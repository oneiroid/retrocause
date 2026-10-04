// The deterministic traversal (LOCAL_LLM.md §5.5). Proposes continuations via
// llm_client, inserts via growth.js, returns { graph, stats, validation }.
//
// Node-only, like llm_client.js: it drives HTTP, so it is never added to the
// page. The page consumes its OUTPUT — a grown graph file — through the
// existing import path (§5.6).
//
// Division of labor: grower.js decides WHAT to propose and in WHAT ORDER;
// growth.js decides whether each proposal is a new state or an existing one.
// The grower does NO deduplication of its own — a second dedup pass with a
// different key would be a silent second definition of "same state" (§5.5.4).
//
// Every ordering decision is pinned, because an unordered iteration is as
// fatal to replay as a random seed:
//   - expansion order: topoRanks, then id, lexicographic (§5.5.1)
//   - candidate order: normalized expr, then label — never the model's
//     output order (§5.5.3)
//   - insertion order is therefore pinned, which is what makes the
//     order-dependent ids of merged survivors deterministic (§3.1)

"use strict";

const fs = require("fs");
const path = require("path");
const Engine = require("./story_builder_engine.js");
const Growth = require("./growth.js");
const Ids = require("./ids.js");

// ── branch.v4: a document the base model continues by one line ─────────────
//
// v1–v3 (removed 2026-09-29) were instructions ("List the alternatives…")
// sent to a BASE model, which has no instruction tuning to read them with,
// and they asked for alternatives outright. v4 asks for nothing. The prompt
// is a `head`-style dump of story files in JSON Lines — one complete story,
// then the current story's path up to the source node — and the completion is
// the next line of that file. Branching comes from sampling that one line
// several times (`width` draws per expansion, each with a derived seed), not
// from asking the model to differ from the told story; a draw that repeats
// the told next event is merged by growth.js like any other duplicate.
//
// The told story's future is deliberately NOT shown: in a document a base
// model continues, a visible future is something to copy. So v4 has no
// `rejoin`, and no `delta`/`invariants` — those are relative to the told
// story, and the line format has nowhere natural to put them. Rejoins
// arrive only through merge: a draw whose content equals an existing state
// on a parallel path collapses into it. `actor` is
// gone too: seed nodes carry none, and a key present on the generated line
// but absent from every line above it is not a continuation of the file.
//
// The grammar pins the line's shape rather than the prompt asking for it:
// the step number is a literal, text fields cannot contain a quote, backslash
// or control character (so the line is valid JSON by construction and cannot
// run onto a second line), and `action` must be `verb(arg, …)` in the seeds'
// lowercase snake_case.
const JSONL_STRING_CHAR = String.raw`[^"\\\x7F\x00-\x1F]`;

// One flat JSON object on one line, in the `{"k": v, "k2": [a, b]}` spacing
// Python's json.dumps writes — the common form of a .jsonl file, and the form
// the grammar's literals use.
function jsonLine(object) {
  const value = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(", ")}]` : JSON.stringify(v));
  return `{${Object.entries(object).map(([k, v]) => `${JSON.stringify(k)}: ${value(v)}`).join(", ")}}`;
}

// The file line for one node. Key order is fixed: it is the order the model
// reads and writes a step in — what happened in prose first, then its
// formal action, then what is true afterwards.
function stepLine(step, node) {
  return jsonLine({ step, event: node.label || node.expr || "", action: node.expr || "", state: node.state || "" });
}

function storyFileName(title) {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${slug || "story"}.jsonl`;
}

function nextStepGrammar(graph, source) {
  const step = ancestorPath(graph, source.id).length + 1;
  const open = JSON.stringify(`{"step": ${step}, "event": "`);
  return [
    `root ::= ${open} text ${JSON.stringify('", "action": "')} action ${JSON.stringify('", "state": "')} text ${JSON.stringify('"}')}`,
    `text ::= ${JSONL_STRING_CHAR}+`,
    `action ::= word "(" word (", " word)* ")"`,
    `word ::= [a-z] [a-z0-9_]*`,
  ].join("\n");
}

function parseNextStep(content) {
  const line = JSON.parse(content);
  return [{ label: line.event, expr: line.action, state: line.state }];
}

