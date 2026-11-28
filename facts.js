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
  // Properties that name the event instead of a state it leaves behind. The
  // first run (2026-11-28) wrote `wolf.action=wait` on 7 of 57 nodes; such a
  // fact never recurs, so it splits worlds that are the same.
  const EVENT_PROPERTY = /(^|\.)(action|actions|activity|doing|event|state|status)$/;
  // One spelling per truth value: runs wrote on_path=false beside on_path=no.
  const VALUE_ALIASES = { true: "yes", y: "yes", false: "no", n: "no" };

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
      const raw = token(part.slice(eq + 1)).replace(ARTICLE, "");
      const value = VALUE_ALIASES[raw] || raw;
      if (!ASSIGNMENT.test(`${key}=${value}`) || EVENT_PROPERTY.test(key)) {
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

  // The fact keys the story's authored nodes use, sorted: the vocabulary the
  // model is asked to write in, so two routes name one fact one way.
  function vocabularyOf(graph) {
    return [...valuesOf(graph).keys()].sort();
  }

  // Each authored key with the values the authored nodes give it, so a place is
  // spelled once (runs wrote `cottage` beside `grandmother_house`).
  function valuesOf(graph) {
    const values = new Map();
    graph.nodes.filter((n) => n.createdBy !== "grown").forEach((n) => effectsOf(n).forEach(([k, v]) => {
      if (!values.has(k)) values.set(k, new Set());
      values.get(k).add(v);
    }));
    return values;
  }

  // "red.location (home, woods), wolf.alive (yes, no)": the vocabulary as the
  // prompt shows it. Yes/no keys are listed without their values.
  function renderVocabulary(graph) {
    const values = valuesOf(graph);
    return [...values.keys()].sort().map((k) => {
      const vs = [...values.get(k)].sort();
      return vs.every((v) => v === "yes" || v === "no") ? k : `${k} (${vs.join(", ")})`;
    }).join(", ");
  }

  const api = { vocabularyOf, valuesOf, renderVocabulary, parseEffects, formatEffects, fold, worldKey, worldDiff, renderWorld, effectsOf, worldsOf, token };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryFacts = api;
})(typeof window !== "undefined" ? window : globalThis);
