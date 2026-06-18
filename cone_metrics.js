// Self-less cone metrics. FORMAL_MODEL.md §8.3.6: the capability apparatus
// of §8.3.5 recast onto structural loci, measure-free. Branching capacity
// B(v) is self-less empowerment (off-Ω); locality gap G(v) is the local
// slope of the simulation gradient; structural alignment is self-less η.
// Agents survive only as the groupByAgent overlay — metadata, never
// structure (cf. cone.js agentInfluence; INTUITIONS claim 9: the self-less
// case is the simulation-gradient base, an agent carries a model on top).
//
// Measure-free throughout: counts, set fractions, and cone.js Menger
// vitality — no probability measure over paths (avoids the §8.3.4
// reparametrization trap).

(function attachConeMetrics(root) {
  const Cone = (typeof module !== "undefined" && module.exports)
    ? require("./cone.js")
    : root.RetrocauseCone;

  // Forward transition adjacency over the raw graph R.
  function forwardAdj(graph) {
    const adj = new Map();
    for (const n of graph.nodes || []) adj.set(n.id, []);
    for (const e of Cone.transitionEdges(graph)) {
      if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to);
    }
    return adj;
  }

  // §8.3.6: for each node, the set of sinks (no transition out-edge)
  // forward-reachable from it over R. Memoized DFS; the graph is a DAG.
  function reachableSinks(graph) {
    const adj = forwardAdj(graph);
    const memo = new Map();
    function visit(v) {
      if (memo.has(v)) return memo.get(v);
      const succ = adj.get(v) || [];
      const out = new Set();
      if (succ.length === 0) { out.add(v); }       // v is a sink
      else for (const s of succ) for (const k of visit(s)) out.add(k);
      memo.set(v, out);
      return out;
    }
    for (const id of adj.keys()) visit(id);
    return memo;
  }

  // §8.3.6 branching capacity (self-less empowerment), off-Ω:
  //   B(v) = log2(# distinct downstream sink-sets across v's successors).
  // Out-degree ≤ 1, or all successors reaching the same sink-set → 0.
  function branchingCapacity(graph) {
    const adj = forwardAdj(graph);
    const sinks = reachableSinks(graph);
    const out = {};
    for (const id of adj.keys()) {
      const succ = adj.get(id) || [];
      if (succ.length === 0) { out[id] = 0; continue; }
      const distinct = new Set(
        succ.map((s) => [...sinks.get(s)].sort().join("|")));
      out[id] = Math.log2(distinct.size);
    }
    return out;
  }

  // §8.3.6 locality gap (self-less accuracy / non-locality of the
  // next-event constraint): the fraction of a support node's locally-
  // possible next events that knowing Ω forbids. Operationalizes the
  // project thesis "knowing the destination constrains the routes" as a
  // per-node number, at the 1-step next-event grain. Reuses cone.rim.
  function localityGap(graph, omega) {
    const inCone = Cone.support(graph, omega);
    const rimSet = Cone.rim(graph, omega);
    const outdeg = new Map();
    const rimOut = new Map();
    for (const e of Cone.transitionEdges(graph)) {
      if (!inCone.has(e.from)) continue;          // only support nodes have a constrained next event
      outdeg.set(e.from, (outdeg.get(e.from) || 0) + 1);
      if (rimSet.has(e.to)) rimOut.set(e.from, (rimOut.get(e.from) || 0) + 1);
    }
    const out = {};
    for (const [id, deg] of outdeg) out[id] = (rimOut.get(id) || 0) / deg;
    return out;
  }

  const api = { reachableSinks, branchingCapacity, localityGap };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseConeMetrics = api;
})(typeof window !== "undefined" ? window : globalThis);
