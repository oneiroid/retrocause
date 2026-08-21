// History-key probe — does knowing the route change what counts as one state?
//
// Model-free. It re-scores graphs that already exist and makes no requests.
//
// Reads `effects` — canonical `owner.property=value` assignments, hand-authored
// on seed nodes (seeds.js) — and folds them along a path, last-write-wins.
//
// The question (LOCAL_LLM.md §8, "Accumulated state"): `defaultContentKey` is
// surface form — `normalizedContent(expr)` — so two nodes merge on saying the
// same thing. If a node's state were instead the accumulation of everything
// that changed on the way to it, would the merges we already made survive?
//
// `sameInContext` takes `contentKey` as a parameter precisely so this can be
// asked without touching the predicate. This script asks it, and reports; it
// changes nothing and is not wired into the app, the grower or the eval.
//
// Two keys, because they bound the answer from opposite sides:
//
//   routeKey     the ordered exprs from the root. This is the FULL history,
//                and it is provably useless: two nodes merge only when their
//                paths are parallel, and parallel paths differ by
//                construction, so a route key never merges anything. Reported
//                as the degenerate bound — a reminder that the useful version
//                of "accumulated state" must FORGET the route. That is what
//                makes it state rather than a log.
//
//   deltaSetKey  the unordered set of non-empty `delta` strings along the
//                path, plus the node's own expr. Forgets order and route,
//                keeps what changed. This is the real candidate.
//
// For each convergence (in-degree > 1) the probe walks the pinned ancestor
// path to each PARENT — one path per parent, not every path, which keeps this
// linear and deterministic and is still enough to detect disagreement — and
// compares the keys.
//
// Reading the output: a convergence whose parents AGREE under deltaSetKey is
// a merge that survives knowing the history. One that DISAGREES is the
// interesting case, and it is a verdict on the merge rather than on the key:
// either the two states really differ and the merge was wrong, or the
// difference does not matter to what follows — which is what a bottleneck is.
// Look at the listed cases before concluding either.
//
// Usage:  node experiments/history_key.js <graph.json> [...]
//         node experiments/history_key.js runs/run_*/grown_graph.json

"use strict";

const path = require("path");
const fs = require("fs");
const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const Ids = require(path.join(R, "ids.js"));
const { ancestorPath } = require(path.join(R, "grower.js"));

// Both keys take the path as node objects and return a string. Empty deltas
// are dropped rather than joined as blanks: a seed node contributes no claim
// about what changed, and an empty slot is not the same as "nothing changed".
function routeKey(pathNodes, node) {
  return pathNodes.map((n) => Ids.normalizedContent(n.expr)).concat(
    Ids.normalizedContent(node.expr),
  ).join(" → ");
}

// Parse `owner.property=value, owner.other=value` into pairs. Malformed
// entries are dropped rather than thrown on: this is a probe over authored
// and generated data, and a bad assignment should lower coverage, not abort.
function assignments(text) {
  return Ids.normalizedContent(text)
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.includes("="))
    .map((a) => [a.slice(0, a.indexOf("=")).trim(), a.slice(a.indexOf("=") + 1).trim()]);
}

