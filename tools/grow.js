#!/usr/bin/env node
// CLI entry point (LOCAL_LLM.md §5.2): grow a seed story's DAG through the
// local model and emit grown_graph.json + growth_manifest.json.
//
//   npm run grow -- --story red [--from red_start] [--depth 3] [--width 2]
//                   [--max-nodes 24] [--seed 7] [--out runs]
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
const { createClient } = require(path.join(REPO, "llm_client.js"));
const { growGraph } = require(path.join(REPO, "grower.js"));
const { seeds } = require(path.join(REPO, "seeds.js"));

const PROMPT_VERSION = "branch.v1";
const PROMPT_PATH = path.join(REPO, "prompts", `${PROMPT_VERSION}.txt`);
const PROFILE = "reference";
const DEFAULTS = { depth: 3, width: 2, maxNodes: 24, seed: 7, out: "runs" };
const GRAPH_FILE = "grown_graph.json";
const MANIFEST_FILE = "growth_manifest.json";

function parseArgs(argv) {
  const args = { cached: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--replay") args.replay = true;
    else if (a === "--cached") args.cached = true;
    else if (a.startsWith("--")) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
    else args.positional.push(a);
  }
  return args;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// The whole configuration a replay needs, gathered in one place so runId can
// hash exactly these fields — not `createdAt` (two identical runs would get
// different ids) and not `result` (an outcome inside the id of the
// configuration that produced it is circular). §5.4.
async function buildConfig({ story, from, depth, width, maxNodes, samplingSeed, client }) {
  const props = await client.props();

  const modelPath = props.model_path || "";
  const model = {
    file: path.basename(modelPath),
    // The GGUF is an artifact outside this repo; hash it rather than assume
    // it (§2.4). If the server runs on another machine the path may not
    // resolve here — record null honestly instead of a guess.
    sha256: fs.existsSync(modelPath) ? sha256(fs.readFileSync(modelPath)) : null,
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

  const promptText = fs.readFileSync(PROMPT_PATH, "utf8");
  const inputGraph = Engine.normalizeGraph(seeds[story]);

  const config = {
    profile: PROFILE,
    model,
    server,
    sampling: client.sampling,
    prompt: { template: PROMPT_VERSION, sha256: sha256(promptText) },
    traversal: { from, depth, width, maxNodes },
    input: { seed: story, graphSha256: sha256(Ids.canonicalJson(inputGraph)) },
  };
  return { config, promptText, inputGraph, samplingSeed };
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
    sampling: { seed: samplingSeed },
  });
  const { config, promptText, inputGraph } = await buildConfig({
    story, from, depth, width, maxNodes, samplingSeed, client,
  });
  const runId = runIdOf(config);

  const { graph, stats, validation } = await growGraph({
    graph: inputGraph,
    client,
    promptTemplate: promptText,
    from,
    depth,
    width,
    maxNodes,
    runId,
  });

  const outDir = path.join(REPO, args.out || DEFAULTS.out, runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, GRAPH_FILE), Ids.canonicalJson(graph));
  const manifest = {
    runId,
    createdAt: new Date().toISOString(),
    ...config,
    result: {
      created: stats.created,
      rejectedCycles: stats.rejectedCycles,
      mergedDuplicates: stats.mergedDuplicates,
      truncated: stats.truncated,
      droppedRejoins: stats.droppedRejoins,
      expansions: stats.expansions,
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
    samplingSeed: manifest.sampling.seed,
    client,
  });

  // A replay against a drifted configuration would diff graphs grown by two
  // different instruments and call the difference "the model". Fail loudly.
  for (const [name, recorded, current] of [
    ["prompt", manifest.prompt.sha256, config.prompt.sha256],
    ["input graph", manifest.input.graphSha256, config.input.graphSha256],
    ["model", manifest.model.sha256, config.model.sha256],
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
    from: manifest.traversal.from,
    depth: manifest.traversal.depth,
    width: manifest.traversal.width,
    maxNodes: manifest.traversal.maxNodes,
    runId: manifest.runId,
    bypassCache: !args.cached,
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

const args = parseArgs(process.argv.slice(2));
(args.replay ? replay(args) : grow(args)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
