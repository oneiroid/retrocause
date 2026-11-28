#!/usr/bin/env node
// One recorded grow run, for the CLI below and for the Lab's bridge
// (tools/grow_server.js). A run writes runs/<runId>/: the grown graph, the
// manifest (parameters, model, prompt hashes, counters) and the trace (every
// request and completion). Runs are records, not replays: expansions race on
// the server's slots and prompt caching is on, so a rerun gives another graph.
//
//   npm run grow -- --story red --from red_woods --depth 4 --width 3 --beam 8 \
//                   --max-nodes 60 [--merge facts|routes|off] [--no-merge] [--prune yes] [--temperature 0.9]

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const Ids = require(path.join(REPO, "ids.js"));
const { createClient } = require(path.join(REPO, "llm_client.js"));
const { growGraph, DEFAULTS } = require(path.join(REPO, "grower.js"));

const PROMPT_DIR = path.join(REPO, "prompts");
const TEMPLATE_FILES = { branch: "branch.chat", same: "same.chat", future: "future.chat", critic: "critic.chat" };
const GRAPH_FILE = "grown_graph.json";
const MANIFEST_FILE = "growth_manifest.json";
const TRACE_FILE = "trace.json";
const INPUT_GRAPH_FILE = "input_graph.json";

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

function loadTemplates() {
  return Object.fromEntries(Object.entries(TEMPLATE_FILES).map(([key, name]) => [
    key, fs.readFileSync(path.join(PROMPT_DIR, `${name}.txt`), "utf8"),
  ]));
}

// Slots left free of generation, so a judge call starts at once instead of
// queueing behind every running expansion.
const SLOTS_FOR_JUDGES = 2;

// What the server says about itself.
async function serverInfo(client) {
  const props = await client.props();
  return { modelFile: path.basename(props.model_path || ""), slots: props.total_slots || 1, build: props.build_info || "" };
}

async function runGrow({ graph, from, params = {}, client = createClient(), outRoot = path.join(REPO, "runs"), signal, onEvent = () => {} }) {
  const info = await serverInfo(client);
  const templates = loadTemplates();
  const settings = { ...DEFAULTS, ...params };
  const createdAt = new Date().toISOString();
  const runId = `run_${Ids.shortHash(`${createdAt}|${from}|${JSON.stringify(settings)}`)}`;
  onEvent({ type: "start", runId, ...info, settings });

  const result = await growGraph({ ...settings, graph, from, client, templates, concurrency: Math.max(1, info.slots - SLOTS_FOR_JUDGES), runId, signal, onEvent });

  const outDir = path.join(outRoot, runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, INPUT_GRAPH_FILE), Ids.canonicalJson(graph));
  fs.writeFileSync(path.join(outDir, GRAPH_FILE), Ids.canonicalJson(result.graph));
  fs.writeFileSync(path.join(outDir, TRACE_FILE), JSON.stringify(result.trace, null, 2));
  fs.writeFileSync(path.join(outDir, MANIFEST_FILE), JSON.stringify({
    runId,
    createdAt,
    replayable: false,
    model: info,
    story: graph.title || (graph.meta && graph.meta.title) || null,
    traversal: { from, ...settings },
    prompts: Object.fromEntries(Object.entries(templates).map(([key, text]) => [TEMPLATE_FILES[key], sha256(text)])),
    ...(result.error ? { error: result.error.message } : {}),
    result: result.stats,
  }, null, 2));
  return { runId, ...result };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument: ${argv[i]}`);
    const key = argv[i].slice(2);
    if (key.startsWith("no-")) out[key.slice(3)] = false;
    else {
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { seeds } = require(path.join(REPO, "seeds.js"));
  const seed = seeds[args.story];
  if (!seed) throw new Error(`--story must be one of ${Object.keys(seeds).join(", ")}`);
  const from = args.from || seed.root;
  const params = {};
  for (const [flag, key] of [["depth", "depth"], ["width", "width"], ["beam", "beam"], ["max-nodes", "maxNodes"], ["temperature", "temperature"]]) {
    if (args[flag] !== undefined) params[key] = +args[flag];
  }
  if (args.merge !== undefined) params.merge = args.merge === false ? "off" : args.merge;
  if (args.prune !== undefined) params.prune = args.prune !== false && args.prune !== "no";

  let lastLine = 0;
  const { runId, stats, error } = await runGrow({
    graph: seed,
    from,
    params,
    onEvent: (event) => {
      if (event.type === "node") console.log(`+ d${event.depth} ${event.node.label}  [${event.node.effects || event.node.state}]`);
      if (event.type === "merge") console.log(`= ${event.how} "${event.label}" -> ${event.into}${event.pYes === undefined ? "" : ` P=${event.pYes.toFixed(2)}`}`);
      if (event.type === "pruned") console.log(`x pruned (${event.reason}) ${event.label}`);
      if (event.type === "progress" && Date.now() - lastLine > 5000) {
        lastLine = Date.now();
        console.log(`… ${event.stats.expansions}/${event.planned} expansions, ${event.stats.created} nodes, ${event.tokensPerSecond.toFixed(0)} tok/s, ${(event.elapsedMs / 1000).toFixed(0)}s`);
      }
    },
  });
  console.log(`${runId}: ${JSON.stringify(stats)}`);
  if (error) throw error;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  runGrow, loadTemplates, serverInfo, sha256, TEMPLATE_FILES, PROMPT_DIR, GRAPH_FILE, MANIFEST_FILE, TRACE_FILE,
};
