// Stage 0 A/B probe (continuation plan v3): does a structured-frame,
// natural-sentence model boundary beat the JSON-schema boundary on human
// plausibility, at the same node, on the same model, under the same sampler?
//
//   sentence arm  prompts/frames.v1.txt  + frames.js grammar → one sentence
//   json arm      prompts/branch.v2.txt  + grower BRANCH_SCHEMA → JSON object
//
// This is NOT a first continuation generator — grower.js already generates.
// It is a representation experiment, and the only thing it produces is a
// file of candidate continuations for a human to grade with grade.js. It
// writes no graph, inserts nothing, and merges nothing.
//
// Usage:
//   node experiments/continue_probe.js --story red --nodes red_woods,red_tell
//   node experiments/continue_probe.js --story red --nodes red_tell --unconstrained
//
//   --story <key>          seed story (red | criedWolf | trojanHorse)
//   --nodes <id,id,...>    nodes to expand; default: three mid-story nodes
//   --k <n>                distinct samples wanted per arm per node (10)
//   --arms <a,b>           sentence,json (both)
//   --unconstrained        sentence arm without the GBNF grammar. Diagnostic
//                          only, and the only mode in which the parse rate is
//                          a measurement rather than 1.0 by construction.
//   --seed <n>             run seed; every per-sample seed derives from it
//   --fill-actors [m]      sentence arm only: draw K unconditioned, then draw
//                          m forced samples (default FILL_PER_MISSING_ACTOR)
//                          for each entity the unconditioned batch never used
//                          as actor. See 6.
//   --temp <f>             sampler temperature (default 1.0). Used to tell a
//                          COLLAPSING sampler from a genuinely narrow node:
//                          if raising it broadens the candidate set the node
//                          was sampler-limited, and if it does not the
//                          possibility space really is that narrow.
//   --fast                 EXPLORATION ONLY. Sets cache_prompt:true so the
//                          server reuses the KV cache of the shared prompt
//                          prefix across the K draws instead of reprocessing
//                          ~1000 tokens per sample (the pinned cost, NOTES).
//                          This DESTROYS bit-replay, so a --fast output is not
//                          replayable and never shares cache with a normal run
//                          (cache_prompt is part of the cache key). The disk
//                          cache already makes re-running an identical config
//                          free; --fast is for first-generating a NEW config
//                          while iterating, then re-run without it to record.
//   --out <path>           output file (default experiments/out/cont_<...>.json)
//
// ── deliberate deviations from the plan text, flagged not absorbed ─────────
//
// 1. FEW-SHOT SOURCE. The plan says to draw the sentence arm's few-shot from
//    "other seed stories". It is drawn from The Tortoise and the Hare
//    instead — a story outside seeds.js, the same one branch.v2 uses. Two
//    reasons, both load-bearing. (a) branch.v2 moved the few-shot out of the
//    corpus precisely so contamination stays DETECTABLE, and it worked:
//    cross-story entities went to zero. Feeding criedWolf to a red probe
//    reopens that channel, and red and criedWolf deliberately share the
//    `wolf` entity. (b) An A/B on representation needs the arms to differ in
//    representation and nothing else; sharing one few-shot story is part of
//    that.
//
// 2. PATH RULE. The plan specifies a linearizer preferring `kind === "story"`
//    with a shortest tie-break. `grower.ancestorPath` — the pinned
//    lexicographically-first shortest path — is reused instead. On seed
//    graphs the story-kind preference is vacuous (nothing is grown), and
//    reusing the grower's rule means both arms see the identical path, which
//    is the point.
//
// 3. SAMPLER PARITY. The plan pins temperature 1.0 / min_p 0.05 for the
//    sentence arm and leaves the JSON arm's sampler unstated. Both arms run
//    the SAME block here. A JSON arm left on the grower's greedy reference
//    profile would return one completion K times, and the A/B would compare
//    representation against sampling.
//
// 4. JSON ARM FAIRNESS. branch.v2 returns up to three branches per call.
//    Flattening them would give the JSON arm three shots per sample against
//    the sentence arm's one. Only the FIRST branch of each sample is graded;
//    the rest are recorded under `extraBranches` and are not thrown away.
//
// 5. TRUNCATION. llm_client treats a length-stop as a hard error. Here a
//    truncated sample is data — "the model ran past the one-sentence format"
//    is exactly what the unconstrained batch measures — so it is caught and
//    recorded as an unusable sample with its partial text, not re-raised.
//
// 6. GATED ACTOR FILL (`--fill-actors`), which the plan does not describe
//    because the finding that motivates it postdates the plan.
//
//    Unconditioned at trojanHorse/th_lie, 30 samples across temperatures 1.0
//    to 1.8 used exactly two of the story's four actors — "the Trojans" 24
//    times, Sinon 6, Cassandra and the Greeks never — and produced one event
//    ("the Trojans bring the horse into the city") in eight or nine of ten.
//    That looked like a narrow possibility space. It is not: the TOLD
//    story's own next event at that node is Cassandra warning, so at least
//    two continuations exist by construction, and restricting the grammar's
//    actor enum to one entity recovers coherent alternatives for every actor
//    — Cassandra naming the trick, Sinon asking to address the king, the
//    Greeks leading the Trojans onto the plain. The mass is on one actor,
//    not on one event. This closed-enum lever is one the JSON arm does not
//    have: `expr` is free text with no designated actor slot and no closed
//    vocabulary to condition on.
//
//    Forcing every actor round-robin was measured (NOTES, "--per-actor")
//    and dropped: it cost draws on actors the unconditioned batch already
//    covered and on absent-but-implausible ones. `--fill-actors` is the
//    survivor — draw K unconditioned, then force ONLY the entities that
//    never appeared, spending the extra draws where the mass is missing.
//    Total draws are K + m × (missing actors), so compare per draw, not per
//    batch — otherwise this mode wins on volume.

