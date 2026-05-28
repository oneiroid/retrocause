// Generic DAG walker. Computes post-state at every reachable node of a
// story graph by topo-replay of `action` annotations, starting from
// `fixture.scope.initial_state`. Replaces the hand-rolled per-seed
// state tables in story_builder_app.js's phiBindings.
// Actor-thread DAGs are first-class: different main characters can
// advance along separate canonical paths, share a merged node for
// several steps, then split again. Multi-predecessor nodes merge their
// incoming post-states before closure.
//
// Inputs:
//   graph    — { nodes:[{id, action?:{entry, binding}}], edges:[{from, to, type, canonical}] }
//   fixture  — { entries:{[name]:LEntry}, scope:{initial_state:Set<string>, derivations:[Rule]} }
//   Phi      — the phi.js module (executor: step, mergeStates, derivationClosure)
//
// Algorithm (§1.7 + §7.8 replay):
//   1. Topo-sort nodes by canonical-edge precedence; non-canonical edges
//      do not contribute state (choice/rejoins/parallels are visual).
//   2. For each node in order:
//      a. preds = canonical edges into this node.
//      b. If empty: pre = initial_state (this is a root / actor-thread start).
//      c. Else: pre = mergeStates(...post[preds]).
//      d. If node.action: post = Phi.step(pre, entry, binding, derivations).
//         Else:           post = Phi.derivationClosure(pre, derivations).
//   3. Return {[nodeId]: post}.
//
// Notes:
// - A node with action whose `requires` does not hold is still stepped
//   (effects fire blindly). The seed author is responsible for only
//   annotating nodes where the precondition holds; nodes that *can't*
//   fire (e.g. red_disguise: grandmother still at home) should be left
//   without an `action` field.
// - Cycles in the canonical sub-DAG are a graph-author bug; the walker
//   detects them and throws.

(function attachStateWalker(root) {

  function canonicalIn(graph, nodeId) {
    return (graph.edges || []).filter(e =>
      e.to === nodeId && (e.canonical === true || (e.canonical === undefined && e.type === "causes")));
  }

  function canonicalOut(graph, nodeId) {
    return (graph.edges || []).filter(e =>
      e.from === nodeId && (e.canonical === true || (e.canonical === undefined && e.type === "causes")));
  }

  // Topo-order over the canonical sub-DAG. Includes only nodes that
  // appear as endpoints of canonical edges OR have no canonical edges
  // at all (so isolated nodes are also surfaced).
  function topoOrderCanonical(graph) {
    const nodes = graph.nodes || [];
    const indegree = new Map();
    for (const n of nodes) indegree.set(n.id, 0);
    for (const e of (graph.edges || [])) {
      if (!(e.canonical === true || (e.canonical === undefined && e.type === "causes"))) continue;
      if (!indegree.has(e.to)) continue;
      indegree.set(e.to, indegree.get(e.to) + 1);
    }
    const ready = [];
    for (const n of nodes) if (indegree.get(n.id) === 0) ready.push(n.id);
    const order = [];
    while (ready.length) {
      const id = ready.shift();
      order.push(id);
      for (const e of canonicalOut(graph, id)) {
        const next = e.to;
        if (!indegree.has(next)) continue;
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) ready.push(next);
      }
    }
    if (order.length !== nodes.length) {
      throw new Error("state_walker: canonical sub-DAG has a cycle; cannot topo-order");
    }
    return order;
  }

  // Compute post-states for every node. Returns Map<nodeId, Set<string>>.
  function computeAllPostStates(graph, fixture, Phi) {
    if (!fixture || !fixture.scope) {
      throw new Error("state_walker: fixture must have a scope with initial_state");
    }
    const derivations = fixture.scope.derivations || [];
    const order = topoOrderCanonical(graph);
    const post = new Map();
    for (const nodeId of order) {
      const node = graph.nodes.find(n => n.id === nodeId);
      const preds = canonicalIn(graph, nodeId);
      let pre;
      if (preds.length === 0) {
        pre = fixture.scope.initial_state;
      } else if (preds.length === 1) {
        const p = post.get(preds[0].from);
        pre = p || fixture.scope.initial_state;
      } else {
        const predStates = preds.map(e => post.get(e.from)).filter(Boolean);
        pre = predStates.length ? Phi.mergeStates(...predStates) : fixture.scope.initial_state;
      }

      let nextState;
      if (node && node.action && fixture.entries && fixture.entries[node.action.entry]) {
        const entry = fixture.entries[node.action.entry];
        nextState = Phi.step(pre, entry, node.action.binding || {}, derivations);
      } else {
        // No action: still run closure so a merged pre-state can fire
        // derivations (this is the C.4-1 magi_reveal case).
        nextState = Phi.derivationClosure(pre, derivations);
      }
      post.set(nodeId, nextState);
    }
    return post;
  }

  // Convenience: post-state at a single node, with implicit caching when
  // the caller supplies a cache map keyed on graph identity.
  function postStateAt(graph, nodeId, fixture, Phi) {
    const all = computeAllPostStates(graph, fixture, Phi);
    return all.get(nodeId);
  }

  const api = { postStateAt, computeAllPostStates, topoOrderCanonical };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseStateWalker = api;
})(typeof window !== "undefined" ? window : globalThis);
