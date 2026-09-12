// Frame candidate source for the grower (continuation plan v3, Stage 1 bridge).
//
//   const propose = createFrameProposer({ client, template, runSeed });
//   growGraph({ graph, proposer: propose, from, depth, width, maxNodes });
//
// Node-only, like llm_client.js and grower.js: it drives HTTP.
//
// Per expansion point:
//   1. The history is the frames along the pinned ancestor path
//      (grower.ancestorPath), rendered one sentence per line under the
//      frames.v1 few-shot.
//   2. UNCONDITIONED_PER_EXPANSION grammar-constrained draws, deduped on
//      normalized frameExpr.
//   3. Gated actor fill: for every entity the unconditioned draws never used
//      as actor, FILL_PER_MISSING_ACTOR draws with the grammar's actor enum
//      restricted to that entity. Measured before this was wired in
//      (experiments/NOTES.md, "--fill-actors measured"): on trojanHorse the
//      fill recovered the told story's own next event at both nodes where
//      unconditioned sampling missed it; on red it widened the actors behind
//      usable samples at no cost to the unconditioned ones.
//   4. PROPOSALS_PER_EXPANSION offered, distinct actors first in pool order
//      (unconditioned before fill), then topped up in pool order. The grower
//      then applies its own pinned sort and width cap, as for any source.
//
// Every draw that yields nothing is counted on `propose.stats`, never
// swallowed: a truncation or an unparseable completion is a measurement.
//
// ── what a frame-grown node is ──────────────────────────────────────────────
//
//   expr   = Frames.frameExpr(frame)   — so ids.nodeId covers all three slots
//   state  = frame.outcome             — what is true after the event
//   label  = "<actor> <action>"
//   frame  = the frame itself          — the next expansion's history line
//   delta, invariants = ""             — frames have neither; eval.js already
//                                        treats empty prose as absence
//
// KNOWN CONSEQUENCE, flagged rather than worked around: seed nodes keep their
// `deed(args)` expr (plan v3: seed ids do not change), and a frame-grown node's
// expr is a frameExpr. The two formats never collide, so a frame-grown branch
// can NEVER merge back into a seed node by content, and eval's grown→seed
// convergence will read zero for this source by construction. The JSON source
// earned its first grown→seed edges exactly by emitting seed exprs.

"use strict";

const Frames = require("./frames.js");
const Ids = require("./ids.js");
const Grower = require("./grower.js");
const Engine = require("./story_builder_engine.js");

// The Stage 0 probe's sampling block, value for value (tests pin the two
// equal). Temperature > 0 with a derived seed per draw is what makes K draws
// both distinct and replayable; the grower's greedy reference profile would
// return one completion K times.
const FRAME_SAMPLING = {
  temperature: 1.0,
  top_k: 0,
  min_p: 0.05,
  samplers: ["top_k", "min_p", "temperature"],
  repeat_penalty: 1.0,
  dry_multiplier: 0,
  cache_prompt: false,
  stop: ["\n"],
};

// Six rather than the probe's ten: the grower offers three per expansion, and
// on the measured batches the unconditioned pool's distinct actors saturated
// well before ten draws (1–2 actors per node on both stories).
const UNCONDITIONED_PER_EXPANSION = 6;

// One rather than the probe's two: in the grower the fill competes for three
// slots, and one forced draw per missing actor is enough to put that actor in
// the pool. The probe needed two to MEASURE per-actor yield, which is done.
const FILL_PER_MISSING_ACTOR = 1;

// The branch schema's maxItems, and the baseline's offer — same funnel for
// every source (eval.js PROPOSALS_PER_EXPANSION).
const PROPOSALS_PER_EXPANSION = 3;

// Rejoin: one extra constrained draw per offered candidate, asking which told
// event the alternative leads back into, or NONE.
//
// Why it exists: measured, the frames source never converges by content —
// 408 parallel pairs judged by same.v2, zero same (experiments/NOTES.md). So
// the grown object is a tree, and the JSON boundary's only convergence
// mechanism, `rejoinTargetId`, has no frames equivalent.
//
// Why an ENUM rather than a free id: branch.v2 lets the model write an id and
// measured `rejoinValidity` 0 — every rejoin it attempted named a node that
// did not exist. Here the grammar's alternatives ARE the told story's own
// rendered sentences plus "NONE", so an invalid target is unreachable rather
// than validated-and-dropped. This is the same closed-enum lever that the
// actor slot already demonstrated.
//
// Only nodes INCOMPARABLE with the source are offered: an ancestor would be a
// cycle and a descendant is already reachable, and the grower would drop
// either. Offering only legal targets is the point. A consequence worth
// knowing: a seed node on a linear spine has no legal target at all — every
// other node is above or below it — so rejoin only becomes available from
// grown nodes, which hang off the spine.
const REJOIN_NONE = "NONE";