"use strict";

const fs = require("fs");
const path = require("path");

const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const Frames = require(path.join(R, "frames.js"));
const Ids = require(path.join(R, "ids.js"));
const Grower = require(path.join(R, "grower.js"));
const { createClient } = require(path.join(R, "llm_client.js"));
const { FRAME_SAMPLING, drawSeed } = require(path.join(R, "frame_proposer.js"));
const { sha256, sha256File } = require(path.join(R, "tools", "grow.js"));
const { seeds } = require(path.join(R, "seeds.js"));

// The sampling block both arms share — the grower's frames source samples
// with the same block (frame_proposer.js), so the probe's measurements say
// something about what the grower grows. Not the reference profile: that one
// is greedy by design, and a greedy client cannot produce K alternatives.
//
//   temperature 1.0 / min_p 0.05  — the plan's pinned pair. min_p rather than
//                                   top_p because it scales the cutoff with
//                                   the top token's own probability, which is
//                                   what keeps a confident position from
//                                   admitting noise.
//   top_k 0                       — off, or it would re-impose greedy
//                                   truncation over min_p.
//   stop ["\n"]                   — one sentence is one line.
//   n_predict                     — see below; it differs per arm and per
//                                   mode, and getting it wrong is not benign.
//   samplers                      — explicit order, same reason as §4.1.
const PROBE_SAMPLING = FRAME_SAMPLING;

// The plan's ~40-token cap. It belongs to the UNCONSTRAINED diagnostic only,
// where "the model ran past the one-sentence format" is the measurement and a
// cap is what stops a runaway completion.
const DIAGNOSTIC_N_PREDICT = 40;

// Under the grammar the cap must NEVER bind — the grammar's bounded character
// classes are already the length limit, and a token cap on top of them is a
// second, tighter limit that silently wins. So it is derived from the grammar
// (Frames.tokenBudget) rather than chosen.
//
// This was a real confound, not a hypothetical one. The first run had the
// grammar admitting 246-char sentences under a 40-token cap: a fifth of
// sentence-arm draws died as "truncated", and they died NON-RANDOMLY — the
// longest, most elaborate continuations were exactly the ones cut. The
// surviving set was biased short, and it was being compared against a JSON
// arm that had 512 tokens to work with.

