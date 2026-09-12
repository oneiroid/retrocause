#!/usr/bin/env node
// Would the frames source converge under a model-judged content key?
//
//   node experiments/frame_merge.js [--story red] [--from red_tell]
//                                   [--depth 2] [--width 2] [--max-nodes 8]
//                                   [--seed 7] [--apply]
//
// REPORTS ONLY by default. It grows nothing new — the graph comes from
// `eval.evalRun`, so on a warm cache the only model calls are the judge's —
// and it never mutates the graph unless `--apply`, which exists to show what
// the merges would DO and still writes nothing to disk.
//
// ── why this is not wired into growth.js ────────────────────────────────────
//
// Continuation plan v3: "Unattended auto-merge stays off (the false-merge
// finding stands)." That finding is on record — `same_state.js --adversarial`
// produced false merges, and a human review of its labels flipped one. A
// judge that is right most of the time, applied automatically at insert time,
// silently fuses states that are not the same, and a fused state cannot be
// un-fused by looking at the graph afterwards. So the judge proposes and a
// human disposes.
//
// ── why frames need this at all ─────────────────────────────────────────────
//
// `merge_predicate.defaultContentKey` is `normalizedContent(expr)`. Seed exprs
// are `deed(args)`; frame-grown exprs are `actor | action | outcome` free
// text. Free text essentially never collides, so for the frames source
// merge-on-insert never fires and every convergence metric in eval.js reads
// zero BY CONSTRUCTION — not because the stories fail to converge. The
// predicate's own header anticipates exactly this: "If two same-content
// states really differ in the present, express that in a richer contentKey."
// This is that richer key, measured before anyone wires it in.
//
// ── the actor guard ─────────────────────────────────────────────────────────
//
// `same_state.js` pairs the model with an argument guard: the model's "same"
// is vetoed unless the two exprs share their arguments in order, which is
// what stops role swaps ("the wolf eats the grandmother" / "the grandmother
// eats the wolf") from merging. Frames have no argument list, and their
// analogue is exact: two events with different actors are not the same event.
// The guard can only ever turn "same" into "different", so it cannot create a
// merge the model did not propose.

"use strict";

const fs = require("fs");
const path = require("path");

const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const Frames = require(path.join(R, "frames.js"));
const Ids = require(path.join(R, "ids.js"));
const Predicate = require(path.join(R, "merge_predicate.js"));
const { createClient } = require(path.join(R, "llm_client.js"));
const Eval = require(path.join(R, "tools", "eval.js"));

const SCHEMA = { type: "object", required: ["same"], properties: { same: { type: "boolean" } } };
const JUDGE_PROMPT = "same.v2";
// Greedy, like same_state.js: this is bounded discrimination, and a sampled
// bit is a coin flip with extra steps.
const JUDGE_SAMPLING = { seed: 7 };

const DEFAULTS = { story: "red", depth: 2, width: 2, maxNodes: 8, seed: 7 };

// Startup control, run before any analysis. A judge that has gone degenerate
// — answering "different" to everything — is indistinguishable from a graph
// with nothing to merge, and the second is the result this tool exists to
// report. same_state.js records the same trap ("the model answered X to EVERY
// pair"). Four pairs, both directions, and a failure ABORTS: a broken judge
// makes every number below it meaningless, and printing zeroes anyway would
// publish a false negative.
const CONTROL = [
  ["identical", true,
    "Then the wolf runs ahead and reaches the house first, and now the wolf is at the door while Red is still in the woods.",
    "Then the wolf runs ahead and reaches the house first, and now the wolf is at the door while Red is still in the woods."],
  ["paraphrase", true,
    "Then the wolf runs ahead and reaches the house first, and now the wolf is at the door while Red is still in the woods.",
    "Then the wolf hurries on and gets to the cottage before her, and now the wolf waits at the grandmother door and Red is behind in the trees."],
  ["actor swap", false,
    "Then the wolf swallows the grandmother whole, and now the grandmother is inside the wolf.",
    "Then Red swallows the grandmother whole, and now the grandmother is inside Red."],
  ["extra fact", false,
    "Then Red walks into the woods with the basket, and now Red is alone on the path among the trees.",
    "Then Red walks into the woods with the basket, and now Red is on the path and the wolf is watching her from the trees."],
];

async function runControl(client, template) {
  const results = [];
  for (const [kind, expected, a, b] of CONTROL) {
    const prompt = template.replaceAll("{{a}}", a).replaceAll("{{b}}", b);
    let got = null;
    try { got = JSON.parse((await client.complete(prompt, SCHEMA, {})).content).same === true; } catch (error) { got = null; }
    results.push({ kind, expected, got, ok: got === expected });
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`judge control (${JUDGE_PROMPT}): ${passed}/${results.length}` +
    results.map((r) => `  [${r.kind}] ${r.expected}->${r.got}`).join(""));
  if (passed < results.length) {
    throw new Error("judge failed its control — refusing to report merges it cannot be trusted to find");
  }
}
const MID_STORY = { red: "red_tell", criedWolf: "cw_laugh", trojanHorse: "th_lie" };

function parseArgs(argv) {
  const args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a.startsWith("--")) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return args;
}

// The frame analogue of same_state.js's argument guard.
function sameActor(a, b) {
  return Ids.normalizedContent(a.frame.actor) === Ids.normalizedContent(b.frame.actor);
}

