// Possibility cone. Implements FORMAL_MODEL.md §8.3: the cone's
// support, width profile, waists, and the influence weight are all
// *derived* from the graph plus one author input — the attractor Ω
// (§8.3.1, a set of destination node ids). Deriving Ω itself is `open`
// (§8.3.4) and is NOT implemented here.
//
// Reachability runs over *transition* edges only: canonical `causes`
// plus counterfactual `choice` / `rejoins`. Those are paths in the raw
// graph R (§8.3, actual/counterfactual abolished within the cone);
// `parallels` / `foreshadows` / `enables` / `blocks` are semantic
// annotations and carry no reachability (cf. CLAUDE.md: non-canonical
// edges contribute no state; here they contribute no topology either).
//
// Cut-criticality measures **influence**, not **capability** — the
// capability reading is `open` (§7.9, INTUITIONS Open-Q 9). Weights
// order and measure; they never elect "the real path".

(function attachCone(root) {
  const TRANSITION_EDGE_TYPES = ["causes", "choice", "rejoins"];

  function toOmegaSet(omega) {
    return new Set(Array.isArray(omega) ? omega : [omega]);
  }

  function transitionEdges(graph) {
    return (graph.edges || []).filter((e) => TRANSITION_EDGE_TYPES.includes(e.type || "causes"));
  }

  // Adjacency over transition edges. reverse=true gives predecessor lists.
  function adjacency(graph, reverse = false) {
    const adj = new Map();
    for (const node of graph.nodes || []) adj.set(node.id, []);
    for (const e of transitionEdges(graph)) {
      const from = reverse ? e.to : e.from;
      const to = reverse ? e.from : e.to;
      if (adj.has(from) && adj.has(to)) adj.get(from).push(to);
    }
    return adj;
  }

  function reach(adj, startIds) {
    const seen = new Set();
    const queue = [...startIds].filter((id) => adj.has(id));
    for (const id of queue) seen.add(id);
    while (queue.length) {
      const id = queue.shift();
      for (const next of adj.get(id) || []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return seen;
  }

  // §8.3.2: support(R, Ω) = forward-reach(source) ∩ backward-reach(Ω).
  function support(graph, omega) {
    const forward = reach(adjacency(graph), [graph.root]);
    const backward = reach(adjacency(graph, true), toOmegaSet(omega));
    const out = new Set();
    for (const id of forward) if (backward.has(id)) out.add(id);
    return out;
  }

  // §8.3.2: the rim — precondition-satisfiable (forward-reachable) but
  // unable to reach Ω, hence not in G.
  function rim(graph, omega) {
    const forward = reach(adjacency(graph), [graph.root]);
    const inCone = support(graph, omega);
    const out = new Set();
    for (const id of forward) if (!inCone.has(id)) out.add(id);
    return out;
  }

  // Longest-path topological levels of the support, from the source.
  // Along any source→Ω path levels strictly increase, so every level is
  // crossed exactly once per path: each level set is a clean cut
  // candidate (§8.3.3) and an antichain by construction.
  function levels(graph, omega) {
    const inCone = support(graph, omega);
    const preds = new Map();
    const succs = new Map();
    for (const id of inCone) { preds.set(id, []); succs.set(id, []); }
    for (const e of transitionEdges(graph)) {
      if (inCone.has(e.from) && inCone.has(e.to)) {
        preds.get(e.to).push(e.from);
        succs.get(e.from).push(e.to);
      }
    }
    const level = new Map();
    const indegree = new Map();
    const queue = [];
    for (const id of inCone) {
      indegree.set(id, preds.get(id).length);
      if (preds.get(id).length === 0) { level.set(id, 0); queue.push(id); }
    }
    while (queue.length) {
      const id = queue.shift();
      for (const next of succs.get(id)) {
        level.set(next, Math.max(level.get(next) || 0, level.get(id) + 1));
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
    return { level, inCone };
  }

  // §8.3.3 width profile: width at phase d = nodes at level d plus
  // transition edges spanning d (level(from) < d < level(to)) — the
  // crossing count of the level-d clean cut.
  function widthProfile(graph, omega) {
    const { level, inCone } = levels(graph, omega);
    if (level.size === 0) return [];
    const maxLevel = Math.max(...level.values());
    const profile = [];
    for (let d = 0; d <= maxLevel; d++) {
      profile.push({ level: d, width: 0, nodes: [], spanningEdgeIds: [] });
    }
    for (const [id, d] of level) profile[d].nodes.push(id);
    for (const e of transitionEdges(graph)) {
      if (!inCone.has(e.from) || !inCone.has(e.to)) continue;
      const from = level.get(e.from);
      const to = level.get(e.to);
      for (let d = from + 1; d < to; d++) profile[d].spanningEdgeIds.push(e.id);
    }
    for (const p of profile) {
      p.nodes.sort();
      p.width = p.nodes.length + p.spanningEdgeIds.length;
    }
    return profile;
  }

  // §8.3.3 waists: clean cuts (no spanning edges) at local minima of
  // the width profile. Source level and Ω levels are boundaries, not
  // waists. Width 1 recovers the single convergence node of §8.1.
  function waists(graph, omega) {
    const profile = widthProfile(graph, omega);
    const omegaSet = toOmegaSet(omega);
    const width = (d) => (d >= 0 && d < profile.length ? profile[d].width : Infinity);
    const out = [];
    for (let d = 1; d < profile.length; d++) {
      const p = profile[d];
      if (p.spanningEdgeIds.length > 0) continue;
      if (p.nodes.some((id) => omegaSet.has(id))) continue;
      if (p.width <= width(d - 1) && p.width <= width(d + 1)) {
        out.push({ level: d, width: p.width, nodes: p.nodes });
      }
    }
    return out;
  }

  // Max-flow over the support with unit vertex capacities (standard
  // node-splitting), so the flow value = number of vertex-disjoint
  // source→Ω paths = minimum clean-cut size, per Menger (§8.3.3).
  // Source and Ω endpoints are uncapacitated. excludeEdgeId removes one
  // transition edge — used by criticality().
  function maxflow(graph, omega, excludeEdgeId = null) {
    const omegaSet = toOmegaSet(omega);
    if (omegaSet.has(graph.root)) return Infinity; // degenerate: Ω is the source
    const inCone = support(graph, omega);
    if (!inCone.has(graph.root)) return 0;
    const INF = Number.POSITIVE_INFINITY;
    const cap = new Map();
    const addArc = (u, v, c) => {
      if (!cap.has(u)) cap.set(u, new Map());
      if (!cap.has(v)) cap.set(v, new Map());
      cap.get(u).set(v, (cap.get(u).get(v) || 0) + c);
      if (!cap.get(v).has(u)) cap.get(v).set(u, 0);
    };
    for (const id of inCone) {
      addArc(`${id}#in`, `${id}#out`, id === graph.root || omegaSet.has(id) ? INF : 1);
    }
    for (const e of transitionEdges(graph)) {
      if (e.id === excludeEdgeId) continue;
      if (inCone.has(e.from) && inCone.has(e.to)) addArc(`${e.from}#out`, `${e.to}#in`, 1);
    }
    const SRC = `${graph.root}#in`;
    const SINK = "#sink";
    for (const w of omegaSet) if (inCone.has(w)) addArc(`${w}#out`, SINK, INF);

    // Edmonds-Karp: BFS augmenting paths over the residual network.
    let flow = 0;
    for (;;) {
      const parent = new Map([[SRC, null]]);
      const queue = [SRC];
      while (queue.length && !parent.has(SINK)) {
        const u = queue.shift();
        for (const [v, c] of cap.get(u) || []) {
          if (c > 0 && !parent.has(v)) { parent.set(v, u); queue.push(v); }
        }
      }
      if (!parent.has(SINK)) return flow;
      let bottleneck = INF;
      for (let v = SINK; parent.get(v) !== null; v = parent.get(v)) {
        bottleneck = Math.min(bottleneck, cap.get(parent.get(v)).get(v));
      }
      for (let v = SINK; parent.get(v) !== null; v = parent.get(v)) {
        const u = parent.get(v);
        cap.get(u).set(v, cap.get(u).get(v) - bottleneck);
        cap.get(v).set(u, cap.get(v).get(u) + bottleneck);
      }
      flow += bottleneck;
    }
  }

  // §8.3.3: the cone's global width — vertex-disjoint source→Ω paths.
  function mengerWidth(graph, omega) {
    return maxflow(graph, omega);
  }

  function resolveEdge(graph, edgeRef) {
    if (typeof edgeRef === "string") return (graph.edges || []).find((e) => e.id === edgeRef);
    return edgeRef;
  }

  // §8.3.3 influence weight of a transition:
  //   criticality(e) = maxflow(source→Ω over support)
  //                  - maxflow(source→Ω over support \ {e})
  // Measures structural influence toward Ω, NOT capability (`open`,
  // §7.9 / INTUITIONS Open-Q 9). It is a measure on transitions, never
  // an election of a path.
  function criticality(graph, omega, edgeRef) {
    const edge = resolveEdge(graph, edgeRef);
    if (!edge || !TRANSITION_EDGE_TYPES.includes(edge.type || "causes")) return 0;
    return maxflow(graph, omega) - maxflow(graph, omega, edge.id);
  }

  // Criticality for every transition edge inside the support, keyed by
  // edge id. Edges outside the support carry zero and are omitted.
  function edgeCriticalities(graph, omega) {
    const inCone = support(graph, omega);
    const base = maxflow(graph, omega);
    const out = {};
    for (const e of transitionEdges(graph)) {
      if (inCone.has(e.from) && inCone.has(e.to)) {
        out[e.id] = base - maxflow(graph, omega, e.id);
      }
    }
    return out;
  }

  // §8.3.3 agent weight = aggregate criticality of the transitions
  // attributed to the agent. Attribution is the entry's agent argument
  // (§7.8): an edge's transition is its target node's `action`, the
  // lexicon entry names which param is the agent (`entry.agent`).
  // Actionless transitions (and entries with no agent param, e.g.
  // world-attributed `reveal`) stay unattributed — attribution is
  // metadata, never structure.
  function agentInfluence(graph, omega, lexicon) {
    const entryByName = new Map((lexicon || []).map((e) => [e.name, e]));
    const nodeById = new Map((graph.nodes || []).map((n) => [n.id, n]));
    const crit = edgeCriticalities(graph, omega);
    const weights = {};
    for (const e of transitionEdges(graph)) {
      if (!(e.id in crit)) continue;
      const action = (nodeById.get(e.to) || {}).action;
      if (!action) continue;
      const entry = entryByName.get(action.entry);
      const agent = entry && entry.agent ? (action.binding || {})[entry.agent] : null;
      if (!agent) continue;
      weights[agent] = (weights[agent] || 0) + crit[e.id];
    }
    return weights;
  }

  // §7.8 realized frontier = Phi(v) ∩ cone. Conservative reading of a
  // claim whose selection mechanism is `open` (INTUITIONS claim 9): we
  // only drop what is *provably* outside the cone — candidates at a
  // node that is itself not in the support, and candidates whose
  // materialized node already exists in the graph (matched by expr,
  // the same convention as phi's downstreamExprs) but lies on the rim.
  // Novel candidates extend the raw graph R and stay in until support
  // is recomputed; nothing here elects a path.
  function realizedFrontier(graph, omega, nodeId, candidates) {
    const inCone = support(graph, omega);
    if (!inCone.has(nodeId)) return [];
    const rimExprs = new Set();
    const rimNodes = rim(graph, omega);
    for (const n of graph.nodes || []) {
      if (rimNodes.has(n.id) && n.expr) rimExprs.add(n.expr);
    }
    return (candidates || []).filter((c) => !rimExprs.has(c.expr));
  }

  // §8.3.3: a meta-agent's weight aggregates its constituents'.
  function metaAgentInfluence(agentWeights, groups) {
    const out = {};
    for (const [meta, members] of Object.entries(groups || {})) {
      out[meta] = members.reduce((sum, m) => sum + (agentWeights[m] || 0), 0);
    }
    return out;
  }

  const api = {
    TRANSITION_EDGE_TYPES, transitionEdges, support, rim,
    widthProfile, waists,
    maxflow, mengerWidth, criticality, edgeCriticalities,
    agentInfluence, metaAgentInfluence, realizedFrontier,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseCone = api;
})(typeof window !== "undefined" ? window : globalThis);
