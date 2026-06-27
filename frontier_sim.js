// Frontier simulation: build the DERIVED possibility cone by running
// auto-branch + auto-merge outward from a fixture's initial state, then
// hand the result to cone.js. This is the non-sand-castle cone — its
// topology is enumerated from the typed lexicon, not hand-drawn
// (INTUITIONS §8 / §9; see project memory project-frontier-sim-direction).
//
//   auto-branch : at each world, phi() enumerates every entry whose
//                 `requires` holds; each effectful candidate yields a child world.
//   auto-merge  : worlds are keyed by stateKey GLOBALLY, so two paths
//                 reaching the same world share one node — convergences
//                 form, and the branch structure becomes a DAG.
//
// Output is a cone.js-compatible graph { root, nodes:[{id}], edges:[{id,from,to,type}] }
// plus per-node info (state, depth, terminal flag).

(function attachFrontierSim(root) {
  const Phi = (typeof require !== "undefined") ? require("./phi.js") : root.RetrocausePhi;

  // Expansion stops at a world that satisfies `isTerminal` (a completed Ω),
  // at maxDepth, or when the frontier is empty. Defaults are generous; the
  // ratchet structure of typical lexicons keeps the reachable set finite.
  const DEFAULTS = { maxDepth: 40, maxNodes: 20000 };

  function simulate({ lexicon, scope, isTerminal = () => false, maxDepth, maxNodes } = {}) {
    maxDepth = maxDepth == null ? DEFAULTS.maxDepth : maxDepth;
    maxNodes = maxNodes == null ? DEFAULTS.maxNodes : maxNodes;
    const rules = scope.derivations || [];
    const start = Phi.derivationClosure(new Set(scope.initial_state), rules);

    const byKey = new Map();      // stateKey -> node {id, state, depth, key}
    const edges = [];
    const edgeSet = new Set();
    let counter = 0;

    function ensure(state, depth) {
      const key = Phi.stateKey(state);
      let node = byKey.get(key);
      let created = false;
      if (!node) {
        node = { id: `n${counter++}`, state, depth, key };
        byKey.set(key, node);
        created = true;
      } else if (depth < node.depth) {
        node.depth = depth; // keep shallowest discovery depth
      }
      return { node, created };
    }

    const rootNode = ensure(start, 0).node;
    const queue = [rootNode];
    while (queue.length && byKey.size < maxNodes) {
      const node = queue.shift();
      if (node.depth >= maxDepth) continue;
      if (isTerminal(node.state)) continue;
      const cands = Phi.phi({ lexicon, scope, state: node.state });
      for (const c of cands) {
        const post = Phi.step(node.state, c.entry, c.binding, rules);
        if (Phi.statesEqual(node.state, post)) continue; // non-effectful: not a real continuation
        const { node: child, created } = ensure(post, node.depth + 1);
        if (child.id !== node.id) {
          const ek = `${node.id}->${child.id}`;
          if (!edgeSet.has(ek)) {
            edgeSet.add(ek);
            edges.push({ id: `e${edges.length}`, from: node.id, to: child.id, type: "causes", label: c.entry.name });
          }
        }
        if (created) queue.push(child);
      }
    }

    const nodes = [];
    const info = new Map();
    for (const node of byKey.values()) {
      nodes.push({ id: node.id });
      info.set(node.id, {
        depth: node.depth,
        state: Array.from(node.state).sort(),
        terminal: isTerminal(node.state),
        key: node.key,
      });
    }
    return {
      graph: { root: rootNode.id, nodes, edges },
      info,
      rootId: rootNode.id,
      byKey,
      truncated: byKey.size >= maxNodes,
    };
  }

  const api = { simulate, DEFAULTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseFrontierSim = api;
})(typeof window !== "undefined" ? window : globalThis);