// Every pair the merge predicate would accept if only the content key said
// yes: distinct, both framed, and INCOMPARABLE (neither reaches the other).
// The incomparability clause is structural and is not the judge's business —
// merge_predicate.js already settles it, and a comparable pair is recurrence,
// not convergence.
function candidatePairs(graph) {
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  const grown = graph.nodes.filter((n) => n.createdBy === "grown" && n.frame).sort(byId);
  // Seed nodes are candidates too, and they are the important ones: the JSON
  // boundary earned its first convergence as grown->SEED edges, by emitting a
  // seed's own expr. A grown node and a seed node further down the told story
  // are incomparable — the grown node has no edge back to the spine — so the
  // predicate would accept them if the content key said yes. Measuring only
  // grown-vs-grown would have answered a narrower question than the one that
  // matters.
  const seedNodes = graph.nodes.filter((n) => n.createdBy !== "grown" && n.frame).sort(byId);

  const pairs = [];
  const push = (a, b, kind) => {
    if (a.id === b.id) return;
    if (Engine.reachable(graph, a.id, b.id) || Engine.reachable(graph, b.id, a.id)) return;
    pairs.push({ a, b, kind });
  };
  for (let i = 0; i < grown.length; i += 1) {
    for (let j = i + 1; j < grown.length; j += 1) push(grown[i], grown[j], "grown-grown");
    for (const seed of seedNodes) push(grown[i], seed, "grown-seed");
  }
  return { grown, seedNodes, pairs };
}

async function judge(client, template, a, b) {
  const prompt = template
    .replaceAll("{{a}}", Frames.render(a.frame))
    .replaceAll("{{b}}", Frames.render(b.frame));
  try {
    const { content } = await client.complete(prompt, SCHEMA, {});
    return JSON.parse(content).same === true;
  } catch (error) {
    // A null answer is an infrastructure failure, not an opinion, and must
    // never read as "different" — that is same_state.js's recorded trap.
    return null;
  }
}

async function analyse(story, args) {
  const from = args.from || MID_STORY[story] || null;
  const row = await Eval.evalRun({
    source: "frames", story, from,
    depth: +(args.depth || DEFAULTS.depth),
    width: +(args.width || DEFAULTS.width),
    maxNodes: +(args.maxNodes || DEFAULTS.maxNodes),
    seed: +(args.seed || DEFAULTS.seed),
    replay: false,
  });
  const graph = row.graph;
  const { grown, seedNodes, pairs } = candidatePairs(graph);

  const template = fs.readFileSync(path.join(R, "prompts", `${JUDGE_PROMPT}.txt`), "utf8");
  const client = createClient({ cacheDir: path.join(R, "cache"), sampling: JUDGE_SAMPLING });

  const verdicts = [];
  for (const { a, b, kind } of pairs) {
    const raw = await judge(client, template, a, b);
    const guarded = raw === null ? null : (sameActor(a, b) ? raw : false);
    verdicts.push({ a, b, kind, raw, guarded, vetoed: raw === true && guarded === false });
  }

  const merges = verdicts.filter((v) => v.guarded === true);
  const failed = verdicts.filter((v) => v.raw === null).length;

  console.log(`\n══ ${story} from ${from || graph.root} ══`);
  const kindCount = (k) => pairs.filter((p) => p.kind === k).length;
  const mergeKind = (k) => merges.filter((v) => v.kind === k).length;
  console.log(`  grown ${grown.length}  seed ${seedNodes.length}  parallel pairs ${pairs.length}` +
    ` (grown-grown ${kindCount("grown-grown")}, grown-seed ${kindCount("grown-seed")})` +
    `   model said same ${verdicts.filter((v) => v.raw === true).length}` +
    `   guard vetoed ${verdicts.filter((v) => v.vetoed).length}` +
    (failed ? `   NO ANSWER ${failed}` : ""));
  console.log(`  proposed merges ${merges.length}` +
    ` (grown-grown ${mergeKind("grown-grown")}, grown-seed ${mergeKind("grown-seed")})`);
  for (const v of merges) {
    console.log(`   MERGE? [${v.kind}] ${Frames.render(v.a.frame)}`);
    console.log(`                    ${v.b.id}: ${Frames.render(v.b.frame)}`);
  }
  for (const v of verdicts.filter((x) => x.vetoed)) {
    console.log(`   vetoed  ${v.a.frame.actor} / ${v.b.frame.actor} — different actors`);
  }

  // `--apply` shows what the merges would DO to the graph, in memory only. It
  // is a preview, not a pipeline: nothing is written and growth.js is not
  // involved, so no run can acquire these merges by accident.
  if (args.apply && merges.length) {
    const before = graph.nodes.length;
    const removed = new Set();
    for (const v of merges) {
      if (removed.has(v.a.id) || removed.has(v.b.id)) continue;
      for (const e of graph.edges) if (e.to === v.b.id) e.to = v.a.id;
      removed.add(v.b.id);
    }
    graph.nodes = graph.nodes.filter((n) => !removed.has(n.id));
    const validation = Engine.validateGraph(graph);
    console.log(`  --apply preview: ${before} nodes -> ${graph.nodes.length}` +
      `, graph ${validation.ok === false ? "INVALID" : "still valid"}`);
  }
  return { story, grown: grown.length, pairs: pairs.length, merges: merges.length,
    grownSeedMerges: mergeKind("grown-seed"), failed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stories = (args.story || Object.keys(MID_STORY).join(",")).split(",");
  const controlClient = createClient({ cacheDir: path.join(R, "cache"), sampling: JUDGE_SAMPLING });
  await runControl(controlClient, fs.readFileSync(path.join(R, "prompts", `${JUDGE_PROMPT}.txt`), "utf8"));

  const totals = [];
  for (const story of stories) totals.push(await analyse(story, args));
  console.log("\n  totals:", JSON.stringify(totals));
  console.log("  REPORT ONLY — no merge is applied to any stored graph. Confirm by hand.");
}

if (require.main === module) {
  main().catch((error) => { console.error(error.stack); process.exit(1); });
}

module.exports = { candidatePairs, sameActor, runControl, CONTROL, JUDGE_PROMPT };
