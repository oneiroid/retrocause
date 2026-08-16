// Generator probe — lexicon continuations under induced constraints.
//
// Grows the possibility DAG of the seed stories by recombining their own
// lexicon, with up to three constraints, all induced (never authored):
//   1. argument continuity  — a continuation shares >=1 argument with its
//      source state (always on);
//   2. bigram grammar       — candidate's schema must be an observed
//      successor of the source's schema in seed edges (BIGRAM=1);
//   3. positional typing    — each argument's role class (roles.json, from a
//      one-time delegated-LLM labeling) must be a class observed at that
//      (schema, position) in seed exprs (TYPED=1).
// Every insert follows merge-on-insert semantics (merge_predicate.js +
// growth.js): same content on parallel paths collapses, so the object grown
// converges toward the reachability closure of the induced grammar.
//
// Result history (three poles, 2026-07-13, Red only):
//   constraint 1        → statistical noise (Poisson in-degree, salad states)
//   + 2                 → structure, still salad
//   + 3                 → readable states, but in-degree layer-uniform (no
//                         gradient): one story's closure is too symmetric.
// Current question: do more seed stories break the symmetry?
//
// Usage:  node experiments/gen_probe.js
//   env:  K=12 D=4 SEED=42 BIGRAM=0|1 TYPED=0|1 STORIES=all|red|red,criedWolf
//
// PERF: growth.insertContinuation is O(N^2)-ish per insert. This script uses
// the same semantics with a contentKey index and a per-frontier-node ancestor
// set (valid for a whole batch: an edge from `from` can never change
// ancestors(from) — a survivor that reached `from` would have been comparable
// and rejected). Equivalence against real growth.grow is asserted on a small
// config at startup.

const path = require("path");
const fs = require("fs");
const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const Growth = require(path.join(R, "growth.js"));
const Predicate = require(path.join(R, "merge_predicate.js"));
const { seeds } = require(path.join(R, "seeds.js"));

// ── seeded RNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── lexicon ─────────────────────────────────────────────────────────────────
function parseExpr(expr) {
  const m = /^([a-z_]+)\(([^)]*)\)$/i.exec(String(expr).trim());
  if (!m) return null;
  return { schema: m[1].toLowerCase(), args: m[2].split(",").map((s) => s.trim()).filter(Boolean) };
}
function extractLexicon(graph) {
  const schemas = new Map(); const entities = new Set();
  for (const n of graph.nodes) {
    const p = parseExpr(n.expr);
    if (!p) continue;
    schemas.set(`${p.schema}/${p.args.length}`, { name: p.schema, arity: p.args.length });
    p.args.forEach((a) => entities.add(a));
  }
  return { schemas: [...schemas.values()], entities: [...entities] };
}
function tuples(pool, arity) {
  if (arity === 0) return [[]];
  const out = [];
  for (const t of tuples(pool, arity - 1)) {
    for (const e of pool) if (!t.includes(e)) out.push([...t, e]);
  }
  return out;
}

// induced bigram grammar: which schema follows which, read off seed edges
function induceBigrams(graph) {
  const schemaOf = (id) => {
    const p = parseExpr((graph.nodes.find((n) => n.id === id) || {}).expr);
    return p ? `${p.schema}/${p.args.length}` : "";
  };
  const allowed = new Map();
  for (const e of graph.edges) {
    const a = schemaOf(e.from), b = schemaOf(e.to);
    if (!a || !b) continue;
    if (!allowed.has(a)) allowed.set(a, new Set());
    allowed.get(a).add(b);
  }
  return allowed;
}

// induced positional typing: allowed role classes per (schema, position)
function induceTyping(graph, roles) {
  const slots = new Map();
  for (const n of graph.nodes) {
    const p = parseExpr(n.expr);
    if (!p) continue;
    p.args.forEach((a, i) => {
      const k = `${p.schema}/${p.args.length}:${i}`;
      if (!slots.has(k)) slots.set(k, new Set());
      slots.get(k).add(roles[a]);
    });
  }
  return {
    slots,
    fits: (schema, pos, entity) => (slots.get(`${schema}:${pos}`) || new Set()).has(roles[entity]),
  };
}