// GBNF string literal. The rejoin enum's alternatives are whole sentences,
// so they must be escaped exactly as the grammar's other literals are.
function gbnfLiteral(text) {
  return JSON.stringify(String(text));
}

function frameSamplingFor(entities) {
  return { ...FRAME_SAMPLING, n_predict: Frames.tokenBudget(entities) };
}

// Derived, not drawn: (run seed, draw tag, source node, index) must give the
// same integer on a rerun. Grown source ids are content-addressed, so this is
// stable across replays. Same derivation as the probe's sampleSeed.
function drawSeed(runSeed, tag, sourceId, index) {
  return parseInt(Ids.shortHash(`${runSeed}|${tag}|${sourceId}|${index}`).slice(0, 8), 16);
}

function createFrameProposer({
  client,
  template,
  runSeed,
  unconditioned = UNCONDITIONED_PER_EXPANSION,
  fillPerMissing = FILL_PER_MISSING_ACTOR,
  proposals = PROPOSALS_PER_EXPANSION,
  rejoinTemplate = null,
} = {}) {
  if (!client || typeof client.complete !== "function") throw new Error("frame proposer needs a client");
  if (!template) throw new Error("frame proposer needs a template");

  // `parseErrors` counts by reason and `parseExamples` keeps the first few raw
  // completions: under the grammar a parse failure means the grammar and
  // Frames.validate disagree about what a legal slot is, and that has twice
  // before turned out to be a silent confound rather than noise.
  const MAX_PARSE_EXAMPLES = 5;
  const stats = {
    expansions: 0, draws: 0, truncated: 0, parseFailures: 0, forced: 0, missingActors: 0,
    parseErrors: {}, parseExamples: [],
    rejoinAsked: 0, rejoinNone: 0, rejoinNamed: 0,
  };

  async function propose(graph, source, { bypassCache = false } = {}) {
    const entities = graph.entities;
    if (!Array.isArray(entities) || entities.length === 0) {
      throw new Error("frame proposer: graph has no entities list");
    }
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const pathIds = Grower.ancestorPath(graph, source.id);
    const frames = pathIds.map((id) => (byId.get(id) || {}).frame);
    const unframed = pathIds.filter((id, i) => !frames[i]);
    // Not a refusal to count: a path with an unframed node means this source
    // is being run on a graph it cannot read, and continuing would silently
    // feed the model a history with holes in it.
    if (unframed.length) throw new Error(`frame proposer: no frame on path node(s) ${unframed.join(", ")}`);

    const title = graph.title || (graph.meta && graph.meta.title) || "";
    // The told story, grown nodes excluded, in topological order — the same
    // spine branch.v2 renders for the JSON boundary, in frame form. Templates
    // without {{story}} (frames.v1) ignore it.
    const ranks = Engine.topoRanks(graph);
    const spine = graph.nodes
      .filter((n) => n.createdBy !== "grown" && n.frame)
      .sort((a, b) => (ranks[a.id] - ranks[b.id]) || String(a.id).localeCompare(String(b.id)))
      .map((n) => n.frame);
    const prompt = Frames.historyPrompt(template, { title, frames, spine });
    const fullGrammar = Frames.grammar(entities);
    stats.expansions += 1;

    async function draw(grammar, parseEntities, seed, forcedActor) {
      stats.draws += 1;
      let content;
      try {
        ({ content } = await client.complete(prompt, null, { seed, grammar, bypassCache }));
      } catch (error) {
        if (!error.truncated) throw error;
        stats.truncated += 1;
        return null;
      }
      const frame = Frames.parse(String(content).trim(), parseEntities);
      if (frame.error) {
        stats.parseFailures += 1;
        stats.parseErrors[frame.error] = (stats.parseErrors[frame.error] || 0) + 1;
        if (stats.parseExamples.length < MAX_PARSE_EXAMPLES) stats.parseExamples.push(String(content));
        return null;
      }
      return { frame, forcedActor };
    }

    const pool = [];
    const seen = new Set();
    const add = (candidate) => {
      if (!candidate) return;
      const key = Ids.normalizedContent(Frames.frameExpr(candidate.frame));
      if (seen.has(key)) return;
      seen.add(key);
      pool.push(candidate);
    };

    for (let i = 0; i < unconditioned; i += 1) {
      add(await draw(fullGrammar, entities, drawSeed(runSeed, "uncond", source.id, i), null));
    }

    // Entity-list order, so which actors are filled first is pinned.
    const present = new Set(pool.map((c) => c.frame.actor));
    const missing = entities.filter((e) => !present.has(e));
    stats.missingActors += missing.length;
    for (const actor of missing) {
      for (let j = 0; j < fillPerMissing; j += 1) {
        const candidate = await draw(Frames.grammar([actor]), [actor], drawSeed(runSeed, `fill:${actor}`, source.id, j), actor);
        if (candidate) stats.forced += 1;
        add(candidate);
      }
    }

    // Distinct actors first — the coverage the fill exists to buy — then top
    // up in pool order.
    const chosen = [];
    const actors = new Set();
    for (const c of pool) {
      if (chosen.length >= proposals) break;
      if (actors.has(c.frame.actor)) continue;
      chosen.push(c);
      actors.add(c.frame.actor);
    }
    for (const c of pool) {
      if (chosen.length >= proposals) break;
      if (!chosen.includes(c)) chosen.push(c);
    }

    // Candidate rejoin targets: framed nodes that the source cannot already
    // reach and that are not the source itself. Ancestors are excluded by the
    // reachability test, so every offered target is a legal edge.
    const rejoinTargets = rejoinTemplate
      ? graph.nodes.filter((n) => n.frame && n.id !== source.id
        && !Engine.reachable(graph, n.id, source.id) && !Engine.reachable(graph, source.id, n.id))
      : [];

    async function askRejoin(frame, index) {
      if (!rejoinTemplate || rejoinTargets.length === 0) return null;
      const rendered = rejoinTargets.map((n) => Frames.render(n.frame));
      const grammar = [
        `root ::= ${[REJOIN_NONE, ...rendered].map((line) => gbnfLiteral(line)).join(" | ")}`,
        "",
      ].join("\n");
      const rejoinPrompt = String(rejoinTemplate)
        .replaceAll("{{story}}", rendered.join("\n"))
        .replaceAll("{{event}}", Frames.render(frame));
      stats.rejoinAsked += 1;
      let content;
      try {
        ({ content } = await client.complete(rejoinPrompt, null, {
          seed: drawSeed(runSeed, "rejoin", source.id, index), grammar, bypassCache,
        }));
      } catch (error) {
        if (!error.truncated) throw error;
        stats.truncated += 1;
        return null;
      }
      const answer = String(content).trim();
      if (answer === REJOIN_NONE) { stats.rejoinNone += 1; return null; }
      const hit = rejoinTargets[rendered.indexOf(answer)];
      if (!hit) { stats.rejoinNone += 1; return null; }
      stats.rejoinNamed += 1;
      return hit.id;
    }

    const withRejoin = [];
    for (let index = 0; index < chosen.length; index += 1) {
      withRejoin.push({ ...chosen[index], rejoinTargetId: await askRejoin(chosen[index].frame, index) });
    }

    return withRejoin.map(({ frame, forcedActor, rejoinTargetId }) => ({
      label: `${frame.actor} ${frame.action}`,
      expr: Frames.frameExpr(frame),
      state: frame.outcome,
      delta: "",
      invariants: "",
      frame,
      tags: forcedActor ? ["counterfactual", "forced-actor"] : ["counterfactual"],
      ...(rejoinTargetId ? { rejoinTargetId } : {}),
    }));
  }

  propose.stats = stats;
  return propose;
}

module.exports = {
  createFrameProposer, frameSamplingFor, drawSeed, REJOIN_NONE,
  FRAME_SAMPLING, UNCONDITIONED_PER_EXPANSION, FILL_PER_MISSING_ACTOR, PROPOSALS_PER_EXPANSION,
};
