(function attachStoryDagEngine(root) {
  const EDGE_TYPES = ["causes", "enables", "blocks", "choice", "rejoins", "parallels", "foreshadows"];

  function normalizeGraph(graph) {
    const clone = JSON.parse(JSON.stringify(graph));
    clone.nodes = (clone.nodes || []).map((node) => ({
      kind: "canonical",
      tags: [],
      state: "",
      expr: "event(?)",
      createdBy: "human",
      delta: "",
      invariants: "",
      ...node
    }));
    clone.edges = (clone.edges || []).map((edge, index) => ({
      id: edge.id || `e_${edge.from}_${edge.to}_${index}`,
      type: edge.type || "causes",
      label: edge.label || edge.type || "edge",
      canonical: edge.canonical ?? edge.type === "causes",
      ...edge
    }));
    clone.root = clone.root || clone.nodes[0]?.id || "root";
    clone.meta = clone.meta || { title: clone.title || "Untitled Story DAG", version: 2 };
    return clone;
  }

  function reachable(graph, from, to, edges = graph.edges) {
    const queue = [from];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.filter((edge) => edge.from === id).forEach((edge) => queue.push(edge.to));
    }
    return false;
  }

  function wouldCreateCycle(graph, from, to) {
    return from === to || reachable(graph, to, from);
  }

  function addEdge(graph, edge) {
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (!ids.has(edge.from) || !ids.has(edge.to)) return { ok: false, message: "Edge endpoint is missing" };
    if (wouldCreateCycle(graph, edge.from, edge.to)) return { ok: false, message: "Rejected because that edge would create a cycle" };
    graph.edges.push({
      id: edge.id || `e_${edge.from}_${edge.to}_${edge.type || "edge"}_${graph.edges.length}`,
      type: edge.type || "causes",
      label: edge.label || edge.type || "edge",
      canonical: edge.canonical ?? false,
      ...edge
    });
    return { ok: true };
  }

  function addBranch(graph, sourceId, branch, rejoinTargetId = "") {
    const source = graph.nodes.find((node) => node.id === sourceId);
    if (!source) return { ok: false, message: "Source node is missing" };
    if (!branch.id) branch.id = `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const newNode = {
      kind: "branch",
      tags: ["counterfactual"],
      state: "",
      expr: `alternate(${sourceId})`,
      createdBy: "human",
      delta: "",
      invariants: "",
      ...branch
    };
    graph.nodes.push(newNode);
    const choice = addEdge(graph, { from: sourceId, to: newNode.id, type: "choice", label: newNode.delta || "alternative branch", canonical: false, branchId: newNode.id });
    if (!choice.ok) {
      graph.nodes = graph.nodes.filter((node) => node.id !== newNode.id);
      return choice;
    }
    if (rejoinTargetId) {
      const rejoin = addEdge(graph, { from: newNode.id, to: rejoinTargetId, type: "rejoins", label: "rejoins canonical path", canonical: false, branchId: newNode.id });
      if (!rejoin.ok) return rejoin;
    }
    return { ok: true, node: newNode };
  }

  function validateGraph(graph) {
    const errors = [];
    const warnings = [];
    const ids = new Set(graph.nodes.map((node) => node.id));
    graph.edges.forEach((edge) => {
      if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`Missing endpoint on ${edge.id}`);
      if (edge.from === edge.to) errors.push(`Self-loop on ${edge.from}`);
    });
    graph.edges.forEach((edge) => {
      const without = graph.edges.filter((candidate) => candidate.id !== edge.id);
      if (reachable(graph, edge.to, edge.from, without)) errors.push(`Cycle through ${edge.from} → ${edge.to}`);
    });
    graph.nodes.forEach((node) => {
      if (node.id !== graph.root && !graph.edges.some((edge) => edge.to === node.id)) warnings.push(`Orphan node: ${node.label}`);
      if (node.kind === "branch" && !graph.edges.some((edge) => edge.from === node.id && edge.type === "rejoins")) warnings.push(`Open branch without rejoin: ${node.label}`);
    });
    return { ok: errors.length === 0, errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)) };
  }

  function topoRanks(graph) {
    const indegree = {};
    const adj = {};
    graph.nodes.forEach((node) => { indegree[node.id] = 0; adj[node.id] = []; });
    graph.edges.forEach((edge) => {
      if (edge.to in indegree) indegree[edge.to] += 1;
      if (adj[edge.from]) adj[edge.from].push(edge.to);
    });
    const queue = Object.keys(indegree).filter((id) => indegree[id] === 0);
    const ranks = {};
    queue.forEach((id) => { ranks[id] = 0; });
    while (queue.length) {
      const id = queue.shift();
      adj[id].forEach((next) => {
        ranks[next] = Math.max(ranks[next] || 0, (ranks[id] || 0) + 1);
        indegree[next] -= 1;
        if (indegree[next] === 0) queue.push(next);
      });
    }
    graph.nodes.forEach((node) => { if (ranks[node.id] === undefined) ranks[node.id] = 0; });
    return ranks;
  }

  function exportGraph(graph) {
    return JSON.stringify({ ...graph, meta: { ...graph.meta, savedAt: new Date().toISOString() } }, null, 2);
  }

  function importGraph(json) {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    const graph = normalizeGraph(parsed);
    const validation = validateGraph(graph);
    if (!validation.ok) {
      const error = new Error("Graph failed validation");
      error.validation = validation;
      throw error;
    }
    return graph;
  }

  // ---- Auto-merge (spec 2026-06-22): collapse state-equivalent nodes. ----

  function isCanonicalEdge(edge) {
    return edge.canonical === true || (edge.canonical === undefined && edge.type === "causes");
  }

  // Shortest canonical distance from any root (node with no canonical
  // in-edges). Pure topology — no fixture needed (spec R3).
  function canonicalDepths(graph) {
    const depth = new Map();
    const indeg = new Map();
    const adj = new Map();
    graph.nodes.forEach((node) => { indeg.set(node.id, 0); adj.set(node.id, []); });
    graph.edges.forEach((edge) => {
      if (!isCanonicalEdge(edge)) return;
      if (!indeg.has(edge.to) || !adj.has(edge.from)) return;
      indeg.set(edge.to, indeg.get(edge.to) + 1);
      adj.get(edge.from).push(edge.to);
    });
    const queue = [];
    graph.nodes.forEach((node) => {
      if (indeg.get(node.id) === 0) { depth.set(node.id, 0); queue.push(node.id); }
    });
    while (queue.length) {
      const id = queue.shift();
      for (const next of adj.get(id)) {
        const cand = depth.get(id) + 1;
        depth.set(next, Math.min(depth.has(next) ? depth.get(next) : Infinity, cand));
        indeg.set(next, indeg.get(next) - 1);
        if (indeg.get(next) === 0) queue.push(next);
      }
    }
    return depth;
  }

  // Absorb victim into survivor: rewire edges, drop self-loops, dedup
  // parallel edges (canonical wins), remap omega, delete victim (R5/R6).
  function absorbNode(graph, victimId, survivorId) {
    graph.edges.forEach((edge) => {
      if (edge.from === victimId) edge.from = survivorId;
      if (edge.to === victimId) edge.to = survivorId;
    });
    graph.edges = graph.edges.filter((edge) => edge.from !== edge.to);
    const kept = [];
    const byKey = new Map();
    for (const edge of graph.edges) {
      const key = `${edge.from} ${edge.to} ${edge.type}`;
      if (!byKey.has(key)) { byKey.set(key, edge); kept.push(edge); }
      else if (isCanonicalEdge(edge) && !isCanonicalEdge(byKey.get(key))) {
        byKey.get(key).canonical = true; // keep the canonical incarnation
      }
    }
    graph.edges = kept;
    if (Array.isArray(graph.omega)) {
      graph.omega = Array.from(new Set(graph.omega.map((id) => (id === victimId ? survivorId : id))));
    }
    graph.nodes = graph.nodes.filter((node) => node.id !== victimId);
  }

  function mergeEquivalentStates(graph, opts = {}) {
    const groups = opts.groups || [];
    const eligible = opts.eligibleIds
      ? (opts.eligibleIds instanceof Set ? opts.eligibleIds : new Set(opts.eligibleIds))
      : null;
    const depths = canonicalDepths(graph);
    const orderIndex = new Map(graph.nodes.map((node, idx) => [node.id, idx]));
    let merged = 0;
    let skipped = 0;
    const survivorSet = new Set();

    for (const rawGroup of groups) {
      const entryIds = Array.isArray(rawGroup) ? rawGroup : (rawGroup.ids || []);
      const pinnedState = Array.isArray(rawGroup) ? null : (rawGroup.state || null);
      const ids = entryIds.filter((id) =>
        graph.nodes.some((node) => node.id === id) && (!eligible || eligible.has(id)));
      if (ids.length < 2) continue;
      // R3: survivor = smallest canonical depth, tie by node order.
      ids.sort((a, b) => {
        const da = depths.has(a) ? depths.get(a) : Infinity;
        const db = depths.has(b) ? depths.get(b) : Infinity;
        if (da !== db) return da - db;
        return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
      });
      const survivorId = ids[0];
      const survivor = graph.nodes.find((node) => node.id === survivorId);
      const absorbed = [];
      const absorbedActions = [];
      for (const victimId of ids.slice(1)) {
        // R4: skip if either reaches the other via canonical edges (merge would create a cycle).
        const canonEdges = graph.edges.filter(isCanonicalEdge);
        if (reachable(graph, survivorId, victimId, canonEdges) || reachable(graph, victimId, survivorId, canonEdges)) {
          skipped += 1;
          continue;
        }
        // Capture the victim's action before absorbNode deletes the node, so
        // the survivor can render a join-title spanning all merged moves.
        const victim = graph.nodes.find((node) => node.id === victimId);
        if (victim && victim.action) absorbedActions.push(victim.action);
        absorbNode(graph, victimId, survivorId);
        absorbed.push(victimId);
        merged += 1;
      }
      if (absorbed.length) {
        survivor.tags = Array.from(new Set([...(survivor.tags || []), "merged"]));
        survivor.mergedFrom = [...(survivor.mergedFrom || []), ...absorbed];
        if (absorbedActions.length) survivor.mergedActions = [...(survivor.mergedActions || []), ...absorbedActions];
        if (pinnedState) survivor.mergedState = pinnedState.slice();
        survivorSet.add(survivorId);
      }
    }
    return { ok: true, merged, skipped, survivors: Array.from(survivorSet) };
  }

  // A merged (join) node is semantically a converged *state*, not a single
  // move, but it still wears one absorbed action's label. Compose a title
  // spanning the whole merged action set — "actor: v1 + v2 → target" — so the
  // join stops masquerading as a duplicate of one of its parents. Returns null
  // for non-merged nodes (caller falls back to node.label).
  // Binding-value order = declaration order (see materializeCandidate / fixture
  // params): [0] is the actor, [1] the receiver/target.
  function composeMergedLabel(node) {
    if (!node || !Array.isArray(node.mergedActions) || !node.mergedActions.length) return null;
    const actions = [node.action, ...node.mergedActions]
      .filter((a) => a && a.entry && a.binding);
    if (actions.length < 2) return null;
    const verbs = [];
    for (const a of actions) if (!verbs.includes(a.entry)) verbs.push(a.entry);
    const nth = (a, i) => Object.values(a.binding)[i];
    const actors = new Set(actions.map((a) => nth(a, 0)));
    const targets = actions.map((a) => nth(a, 1));
    const actor = actors.size === 1 ? [...actors][0] : null;
    const target = targets.every((t) => t != null) && new Set(targets).size === 1 ? targets[0] : null;
    let title = verbs.join(" + ");
    if (actor != null) title = `${actor}: ${title}`;
    if (target != null) title = `${title} → ${target}`;
    return title;
  }

  const api = { EDGE_TYPES, normalizeGraph, reachable, wouldCreateCycle, addEdge, addBranch, validateGraph, topoRanks, exportGraph, importGraph, mergeEquivalentStates, composeMergedLabel };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