// The JSON arm needs room for a whole object (label + expr + state + delta +
// invariants, up to three branches), so its cap stays the reference profile's
// 512. Both arms' caps are now sized so that neither binds in practice: the
// point is to compare representations, not to find out which one the sampler
// budget cut off first.
const JSON_ARM_N_PREDICT = 512;

// Refill rounds after the first: a node that still cannot fill K distinct
// samples is SATURATED, which is a finding (criedWolf is the known case), not
// a reason to keep drawing.
const MAX_REFILL_ROUNDS = 3;

const DEFAULT_K = 10;

// Forced draws per actor absent from the unconditioned batch. Two, because on
// red the productive forced actor (the woodcutter) yielded usable samples in
// 4 of 6 forced draws, and one draw would miss that about a third of the time.
const FILL_PER_MISSING_ACTOR = 2;
const DEFAULT_RUN_SEED = 7;

const FRAMES_TEMPLATE = "frames.v1";
const BRANCH_TEMPLATE = "branch.v2";
const templatePathOf = (name) => path.join(R, "prompts", `${name}.txt`);

// Mid-story nodes: far enough in that there is a history to condition on,
// short of the ending, where "what could happen next" is nearly closed.
const DEFAULT_NODES = {
  red: ["red_woods", "red_tell", "red_flowers"],
  criedWolf: ["cw_cry1", "cw_laugh", "cw_doubt"],
  trojanHorse: ["th_gift", "th_lie", "th_seer"],
};

// ── argv ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { story: "red", k: DEFAULT_K, seed: DEFAULT_RUN_SEED, arms: ["sentence", "json"], unconstrained: false, fillActors: 0, temp: PROBE_SAMPLING.temperature, fast: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--story") { args.story = value; i += 1; }
    else if (flag === "--nodes") { args.nodes = value.split(",").map((s) => s.trim()).filter(Boolean); i += 1; }
    else if (flag === "--k") { args.k = Number(value); i += 1; }
    else if (flag === "--arms") { args.arms = value.split(",").map((s) => s.trim()).filter(Boolean); i += 1; }
    else if (flag === "--seed") { args.seed = Number(value); i += 1; }
    else if (flag === "--temp") { args.temp = Number(value); i += 1; }
    else if (flag === "--out") { args.out = value; i += 1; }
    else if (flag === "--base-url") { args.baseUrl = value; i += 1; }
    else if (flag === "--unconstrained") { args.unconstrained = true; }
    else if (flag === "--fast") { args.fast = true; }
    else if (flag === "--fill-actors") {
      const next = Number(value);
      if (Number.isInteger(next) && next > 0) { args.fillActors = next; i += 1; } else { args.fillActors = FILL_PER_MISSING_ACTOR; }
    }
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!seeds[args.story]) throw new Error(`unknown story: ${args.story}`);
  args.nodes = args.nodes || DEFAULT_NODES[args.story];
  return args;
}

// Per-sample seeds are derived, not drawn: (run seed, arm, node, index) must
// give the same integer on a rerun or the file does not replay. The grower's
// frames source uses the identical derivation (frame_proposer.drawSeed).
const sampleSeed = drawSeed;

// ── prompts ─────────────────────────────────────────────────────────────────

// The template ends at the `NEXT EVENT:` cue; the trailing space is added
// here rather than left in the file, where an editor would strip it. The
// grammar (and the few-shot) supply the "Then " that follows — the same
// deviation branch.v2 records for its missing open brace: a cue the sampler
// is about to emit must not also be in the prompt.
function sentencePrompt(template, story, historyFrames) {
  return Frames.historyPrompt(template, { title: story.title, frames: historyFrames });
}

// ── arms ────────────────────────────────────────────────────────────────────