// ── branch.v5: the path as plain prose ─────────────────────────────────────
//
// v4 still asked a base model to continue a JSON file, with a foreign example
// story in front. v5 shows only the story itself, as a reader would see it:
// the title, one sentence naming the characters, then one paragraph per path
// node — its label as the event sentence, its `state` after it. The model
// writes the next paragraph.
//
// The grammar holds that paragraph to the same scaffold, so it parses back
// mechanically: an event sentence with no sentence-ending punctuation inside
// it, ". ", the state, one newline. The first sentence is the label, the rest
// the state.
//
// Prose has no `expr`, and the merge machinery keys on it. So a second,
// greedy completion FORMALIZES the event sentence (prompts/formal.v1.txt):
// this story's own told nodes as `label => expr` lines, then the new sentence
// and `=>`, under a `verb(arg, …)` grammar. The examples are the story's own
// vocabulary, which is what lets a drawn "The villagers come running again"
// land on the told `arrive(villagers, flock)` and be judged as a merge.

// The state is capped at MAX_STATE_SENTENCES, after which the grammar forces
// the paragraph break. Uncapped, the model never ended a paragraph: at
// temperature 1.0 it wrote sentence after sentence until n_predict, drifting
// into loops ("The boy is not credible. The boy is not believable. …") —
// 39 of 40 draws truncated at cw_cry1 (2026-10-04). Seed states run one to
// three sentences, so three is the told story's own ceiling.
const MAX_STATE_SENTENCES = 3;
const PROSE_GRAMMAR = [
  String.raw`root ::= event ". " state "\n"`,
  String.raw`event ::= [A-Z] [^.!?\n]*`,
  `state ::= ${"sent (\" \" ".repeat(MAX_STATE_SENTENCES - 1)}sent${")?".repeat(MAX_STATE_SENTENCES - 1)}`,
  String.raw`sent ::= [A-Z"] [^.!?\n]* [.!?] ["]?`,
].join("\n");

const FORMAL_GRAMMAR = [
  `root ::= " " word "(" word (", " word)* ")"`,
  `word ::= [a-z] [a-z0-9_]*`,
].join("\n");
const FORMAL_TEMPLATE = "formal.v1";

const sentence = (text) => {
  const s = String(text || "").trim();
  return s && !/[.!?]$/.test(s) ? `${s}.` : s;
};

// A node as a paragraph: event sentence, then what is true afterwards.
function paragraphOf(node) {
  return [sentence(node.label || node.expr), String(node.state || "").trim()].filter(Boolean).join(" ");
}

function charactersSentence(entities) {
  if (!entities.length) return "";
  const list = entities.length === 1
    ? entities[0]
    : `${entities.slice(0, -1).join(", ")} and ${entities.at(-1)}`;
  return `The characters are ${list}.`;
}

// Event sentence → `verb(args)` in this story's vocabulary. `client` should be
// the reference (greedy) profile: one formalization per sentence, cached.
function createFormalizer({ client, template }) {
  return async function formalize(graph, label) {
    const ranks = Engine.topoRanks(graph);
    const pairs = graph.nodes
      .filter((n) => n.createdBy !== "grown" && n.label && n.expr)
      .sort((a, b) => (ranks[a.id] - ranks[b.id]) || String(a.id).localeCompare(String(b.id)))
      .map((n) => `${n.label} => ${n.expr}`);
    const prompt = String(template)
      .replaceAll("{{title}}", graph.title || "")
      .replaceAll("{{pairs}}", pairs.join("\n"))
      .replaceAll("{{event}}", String(label).trim());
    const { content } = await client.complete(prompt, null, { grammar: FORMAL_GRAMMAR });
    return { expr: content.trim(), prompt };
  };
}

function parseParagraph(content) {
  const text = String(content).replace(/\n+$/, "");
  const cut = text.indexOf(". ");
  return { label: text.slice(0, cut), state: text.slice(cut + 2).trim() };
}

