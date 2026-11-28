// The fact layer: a node's world as `owner.property=value` assignments.
//
// A node's `effects` names what its event changed. Folded last-write-wins along
// a path, the effects give the world at that node. Two nodes whose folded worlds
// are equal are the same state, however differently they were reached: that is
// the convergence the project is about (INTUITIONS §5). The grower merges on it
// without a model call.
//
// Seeds carry hand-authored effects, the ground truth. Grown nodes carry
// effects the model wrote (createdBy: "grown"), so a grown world measures the
// model's own consistency, not the story's truth.
//
// Values are normalized hard (case, spaces, a leading article), because the
// fold only finds a convergence when the same fact is written the same way.

(function attachFacts(root) {
  const ASSIGNMENT = /^([a-z0-9_]+)\.([a-z0-9_.]+)=([a-z0-9_.-]+)$/;
  const ARTICLE = /^(the|a|an)_/;

  function token(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9_.-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[_.]+|[_.]+$/g, "");
  }

  // "Red.location = the woods; wolf.knows=yes" → [["red.location", "woods"], ["wolf.knows", "yes"]].
  // Parts that are not `owner.property=value` are counted in `rejected`.
  function parseEffects(text) {
    const pairs = [];
    let rejected = 0;
    for (const part of String(text || "").split(/[,;]/)) {
      if (!part.trim()) continue;
      const eq = part.indexOf("=");
      if (eq < 0) {
        rejected += 1;
        continue;
      }
      const key = token(part.slice(0, eq));
      const value = token(part.slice(eq + 1)).replace(ARTICLE, "");
      if (!ASSIGNMENT.test(`${key}=${value}`)) {
        rejected += 1;
        continue;
      }
      pairs.push([key, value]);
    }
    return { pairs, rejected };
  }

  const formatEffects = (pairs) => pairs.map(([k, v]) => `${k}=${v}`).join(", ");

  function fold(world, pairs) {
    const next = new Map(world);
    pairs.forEach(([k, v]) => next.set(k, v));
    return next;
  }

  // One string per world: equal worlds, equal keys.
  function worldKey(world) {
    return [...world.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join(";");
  }

  // The facts on which two worlds differ, a key held by only one included.
  function worldDiff(a, b) {
    const keys = new Set([...a.keys(), ...b.keys()]);
    return [...keys].sort().filter((k) => a.get(k) !== b.get(k)).map((k) => ({ key: k, a: a.get(k), b: b.get(k) }));
  }

  // "red: location=woods, has_basket=yes\nwolf: alive=yes", grouped by owner.
  function renderWorld(world) {
    const byOwner = new Map();
    [...world.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).forEach(([key, value]) => {
      const dot = key.indexOf(".");
      const owner = key.slice(0, dot);
      if (!byOwner.has(owner)) byOwner.set(owner, []);
      byOwner.get(owner).push(`${key.slice(dot + 1)}=${value}`);
    });
    return [...byOwner.entries()].map(([owner, facts]) => `${owner}: ${facts.join(", ")}`).join("\n");
  }

  // A node's own changes, from its `effects` string.
  const effectsOf = (node) => parseEffects(node && node.effects).pairs;

  // Worlds for every node of `graph`, folded from the root. A node's world comes
  // through one parent: the first by id among its non-rejoin edges, else among
  // its rejoins. A merge made on equal worlds makes every parent agree, so the
  // choice matters only for merges a judge made on near ones.
  function worldsOf(graph) {
    const parents = new Map();
    graph.edges.forEach((e) => {
      if (!parents.has(e.to)) parents.set(e.to, []);
      parents.get(e.to).push(e);
    });
    const pick = (id) => {
      const incoming = (parents.get(id) || []).slice().sort((a, b) => String(a.from).localeCompare(String(b.from)));
      const main = incoming.find((e) => e.type !== "rejoins") || incoming[0];
      return main ? main.from : null;
    };
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const worlds = new Map();
    const resolve = (start) => {
      const chain = [];
      const seen = new Set();
      let id = start;
      for (; id !== null && !worlds.has(id) && !seen.has(id); id = pick(id)) {
        seen.add(id);
        chain.push(id);
      }
      let world = id !== null && worlds.has(id) ? worlds.get(id) : new Map();
      for (const id of chain.reverse()) {
        world = fold(world, effectsOf(byId.get(id)));
        worlds.set(id, world);
      }
    };
    graph.nodes.forEach((n) => { if (!worlds.has(n.id)) resolve(n.id); });
    return worlds;
  }

  const api = { parseEffects, formatEffects, fold, worldKey, worldDiff, renderWorld, effectsOf, worldsOf, token };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryFacts = api;
})(typeof window !== "undefined" ? window : globalThis);
