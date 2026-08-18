#!/usr/bin/env node
// Eval harness (LOCAL_LLM.md §6): score grown graphs against the gen_probe
// baseline. A script, not a `node --test` case — scoring is deterministic and
// its output is a table.
//
//   node tools/eval.js score runs/<runId> [runs/<runId> ...]
//   node tools/eval.js sweep --stories red,criedWolf,trojanHorse
//                            [--depth 2] [--width 2] [--max-nodes 8] [--seed 7]
//                            [--replay] [--baseline-only] [--show]
//
// `sweep` grows one model run and one baseline run per story on the same
// budgets and scores both; the model rows need the reference server
// (./tools/serve_reference.sh), the baseline rows never touch the network.
// `score` re-scores an existing run directory (grown_graph.json +
// growth_manifest.json) with no server at all.
//
// The baseline is the strongest probe pole (argument continuity + induced
// bigrams + positional typing — §1.1), run through the grower's OWN traversal
// by swapping only the candidate source: a client-shaped recombiner that
// parses the target expr back out of the rendered prompt. Same prompt
// plumbing, same ordering pins, same merge-on-insert.
//
// Pre-registered decision rule (§8, recorded before the first sweep): the
// probe's failure mode is layer-uniform in-degree — no convergence gradient,
// no template to find. If the model rows show the same flat per-rank
// in-degree spread as the baseline rows, the bet that a 1.7B model supplies
// the missing semantics is LOST, and the answer is to question single-node
// lookahead, not to tune prompts or try a bigger model.

"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const Engine = require(path.join(REPO, "story_builder_engine.js"));
const Ids = require(path.join(REPO, "ids.js"));
const Probe = require(path.join(REPO, "experiments", "gen_probe.js"));
const { createClient } = require(path.join(REPO, "llm_client.js"));
const { growGraph } = require(path.join(REPO, "grower.js"));
const { seeds } = require(path.join(REPO, "seeds.js"));

const promptPathOf = (version) => path.join(REPO, "prompts", `${version}.txt`);
const ROLES_PATH = path.join(REPO, "experiments", "roles.json");
// `prompt` is a swept dimension, not a constant: comparing v1 (one node) with
// v2 (told story + ancestor path) at equal budgets is the whole point of
// changing the template, and the baseline is unaffected either way — the
// recombiner reads only the last `State:` line.
const DEFAULTS = { depth: 2, width: 2, maxNodes: 8, seed: 7, prompt: "branch.v2" };
// The grower's schema allows at most 3 branches per expansion (§5.3); the
// baseline offers the same number so neither source gets a wider funnel.
const PROPOSALS_PER_EXPANSION = 3;

// ── metrics ─────────────────────────────────────────────────────────────────

// Score one grown graph plus the traversal counters the grower emitted
// (grow.js persists them as manifest.result). Every §6 metric that can be
// computed model-free lives here; replay is measured by the caller because
// it needs a second growth pass.
function scoreGrowth({ graph, stats }) {
  const grown = graph.nodes.filter((n) => n.createdBy === "grown");
  const grownIds = new Set(grown.map((n) => n.id));

  // JSON validity — should be 100% under the grammar (§5.3); a truncated
  // completion is the only in-contract way a request fails to yield JSON.
  const requests = stats.expansions + stats.truncated;
  const jsonValidity = requests ? stats.expansions / requests : 1;

  // Every rate below shares one denominator: total insert attempts. Null
  // transitions belong in it — they were proposals, and excluding them would
  // quietly inflate every other acceptance number. Recorded runs from before
  // `rejectedNullTransitions` existed read it as 0, which is what they were.
  const nulls = stats.rejectedNullTransitions || 0;
  const inserts = stats.created + stats.mergedDuplicates + stats.rejectedCycles + nulls;
  const acyclicityAcceptance = inserts ? (inserts - stats.rejectedCycles) / inserts : 1;
  // Proposals that restated the state they continued from (growth.js). The
  // grower's degenerate mode, made countable rather than argued about.
  const nullTransitionRate = inserts ? nulls / inserts : 0;

  // Duplicate-expr rate — prompt collapse into one idea, measured over the
  // grown nodes that survived (merged duplicates are the mergeRate column).
  const distinctExprs = new Set(grown.map((n) => Ids.normalizedContent(n.expr))).size;
  const dupExprRate = grown.length ? 1 - distinctExprs / grown.length : 0;
  const mergeRate = inserts ? stats.mergedDuplicates / inserts : 0;

  // rejoinTargetId validity — surviving rejoin edges over attempts. The
  // grower stamps `branchId` on the rejoins it creates (grower.js §5.5.6).
  const rejoins = graph.edges.filter((e) => e.type === "rejoins" && grownIds.has(e.branchId)).length;
  const rejoinAttempts = rejoins + stats.droppedRejoins;
  const rejoinValidity = rejoinAttempts ? rejoins / rejoinAttempts : null;

  // Branch diversity — distinct normalized expr per expansion point, over
  // the grown children that survived at each source.
  const byExpr = new Map(graph.nodes.map((n) => [n.id, Ids.normalizedContent(n.expr)]));
  const perSource = new Map();
  for (const e of graph.edges) {
    if (e.type !== "choice" || !grownIds.has(e.to)) continue;
    if (!perSource.has(e.from)) perSource.set(e.from, []);
    perSource.get(e.from).push(byExpr.get(e.to));
  }
  let diversitySum = 0;
  for (const exprs of perSource.values()) diversitySum += new Set(exprs).size / exprs.length;
  const branchDiversity = perSource.size ? diversitySum / perSource.size : null;

  // In-degree distribution — the falsification metric. `spreadByRank` is the
  // gradient question made countable: a layer-uniform graph (the probe's
  // known failure) has max-min = 0 at every rank.
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const histogram = {};
  for (const d of indeg.values()) histogram[d] = (histogram[d] || 0) + 1;
  const ranks = Engine.topoRanks(graph);
  const byRank = new Map();
  for (const n of graph.nodes) {
    const r = ranks[n.id];
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(indeg.get(n.id));
  }
  const spreadByRank = [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rank, ds]) => ({ rank, n: ds.length, min: Math.min(...ds), max: Math.max(...ds) }));
  const maxRankSpread = Math.max(0, ...spreadByRank.map((s) => s.max - s.min));

  // Per-branch contradiction check (§0, §8): the observed failure is delta
  // copied into invariants — a branch whose "what changed" and "what held"
  // are the same sentence contradicts itself. Only the non-empty case
  // counts; the baseline's empty prose fields are absence, not agreement.
  const contradictions = grown.filter((n) => {
    const delta = Ids.normalizedContent(n.delta);
    return delta && delta === Ids.normalizedContent(n.invariants);
  });
  const contradictionRate = grown.length ? contradictions.length / grown.length : 0;

  return {
    grownNodes: grown.length,
    jsonValidity,
    acyclicityAcceptance,
    nullTransitionRate,
    dupExprRate,
    mergeRate,
    rejoinValidity,
    branchDiversity,
    maxRankSpread,
    contradictionRate,
    histogram,
    spreadByRank,
    contradictions: contradictions.map((n) => ({ id: n.id, expr: n.expr, delta: n.delta, invariants: n.invariants })),
  };
}