// Prompt version → how its requests are constrained (`constrain(graph,
// source)` → { schema } or { grammar }), how a completion becomes candidates
// (`parse(content, { graph })`, possibly async), and how many completions one
// expansion draws. A format that needs a second model call (v5's
// formalization) gets its client here, so callers build formats per run.
function formatForPrompt(version, { formalClient = null } = {}) {
  // v6 is v4 without the foreign example story: the same file format, so the
  // same grammar and parser. The selected node's own past lines are the only
  // examples; at the root there is one line and no example at all.
  if (version === "branch.v4" || version === "branch.v6") {
    return {
      constrain: (graph, source) => ({ grammar: nextStepGrammar(graph, source) }),
      parse: parseNextStep,
      draws: (width) => width,
    };
  }
  if (version === "branch.v5") {
    if (!formalClient) throw new Error("branch.v5 needs a formalClient to turn event sentences into exprs");
    const formalize = createFormalizer({
      client: formalClient,
      template: fs.readFileSync(path.join(__dirname, "prompts", `${FORMAL_TEMPLATE}.txt`), "utf8"),
    });
    return {
      constrain: () => ({ grammar: PROSE_GRAMMAR }),
      parse: async (content, { graph }) => {
        const { label, state } = parseParagraph(content);
        const { expr, prompt } = await formalize(graph, label);
        return [{ label, state, expr, formalPrompt: prompt }];
      },
      draws: (width) => width,
    };
  }
  throw new Error(`no format registered for prompt ${version}`);
}
const PROMPT_VERSIONS = ["branch.v4", "branch.v5", "branch.v6"];
const DEFAULT_PROMPT_VERSION = "branch.v6";

// ── told-story match ────────────────────────────────────────────────────────
//
// Does a draw at `sourceId` reproduce the told story? "next" when its action
// is a told child's, "later" when it is a told descendant further on (the
// model jumped ahead), null otherwise. Surface form only (normalized expr) —
// a raw signal to look at, not a judgement; paraphrases of the told event
// under a different verb count as new.
function toldMatch(graph, sourceId, expr) {
  const key = Ids.normalizedContent(expr);
  if (!key) return null;
  const told = (n) => n.createdBy !== "grown";
  const children = new Set(graph.edges.filter((e) => e.from === sourceId).map((e) => e.to));
  const ranks = Engine.topoRanks(graph);
  const hits = graph.nodes
    .filter((n) => told(n) && n.id !== sourceId && Ids.normalizedContent(n.expr) === key && Engine.reachable(graph, sourceId, n.id))
    .sort((a, b) => (ranks[a.id] - ranks[b.id]) || String(a.id).localeCompare(String(b.id)));
  const next = hits.find((n) => children.has(n.id));
  if (next) return { kind: "next", id: next.id };
  return hits.length ? { kind: "later", id: hits[0].id } : null;
}

// Per-draw seeds are derived, not drawn: (client seed, source, index) must
// give the same integer on a rerun or the run does not replay. The callers
// grow under llm_client's SAMPLED_SAMPLING; under the greedy reference
// profile every draw would return the same line and merge into the first.
function drawSeed(clientSeed, sourceId, index) {
  return parseInt(Ids.shortHash(`${clientSeed}|${sourceId}|${index}`).slice(0, 8), 16);
}

// Deterministic template rendering: pure string substitution of the graph
// context below. The rendered prompt is a cache key (§5.7), so nothing
// non-deterministic may enter it.
function renderPrompt(template, context = {}) {
  return String(template)
    .replaceAll("{{story}}", context.story || "")
    .replaceAll("{{file}}", context.file || "")
    .replaceAll("{{header}}", context.header || "")
    .replaceAll("{{steps}}", context.steps || "");
}

// ── prompt context ──────────────────────────────────────────────────────────
//
// Everything the model is told about the graph is derived here, and every
// ordering in it is pinned for the same reason the traversal's orderings are:
// the rendered prompt IS the cache key, so a context that reordered between
// runs would be a different prompt for the same state and replay would fail.

// The lexicographically-first shortest path from the graph's root to `to`.
// A node in a DAG can be reached several ways, and "whichever path we found"
// is not a pinned choice — two runs that picked differently would render
// different prompts for the same node.
function ancestorPath(graph, to) {
  const from = graph.root;
  if (!from || from === to) return [to];

  // Distance to the target over REVERSED edges, so the forward walk can tell
  // which successors still lead there without a second search per step.
  const distance = { [to]: 0 };
  for (let queue = [to]; queue.length;) {
    const next = [];
    for (const id of queue) {
      for (const edge of graph.edges) {
        if (edge.to !== id || distance[edge.from] !== undefined) continue;
        distance[edge.from] = distance[id] + 1;
        next.push(edge.from);
      }
    }
    queue = next;
  }
  // An unreachable node still gets a prompt; it just has no story behind it.
  if (distance[from] === undefined) return [to];

  const path = [from];
  for (let cur = from; cur !== to;) {
    // distance[cur] > 0 guarantees such a step exists: that is how BFS
    // assigned it. Ties broken by id, the same rule orderFrontier uses.
    const [step] = graph.edges
      .filter((e) => e.from === cur && distance[e.to] === distance[cur] - 1)
      .map((e) => e.to)
      .sort((a, b) => String(a).localeCompare(String(b)));
    path.push(step);
    cur = step;
  }
  return path;
}