// One draw. Returns a record that is ALWAYS written: a refusal, a truncation
// and a good sample are all outcomes of the same measurement, and a probe
// that only records successes measures nothing.
async function drawSentence({ client, prompt, grammar, entities, seed, forcedActor = null }) {
  const record = { arm: "sentence", seed, ...(forcedActor ? { forcedActor } : {}) };
  try {
    const { content, stopType, cached, cacheKey } = await client.complete(prompt, null, { seed, grammar });
    Object.assign(record, { raw: content, stopType, cached, cacheKey });
  } catch (error) {
    if (!error.truncated) throw error;
    Object.assign(record, { raw: error.content, stopType: "limit", truncated: true, cacheKey: error.cacheKey });
    record.error = "truncated at n_predict";
    return record;
  }

  // The grammar emits the sentence without the leading "Then " only if the
  // prompt carried it; it does not, so `raw` is the whole sentence. Trim is
  // for the unconstrained arm, which may lead with whitespace.
  const sentence = record.raw.trim();
  record.sentence = sentence;
  const parsed = Frames.parse(sentence, entities);
  if (parsed.error) { record.error = parsed.error; return record; }
  record.frame = parsed;
  record.expr = Frames.frameExpr(parsed);
  record.display = sentence;
  return record;
}

async function drawJson({ client, prompt, seed }) {
  const record = { arm: "json", seed };
  try {
    const { content, stopType, cached, cacheKey } = await client.complete(prompt, Grower.BRANCH_SCHEMA, { seed });
    Object.assign(record, { raw: content, stopType, cached, cacheKey });
  } catch (error) {
    if (!error.truncated) throw error;
    Object.assign(record, { raw: error.content, stopType: "limit", truncated: true, cacheKey: error.cacheKey });
    record.error = "truncated at n_predict";
    return record;
  }

  let payload;
  try { payload = JSON.parse(record.raw); } catch (error) { record.error = `unparseable JSON: ${error.message}`; return record; }
  const branches = Array.isArray(payload.branches) ? payload.branches : [];
  if (branches.length === 0) { record.error = "no branches"; return record; }

  const [first, ...rest] = branches;
  record.branch = first;
  if (rest.length) record.extraBranches = rest;
  record.expr = String(first.expr || "");
  // The grader sees one next-event line per sample in both arms. The format
  // still differs, and that partially reveals the arm — recorded as a
  // limitation of this design, not engineered around.
  record.display = `${record.expr} — ${String(first.state || "")}`;
  return record;
}

// Draw until `k` DISTINCT usable samples exist or the refill budget is spent.
// Distinctness is on normalized expr, the repo's one content key, so the two
// arms are deduped by the same rule despite different surface forms.
// `onAttempt` sees every record as it lands, duplicates marked — the grow
// server streams them to the page so a batch is visible while it draws.
async function drawDistinct(draw, k, onAttempt = null) {
  const samples = [];
  const attempts = [];
  const seen = new Set();
  const budget = k * (1 + MAX_REFILL_ROUNDS);

  for (let index = 0; index < budget && samples.length < k; index += 1) {
    const record = await draw(index);
    attempts.push(record);
    if (!record.error) {
      const key = Ids.normalizedContent(record.expr);
      if (seen.has(key)) record.duplicateOf = key;
      else { seen.add(key); samples.push(record); }
    }
    if (onAttempt) onAttempt(record);
  }

  return {
    samples,
    attempts: attempts.length,
    refused: attempts.filter((a) => a.error && !a.truncated).length,
    truncated: attempts.filter((a) => a.truncated).length,
    duplicates: attempts.filter((a) => a.duplicateOf).length,
    // Truncation is NOT a parse failure and must not be averaged into one.
    // A completion cut off at the token cap never got the chance to be
    // well-formed; counting it as unparseable blames the representation for
    // the sampler's budget. `parseRate` is therefore over completions that
    // actually finished, and truncation is reported on its own.
    parseRate: (() => {
      const finished = attempts.filter((a) => !a.truncated);
      if (finished.length === 0) return null;
      return (finished.length - finished.filter((a) => a.error).length) / finished.length;
    })(),
    truncationRate: attempts.length ? attempts.filter((a) => a.truncated).length / attempts.length : 0,
    saturated: samples.length < k,
    allAttempts: attempts,
  };
}

// ── run ─────────────────────────────────────────────────────────────────────