// ── the baseline candidate source ───────────────────────────────────────────

// Client-shaped lexicon recombiner (§6): same `complete(prompt, schema,
// opts)` surface as llm_client, so growGraph cannot tell the sources apart.
// The target expr is parsed back out of the rendered prompt — the last
// `State:` line, after the few-shot examples — exactly as the test fixtures
// do, so the baseline exercises the same prompt plumbing as the model.
function createBaselineClient({ inputGraph, seed, proposals = PROPOSALS_PER_EXPANSION }) {
  // The probe's candidate cache does not key on the inducing graph; stale
  // entries from another story's grammar would be served silently.
  Probe.clearCandidateCache();
  const roles = JSON.parse(fs.readFileSync(ROLES_PATH, "utf8")).roles;
  const lex = Probe.extractLexicon(inputGraph);
  const allowed = Probe.induceBigrams(inputGraph);
  const typing = Probe.induceTyping(inputGraph, roles);
  const rand = Probe.mulberry32(seed);

  async function complete(prompt) {
    const stateLines = [...String(prompt).matchAll(/^State: (.*)$/gm)];
    const expr = stateLines.length ? stateLines[stateLines.length - 1][1] : "";
    const cands = Probe.candidatesFor(expr, lex, allowed, typing);
    // The probe's own draw: seeded Fisher–Yates, then take the head. The
    // grower re-sorts by its own key before the width cap (§5.5.3), so the
    // shuffle only decides WHICH candidates are offered, not their order.
    const idx = cands.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const branches = idx.slice(0, proposals).map((i) => ({
      label: cands[i], expr: cands[i], state: "", delta: "", invariants: "",
    }));
    return { content: JSON.stringify({ branches }), stopType: "eos", cached: false };
  }

  return { complete, props: async () => ({}), sampling: { seed } };
}

// ── run + score one (source, story) cell ────────────────────────────────────

async function evalRun({
  source, story, depth, width, maxNodes, seed, replay, baseUrl,
  prompt = DEFAULTS.prompt,
}) {
  const inputGraph = Engine.normalizeGraph(seeds[story]);
  const promptTemplate = fs.readFileSync(promptPathOf(prompt), "utf8");
  const makeClient = source === "baseline"
    ? () => createBaselineClient({ inputGraph, seed })
    : () => createClient({ baseUrl, cacheDir: path.join(REPO, "cache"), sampling: { seed } });
  const budget = {
    graph: inputGraph, promptTemplate, from: seeds[story].root, depth, width, maxNodes,
  };

  const { graph, stats } = await growGraph({ ...budget, client: makeClient() });
  const score = scoreGrowth({ graph, stats });

  // Replay rate (§6) — the metric the rest of the document exists to make
  // meaningful. A fresh client each pass: cache-cold for the model, a fresh
  // RNG stream for the baseline.
  let replayOk = null;
  if (replay) {
    const second = await growGraph({ ...budget, client: makeClient(), bypassCache: true });
    replayOk = Ids.canonicalJson(second.graph) === Ids.canonicalJson(graph);
  }
  return { source, story, prompt, ...score, replayOk, graph };
}

