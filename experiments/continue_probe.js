// Continuation probe: at one node, on one model, under one sampler, draw K
// distinct continuations per prompt version ("arm") and write them out for
// grading (experiments/grade.js, or the Lab panel's grading dialog).
//
//   node experiments/continue_probe.js --story red --nodes red_woods,red_tell
//   node experiments/continue_probe.js --story criedWolf --k 20
//
//   --story <key>          seed story (red | criedWolf | trojanHorse)
//   --nodes <id,id,...>    nodes to expand; default: three mid-story nodes
//   --k <n>                distinct samples wanted per arm per node (10)
//   --arms <a,b>           prompt versions to compare (branch.v4,branch.v5)
//   --seed <n>             run seed; every per-sample seed derives from it
//   --temp <f>             sampler temperature (default 1.0)
//   --fast                 EXPLORATION ONLY: cache_prompt:true, so the server
//                          reuses the shared prompt prefix's KV cache across
//                          the K draws. Not bit-replayable; its cache entries
//                          never collide with a normal run's.
//   --out <path>           output file (default experiments/out/cont_<...>.json)
//
// It grows nothing and merges nothing. Every arm renders the same line per
// sample (`expr — state`), so a grader cannot tell arms apart by format.
//
// One draw, one graded sample: a completion is one line, so one node. Should
// a format ever return several, the rest are kept under `extraBranches`.
//
// A truncated completion is data here, not a run failure: it is recorded as
// an unusable sample with its partial text.

"use strict";

const fs = require("fs");
const path = require("path");

const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const Ids = require(path.join(R, "ids.js"));
const Grower = require(path.join(R, "grower.js"));
const { createClient, SAMPLED_SAMPLING } = require(path.join(R, "llm_client.js"));
const { sha256, sha256File } = require(path.join(R, "tools", "grow.js"));
const { seeds } = require(path.join(R, "seeds.js"));

// The grower's own sampled profile (llm_client.js), so a probed line and a
// grown line are drawn the same way.
const PROBE_SAMPLING = SAMPLED_SAMPLING;

// Refill rounds after the first: a node that still cannot fill K distinct
// samples is SATURATED, which is a finding (criedWolf is the known case), not
// a reason to keep drawing.
const MAX_REFILL_ROUNDS = 3;
const DEFAULT_K = 10;
const DEFAULT_RUN_SEED = 7;
const DEFAULT_ARMS = ["branch.v4", "branch.v5"];

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
  const args = { story: "red", k: DEFAULT_K, seed: DEFAULT_RUN_SEED, arms: DEFAULT_ARMS, temp: PROBE_SAMPLING.temperature, fast: false };
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
    else if (flag === "--fast") { args.fast = true; }
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!seeds[args.story]) throw new Error(`unknown story: ${args.story}`);
  args.nodes = args.nodes || DEFAULT_NODES[args.story];
  return args;
}

// Per-sample seeds are derived, not drawn: (run seed, arm, node, index) must
// give the same integer on a rerun or the file does not replay.
function sampleSeed(runSeed, arm, nodeId, index) {
  return parseInt(Ids.shortHash(`${runSeed}|${arm}|${nodeId}|${index}`).slice(0, 8), 16);
}

// ── drawing ─────────────────────────────────────────────────────────────────

// One draw. Returns a record that is ALWAYS written: a truncation and a good
// sample are both outcomes of the measurement.
async function drawJson({ client, prompt, constraint, parse, seed, arm, graph, source }) {
  const record = { arm, seed };
  try {
    const { content, stopType, cached, cacheKey } = await client.complete(
      prompt, constraint.schema, { seed, grammar: constraint.grammar, sourceExpr: source.expr },
    );
    Object.assign(record, { raw: content, stopType, cached, cacheKey });
  } catch (error) {
    if (!error.truncated) throw error;
    Object.assign(record, { raw: error.content, stopType: "limit", truncated: true, cacheKey: error.cacheKey });
    record.error = "truncated at n_predict";
    return record;
  }

  let branches;
  try { branches = await parse(record.raw, { graph, source }); } catch (error) { record.error = `unparseable: ${error.message}`; return record; }
  if (!Array.isArray(branches)) branches = [];
  if (branches.length === 0) { record.error = "no branches"; return record; }

  const [first, ...rest] = branches;
  record.branch = first;
  if (rest.length) record.extraBranches = rest;
  record.expr = String(first.expr || "");
  record.display = `${record.expr} — ${String(first.state || "")}`;
  // Does it reproduce the told story here (Grower.toldMatch)? Kept off the
  // grading display: a grader must not be shown the told future.
  const told = Grower.toldMatch(graph, source.id, record.expr);
  if (told) record.told = told;
  return record;
}

// Draw until `k` DISTINCT usable samples exist or the refill budget is spent.
// Distinctness is on normalized expr, the repo's one content key. `onAttempt`
// sees every record as it lands — the grow server streams progress from it.
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
    // Over every usable draw, duplicates included: how often the model
    // reproduces the told story at this node.
    usable: attempts.filter((a) => !a.error).length,
    toldNext: attempts.filter((a) => !a.error && a.told && a.told.kind === "next").length,
    toldLater: attempts.filter((a) => !a.error && a.told && a.told.kind === "later").length,
    saturated: samples.length < k,
    allAttempts: attempts,
  };
}