const candCache = new Map();
function candidatesFor(sourceExpr, lex, allowed, typing) {
  const cacheKey = (allowed ? "b" : "n") + (typing ? "t:" : ":") + sourceExpr;
  if (candCache.has(cacheKey)) return candCache.get(cacheKey);
  const p = parseExpr(sourceExpr);
  const srcArgs = new Set(p ? p.args : []);
  const srcSchema = p ? `${p.schema}/${p.args.length}` : "";
  const out = [];
  for (const s of lex.schemas) {
    if (allowed && !(allowed.get(srcSchema) || new Set()).has(`${s.name}/${s.arity}`)) continue;
    for (const t of tuples(lex.entities, s.arity)) {
      if (!t.some((a) => srcArgs.has(a))) continue;
      if (typing && !t.every((a, i) => typing.fits(`${s.name}/${s.arity}`, i, a))) continue;
      const expr = `${s.name}(${t.join(", ")})`;
      if (expr !== sourceExpr) out.push(expr);
    }
  }
  candCache.set(cacheKey, out);
  return out;
}

// ── fast inserter with growth.js semantics ──────────────────────────────────
// Batched per frontier node: one reverse-BFS gives ancestors(from), then each
// candidate's merge check is a set lookup. All mutations are append-only.
function makeInserter(graph) {
  const key = Predicate.defaultContentKey;
  const byKey = new Map(); const radj = new Map(); const edgeSet = new Set();
  for (const n of graph.nodes) {
    const k = key(n);
    if (k) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(n.id); }
  }
  for (const e of graph.edges) {
    if (!radj.has(e.to)) radj.set(e.to, []);
    radj.get(e.to).push(e.from);
    edgeSet.add(e.from + ">" + e.to);
  }
  function pushEdge(from, to) {
    graph.edges.push({ id: `e_${from}_${to}_${graph.edges.length}`, from, to, type: "causes", label: "causes" });
    if (!radj.has(to)) radj.set(to, []);
    radj.get(to).push(from);
    edgeSet.add(from + ">" + to);
  }
  function ancestorsOf(id) {
    const seen = new Set([id]); const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const p of radj.get(cur) || []) if (!seen.has(p)) { seen.add(p); stack.push(p); }
    }
    return seen; // includes id itself
  }
  return function insertBatch(fromId, nodes) {
    const anc = ancestorsOf(fromId); // stable for the whole batch (see header)
    return nodes.map((node) => {
      const k = key(node);
      let survivor = null;
      for (const oid of byKey.get(k) || []) {
        if (!anc.has(oid)) { survivor = oid; break; } // parallel + same content
      }
      if (survivor) {
        if (!edgeSet.has(fromId + ">" + survivor)) pushEdge(fromId, survivor);
        return { merged: true, into: survivor };
      }
      graph.nodes.push(node);
      pushEdge(fromId, node.id);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(node.id);
      return { merged: false, node };
    });
  };
}

// ── the run ──────────────────────────────────────────────────────────────────
function outdegMap(graph) {
  const m = new Map();
  for (const e of graph.edges) m.set(e.from, (m.get(e.from) || 0) + 1);
  return m;
}
function unionGraph(storyKeys) {
  const parts = storyKeys.map((k) => {
    if (!seeds[k]) throw new Error(`unknown seed: ${k} (have: ${Object.keys(seeds).join(", ")})`);
    return seeds[k];
  });
  return Engine.normalizeGraph({
    title: `Union: ${storyKeys.join("+")}`,
    root: parts[0].root,
    nodes: parts.flatMap((s) => s.nodes),
    edges: parts.flatMap((s) => s.edges),
  });
}

