#!/usr/bin/env node
// Snapshot extractor (LOCAL_LLM.md §8, "Accumulated state").
//
//   node tools/extract_state.js --story red [--prompt state.v1] [--out -]
//
// Asks the model, once per node, what is TRUE after that event, as
// `owner.property=value` facts. It does NOT ask what changed: deltas are the
// diff of consecutive snapshots, and a diff is arithmetic, not judgment. That
// division is the point — the model does the part that resists formalisation,
// the code does the part that does not.
//
// This is a DRAFTING tool. Its output is meant to be read and corrected by a
// human before it lands in seeds.js. If the model writes the ground truth and
// also writes the graphs scored against it, the probe measures the model's
// self-consistency rather than its correctness (§8). Author review is what
// keeps that from happening, at ~5% of the cost of authoring from scratch.
//
// Node-only, same reference profile and response cache as the grower, so a
// re-run is free and byte-identical.

"use strict";

const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");
const Engine = require(path.join(REPO, "story_builder_engine.js"));
const Ids = require(path.join(REPO, "ids.js"));
const { createClient } = require(path.join(REPO, "llm_client.js"));
const { renderPrompt, promptContext } = require(path.join(REPO, "grower.js"));
const { seeds } = require(path.join(REPO, "seeds.js"));

// Facts are free strings under the grammar; the `owner.property=value` shape
// is taught by the few-shot, not enforced here. Enforcing it as a regex would
// turn a malformed fact into a hard failure mid-run; reporting it lets the
// reviewer see exactly how the model went off-shape.
const STATE_SCHEMA = {
  type: "object",
  required: ["facts"],
  properties: {
    // maxItems is not decoration. Without it the grammar permits an
    // unbounded array, and a base model with no strong stop signal will fill
    // n_predict with facts and truncate — which is what happened on the first
    // run. The branch schema has carried a cap since §5.3; this one must too.
    // The bound also states the design limit out loud: a snapshot that needs
    // more than this many facts is a story whose state has outgrown the
    // window, and that is a finding, not something to raise the cap for.
    facts: { type: "array", minItems: 1, maxItems: 16, items: { type: "string" } },
  },
};

const WELL_FORMED = /^[a-z_]+\.[a-z_]+=[a-z_0-9]+$/;

// Snapshots are per-node, so the delta is the diff against the node's
// predecessor on the seed chain — last-write-wins falls out of the diff
// instead of being folded along a route. A variable that appears with a new
// value changed; one that appears for the first time changed; one that
// vanished is NOT treated as a change, because a model omitting a fact is far
// more likely to be forgetful than to be asserting a retraction.
function diff(before, after) {
  const prior = new Map(before.map((f) => f.split("=")).map(([k, v]) => [k, v]));
  return after.filter((f) => {
    const [k, v] = f.split("=");
    return prior.get(k) !== v;
  });
}

async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i].startsWith("--")) args[process.argv[i].slice(2)] = process.argv[i + 1];
  }
  const story = args.story;
  if (!story || !seeds[story]) {
    console.error(`--story must be one of: ${Object.keys(seeds).join(", ")}`);
    process.exit(1);
  }
  const template = fs.readFileSync(
    path.join(REPO, "prompts", `${args.prompt || "state.v1"}.txt`), "utf8",
  );
  const client = createClient({
    baseUrl: args.baseUrl,
    cacheDir: path.join(REPO, "cache"),
    sampling: { seed: 7 },
  });

  const graph = Engine.normalizeGraph(seeds[story]);
  // Seed stories are chains, so "the previous node" is well defined here.
  // This tool is for seeds; grown graphs branch and would need the pinned
  // ancestor path instead.
  const order = graph.nodes.slice();
  const out = [];
  let previous = [];
  for (const node of order) {
    const prompt = renderPrompt(template, node, promptContext(graph, node));
    let facts;
    try {
      const { content } = await client.complete(prompt, STATE_SCHEMA, {});
      facts = JSON.parse(content).facts.map((f) => Ids.normalizedContent(f));
    } catch (error) {
      // Report and continue: a drafting tool that dies on node 1 tells you
      // nothing about nodes 2-14, and which nodes fail is the measurement.
      console.error(`  !! ${node.id} ${node.expr}: ${error.message}`);
      out.push({ id: node.id, expr: node.expr, facts: [], delta: [], malformed: [], failed: true });
      continue;
    }
    const malformed = facts.filter((f) => !WELL_FORMED.test(f));
    out.push({ id: node.id, expr: node.expr, facts, delta: diff(previous, facts), malformed });
    previous = facts;
  }

  for (const r of out) {
    console.log(`\n${r.id}  ${r.expr}`);
    console.log(`  delta: ${r.delta.join(", ") || "(nothing changed)"}`);
    console.log(`  state: ${r.facts.join(", ")}`);
    if (r.malformed.length) console.log(`  MALFORMED: ${r.malformed.join(", ")}`);
  }

  const total = out.reduce((n, r) => n + r.facts.length, 0);
  const bad = out.reduce((n, r) => n + r.malformed.length, 0);
  const empty = out.filter((r) => !r.failed && !r.delta.length).length;
  const failed = out.filter((r) => r.failed).length;
  if (failed) console.log(`--- ${failed}/${out.length} nodes FAILED (truncation or bad JSON)`);
  console.log(`\n--- ${out.length} nodes, ${total} facts, ${bad} malformed `
    + `(${(bad / total * 100).toFixed(0)}%), ${empty} nodes where nothing changed`);
  const vars = new Set(out.flatMap((r) => r.facts.map((f) => f.split("=")[0])));
  console.log(`--- ${vars.size} distinct variables: ${[...vars].sort().join(", ")}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
