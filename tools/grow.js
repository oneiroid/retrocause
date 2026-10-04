#!/usr/bin/env node
// CLI entry point (LOCAL_LLM.md §5.2): grow a seed story's DAG through the
// local model and emit grown_graph.json + growth_manifest.json.
//
//   npm run grow -- --story red [--from red_start] [--depth 3] [--width 2]
//                   [--max-nodes 24] [--seed 7] [--out runs]
//                   [--prompt branch.v4] [--no-judge]
//   npm run grow:replay -- runs/<runId>/growth_manifest.json [--cached]
//
// Replay re-runs from the manifest and diffs canonical JSON. It is
// CACHE-COLD by default (§4.2): with the response cache in the way, every
// request is served from disk and the "replay" never touches the model.
// `--cached` exists for debugging the traversal (Layers 0–2), and a cached
// replay is never reported as a model-replay success.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
const Engine = require(path.join(REPO, "story_builder_engine.js"));
const Ids = require(path.join(REPO, "ids.js"));
const { createClient, SAMPLED_SAMPLING } = require(path.join(REPO, "llm_client.js"));
const { growGraph, formatForPrompt } = require(path.join(REPO, "grower.js"));
const { createJudge, SAME_THRESHOLD, JUDGE_PROMPT } = require(path.join(REPO, "same_judge.js"));
const { seeds } = require(path.join(REPO, "seeds.js"));

// branch.v4 is the only template. v1–v3 were deleted 2026-09-29 (instruction
// prompts sent to a base model); runs recorded under them keep their
// manifests as records but are no longer replayable.
const DEFAULT_PROMPT_VERSION = "branch.v4";
const promptPathOf = (version) => path.join(REPO, "prompts", `${version}.txt`);
const PROFILE = "sampled";
const DEFAULTS = { depth: 3, width: 2, maxNodes: 24, seed: 7, out: "runs" };
const GRAPH_FILE = "grown_graph.json";
const MANIFEST_FILE = "growth_manifest.json";
// Every prompt sent and completion received, per expansion (grower `trace`),
// including the merge judge's verdicts. The Lab panel shows it.
const TRACE_FILE = "trace.json";