// The fold. LAST-WRITE-WINS per variable — not a set union, which was the
// first version of this and was wrong in principle rather than under-fed:
//
//   leave the path, then return   →  union {on_path=no, on_path=yes}
//   never leave                   →  union {on_path=yes}
//
// Same world, different sets. A set of changes is a log; a state is what you
// get when later changes overwrite earlier ones on the same variable. Only
// overwriting makes two routes to one situation coincide, and coinciding is
// the entire property being tested.
function effectsFoldKey(pathNodes, node) {
  const state = new Map();
  for (const n of pathNodes.concat(node)) {
    for (const [k, v] of assignments(n.effects)) state.set(k, v);
  }
  const folded = [...state.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join(";");
  return `${Ids.normalizedContent(node.expr)}|${folded}`;
}

function score(graph, label) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parents = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) parents.get(e.to).push(e.from);

  // Delta coverage first: the whole idea rests on nodes recording what
  // changed, and seed nodes record none. A low number here means the fold has
  // nothing to fold for most of every path (§8's first blocker), and the
  // agreement figures below are measuring mostly-empty sets.
  const withEffects = graph.nodes.filter((n) => assignments(n.effects).length).length;

  // Is the delta data informative enough for the survival figure to mean
  // anything? The vacuity risk is a graph whose deltas have collapsed onto
  // one string ("the wolf is still unseen", 16 of 22 nodes in the run that
  // started this): constant deltas make every delta-set equal, so everything
  // "survives" for the trivial reason that the key carries no information.
  //
  // Counting partitions over the whole graph does NOT measure this — a
  // convergence has one key PER PARENT, and a global group count collapses
  // them to the pinned one, which reports a working key as inert. Measure
  // the input instead: how varied are the deltas actually recorded.
  const distinctVars = new Set(
    graph.nodes.flatMap((n) => assignments(n.effects).map(([k]) => k)),
  ).size;

  const convergences = graph.nodes.filter((n) => parents.get(n.id).length > 1);
  const rows = convergences.map((node) => {
    // One pinned path per parent. ancestorPath already fixes the choice when
    // a parent is itself reachable several ways (grower.js, §5.5.7).
    const keys = parents.get(node.id).map((parentId) => {
      const nodesOnPath = ancestorPath(graph, parentId).map((id) => byId.get(id)).filter(Boolean);
      return { route: routeKey(nodesOnPath, node), delta: effectsFoldKey(nodesOnPath, node) };
    });
    // A key whose delta half is empty means that path recorded no changes at
    // all — every seed node has an empty `delta`, so any route through the
    // told story contributes nothing. That is a COVERAGE hole, not a verdict:
    // an empty set differs from a non-empty one automatically, and counting
    // it as disagreement would report the seeds' silence as a semantic
    // conflict. Split the two so the number means what it says.
    const uncovered = keys.some((k) => k.delta.endsWith("|"));
    const distinct = new Set(keys.map((k) => k.delta)).size;
    return {
      node,
      parents: keys.length,
      routeAgrees: new Set(keys.map((k) => k.route)).size === 1,
      deltaAgrees: distinct === 1,
      uncovered,
      deltaKeys: [...new Set(keys.map((k) => k.delta))],
    };
  });

  const agree = rows.filter((r) => r.deltaAgrees);
  const testable = rows.filter((r) => !r.uncovered);
  const blocked = rows.filter((r) => r.uncovered && !r.deltaAgrees);
  console.log(`\n=== ${label} ===`);
  console.log(`  nodes ${graph.nodes.length}  edges ${graph.edges.length}  `
    + `convergences (in-degree > 1) ${convergences.length}`);
  const coverage = withEffects / graph.nodes.length;
  console.log(`  effects coverage: ${withEffects}/${graph.nodes.length} nodes record what changed`
    + `${coverage < 1 ? "  ← nodes without effects contribute nothing to the fold" : ""}`);
  console.log(`  distinct variables: ${distinctVars}`);
  if (!convergences.length) {
    console.log("  no convergences — nothing to test (a chain-shaped graph)");
    return;
  }
  console.log(`  routeKey  — convergences that survive: ${rows.filter((r) => r.routeAgrees).length}/${rows.length}`);
  // With nothing testable the headline must not print a number: an all-empty
  // fold makes every path equal, and "N/N survived" would report the absence
  // of data as a clean result. Third time this class of vacuity has appeared
  // in this probe; each time it printed a plausible number first.
  console.log(`  effectsFold — convergences that survive: `
    + `${testable.length ? `${testable.filter((r) => r.deltaAgrees).length}/${testable.length}` : "— (nothing testable)"}`
    + `   [undecidable for want of effects: ${rows.length - testable.length}]`);
  if (!testable.length) {
    console.log("    nothing is being tested: at least one path into every convergence");
    console.log("    records no effects. Grown nodes do not carry them yet — that is");
    console.log("    the remaining gap, not a result (LOCAL_LLM.md §8).");
  }
  for (const r of rows.filter((x) => !x.deltaAgrees)) {
    console.log(`\n    ${r.uncovered ? "UNDECIDABLE" : "DISAGREES  "} ${r.node.expr}  (${r.parents} parents)`);
    for (const k of r.deltaKeys) console.log(`      ${k}`);
  }
}

if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node experiments/history_key.js <graph.json> [...]");
    process.exit(1);
  }
  for (const file of files) {
    score(Engine.normalizeGraph(JSON.parse(fs.readFileSync(file, "utf8"))), path.relative(R, file));
  }
}

module.exports = { routeKey, effectsFoldKey, assignments, score };