// ── run ─────────────────────────────────────────────────────────────────────

// `create` is injectable so the grow server's tests run the probe over the
// fixture transport.
function createProbeClient({
  baseUrl, temp = PROBE_SAMPLING.temperature, fast = false,
  create = (sampling) => createClient({ baseUrl, cacheDir: path.join(R, "cache"), sampling }),
} = {}) {
  return create({ ...PROBE_SAMPLING, temperature: temp, ...(fast ? { cache_prompt: true } : {}) });
}

function readTemplates(arms) {
  return Object.fromEntries(arms.map((arm) => [arm, fs.readFileSync(templatePathOf(arm), "utf8")]));
}

// Every arm at one node of `graph` (a seed, or a graph the page sent over).
// Returns the node's entry in the probe file's `results`.
async function probeNode({
  graph, nodeId, client, arms = DEFAULT_ARMS, templates = readTemplates(arms),
  // Reference (greedy) client for branch.v5's formalization step.
  formalClient = null,
  k = DEFAULT_K, runSeed = DEFAULT_RUN_SEED, onAttempt = null,
}) {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`no node ${nodeId} in the graph`);
  const context = Grower.promptContext(graph, node);
  const entry = { nodeId, path: Grower.ancestorPath(graph, nodeId), history: historyOf(graph, nodeId), arms: {} };

  for (const arm of arms) {
    const prompt = Grower.renderPrompt(templates[arm], context);
    const format = Grower.formatForPrompt(arm, { formalClient });
    const constraint = format.constrain(graph, node);
    const result = await drawDistinct(
      (index) => drawJson({
        client, prompt, constraint, parse: format.parse, arm, seed: sampleSeed(runSeed, arm, nodeId, index),
        graph, source: node,
      }),
      k,
      onAttempt,
    );
    entry.arms[arm] = { prompt, promptSha256: sha256(prompt), ...constraint, ...result };
  }
  return entry;
}

// What a grader reads before the candidates: the path up to the node, one
// `expr — state` line per step — the same line format the samples use.
function historyOf(graph, nodeId) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return Grower.ancestorPath(graph, nodeId)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((n) => `${n.expr}${n.state ? ` — ${n.state}` : ""}`);
}

// The probe file's manifest — what grade.js reads (`arms`, `runSeed`) plus
// everything a number from this batch needs to be traced to its config.
function probeManifest({ story, k, runSeed, arms, fast, client, props }) {
  const modelPath = props.model_path || "";
  return {
    probe: "continue_probe v2 (prompt-version A/B)",
    story,
    k,
    runSeed,
    arms,
    fast,
    sampling: client.sampling,
    model: {
      props,
      sha256: modelPath && fs.existsSync(modelPath) && process.env.SKIP_SHA256 !== "1"
        ? sha256File(modelPath)
        : null,
    },
    templates: Object.fromEntries(arms.map((arm) => [arm, { sha256: sha256File(templatePathOf(arm)) }])),
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const graph = Engine.normalizeGraph(seeds[args.story]);

  if (args.fast) {
    process.stderr.write("--fast: cache_prompt=true — this run is NOT bit-replayable. Re-run without --fast to record.\n");
  }
  const client = createProbeClient({ baseUrl: args.baseUrl, temp: args.temp, fast: args.fast });
  const formalClient = createClient({ baseUrl: args.baseUrl, cacheDir: path.join(R, "cache") });
  const templates = readTemplates(args.arms);
  const props = await client.props();
  const results = [];

  for (const nodeId of args.nodes) {
    const entry = await probeNode({ graph, nodeId, client, formalClient, arms: args.arms, templates, k: args.k, runSeed: args.seed });
    results.push(entry);
    const line = args.arms
      .map((arm) => {
        const a = entry.arms[arm];
        return `${arm} ${a.samples.length}/${args.k} (refused ${a.refused}, trunc ${a.truncated}, dup ${a.duplicates}, told next ${a.toldNext}/${a.usable})`;
      })
      .join("  |  ");
    process.stderr.write(`${nodeId}: ${line}\n`);
  }

  const output = {
    manifest: probeManifest({ story: args.story, k: args.k, runSeed: args.seed, arms: args.arms, fast: args.fast, client, props }),
    results,
  };
  const outDir = path.join(R, "experiments", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const out = args.out || path.join(outDir, `cont_${args.story}_${args.nodes.join("-")}_${args.arms.join("-")}.json`);
  fs.writeFileSync(out, JSON.stringify(output, null, 2));
  process.stderr.write(`\nwrote ${out}\n`);
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exit(1); });
}

module.exports = {
  PROBE_SAMPLING, DEFAULT_K, DEFAULT_ARMS, DEFAULT_NODES, sampleSeed, drawDistinct,
  createProbeClient, readTemplates, probeNode, probeManifest, historyOf,
};