function parseArgs(argv) {
  const args = { cached: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--replay") args.replay = true;
    else if (a === "--cached") args.cached = true;
    else if (a === "--no-judge") args.noJudge = true;
    else if (a.startsWith("--")) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else args.positional.push(a);
  }
  return args;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Streamed, not readFileSync: Node caps one Buffer at 2 GiB, and the 4B
// Q5_K_M GGUF (2.9 GB) is over it — a whole-file read throws before the run
// starts. Memoized on (path, size, mtime) because the grow server hashes the
// model on every request and a multi-GB hash costs seconds.
const fileHashMemo = new Map();

function sha256File(file) {
  const { size, mtimeMs } = fs.statSync(file);
  const memoKey = `${file}|${size}|${mtimeMs}`;
  if (fileHashMemo.has(memoKey)) return fileHashMemo.get(memoKey);
  const hash = crypto.createHash("sha256");
  const CHUNK = 8 * 1024 * 1024;
  const buffer = Buffer.allocUnsafe(CHUNK);
  const fd = fs.openSync(file, "r");
  try {
    for (let read = 0; (read = fs.readSync(fd, buffer, 0, CHUNK, null)) > 0;) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  const digest = hash.digest("hex");
  fileHashMemo.set(memoKey, digest);
  return digest;
}

// The whole configuration a replay needs, gathered in one place so runId can
// hash exactly these fields — not `createdAt` (two identical runs would get
// different ids) and not `result` (an outcome inside the id of the
// configuration that produced it is circular). §5.4.
//
// `story` may be null: the grow server (tools/grow_server.js) grows graphs
// the UI sends over, which have no seed name. The graph hash still pins the
// input; such manifests carry `input.seed: null` plus an input_graph.json
// beside them, and `grow:replay` cannot re-run them from the seed table.
//
// `source` is set only for a non-default candidate source (the grow server's
// baseline runs): `{ name, ...details }`. Absent, the config — and so
// every recorded runId — is exactly what it was before sources existed.
async function buildConfig({
  story = null, graph = null, from, depth, width, maxNodes, client,
  promptVersion = DEFAULT_PROMPT_VERSION, source = null, judge = null,
}) {
  const props = await client.props();

  const modelPath = props.model_path || "";
  const model = {
    file: path.basename(modelPath),
    // The GGUF is an artifact outside this repo; hash it rather than assume
    // it (§2.4). If the server runs on another machine the path may not
    // resolve here — record null honestly instead of a guess.
    sha256: modelPath && fs.existsSync(modelPath) ? sha256File(modelPath) : null,
  };

  const generationDefaults = props.default_generation_settings || {};
  const server = {
    build_info: props.build_info || null,
    model_ftype: props.model_ftype || null,
    total_slots: props.total_slots || null,
    n_ctx: generationDefaults.n_ctx || null,
    // Captured wholesale: this is the record of every sampler default the
    // requests did NOT override — the hidden-hyperparameter class §4.2 is
    // about (`system_fingerprint` does not exist on this build).
    default_generation_settings: generationDefaults,
  };

  const promptText = fs.readFileSync(promptPathOf(promptVersion), "utf8");
  const inputGraph = Engine.normalizeGraph(graph || seeds[story]);

  const config = {
    profile: PROFILE,
    model,
    server,
    sampling: client.sampling,
    prompt: { template: promptVersion, sha256: sha256(promptText) },
    traversal: { from, depth, width, maxNodes },
    input: { seed: story, graphSha256: sha256(Ids.canonicalJson(inputGraph)) },
    ...(source ? { source } : {}),
    // The merge judge's config block (createRunJudge), when the run had one.
    ...(judge ? { judge } : {}),
  };
  return { config, promptText, inputGraph };
}

// The confirm-before-merge judge for a model run, plus the manifest block that
// records it. Its client is the reference profile: the verdict is read off
// next-token logprobs, so its sampler never decides anything, and it must not
// inherit the growth profile's seed or temperature.
function createRunJudge({ makeClient, threshold = SAME_THRESHOLD }) {
  const template = fs.readFileSync(promptPathOf(JUDGE_PROMPT), "utf8");
  return {
    judge: createJudge({ client: makeClient(), template, threshold }),
    config: { prompt: JUDGE_PROMPT, sha256: sha256(template), threshold },
  };
}

function runIdOf(config) {
  return `run_${Ids.shortHash(JSON.stringify(config))}`;
}

async function grow(args) {
  const story = args.story;
  if (!story || !seeds[story]) {
    console.error(`--story must be one of: ${Object.keys(seeds).join(", ")}`);
    process.exit(1);
  }
  const from = args.from || seeds[story].root;
  const depth = +(args.depth || DEFAULTS.depth);
  const width = +(args.width || DEFAULTS.width);
  const maxNodes = +(args.maxNodes || DEFAULTS.maxNodes);
  const samplingSeed = +(args.seed || DEFAULTS.seed);

  const client = createClient({
    baseUrl: args.baseUrl,
    cacheDir: path.join(REPO, "cache"),
    sampling: { ...SAMPLED_SAMPLING, seed: samplingSeed },
  });
  // The reference (greedy) client: the merge judge and v5's formalizer.
  const refClient = createClient({ baseUrl: args.baseUrl, cacheDir: path.join(REPO, "cache") });
  // On by default; `--no-judge` grows with the surface key alone.
  const runJudge = args.noJudge ? null : createRunJudge({ makeClient: () => refClient });
  const { config, promptText, inputGraph } = await buildConfig({
    story, from, depth, width, maxNodes, client,
    promptVersion: args.prompt || DEFAULT_PROMPT_VERSION,
    judge: runJudge && runJudge.config,
  });
  const runId = runIdOf(config);

  const { graph, stats, validation, trace } = await growGraph({
    graph: inputGraph,
    client,
    promptTemplate: promptText,
    format: formatForPrompt(config.prompt.template, { formalClient: refClient }),
    from,
    depth,
    width,
    maxNodes,
    runId,
    judge: runJudge && runJudge.judge,
  });

  const outDir = path.join(REPO, args.out || DEFAULTS.out, runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, GRAPH_FILE), Ids.canonicalJson(graph));
  fs.writeFileSync(path.join(outDir, TRACE_FILE), JSON.stringify(trace, null, 2));
  const manifest = {
    runId,
    createdAt: new Date().toISOString(),
    ...config,
    result: {
      created: stats.created,
      rejectedCycles: stats.rejectedCycles,
      rejectedNullTransitions: stats.rejectedNullTransitions,
      mergedDuplicates: stats.mergedDuplicates,
      truncated: stats.truncated,
      expansions: stats.expansions,
      mergesRefused: stats.mergesRefused,
    },
  };
  fs.writeFileSync(path.join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));

  console.log(`run ${runId}`);
  console.table([manifest.result]);
  if (!validation.ok) console.error("validation errors:", validation.errors);
  if (validation.warnings.length) console.log(`warnings: ${validation.warnings.length} (open branches / orphans)`);
  console.log(`graph:    ${path.relative(REPO, path.join(outDir, GRAPH_FILE))}`);
  console.log(`manifest: ${path.relative(REPO, path.join(outDir, MANIFEST_FILE))}`);
  process.exit(validation.ok ? 0 : 1);
}