function run({ K, D, seed, stories, useGrowthModule = false, bigrams = false, typed = false }) {
  const graph = unionGraph(stories);
  const lex = extractLexicon(graph);
  const allowed = bigrams ? induceBigrams(graph) : null;
  const typing = typed
    ? induceTyping(graph, JSON.parse(fs.readFileSync(path.join(__dirname, "roles.json"), "utf8")).roles)
    : null;
  const rand = mulberry32(seed);
  const insertBatch = useGrowthModule
    ? (fromId, nodes) => nodes.map((node) => Growth.insertContinuation(graph, { from: fromId, node }))
    : makeInserter(graph);

  const depth = new Map(graph.nodes.map((n) => [n.id, 0]));
  let od = outdegMap(graph);
  // bigram mode grows from EVERY seed node (a story-final schema has no
  // successor, so leaf-only growth would be empty); noise mode from leaves.
  let frontier = bigrams
    ? graph.nodes.map((n) => n.id)
    : graph.nodes.filter((n) => !od.get(n.id)).map((n) => n.id);
  const perRound = [];
  let counter = 0, totalInserts = 0;
  const CAP = +(process.env.CAP || 400000);

  for (let r = 1; r <= D && frontier.length; r++) {
    const next = new Set();
    let merges = 0, inserts = 0;
    for (const fid of frontier) {
      const srcExpr = (graph.nodes.find((n) => n.id === fid) || {}).expr;
      const cands = candidatesFor(srcExpr, lex, allowed, typing);
      const idx = cands.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const batch = idx.slice(0, K).map((i) => ({ id: `g${r}_${++counter}`, expr: cands[i], kind: "story", createdBy: "generator" }));
      for (const res of insertBatch(fid, batch)) {
        inserts++; totalInserts++;
        if (res.merged) { merges++; next.add(res.into); }
        else if (res.merged === false) next.add(res.node.id);
      }
      if (totalInserts > CAP) break;
    }
    od = outdegMap(graph);
    frontier = [...next].filter((id) => !od.get(id));
    frontier.forEach((id) => { if (!depth.has(id)) depth.set(id, r); });
    perRound.push({ round: r, inserts, merges, mergeRate: +(merges / Math.max(1, inserts)).toFixed(3), nodes: graph.nodes.length, edges: graph.edges.length, nextFrontier: frontier.length });
    if (totalInserts > CAP) { console.log(`(stopped: CAP=${CAP} inserts reached)`); break; }
  }
  return { graph, lex, perRound, depth };
}