// Computed at expansion time, which is a pinned point in a pinned order: the
// path reflects the graph as the traversal has left it.
function promptContext(graph, node) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const title = graph.title || (graph.meta && graph.meta.title) || "the told story";
  const entities = Array.isArray(graph.entities) ? graph.entities : [];
  const pathNodes = ancestorPath(graph, node.id).map((id) => byId.get(id) || { expr: id });
  return {
    file: storyFileName(title),
    header: jsonLine({ title, ...(entities.length ? { characters: entities } : {}) }),
    steps: pathNodes.map((n, i) => stepLine(i + 1, n)).join("\n"),
    // branch.v5's prose: title, characters, one paragraph per path node.
    story: [title, charactersSentence(entities), ...pathNodes.map(paragraphOf)].filter(Boolean).join("\n\n"),
  };
}

// §5.5.3 — sort returned branches by a deterministic key before the width
// cap. The model's output order is not trusted to be stable.
function byCandidateKey(a, b) {
  const ea = Ids.normalizedContent(a.expr);
  const eb = Ids.normalizedContent(b.expr);
  if (ea !== eb) return ea.localeCompare(eb);
  return Ids.normalizedContent(a.label).localeCompare(Ids.normalizedContent(b.label));
}

// §5.5.1 — expansion points sorted by topological rank, then id. Computed
// per round: earlier inserts in the same round can change ranks, and the
// pinned rule is "ranks as of the round start".
function orderFrontier(graph, ids) {
  const ranks = Engine.topoRanks(graph);
  return [...ids].sort((a, b) => (ranks[a] - ranks[b]) || String(a).localeCompare(String(b)));
}