async function replay(args) {
  const manifestPath = args.positional[0];
  if (!manifestPath) {
    console.error("usage: npm run grow:replay -- runs/<runId>/growth_manifest.json [--cached]");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const recordedGraph = fs.readFileSync(path.join(path.dirname(manifestPath), GRAPH_FILE), "utf8");

  const client = createClient({
    baseUrl: args.baseUrl,
    cacheDir: path.join(REPO, "cache"),
    sampling: manifest.sampling,
  });
  const { config, promptText, inputGraph } = await buildConfig({
    story: manifest.input.seed,
    from: manifest.traversal.from,
    depth: manifest.traversal.depth,
    width: manifest.traversal.width,
    maxNodes: manifest.traversal.maxNodes,
    client,
    // From the manifest, never the current default: rebuilding a run under a
    // different template would trip the prompt-hash guard below and report a
    // template swap as a replay failure.
    promptVersion: manifest.prompt.template,
  });
  const refClient = createClient({ baseUrl: args.baseUrl, cacheDir: path.join(REPO, "cache") });
  const runJudge = manifest.judge ? createRunJudge({
    makeClient: () => refClient,
    threshold: manifest.judge.threshold,
  }) : null;

  // A replay against a drifted configuration would diff graphs grown by two
  // different instruments and call the difference "the model". Fail loudly.
  for (const [name, recorded, current] of [
    ["prompt", manifest.prompt.sha256, config.prompt.sha256],
    ["input graph", manifest.input.graphSha256, config.input.graphSha256],
    ["model", manifest.model.sha256, config.model.sha256],
    ["judge prompt", manifest.judge && manifest.judge.sha256, runJudge && runJudge.config.sha256],
  ]) {
    if (recorded && current && recorded !== current) {
      console.error(`REPLAY INVALID — ${name} hash differs from the manifest`);
      console.error(`  recorded ${recorded}\n  current  ${current}`);
      process.exit(1);
    }
  }

  const { graph } = await growGraph({
    graph: inputGraph,
    client,
    promptTemplate: promptText,
    format: formatForPrompt(manifest.prompt.template, { formalClient: refClient }),
    from: manifest.traversal.from,
    depth: manifest.traversal.depth,
    width: manifest.traversal.width,
    maxNodes: manifest.traversal.maxNodes,
    runId: manifest.runId,
    bypassCache: !args.cached,
    judge: runJudge && runJudge.judge,
  });

  const replayed = Ids.canonicalJson(graph);
  const mode = args.cached ? "cached (traversal-only, NOT a model replay)" : "cache-cold";
  if (replayed === recordedGraph) {
    console.log(`REPLAY OK [${mode}] — canonical JSON is byte-identical (${manifest.runId})`);
    process.exit(0);
  }
  const divergedPath = path.join(path.dirname(manifestPath), "replay_diverged.json");
  fs.writeFileSync(divergedPath, replayed);
  console.error(`REPLAY MISMATCH [${mode}] — diverged graph written to ${divergedPath}`);
  console.error("diff it against the recorded graph to locate the first divergent id");
  process.exit(1);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  (args.replay ? replay(args) : grow(args)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

// The grow server reuses the config/manifest machinery so UI-triggered runs
// are provenanced by the same instrument as CLI runs — a second manifest
// writer would drift.
module.exports = {
  buildConfig, runIdOf, sha256, sha256File, promptPathOf, DEFAULT_PROMPT_VERSION, DEFAULTS, GRAPH_FILE, MANIFEST_FILE,
  createRunJudge, TRACE_FILE,
};