// ── analysis helpers ─────────────────────────────────────────────────────────
function isAcyclic(graph) {
  const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
  const adj = new Map();
  for (const e of graph.edges) {
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const q = [...indeg.keys()].filter((id) => !indeg.get(id));
  let seen = 0;
  while (q.length) {
    const id = q.pop(); seen++;
    for (const t of adj.get(id) || []) { indeg.set(t, indeg.get(t) - 1); if (!indeg.get(t)) q.push(t); }
  }
  return seen === graph.nodes.length;
}
function spearman(xs, ys) {
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys), n = xs.length;
  const mx = rx.reduce((a, b) => a + b) / n, my = ry.reduce((a, b) => a + b) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

// ── requirable surface ──────────────────────────────────────────────────────
// tools/eval.js runs the recombiner as the §6 baseline through the grower's
// own traversal. It must be THIS code — a copied candidate source would drift
// into a second definition of the baseline. Everything below the guard only
// executes when the probe is run directly.
if (typeof module !== "undefined" && module.exports) {
  // candCache keys on flags+expr only, not on WHICH graph induced the
  // grammar — valid within one run, wrong across runs on different stories
  // (they share exprs by design). Callers switching graphs must clear it.
  const clearCandidateCache = () => candCache.clear();
  module.exports = { parseExpr, extractLexicon, induceBigrams, induceTyping, candidatesFor, mulberry32, unionGraph, clearCandidateCache };
}
if (typeof require !== "undefined" && require.main === module) {

// ── equivalence check: fast path vs real growth module ──────────────────────
{
  const shape = (g) => JSON.stringify({
    nodes: g.graph.nodes.map((n) => n.id + ":" + n.expr).sort(),
    edges: g.graph.edges.map((e) => e.from + ">" + e.to).sort(),
  });
  const cfg = { K: 5, D: 2, seed: 7, stories: ["red"] };
  const a = run({ ...cfg, useGrowthModule: false });
  const b = run({ ...cfg, useGrowthModule: true });
  if (shape(a) !== shape(b)) { console.error("MISMATCH — fast path diverges from growth.js semantics"); process.exit(1); }
  console.log(`equivalence check: OK (${a.graph.nodes.length} nodes, ${a.graph.edges.length} edges on both paths)\n`);
}

// ── main run ─────────────────────────────────────────────────────────────────
const K = +(process.env.K || 12), D = +(process.env.D || 4), SEED = +(process.env.SEED || 42);
const BIGRAM = !!+(process.env.BIGRAM || 0), TYPED = !!+(process.env.TYPED || 0);
const STORIES = (process.env.STORIES || "all") === "all" ? Object.keys(seeds) : process.env.STORIES.split(",");
console.log(`== main run: K=${K}, D=${D}, seed=${SEED}, bigrams=${BIGRAM}, typed=${TYPED}, stories=${STORIES.join("+")} ==`);
const t0 = Date.now();
const { graph, lex, perRound, depth } = run({ K, D, seed: SEED, stories: STORIES, bigrams: BIGRAM, typed: TYPED });
console.log(`lexicon: ${lex.schemas.length} schemas, ${lex.entities.length} entities`);
console.table(perRound);
console.log(`acyclic: ${isAcyclic(graph)}   runtime: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const space = lex.schemas.reduce((s, sc) => {
  let p = 1; for (let i = 0; i < sc.arity; i++) p *= lex.entities.length - i;
  return s + p;
}, 0);
const distinct = new Set(graph.nodes.map((n) => Predicate.defaultContentKey(n))).size;
console.log(`saturation: ${distinct}/${space} distinct contents (untyped upper bound); ` +
  `${graph.nodes.length - distinct} recurrence copies`);

const indeg = new Map(graph.nodes.map((n) => [n.id, 0]));
for (const e of graph.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
const od = outdegMap(graph);
const hist = {};
for (const n of graph.nodes) { const d = indeg.get(n.id); hist[d] = (hist[d] || 0) + 1; }
console.log("\nin-degree histogram:", JSON.stringify(hist));
console.log("dead ends (outdeg 0):", graph.nodes.filter((n) => !od.get(n.id)).length);
console.log("bottleneck-ish indeg>2 && outdeg>1:", graph.nodes.filter((n) => indeg.get(n.id) > 2 && (od.get(n.id) || 0) > 1).length);

// per-schema in-degree spread — the gradient question: pole 3 (Red only) was
// layer-uniform (all rescue states tied); do more seeds break the symmetry?
const bySchema = new Map();
for (const n of graph.nodes) {
  const p = parseExpr(n.expr);
  if (!p) continue;
  const k = `${p.schema}/${p.args.length}`;
  if (!bySchema.has(k)) bySchema.set(k, []);
  bySchema.get(k).push(indeg.get(n.id));
}
console.log("\nper-schema in-degree spread (min / median / max, n):");
for (const [k, arr] of [...bySchema].sort()) {
  arr.sort((a, b) => a - b);
  console.log(`  ${k.padEnd(15)} n=${String(arr.length).padStart(5)}  ${arr[0]} / ${arr[(arr.length - 1) >> 1]} / ${arr[arr.length - 1]}`);
}

const top = [...graph.nodes].sort((x, y) => indeg.get(y.id) - indeg.get(x.id)).slice(0, 12);
console.log("\ntop in-degree states:");
for (const n of top) console.log(`  ${String(indeg.get(n.id)).padStart(4)}  ${n.expr}${n.createdBy === "seed" ? "   [SEED]" : ""}  (outdeg ${od.get(n.id) || 0})`);

console.log("\nseed-story states:");
for (const n of graph.nodes.filter((n) => n.createdBy === "seed")) {
  console.log(`  indeg ${String(indeg.get(n.id)).padStart(4)}  outdeg ${String(od.get(n.id) || 0).padStart(4)}  ${n.expr}`);
}

const argsOf = new Map(graph.nodes.map((n) => [n.id, new Set((parseExpr(n.expr) || { args: [] }).args)]));
const entityCount = new Map();
for (const n of graph.nodes) for (const a of argsOf.get(n.id)) entityCount.set(a, (entityCount.get(a) || 0) + 1);
const gen = graph.nodes.filter((n) => n.createdBy === "generator");
if (gen.length > 2) {
  const xs = gen.map((n) => [...argsOf.get(n.id)].reduce((s, a) => s + entityCount.get(a), 0));
  const ys = gen.map((n) => indeg.get(n.id));
  console.log(`\nSpearman(in-degree, argument-connectivity) over ${gen.length} generated states: ${spearman(xs, ys).toFixed(3)}`);
}

const outName = `gen_${STORIES.length > 1 ? "union" : STORIES[0]}_K${K}_D${D}${BIGRAM ? "_bigram" : ""}${TYPED ? "_typed" : ""}.json`;
const outPath = path.join(process.env.OUT || __dirname, outName);
fs.writeFileSync(outPath, Engine.exportGraph(graph));
console.log(`\ngraph written: ${outPath}`);

} // require.main guard
