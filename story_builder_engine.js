(function attachStoryDagEngine(root) {
  const Ids = (typeof require !== "undefined")
    ? require("./ids.js")
    : root.StoryDagIds;

  const EDGE_TYPES = ["causes", "leads_to", "choice", "rejoins"];

  function normalizeGraph(graph) {
    const clone = JSON.parse(JSON.stringify(graph));
    clone.nodes = (clone.nodes || []).map((node) => ({
      kind: "story",
      tags: [],
      state: "",
      expr: "event(?)",
      createdBy: "human",
      delta: "",
      invariants: "",
      ...node,
      label: node.label || node.id || "unnamed"
    }));
    // Minted ids accumulate into `taken` so a second edge between the same
    // pair gets `_2` rather than colliding — index-free, so the id survives a
    // reordering of the edge list (LOCAL_LLM.md §3.1).
    const taken = new Set((clone.edges || []).map((edge) => edge.id).filter(Boolean));
    clone.edges = (clone.edges || []).map((edge) => {
      const type = edge.type || "causes";
      const id = edge.id || Ids.edgeId({ from: edge.from, to: edge.to, type }, taken);
      taken.add(id);
      return { id, type, label: edge.label || edge.type || "edge", ...edge };
    });
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
      id: edge.id || Ids.edgeId({ from: edge.from, to: edge.to, type: edge.type }, graph),
      type: edge.type || "causes",
      label: edge.label || edge.type || "edge",
      ...edge
    });
    return { ok: true };
  }

  function addBranch(graph, sourceId, branch, rejoinTargetId = "") {
    const source = graph.nodes.find((node) => node.id === sourceId);
    if (!source) return { ok: false, message: "Source node is missing" };
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
    // Minted AFTER the defaults are applied, so the id hashes the `expr` the
    // node actually ends up with rather than an absent one (LOCAL_LLM.md §3.1).
    if (!newNode.id) newNode.id = Ids.nodeId({ parentId: sourceId, expr: newNode.expr, label: newNode.label }, graph);
    graph.nodes.push(newNode);
    const choice = addEdge(graph, { from: sourceId, to: newNode.id, type: "choice", label: newNode.delta || "alternative branch", branchId: newNode.id });
    if (!choice.ok) {
      graph.nodes = graph.nodes.filter((node) => node.id !== newNode.id);
      return choice;
    }
    if (rejoinTargetId) {
      const rejoin = addEdge(graph, { from: newNode.id, to: rejoinTargetId, type: "rejoins", label: "rejoins the story", branchId: newNode.id });
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

  // Canonical, not chronological: sorted, fixed key order, no `savedAt`. Two
  // identical graphs must export to identical bytes, which is the whole
  // definition of "this run reproduced" (LOCAL_LLM.md §3.2). A wall-clock
  // stamp is provenance and belongs in the run manifest, not in the content.
  function exportGraph(graph) {
    return Ids.canonicalJson(graph);
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

  const api = { EDGE_TYPES, normalizeGraph, reachable, wouldCreateCycle, addEdge, addBranch, validateGraph, topoRanks, exportGraph, importGraph };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
