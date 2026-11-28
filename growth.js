// Growth loop (v0) — merge-on-insert.
//
// Insert a candidate continuation ("a new state `node` reached from an existing
// node `from`") into the DAG. If the new state turns out to be the same state
// as one already in the graph — same content, reached by a *parallel* path —
// collapse it into that existing node so the graph CONVERGES instead of growing
// a fresh leaf for every continuation.
//
// The whole merge decision is delegated to MergePredicate.sameInContext. The
// rewire on merge (`from → survivor`) is provably acyclic: it could only cycle
// if the survivor already reached `from`, but that is exactly the condition
// that makes the two nodes comparable and blocks the merge. So merge and
// acyclicity are the same condition — no extra cycle guard is needed.
//
// The manual branch form uses insertContinuation. The automatic grower decides
// merges with the model (grower.js) and uses attach / rejoin.

(function attachGrowth(root) {
  const Engine = (typeof require !== "undefined")
    ? require("./story_builder_engine.js")
    : root.StoryDagEngine;
  const Predicate = (typeof require !== "undefined")
    ? require("./merge_predicate.js")
    : root.MergePredicate;
  const Ids = (typeof require !== "undefined")
    ? require("./ids.js")
    : root.StoryDagIds;

  // If `nodeId` is the same state in context as an existing node, collapse it:
  // remove it and rewire ALL its edges (incoming and outgoing) to the survivor,
  // skipping rewires the survivor already has. Safe for the same reason the
  // simple merge is: a rewired edge could only cycle if its far endpoint were
  // reachable from / could reach the survivor through the victim — which would
  // have made victim and survivor comparable and blocked the merge.
  // Returns { merged:true, into } or { merged:false }.
  function collapseIfSame(graph, nodeId) {
    const survivor = graph.nodes.find(
      (other) => other.id !== nodeId && Predicate.sameInContext(graph, nodeId, other.id),
    );
    if (!survivor) return { merged: false };

    const touched = graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);
    graph.edges = graph.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    graph.nodes = graph.nodes.filter((n) => n.id !== nodeId);
    touched.forEach((e) => {
      const { id, from: oldFrom, to: oldTo, ...rest } = e;
      const from = oldFrom === nodeId ? survivor.id : oldFrom;
      const to = oldTo === nodeId ? survivor.id : oldTo;
      const duplicate = graph.edges.some((other) => other.from === from && other.to === to);
      if (!duplicate) Engine.addEdge(graph, { ...rest, from, to });
    });
    return { merged: true, into: survivor.id };
  }

  // A continuation whose content is identical to the state it continues FROM
  // advances nothing: the edge carries no information and the child is a
  // restatement, not an event. Observed as `leave(red, basket) -> leave(red,
  // basket)` and as a four-node chain of `watch(red, woods)` — 8 of 34 edges
  // in one real run.
  //
  // This is NOT a second definition of "same state" . Two different
  // questions:
  //   - "are these two nodes the same state?"  — identity. sameInContext owns
  //     it, and its answer for a chain is `recurrence, do not merge`, which
  //     must stay that way or criedWolf's three `cry(boy, wolf)` collapse.
  //   - "does this edge advance anything?"     — validity. This. It never
  //     compares two distinct states, so it cannot disagree with the predicate.
  //
  // Nor can it be solved by merging: source and candidate are comparable here,
  // so the incomparability clause blocks the collapse, and lifting that clause
  // would reintroduce the cycles the merge rewire relies on being impossible
  // (see the header). A null transition has to be refused at creation.
  //
  // BOTH fields must be present on the source before this claims anything,
  // mirroring the predicate's refusal to merge unknown states. Two nodes with
  // the same expr and no state at all are not evidence that nothing changed —
  // they are evidence that nothing was said. Refusing to judge there is the
  // cheap direction: a missed null transition costs one junk node, a wrongly
  // refused recurrence costs criedWolf.
  //
  // Note what this does NOT catch. It is a syntactic proxy for "nothing
  // changed", and it fires on the observed cases only because the model
  // restated the state text too. A model that wrote a *different* sentence
  // for an event that is still impossible — leaving a basket already left,
  // a thing Red has exactly one of — would pass it. Preconditions and
  // consumption need a world model, the machinery this repo has twice
  // declined to build. This catches laziness, not incoherence.
  function isNullTransition(source, node) {
    const expr = Ids.normalizedContent(source.expr);
    const state = Ids.normalizedContent(source.state);
    if (!expr || !state) return false;
    return Ids.normalizedContent(node.expr) === expr
      && Ids.normalizedContent(node.state) === state;
  }

  // Fold `victimId` into `survivorId`: every edge into the victim now goes into
  // the survivor (as `rejoins`: the routes meet there), every edge out of it now
  // leaves the survivor, and the victim is removed. Acyclic when the two are
  // incomparable, for the reason collapseIfSame gives. Returns the edges removed
  // and the edges added, so a caller showing the graph can apply the same change.
  function collapseInto(graph, victimId, survivorId, label = "") {
    const removed = graph.edges.filter((e) => e.from === victimId || e.to === victimId);
    graph.edges = graph.edges.filter((e) => e.from !== victimId && e.to !== victimId);
    graph.nodes = graph.nodes.filter((n) => n.id !== victimId);
    const added = [];
    removed.forEach((e) => {
      const incoming = e.to === victimId;
      const from = incoming ? e.from : survivorId;
      const to = incoming ? survivorId : e.to;
      if (from === to || graph.edges.some((other) => other.from === from && other.to === to)) return;
      const result = Engine.addEdge(graph, {
        from, to, type: incoming ? "rejoins" : e.type, label: incoming ? (label || e.label || "") : (e.label || ""),
      });
      if (result.ok) added.push(graph.edges[graph.edges.length - 1]);
    });
    return { removed, added };
  }

  // Insert one continuation. Returns:
  //   { merged:true,  into, edge }  — collapsed into an existing parallel state
  //   { merged:false, node, edge }  — kept as a genuinely new state
  //   { ok:false, message }         — bad input (e.g. `from` not in graph)
  //   { ok:false, reason:"null_transition" } — restates `from`; nothing added
  function insertContinuation(graph, { from, node, type, label } = {}) {
    const source = graph.nodes.find((n) => n.id === from);
    if (!source) return { ok: false, message: `Source node ${from} is missing` };
    if (!node) return { ok: false, message: "Continuation has no node" };
    if (isNullTransition(source, node)) {
      return { ok: false, reason: "null_transition", message: `Continuation restates ${from}` };
    }
    // Content-addressed, hashing the node `from` was reached under. This is
    // the id site that fires most — once per inserted continuation — so it is
    // the one that decides whether a grown graph replays at all.
    if (!node.id) node.id = Ids.nodeId({ parentId: from, expr: node.expr, label: node.label }, graph);

    graph.nodes.push(node);
    const result = Engine.addEdge(graph, { from, to: node.id, type, label });
    if (!result.ok) {
      graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
      return result;
    }
    const edge = graph.edges[graph.edges.length - 1];

    const collapsed = collapseIfSame(graph, node.id);
    if (!collapsed.merged) return { merged: false, node, edge };
    return { merged: true, into: collapsed.into, edge: graph.edges[graph.edges.length - 1] };
  }

  // The grower's two moves, once it has decided: keep the candidate as a new
  // state, or send the edge to a state the judge confirmed. Unlike
  // insertContinuation, neither asks the surface key anything.
  function attach(graph, { from, node, type = "choice", label = "" }) {
    if (!node.id) node.id = Ids.nodeId({ parentId: from, expr: node.expr, label: node.label }, graph);
    graph.nodes.push(node);
    Engine.addEdge(graph, { from, to: node.id, type, label });
    return { node, edge: graph.edges[graph.edges.length - 1] };
  }

  // Returns the new edge, or null when `from` already leads to `into`.
  function rejoin(graph, { from, into, label = "" }) {
    if (graph.edges.some((e) => e.from === from && e.to === into)) return null;
    return Engine.addEdge(graph, { from, to: into, type: "rejoins", label }).ok
      ? graph.edges[graph.edges.length - 1]
      : null;
  }

  // Apply several continuations in order. Order is significant: a later
  // candidate can merge into a node added earlier in the same call.
  function grow(graph, continuations) {
    return (continuations || []).map((c) => insertContinuation(graph, c));
  }

  const api = { insertContinuation, grow, collapseIfSame, collapseInto, isNullTransition, attach, rejoin };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagGrowth = api;
})(typeof window !== "undefined" ? window : globalThis);