// One client per arm. Unconstrained: the plan's diagnostic cap, where
// truncation is the point. Constrained: derived so the grammar binds and the
// cap never does. --fast trades bit-replay for KV-cache reuse across the
// shared prompt prefix; only ever set by the caller, so a normal run's body
// is byte-identical to before and keeps hitting the recorded cache.
// `create` is injectable so the grow server's tests run the probe over the
// fixture transport.
function createProbeClients({
  baseUrl, entities, temp = PROBE_SAMPLING.temperature, unconstrained = false, fast = false,
  create = (sampling) => createClient({ baseUrl, cacheDir: path.join(R, "cache"), sampling }),
}) {
  const extra = fast ? { cache_prompt: true } : {};
  return {
    sentence: create({
      ...PROBE_SAMPLING, temperature: temp,
      n_predict: unconstrained ? DIAGNOSTIC_N_PREDICT : Frames.tokenBudget(entities), ...extra,
    }),
    json: create({ ...PROBE_SAMPLING, temperature: temp, n_predict: JSON_ARM_N_PREDICT, stop: undefined, ...extra }),
  };
}

function readTemplates() {
  return {
    frames: fs.readFileSync(templatePathOf(FRAMES_TEMPLATE), "utf8"),
    branch: fs.readFileSync(templatePathOf(BRANCH_TEMPLATE), "utf8"),
  };
}

// Both arms (or the ones asked for) at one node. `graph` is any normalized
// graph whose path to `nodeId` is fully framed — a seed, or a graph the page
// sent over. Returns the node's entry in the probe file's `results`.
async function probeNode({
  graph, nodeId, clients, templates = readTemplates(),
  k = DEFAULT_K, arms = ["sentence", "json"], runSeed = DEFAULT_RUN_SEED,
  fillActors = 0, unconstrained = false, onAttempt = null,
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) throw new Error(`no node ${nodeId} in the graph`);
  const entities = graph.entities;
  const title = graph.title || (graph.meta && graph.meta.title) || "";

  const pathIds = Grower.ancestorPath(graph, nodeId);
  const historyFrames = pathIds.map((id) => (byId.get(id) || {}).frame).filter(Boolean);
  const entry = { nodeId, path: pathIds, history: historyFrames.map((f) => Frames.render(f)), arms: {} };

  if (arms.includes("sentence")) {
    if (!Array.isArray(entities) || !entities.length) throw new Error("sentence arm: graph has no entities list");
    if (historyFrames.length !== pathIds.length) throw new Error(`${nodeId}: some node on the path has no frame`);
    const prompt = sentencePrompt(templates.frames, { title }, historyFrames);
    const result = await drawDistinct(
      (index) => drawSentence({
        client: clients.sentence,
        prompt,
        grammar: unconstrained ? null : Frames.grammar(entities),
        entities,
        seed: sampleSeed(runSeed, "sentence", nodeId, index),
      }),
      k,
      onAttempt,
    );
    entry.arms.sentence = {
      prompt, promptSha256: sha256(prompt), constrained: !unconstrained,
      fillActors, ...result,
    };

    if (fillActors && !unconstrained) {
      const present = new Set(result.samples.map((sample) => sample.frame.actor));
      const missing = entities.filter((e) => !present.has(e));
      const filled = [];
      let fillAttempts = 0;
      for (const actor of missing) {
        const fill = await drawDistinct(
          (index) => drawSentence({
            client: clients.sentence,
            prompt,
            grammar: Frames.grammar([actor]),
            entities: [actor],
            seed: sampleSeed(runSeed, `fill:${actor}`, nodeId, index),
            forcedActor: actor,
          }),
          fillActors,
          onAttempt,
        );
        fillAttempts += fill.attempts;
        filled.push(...fill.samples);
      }
      entry.arms.sentence.samples = [...result.samples, ...filled];
      entry.arms.sentence.fill = {
        perMissingActor: fillActors, missing, added: filled.length,
        attempts: fillAttempts, totalDraws: result.attempts + fillAttempts,
      };
    }
  }

  if (arms.includes("json")) {
    const context = Grower.promptContext(graph, node);
    const prompt = Grower.renderPrompt(templates.branch, node, context);
    const result = await drawDistinct(
      (index) => drawJson({
        client: clients.json,
        prompt,
        seed: sampleSeed(runSeed, "json", nodeId, index),
      }),
      k,
      onAttempt,
    );
    entry.arms.json = { prompt, promptSha256: sha256(prompt), constrained: true, ...result };
  }
  return entry;
}