// Grow `graph` from `from` for up to `depth` rounds, at most `width` accepted
// branches per expansion point, stopping once `maxNodes` nodes were created.
//
// Counts everything it declines to do — rejections are manifest data, never
// silently swallowed (§5.5.5).
async function growGraph({
  graph: inputGraph,
  client,
  promptTemplate,
  // How requests are constrained and completions read — formatForPrompt(v).
  format = formatForPrompt(DEFAULT_PROMPT_VERSION),
  from,
  depth,
  width,
  maxNodes,
  runId = null,
  bypassCache = false,
  // Optional same_judge.createJudge(...): confirms each merge before it
  // happens. Without one, the surface key alone decides, as before.
  judge = null,
} = {}) {
  // normalizeGraph clones and resolves defaults, so ids downstream hash the
  // fields nodes actually end up with — and the grower never mutates its input.
  const graph = Engine.normalizeGraph(inputGraph);
  if (!graph.nodes.some((n) => n.id === from)) {
    throw new Error(`traversal.from node not in graph: ${from}`);
  }

  const stats = {
    created: 0,
    mergedDuplicates: 0,
    rejectedCycles: 0,
    rejectedNullTransitions: 0,
    truncated: 0,
    expansions: 0,
    // Merges the predicate proposed and the judge refused.
    mergesRefused: 0,
    // Draws that reproduce the told story (toldMatch): its next event, or
    // one further on. Counted over parsed draws, before the width cap.
    toldNext: 0,
    toldLater: 0,
    draws: 0,
  };
  const clientSeed = client.sampling && client.sampling.seed;
  // Every request as sent and every completion as received, per expansion —
  // what the Lab shows as "the prompts". Not part of the graph or the stats,
  // so it cannot move a canonical-JSON comparison.
  const trace = [];

  let frontier = [from];
  for (let round = 1; round <= depth && frontier.length && stats.created < maxNodes; round += 1) {
    const next = new Set();
    for (const sourceId of orderFrontier(graph, frontier)) {
      if (stats.created >= maxNodes) break;
      const source = graph.nodes.find((n) => n.id === sourceId);
      const prompt = renderPrompt(promptTemplate, promptContext(graph, source));
      const { schema, grammar } = format.constrain(graph, source);
      const draws = format.draws ? format.draws(width) : 1;

      const proposed = [];
      const expansion = { from: sourceId, prompt, ...(grammar ? { grammar } : {}), ...(schema ? { schema } : {}), draws: [] };
      trace.push(expansion);
      let answered = false;
      for (let index = 0; index < draws; index += 1) {
        const seed = draws > 1 ? drawSeed(clientSeed, sourceId, index) : clientSeed;
        try {
          const { content } = await client.complete(prompt, schema, {
            bypassCache, grammar, sourceExpr: source.expr,
            ...(draws > 1 ? { seed } : {}),
          });
          const parsed = await format.parse(content, { graph, source });
          const record = { seed, content };
          for (const candidate of parsed) {
            const told = toldMatch(graph, sourceId, candidate.expr);
            stats.draws += 1;
            if (told && told.kind === "next") stats.toldNext += 1;
            if (told && told.kind === "later") stats.toldLater += 1;
            if (told) record.told = told;
            if (candidate.formalPrompt) {
              record.expr = candidate.expr;
              record.formalPrompt = candidate.formalPrompt;
            }
          }
          expansion.draws.push(record);
          proposed.push(...parsed.map(({ formalPrompt, ...candidate }) => candidate));
          answered = true;
        } catch (error) {
          // Truncation is a counted hard failure for this draw, not a retry
          // with a bigger cap — that would make the run irreproducible
          // (§5.3). Anything else is a real error and stops the run.
          if (!error.truncated) throw error;
          expansion.draws.push({ seed, content: error.content || "", truncated: true });
          stats.truncated += 1;
        }
      }
      if (!answered) continue;
      stats.expansions += 1;

      for (const candidate of proposed.sort(byCandidateKey).slice(0, width)) {
        if (stats.created >= maxNodes) break;
        const node = {
          // The engine would later default an empty label to the node id —
          // but the id hashes the label, so resolve the fallback BEFORE the
          // id is minted, not after (§3.1 "pass the RESOLVED fields").
          label: candidate.label || candidate.expr,
          kind: "branch",
          expr: candidate.expr,
          state: candidate.state,
          tags: ["counterfactual"],
          createdBy: "grown",
          ...(runId ? { runId } : {}),
        };

        // Confirm-before-merge. Every merge the predicate would make is put to
        // the judge first; a refused survivor is excluded from the insert, so
        // the judge can only ever REMOVE merges (same_judge.js).
        const refuse = new Set();
        if (judge) {
          for (const survivorId of Growth.mergeCandidates(graph, { from: sourceId, node })) {
            const verdict = await judge(graph, survivorId, sourceId, node);
            expansion.judgements = expansion.judgements || [];
            expansion.judgements.push({ label: node.label, expr: node.expr, survivor: survivorId, ...verdict });
            if (verdict.same) break;
            refuse.add(survivorId);
            stats.mergesRefused += 1;
          }
        }

        const result = Growth.insertContinuation(graph, {
          from: sourceId,
          node,
          type: "choice",
          label: "",
          refuse,
        });
        if (result.ok === false) {
          // Two distinct refusals, counted apart: a cycle is a structural
          // impossibility, a null transition is a proposal that said nothing.
          // Collapsing them would hide which failure a run actually had.
          if (result.reason === "null_transition") stats.rejectedNullTransitions += 1;
          else stats.rejectedCycles += 1;
          continue;
        }

        // Only a node this draw CREATED joins the next frontier. A merge ends
        // the branch: the node it landed on is either a told-story node —
        // whose continuation is already authored, and which the user did not
        // select — or a node this run grew, which is already on a frontier.
        // Expanding merge targets walked the run down the told story
        // (criedWolf from cw_cry2, 2026-09-29: draws matching cw_run2 and
        // cw_dismiss put both on round 2's frontier).
        if (result.merged) {
          stats.mergedDuplicates += 1;
          continue;
        }
        stats.created += 1;
        next.add(result.node.id);
      }
    }
    frontier = [...next];
  }

  // Once per run, never per insert (§8) — per-insert cycle refusal is
  // addEdge's own wouldCreateCycle.
  const validation = Engine.validateGraph(graph);
  return { graph, stats, validation, trace };
}

module.exports = {
  growGraph, renderPrompt, promptContext, ancestorPath, formatForPrompt, drawSeed,
  nextStepGrammar, stepLine, storyFileName, DEFAULT_PROMPT_VERSION, PROMPT_VERSIONS,
  toldMatch, parseParagraph, paragraphOf, createFormalizer, PROSE_GRAMMAR, FORMAL_GRAMMAR,
};