// ── output ──────────────────────────────────────────────────────────────────

const fmt = (v) => (v === null ? "—" : typeof v === "number" ? +v.toFixed(3) : v);

function printReport(rows, { show }) {
  console.table(rows.map((r) => ({
    source: r.source,
    prompt: r.source === "baseline" ? "—" : r.prompt,
    story: r.story,
    grown: r.grownNodes,
    jsonValid: fmt(r.jsonValidity),
    acyclic: fmt(r.acyclicityAcceptance),
    nullTx: fmt(r.nullTransitionRate),
    dupExpr: fmt(r.dupExprRate),
    merge: fmt(r.mergeRate),
    rejoin: fmt(r.rejoinValidity),
    diversity: fmt(r.branchDiversity),
    rankSpread: r.maxRankSpread,
    contradict: fmt(r.contradictionRate),
    replay: r.replayOk === null ? "—" : r.replayOk ? "OK" : "MISMATCH",
  })));

  for (const r of rows) {
    const label = r.source === "baseline" ? r.source : `${r.source}:${r.prompt}`;
    console.log(`\n${label}/${r.story} — in-degree histogram: ${JSON.stringify(r.histogram)}`);
    console.log("  per-rank in-degree (rank: n, min..max):",
      r.spreadByRank.map((s) => `${s.rank}: ${s.n}, ${s.min}..${s.max}`).join("  "));
    if (show && r.contradictions.length) {
      console.log("  contradictions (delta == invariants):");
      for (const c of r.contradictions) console.log(`    ${c.expr}  delta="${c.delta}"`);
    }
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const BOOL_FLAGS = new Set(["replay", "baseline-only", "show"]);

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = BOOL_FLAGS.has(name) ? true : argv[++i];
    } else args.positional.push(a);
  }
  return args;
}

async function sweep(args) {
  const stories = (args.stories || args.story || Object.keys(seeds).join(",")).split(",");
  for (const s of stories) {
    if (!seeds[s]) {
      console.error(`unknown story: ${s} (have: ${Object.keys(seeds).join(", ")})`);
      process.exit(1);
    }
  }
  // `--prompt branch.v1,branch.v2` scores template versions side by side at
  // one budget, which is the only way to attribute a metric move to the
  // template rather than to the budget.
  const prompts = String(args.prompt || DEFAULTS.prompt).split(",");
  for (const p of prompts) {
    if (!fs.existsSync(promptPathOf(p))) {
      console.error(`unknown prompt template: ${p}`);
      process.exit(1);
    }
  }
  const budget = {
    depth: +(args.depth || DEFAULTS.depth),
    width: +(args.width || DEFAULTS.width),
    maxNodes: +(args.maxNodes || DEFAULTS.maxNodes),
    seed: +(args.seed || DEFAULTS.seed),
    replay: !!args.replay,
    baseUrl: args.baseUrl,
  };
  console.log(`sweep: stories=${stories.join(",")} prompts=${prompts.join(",")} ` +
    `depth=${budget.depth} width=${budget.width} ` +
    `maxNodes=${budget.maxNodes} seed=${budget.seed} replay=${budget.replay}`);

  const rows = [];
  // The baseline is a required column, not an appendix (§6) — it runs first
  // so a dead model server still leaves the bar on the table. It runs ONCE
  // regardless of --prompt: the recombiner reads only the last `State:` line,
  // so a per-prompt baseline row would be the same numbers twice.
  for (const story of stories) {
    rows.push(await evalRun({ source: "baseline", story, prompt: prompts[0], ...budget }));
  }
  if (!args.baselineOnly) {
    for (const prompt of prompts) {
      for (const story of stories) {
        rows.push(await evalRun({ source: "model", story, prompt, ...budget }));
      }
    }
  }
  printReport(rows, { show: !!args.show });
}

// Re-score recorded run directories: the graph carries the structure, the
// manifest carries the traversal counters. No server, no growth pass — so no
// replay column; that is `npm run grow:replay`'s job.
function score(args) {
  if (!args.positional.length) {
    console.error("usage: node tools/eval.js score runs/<runId> [...]");
    process.exit(1);
  }
  const rows = args.positional.map((dir) => {
    const graph = Engine.normalizeGraph(JSON.parse(fs.readFileSync(path.join(dir, "grown_graph.json"), "utf8")));
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "growth_manifest.json"), "utf8"));
    return {
      source: manifest.runId,
      prompt: manifest.prompt.template,
      story: manifest.input.seed,
      ...scoreGrowth({ graph, stats: manifest.result }),
      replayOk: null,
    };
  });
  printReport(rows, { show: !!args.show });
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.positional.shift();
  if (mode === "score") score(args);
  else if (mode === "sweep") {
    sweep(args).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  } else {
    console.error("usage: node tools/eval.js <score|sweep> …  (header comment has the flags)");
    process.exit(1);
  }
}

module.exports = { scoreGrowth, createBaselineClient, evalRun };