// The probe file's manifest — what grade.js reads (`arms`, `runSeed`) plus
// everything a number from this batch needs to be traced to its config.
function probeManifest({ story, k, runSeed, arms, unconstrained, fillActors, fast, clients, props, entities }) {
  const grammar = Frames.grammar(entities);
  const modelPath = props.model_path || "";
  return {
    probe: "continue_probe v1 (continuation plan v3, Stage 0)",
    story,
    k,
    runSeed,
    arms,
    unconstrained,
    fillActors,
    fast,
    grammarBounds: {
      actionMaxChars: Frames.ACTION_MAX_CHARS,
      outcomeMaxChars: Frames.OUTCOME_MAX_CHARS,
      maxSentenceChars: Frames.maxSentenceChars(entities),
    },
    sampling: { sentence: clients.sentence.sampling, json: clients.json.sampling },
    model: {
      props,
      sha256: modelPath && fs.existsSync(modelPath) && process.env.SKIP_SHA256 !== "1"
        ? sha256File(modelPath)
        : null,
    },
    templates: {
      sentence: { name: FRAMES_TEMPLATE, sha256: sha256File(templatePathOf(FRAMES_TEMPLATE)) },
      json: { name: BRANCH_TEMPLATE, sha256: sha256File(templatePathOf(BRANCH_TEMPLATE)) },
    },
    entities,
    entitiesSha256: sha256(JSON.stringify(entities)),
    grammar,
    grammarSha256: sha256(grammar),
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = seeds[args.story];
  const graph = Engine.normalizeGraph(story);
  const entities = story.entities;

  if (args.fast) {
    process.stderr.write("--fast: cache_prompt=true — this run is NOT bit-replayable and its cache entries are separate from normal runs. Re-run without --fast to record.\n");
  }
  const clients = createProbeClients({
    baseUrl: args.baseUrl, entities, temp: args.temp, unconstrained: args.unconstrained, fast: args.fast,
  });
  const templates = readTemplates();
  const props = await clients.sentence.props();
  const results = [];

  for (const nodeId of args.nodes) {
    const entry = await probeNode({
      graph, nodeId, clients, templates,
      k: args.k, arms: args.arms, runSeed: args.seed,
      fillActors: args.fillActors, unconstrained: args.unconstrained,
    });
    results.push(entry);
    const line = args.arms
      .map((arm) => {
        const a = entry.arms[arm];
        const parse = a.parseRate === null ? "n/a" : a.parseRate.toFixed(2);
        return `${arm} ${a.samples.length}/${args.k}` +
          ` (parse ${parse}, trunc ${a.truncated}, dup ${a.duplicates})`;
      })
      .join("  |  ");
    process.stderr.write(`${nodeId}: ${line}\n`);
  }

  const output = {
    manifest: probeManifest({
      story: args.story, k: args.k, runSeed: args.seed, arms: args.arms,
      unconstrained: args.unconstrained, fillActors: args.fillActors, fast: args.fast,
      clients, props, entities,
    }),
    results,
  };

  const outDir = path.join(R, "experiments", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const suffix = `${args.unconstrained ? "_unconstrained" : ""}${args.fillActors ? "_fill" : ""}`;
  const out = args.out || path.join(outDir, `cont_${args.story}_${args.nodes.join("-")}${suffix}.json`);
  fs.writeFileSync(out, JSON.stringify(output, null, 2));
  process.stderr.write(`\nwrote ${out}\n`);
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exit(1); });
}

module.exports = {
  PROBE_SAMPLING, DEFAULT_K, sentencePrompt, sampleSeed, drawDistinct,
  createProbeClients, readTemplates, probeNode, probeManifest, DEFAULT_NODES,
};
