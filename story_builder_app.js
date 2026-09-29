/* global d3 */
(() => {
  const EDGE_TYPES = ["causes", "leads_to", "choice", "rejoins"];
  const STORAGE_KEY = "retrocause.storyDagBuilder.v2";

  // The Node-side grow bridge (tools/grow_server.js). The page never calls
  // the model itself — it POSTs "grow from this node" here and imports the
  // grown graph the bridge returns. Optional: without the bridge running,
  // Auto-grow fails with a toast and everything else works as before.
  const GROW_SERVER_URL = "http://127.0.0.1:8081";

  // Content-addressed ids and canonical export (ids.js, LOCAL_LLM.md §3).
  // Loaded as a plain script before this one; the page has no module system.
  const ids = window.StoryDagIds;

  // ── Force-layout tuning ───────────────────────────────────────────────
  // Every graph-layout magic number lives here, named and explained, instead
  // of being scattered through the simulation code. Adjust layout feel here.
  // (Declared up top so the force functions can read it during first render.)
  const LAYOUT = {
    // Resting forces (a settled graph nobody is dragging).
    charge: -1200,           // base node repulsion; more negative = more spread
    chargeDistanceMax: 1200, // px — ignore repulsion beyond this range (perf + locality)
    dragCharge: -3000,       // repulsion of the node under the cursor: a wider
                             //   "bubble" so neighbours give way as it's dragged
    linkDistance: 160,       // px — preferred length of a causal / choice edge
    rejoinLinkDistance: 200, // px — rejoins edges sit a little looser
    linkStrength: 0.25,      // how stiffly an edge holds its preferred length (0..1)
    collidePadding: 30,      // px added to each node's half-width as collision radius
    collideIterations: 3,    // collision passes per tick; higher = firmer non-overlap
    laneGapMin: 92,          // px — min vertical gap when fanning same-rank siblings
    laneGapMax: 150,         // px — max vertical gap (caps very tall fan-outs)
    yStrength: 0.08,         // gentle vertical organising pull (low = plastic, not rigid)
    edgeMinDx: 60,           // px — an edge's end node is kept at least this far to the
                             //   RIGHT of its start node, so edges never point left (§LTR)
    edgeCorrection: 0.5,     // fraction of an LTR overshoot fixed per tick: a soft
                             //   relaxation rather than a hard snap, so dragging past a
                             //   neighbour eases into order instead of shocking the graph
    dragAlphaTarget: 0.35,   // simulation "heat" held while a drag is in progress (lower =
                             //   calmer give-way, the node sits more still where dropped)
    restAlphaDecay: 0.0228,  // d3's default cooling rate, restored after a reheat

    // Reheat = an "untangle" pass: shake out of the current local minimum,
    // stretch hard, cool slowly, then relax back to the resting forces.
    reheat: {
      jitter: 520,           // px — random shake applied to each free node
      charge: -2400,         // stronger repulsion during the untangle pass
      chargeDistanceMax: 1600,
      linkDistance: 210,
      rejoinLinkDistance: 260,
      linkStrength: 0.18,
      alphaDecay: 0.022,     // slow cooling = more time to reorganize
      settleMs: 2400,        // length of the energetic pass before relaxing
      fitDelayMs: 700,       // re-frame the result this long after relaxing
    },
  };
  const NODE_COLORS = {
    root: "#38bdf8",
    story: "#38bdf8",
    branch: "#f472b6",
    bottleneck: "#f59e0b",
    note: "#94a3b8"
  };
  // A bottleneck is a waist: strictly more than two paths merge into it AND
  // the flow re-widens — it forks again at the node (out-degree >= 2) or at
  // some descendant later. A many-in node that just dead-ends or runs to a
  // single terminating line is a sink, not a bottleneck. Derived from
  // topology, never authored as a kind.
  const BOTTLENECK_MIN_INPUTS = 3;
  const BRANCH_MIN_OUTPUTS = 2;
  const EDGE_COLORS = {
    causes: "#64748b",
    leads_to: "#38bdf8",
    choice: "#f472b6",
    rejoins: "#f59e0b"
  };

  const seeds = (typeof window !== "undefined" && window.RetrocauseSeeds)
    ? window.RetrocauseSeeds.seeds
    : (typeof require !== "undefined" ? require("./seeds.js").seeds : {});

  const state = {
    graph: makeGraph(seeds.red),
    activeSeed: "red",
    selectedId: "red_start",
    promptLog: [],
    nodes: [],
    edges: [],
    ranks: {},
    showEdgeLabels: true,
    search: "",
    viewMode: "all",
    draggingId: null,
    lockedIds: new Set(),
    // Nodes a drag dropped in place (kept fx/fy so they STAY put). Distinct
    // from lockedIds (dblclick hard-lock): soft pins are released by Reheat.
    softPinnedIds: new Set()
  };

  const el = Object.fromEntries(Array.from(document.querySelectorAll("[id]")).map((item) => [item.id, item]));
  const svg = d3.select("#graphSvg");
  const defs = svg.append("defs");
  // Arrow placed at the midpoint of each edge (marker-mid) so node boxes
  // never obscure it. refX/refY center the marker on the path vertex that
  // curvedPath() injects at t=0.5.
  defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 5)
    .attr("refY", 5)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,0 L10,5 L0,10 z")
    .attr("fill", "#64748b");
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
  glow.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", (d) => d);

  const graphLayer = svg.append("g");
  const edgeLayer = graphLayer.append("g").attr("class", "edge-layer");
  const labelLayer = graphLayer.append("g").attr("class", "edge-label-layer");
  const nodeLayer = graphLayer.append("g").attr("class", "node-layer");
  const zoom = d3.zoom().scaleExtent([0.15, 3]).on("zoom", (event) => graphLayer.attr("transform", event.transform));
  svg.call(zoom);

  let simulation;
  let reheatTimer;
  let nodeSelection = nodeLayer.selectAll("g.node");
  let edgeSelection = edgeLayer.selectAll("path.link");
  let edgeLabelSelection = labelLayer.selectAll("text.edge-label");

  init();

  function init() {
    renderSeeds();
    renderEdgeTypeOptions();
    bindEvents();
    renderAll();
    setTimeout(fitGraph, 350);
    checkBridge();
    window.__storyDagApp = {
      getGraph: () => structuredClone(state.graph),
      exportJson,
      importGraph,
      validateGraph,
      autoGrow,
      selectNode: (id) => { state.selectedId = id; renderAll(); }
    };
  }

  function makeGraph(seed) {
    const graph = structuredClone(seed);
    graph.meta = {
      title: seed.title,
      summary: seed.summary,
      version: 2,
      savedAt: null
    };
    return normalizeGraph(graph);
  }

  function normalizeGraph(graph) {
    graph.nodes = (graph.nodes || []).map((item) => ({
      kind: "story",
      tags: [],
      state: "",
      expr: "event(?)",
      createdBy: "human",
      delta: "",
      invariants: "",
      ...item
    }));
    graph.edges = (graph.edges || []).map((item, index) => ({
      id: item.id || `e_${item.from}_${item.to}_${index}`,
      type: item.type || "causes",
      label: item.label || "",
      ...item
    }));
    graph.root = graph.root || graph.nodes[0]?.id || "root";
    graph.meta = graph.meta || { title: graph.title || "Untitled Story DAG", version: 2 };
    return graph;
  }

  function renderSeeds() {
    el.seedList.innerHTML = "";
    Object.entries(seeds).forEach(([key, seed]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `seed-button${key === state.activeSeed ? " active" : ""}`;
      button.dataset.seed = key;
      button.innerHTML = `<strong>${seed.title}</strong><span>${seed.summary}</span>`;
      button.addEventListener("click", () => {
        state.graph = makeGraph(seed);
        state.activeSeed = key;
        state.selectedId = state.graph.root;
        renderSeeds();
        renderAll();
        setTimeout(fitGraph, 100);
        toast(`Loaded ${seed.title}`);
      });
      el.seedList.appendChild(button);
    });
  }

  function renderEdgeTypeOptions() {
    el.manualEdgeType.innerHTML = EDGE_TYPES.map((type) => `<option value="${type}">${type}</option>`).join("");
  }

  function bindEvents() {
    el.addBranchBtn.addEventListener("click", addBranchFromForm);
    el.addManualBtn.addEventListener("click", addManualEdit);
    el.deleteSelectedBtn.addEventListener("click", deleteSelectedNode);
    el.validateBtn.addEventListener("click", () => showValidation(validateGraph()));
    el.fitBtn.addEventListener("click", fitGraph);
    el.reheatBtn.addEventListener("click", untangleReheat);
    el.toggleLabelsBtn.addEventListener("click", () => { state.showEdgeLabels = !state.showEdgeLabels; renderGraph(); });
    el.searchInput.addEventListener("input", () => { state.search = el.searchInput.value.trim().toLowerCase(); renderGraph(); });
    el.viewMode.addEventListener("change", () => { state.viewMode = el.viewMode.value; renderAll(); });
    el.saveNodeBtn.addEventListener("click", saveSelectedNodeEdits);
    el.importJsonBtn.addEventListener("click", importFromTextArea);
    el.autoGrowBtn.addEventListener("click", autoGrow);
    el.probeBtn.addEventListener("click", runProbe);
    el.probeShowBtn.addEventListener("click", openProbe);
    el.probeList.addEventListener("click", onProbeClick);
    el.saveGradesBtn.addEventListener("click", saveGrades);
    el.loadRunBtn.addEventListener("click", loadRun);
    el.refreshRunsBtn.addEventListener("click", loadRuns);
    el.promptPreviewBtn.addEventListener("click", previewPrompt);
    el.promptTemplatesBtn.addEventListener("click", showTemplates);
    el.promptClearBtn.addEventListener("click", () => { state.promptLog = []; renderPromptLog(); });
    el.exportJsonBtn.addEventListener("click", showExportJson);
    el.downloadJsonBtn.addEventListener("click", downloadJson);
    el.saveLocalBtn.addEventListener("click", saveLocal);
    el.loadLocalBtn.addEventListener("click", loadLocal);
    el.blankGraphBtn.addEventListener("click", loadBlankGraph);
    window.addEventListener("resize", () => {
      if (!simulation) return;
      applyForces();
      simulation.alpha(0.35).restart();
    });
  }

  function renderAll() {
    state.ranks = topoRanks(state.graph);
    state.bottlenecks = computeBottlenecks();
    renderGraph();
    renderPanels();
    el.jsonText.value = exportJson();
  }

  // Set of node ids that are bottlenecks: in-degree > 2 (BOTTLENECK_MIN_INPUTS)
  // AND the flow re-widens at or below the node — it forks here, or a
  // descendant forks later (out-degree >= BRANCH_MIN_OUTPUTS). A many-in node
  // that only dead-ends or runs to a single line is a sink, not a bottleneck.
  // Derived each render from the edges.
  function computeBottlenecks() {
    const indeg = new Map();
    const outdeg = new Map();
    const children = new Map();
    state.graph.nodes.forEach((item) => { indeg.set(item.id, 0); outdeg.set(item.id, 0); children.set(item.id, []); });
    state.graph.edges.forEach((edgeItem) => {
      if (outdeg.has(edgeItem.from)) { outdeg.set(edgeItem.from, outdeg.get(edgeItem.from) + 1); children.get(edgeItem.from).push(edgeItem.to); }
      if (indeg.has(edgeItem.to)) indeg.set(edgeItem.to, indeg.get(edgeItem.to) + 1);
    });
    // Does this node, or any descendant, fork (>= BRANCH_MIN_OUTPUTS out)?
    // Memoized DFS over the acyclic graph.
    const widensMemo = new Map();
    function widensAtOrBelow(id) {
      if (widensMemo.has(id)) return widensMemo.get(id);
      widensMemo.set(id, false); // cycle guard (graph is a DAG)
      let widens = (outdeg.get(id) || 0) >= BRANCH_MIN_OUTPUTS;
      if (!widens) {
        for (const next of children.get(id) || []) {
          if (widensAtOrBelow(next)) { widens = true; break; }
        }
      }
      widensMemo.set(id, widens);
      return widens;
    }
    const ids = new Set();
    state.graph.nodes.forEach((item) => {
      if (indeg.get(item.id) >= BOTTLENECK_MIN_INPUTS && widensAtOrBelow(item.id)) ids.add(item.id);
    });
    return ids;
  }

  function isBottleneck(id) {
    return !!state.bottlenecks && state.bottlenecks.has(id);
  }

  function visibleNodeIds() {
    if (state.viewMode === "all") return new Set(state.graph.nodes.map((item) => item.id));
    if (state.viewMode === "spine") {
      return new Set(state.graph.nodes.filter((item) => item.kind !== "branch" || item.id === state.selectedId).map((item) => item.id));
    }
    const ids = new Set(state.graph.nodes.filter((item) => item.kind === "branch" || isBottleneck(item.id) || item.id === state.selectedId).map((item) => item.id));
    state.graph.edges.forEach((edgeItem) => {
      if (edgeItem.type === "choice" || edgeItem.type === "rejoins") {
        ids.add(edgeItem.from);
        ids.add(edgeItem.to);
      }
    });
    return ids;
  }

  function renderGraph() {
    const dimensions = graphDimensions();
    const visible = visibleNodeIds();
    const oldPositions = new Map(state.nodes.map((item) => [item.id, { x: item.x, y: item.y }]));
    const maxRank = Math.max(1, ...Object.values(state.ranks));
    // Count visible nodes per causal rank so same-rank siblings can be
    // fanned out vertically — the old kind-based lanes piled every
    // same-kind node onto one y-band, which is what overlapped the edges.
    const rankCounts = {};
    state.graph.nodes.forEach((item) => {
      if (!visible.has(item.id)) return;
      const rank = state.ranks[item.id] || 0;
      rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    });
    const rankBuckets = new Map();

    state.nodes = state.graph.nodes
      .filter((item) => visible.has(item.id))
      .map((item) => {
        const rank = state.ranks[item.id] || 0;
        const rankIndex = rankBuckets.get(rank) || 0;
        rankBuckets.set(rank, rankIndex + 1);
        const old = oldPositions.get(item.id);
        const x = old?.x ?? 120 + (rank / maxRank) * (dimensions.width - 240);
        // laneY: the simulation's vertical target (per-rank fan-out). x is
        // governed separately by a strong rank force (left→right causal order).
        const laneY = laneTargetY(rankIndex, rankCounts[rank], dimensions.height);
        const y = old?.y ?? laneY;
        const node = { ...item, rank, rankIndex, laneY, x, y };
        // Re-pin position-locked nodes (§dblclick lock) so a re-render
        // doesn't let the simulation drift them back.
        if (state.lockedIds.has(item.id)) {
          node.fx = x;
          node.fy = y;
        }
        return node;
      });
    const nodeById = new Map(state.nodes.map((item) => [item.id, item]));
    state.edges = state.graph.edges
      .filter((item) => nodeById.has(item.from) && nodeById.has(item.to))
      .map((item) => ({ ...item, source: nodeById.get(item.from), target: nodeById.get(item.to) }));

    if (simulation) simulation.stop();
    simulation = d3.forceSimulation(state.nodes);
    applyForces();
    simulation.on("tick", ticked).alpha(0.9).restart();

    edgeSelection = edgeLayer.selectAll("path.link").data(state.edges, (item) => item.id);
    edgeSelection.exit().remove();
    edgeSelection = edgeSelection.enter()
      .append("path")
      .attr("class", "link")
      .attr("marker-mid", "url(#arrow)")
      .merge(edgeSelection)
      .attr("stroke", (item) => EDGE_COLORS[item.type] || EDGE_COLORS.causes)
      .attr("stroke-dasharray", (item) => item.type === "rejoins" ? "7 5" : item.type === "choice" ? "3 4" : null)
      .classed("dimmed", (item) => isDimmedEdge(item));

    edgeLabelSelection = labelLayer.selectAll("text.edge-label").data(state.edges, (item) => item.id);
    edgeLabelSelection.exit().remove();
    edgeLabelSelection = edgeLabelSelection.enter()
      .append("text")
      .attr("class", "edge-label")
      .attr("text-anchor", "middle")
      .merge(edgeLabelSelection)
      .classed("hidden", !state.showEdgeLabels)
      .text((item) => item.label || "");

    nodeSelection = nodeLayer.selectAll("g.node").data(state.nodes, (item) => item.id);
    nodeSelection.exit().remove();
    const entering = nodeSelection.enter().append("g")
      .attr("class", "node")
      .on("click", (event, item) => {
        event.stopPropagation();
        // Selection only changes highlight + panels — no topology change,
        // so update in place instead of re-heating the simulation (which
        // is what made clicked nodes jump).
        selectNode(item.id);
      })
      .on("dblclick", (event, item) => {
        event.stopPropagation();
        event.preventDefault();
        toggleLock(item);
      });
    entering.append("rect").attr("rx", 12).attr("ry", 12);
    entering.append("text").attr("class", "node-label").attr("text-anchor", "middle").attr("dy", "-0.65em");
    entering.append("text").attr("class", "node-state").attr("text-anchor", "middle").attr("dy", "0.75em");
    entering.append("text").attr("class", "node-meta").attr("text-anchor", "middle").attr("dy", "2.15em");
    nodeSelection = entering.merge(nodeSelection)
      .classed("selected", (item) => item.id === state.selectedId)
      .classed("search-hit", (item) => matchesSearch(item))
      .classed("dimmed", (item) => state.search && !matchesSearch(item))
      .classed("locked", (item) => state.lockedIds.has(item.id))
      .classed("fresh", (item) => !!state.lastRunId && item.runId === state.lastRunId);

    nodeSelection.select("rect")
      .attr("width", (item) => nodeWidth(item))
      .attr("height", 64)
      .attr("x", (item) => -nodeWidth(item) / 2)
      .attr("y", -32)
      .attr("fill", (item) => nodeFill(item))
      .attr("stroke", (item) => isBottleneck(item.id) ? NODE_COLORS.bottleneck : (NODE_COLORS[item.kind] || NODE_COLORS.note));
    nodeSelection.select(".node-label").text((item) => truncate(item.label, 33));
    nodeSelection.select(".node-state").text((item) => truncate(item.state, 42));
    nodeSelection.select(".node-meta").text((item) => `${isBottleneck(item.id) ? "bottleneck" : item.kind} · r${item.rank} · ${(item.tags || []).slice(0, 3).join(", ")}`);
    nodeSelection.call(d3.drag()
      .on("start", (event, item) => {
        // Mark the dragged node so it repels harder (give-way), and
        // reassign the charge force so d3 re-reads the per-node strengths.
        state.draggingId = item.id;
        simulation.force("charge", d3.forceManyBody().strength(chargeStrengthFor).distanceMax(LAYOUT.chargeDistanceMax));
        if (!event.active) simulation.alphaTarget(LAYOUT.dragAlphaTarget).restart();
        item.fx = item.x;
        item.fy = item.y;
      })
      .on("drag", (event, item) => {
        item.fx = event.x;
        item.fy = event.y;
      })
      .on("end", (event, item) => {
        // Drop the give-way boost and re-read uniform charge strengths.
        state.draggingId = null;
        simulation.force("charge", d3.forceManyBody().strength(chargeStrengthFor).distanceMax(LAYOUT.chargeDistanceMax));
        if (!event.active) simulation.alphaTarget(0);
        // Plasticity: a dragged node STAYS where it was dropped — keep its
        // fx/fy so the forces can't spring it back. Tracked as a soft pin
        // (Reheat releases these; a dblclick hard-lock keeps its own fx).
        if (!state.lockedIds.has(item.id)) {
          item.fx = event.x;
          item.fy = event.y;
          state.softPinnedIds.add(item.id);
        }
      }));
  }

  // Lightweight selection update: restyle nodes + refresh panels without
  // rebuilding the graph or restarting the force simulation.
  function selectNode(id) {
    state.selectedId = id;
    nodeSelection.classed("selected", (item) => item.id === state.selectedId);
    renderPanels();
  }

  // Toggle a position lock (dblclick). Locked nodes get fixed coordinates
  // (fx/fy) so the simulation can't move them; the id is tracked in
  // state.lockedIds so the lock survives re-renders.
  function toggleLock(item) {
    if (state.lockedIds.has(item.id)) {
      state.lockedIds.delete(item.id);
      item.fx = null;
      item.fy = null;
    } else {
      state.lockedIds.add(item.id);
      item.fx = item.x;
      item.fy = item.y;
    }
    nodeSelection.classed("locked", (node) => state.lockedIds.has(node.id));
    toast(state.lockedIds.has(item.id) ? "Node locked in place" : "Node unlocked");
  }

  // The node currently under the cursor repels harder so neighbouring nodes
  // (and therefore their edges) slide out of the way as it is dragged.
  function chargeStrengthFor(item) {
    return item.id === state.draggingId ? LAYOUT.dragCharge : LAYOUT.charge;
  }

  // §LTR constraint (per-edge): the end node of every edge is kept to the
  // RIGHT of its start node by at least LAYOUT.edgeMinDx, so an edge can never
  // point leftward. Whichever endpoint is free gives way; an endpoint being
  // dragged or locked (fx set) holds, and the other end moves around it.
  //
  // The pushes are one-sided (a fixed endpoint can't move, so only its partner
  // shifts), which would translate the whole graph — every parent of a node
  // dragged leftward gets nudged left, cascading into a runaway leftward drift
  // while the drag holds the simulation hot. To prevent that, we snapshot the
  // centroid of the FREE (non-fx) nodes and restore it afterward: the
  // constraint then RESHAPES the graph around the dragged/locked anchors
  // without translating it. (Charge/link/collide are already internal forces
  // that conserve the centroid; this makes the LTR correction internal too.)
  function enforceEdgeDirection() {
    let sumBefore = 0, freeCount = 0;
    for (const node of state.nodes) {
      if (node.fx == null) { sumBefore += node.x; freeCount++; }
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const edge of state.edges) {
        const s = edge.source, t = edge.target;
        if (!s || !t) continue;
        const overshoot = (s.x + LAYOUT.edgeMinDx) - t.x; // > 0 ⇒ end is too far left
        if (overshoot <= 0) continue;
        const sFixed = s.fx != null, tFixed = t.fx != null;
        if (sFixed && tFixed) continue;            // can't move either; leave it
        const fix = overshoot * LAYOUT.edgeCorrection; // soft relaxation, not a snap
        if (sFixed) t.x += fix;                    // push the end right
        else if (tFixed) s.x -= fix;               // push the start left
        else { s.x -= fix / 2; t.x += fix / 2; }   // both free: split
      }
    }
    // Restore the free-node centroid so the corrections above don't drift the
    // whole graph; the dragged/locked (fx) anchors are excluded by design.
    if (freeCount > 0) {
      let sumAfter = 0;
      for (const node of state.nodes) if (node.fx == null) sumAfter += node.x;
      const shift = (sumAfter - sumBefore) / freeCount;
      if (shift) for (const node of state.nodes) if (node.fx == null) node.x -= shift;
    }
  }

  // "Reheat" is an untangle pass: shake nodes out of their current
  // (possibly tangled) local minimum, then stretch the graph with stronger
  // repulsion + longer links and slow cooling so crossing edges have room
  // and time to pull apart. After the energetic pass it relaxes back to the
  // resting forces and re-frames the untangled, stretched DAG.
  function untangleReheat() {
    if (!simulation) return;
    state.nodes.forEach((node) => {
      if (state.lockedIds.has(node.id)) return; // respect hard locks (dblclick)
      // Release soft pins (drag-drop) so the shake can actually move them —
      // an fx would otherwise override the jittered x every tick.
      if (state.softPinnedIds.has(node.id)) { node.fx = null; node.fy = null; }
      node.x += (Math.random() - 0.5) * LAYOUT.reheat.jitter;
      node.y += (Math.random() - 0.5) * LAYOUT.reheat.jitter;
    });
    state.softPinnedIds.clear();
    simulation
      .force("charge", d3.forceManyBody().strength(LAYOUT.reheat.charge).distanceMax(LAYOUT.reheat.chargeDistanceMax))
      .force("link", d3.forceLink(state.edges).id((item) => item.id)
        .distance((item) => item.type === "rejoins" ? LAYOUT.reheat.rejoinLinkDistance : LAYOUT.reheat.linkDistance)
        .strength(LAYOUT.reheat.linkStrength))
      .alpha(1)
      .alphaDecay(LAYOUT.reheat.alphaDecay)
      .restart();
    clearTimeout(reheatTimer);
    reheatTimer = setTimeout(() => {
      if (!simulation) return;
      applyForces();                                 // restore the resting force balance
      simulation.alphaDecay(LAYOUT.restAlphaDecay);  // d3 default cooling rate
      setTimeout(fitGraph, LAYOUT.reheat.fitDelayMs); // re-frame the stretched result
    }, LAYOUT.reheat.settleMs);
  }

  function applyForces() {
    // Left→right order is enforced by enforceEdgeDirection (§LTR, a hard
    // per-edge constraint), NOT by pinning nodes to rank columns — so a node
    // stays where it is dragged instead of snapping back to a column. The
    // forces below only spread nodes apart (charge/collide), hold edge
    // lengths (link), and give a gentle vertical organisation (y). There is
    // deliberately no x-force.
    simulation
      .force("link", d3.forceLink(state.edges).id((item) => item.id)
        .distance((item) => item.type === "rejoins" ? LAYOUT.rejoinLinkDistance : LAYOUT.linkDistance)
        .strength(LAYOUT.linkStrength))
      .force("charge", d3.forceManyBody().strength(chargeStrengthFor).distanceMax(LAYOUT.chargeDistanceMax))
      .force("collide", d3.forceCollide((item) => nodeWidth(item) / 2 + LAYOUT.collidePadding).strength(1).iterations(LAYOUT.collideIterations))
      .force("x", null) // no rank-column pull — removed; it made the DAG rigid
      .force("y", d3.forceY((item) => (item.laneY != null ? item.laneY : graphDimensions().height / 2)).strength(LAYOUT.yStrength));
  }

  // Vertical target for a node: fan same-rank siblings out around the
  // canvas center so neither the nodes nor their edges pile onto one line.
  function laneTargetY(rankIndex, rankCount, height) {
    const count = Math.max(1, rankCount || 1);
    const gap = Math.max(LAYOUT.laneGapMin, Math.min(LAYOUT.laneGapMax, (height - 160) / count));
    return height / 2 + (rankIndex - (count - 1) / 2) * gap;
  }

  function ticked() {
    enforceEdgeDirection(); // §LTR: keep every edge pointing left→right
    edgeSelection.attr("d", (item) => curvedPath(item.source, item.target, item.type));
    edgeLabelSelection
      .attr("x", (item) => (item.source.x + item.target.x) / 2)
      .attr("y", (item) => (item.source.y + item.target.y) / 2 - (item.type === "rejoins" ? 16 : 8));
    nodeSelection.attr("transform", (item) => `translate(${item.x},${item.y})`);
  }

  // Returns a path split into two cubic segments meeting at the curve's
  // t=0.5 point (De Casteljau). That shared vertex is where `marker-mid`
  // draws the direction arrow — centered on the branch, clear of nodes.
  function curvedPath(source, target, type) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const curve = type === "rejoins" ? 0.45 : type === "choice" ? 0.25 : 0.14;
    const mx = source.x + dx / 2;
    const p0 = [source.x, source.y];
    const p1 = [mx, source.y + dy * curve];
    const p2 = [mx, target.y - dy * curve];
    const p3 = [target.x, target.y];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const a = mid(p0, p1);
    const b = mid(p1, p2);
    const c = mid(p2, p3);
    const d = mid(a, b);
    const e = mid(b, c);
    const f = mid(d, e); // point on the curve at t=0.5
    const pt = (q) => `${q[0]},${q[1]}`;
    return `M${pt(p0)} C${pt(a)} ${pt(d)} ${pt(f)} C${pt(e)} ${pt(c)} ${pt(p3)}`;
  }

  function renderPanels() {
    const graph = state.graph;
    const selected = getNode(state.selectedId);
    el.nodeCount.textContent = graph.nodes.length;
    el.edgeCount.textContent = graph.edges.length;
    el.branchCount.textContent = graph.nodes.filter((item) => item.kind === "branch").length;
    el.bottleneckCount.textContent = state.bottlenecks ? state.bottlenecks.size : 0;
    renderSelects();
    renderSelected(selected);
    syncEditor(selected);
  }

  function renderSelects() {
    const selectedRank = state.ranks[state.selectedId] || 0;
    const options = state.graph.nodes.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === state.selectedId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
    const targetOptions = state.graph.nodes
      .filter((item) => item.id !== state.selectedId && (state.ranks[item.id] || 0) >= selectedRank)
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("");
    el.manualFrom.innerHTML = options;
    el.manualTo.innerHTML = `<option value="__new__">New node</option>${options}`;
    el.rejoinSelect.innerHTML = `<option value="">No rejoin yet</option>${targetOptions}`;
  }

  function renderSelected(selected) {
    if (!selected) {
      el.selectedNode.className = "selected-card muted";
      el.selectedNode.textContent = "Select a node in the graph.";
      return;
    }
    const incoming = state.graph.edges.filter((item) => item.to === selected.id).map(edgeSummary).join("<br>") || "none";
    const outgoing = state.graph.edges.filter((item) => item.from === selected.id).map(edgeSummary).join("<br>") || "none";
    el.selectedNode.className = "selected-card";
    el.selectedNode.innerHTML = `
      <h3>${escapeHtml(selected.label)}</h3>
      <div class="expr">${escapeHtml(selected.expr)}</div>
      ${selected.actor ? `<div><strong>Actor:</strong> ${escapeHtml(selected.actor)}</div>` : ""}
      <div>${escapeHtml(selected.state || "No state note.")}</div>
      ${selected.reading ? `<div class="muted">${escapeHtml(selected.reading)}</div>` : ""}
      ${selected.delta ? `<div><strong>Changed:</strong> ${escapeHtml(selected.delta)}</div>` : ""}
      ${selected.invariants ? `<div><strong>Invariant:</strong> ${escapeHtml(selected.invariants)}</div>` : ""}
      <div class="tag-row">${(selected.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="muted"><strong>Incoming</strong><br>${incoming}</div>
      <div class="muted"><strong>Outgoing</strong><br>${outgoing}</div>`;
  }

  function edgeSummary(edgeItem) {
    const other = getNode(edgeItem.from === state.selectedId ? edgeItem.to : edgeItem.from);
    return `<span style="color:${EDGE_COLORS[edgeItem.type] || EDGE_COLORS.causes}">${escapeHtml(edgeItem.type)}</span> ${escapeHtml(other?.label || "?")} ${edgeItem.label ? `· ${escapeHtml(edgeItem.label)}` : ""}`;
  }

  function syncEditor(selected) {
    el.editLabel.value = selected?.label || "";
    el.editExpr.value = selected?.expr || "";
    el.editState.value = selected?.state || "";
    el.editTags.value = (selected?.tags || []).join(", ");
  }

  // Auto-merge on insert: if the freshly added node is the same state in
  // context as an existing one (same content, parallel paths — see
  // merge_predicate.js), collapse it into that node so the graph converges
  // instead of sprouting a duplicate. Returns the merge result or null.
  function tryAutoMerge(nodeId) {
    const growth = typeof window !== "undefined" ? window.StoryDagGrowth : null;
    if (!growth) return null;
    const result = growth.collapseIfSame(state.graph, nodeId);
    return result.merged ? result : null;
  }

  // One insertion path for every branch source — the form, pasted JSON and
  // probe candidates: content id, choice edge, optional rejoin, auto-merge.
  // Returns { id, merged } or { error }.
  function insertBranch(sourceId, fields, rejoinTarget = "") {
    const expr = fields.expr || `alternate(${sourceId})`;
    const id = contentId({ parentId: sourceId, expr, label: fields.label });
    const branch = {
      kind: "branch",
      tags: ["counterfactual"],
      createdBy: "human",
      state: "",
      delta: "",
      invariants: "",
      ...fields,
      id,
      expr
    };
    state.graph.nodes.push(branch);
    const choice = addEdge({ from: sourceId, to: id, type: "choice", label: branch.delta || "alternative branch", branchId: id });
    if (!choice.ok) {
      state.graph.nodes = state.graph.nodes.filter((item) => item.id !== id);
      return { error: choice.message };
    }
    if (rejoinTarget) {
      const rejoin = addEdge({ from: id, to: rejoinTarget, type: "rejoins", label: "rejoins the story", branchId: id });
      if (!rejoin.ok) toast(rejoin.message, true);
    }
    return { id, merged: tryAutoMerge(id) };
  }

  function addBranchFromForm() {
    const source = getNode(state.selectedId);
    if (!source) return toast("Select a source node first", true);
    const label = el.branchLabel.value.trim();
    if (!label) return toast("Branch title is required", true);
    const made = insertBranch(source.id, {
      label,
      expr: el.branchExpr.value.trim(),
      state: el.branchState.value.trim(),
      delta: el.branchDelta.value.trim(),
      invariants: el.branchInvariants.value.trim()
    }, el.rejoinSelect.value);
    if (made.error) return toast(made.error, true);
    [el.branchLabel, el.branchExpr, el.branchState, el.branchDelta, el.branchInvariants].forEach((input) => { input.value = ""; });
    state.selectedId = made.merged ? made.merged.into : made.id;
    renderAll();
    toast(made.merged
      ? `Same state in context — merged into “${getNode(made.merged.into)?.label || made.merged.into}”`
      : "Branch added");
  }

  function addManualEdit() {
    const from = el.manualFrom.value;
    const to = el.manualTo.value;
    const type = el.manualEdgeType.value;
    const label = el.manualEdgeLabel.value.trim();
    if (to === "__new__") {
      const nodeLabel = el.manualNodeLabel.value.trim();
      if (!nodeLabel) return toast("New node label is required", true);
      const expr = `event(${slug(nodeLabel)})`;
      const id = contentId({ parentId: from, expr, label: nodeLabel });
      state.graph.nodes.push({
        id,
        label: nodeLabel,
        expr,
        state: "",
        kind: "story",
        tags: [],
        createdBy: "human",
        delta: "",
        invariants: ""
      });
      const result = addEdge({ from, to: id, type, label });
      if (!result.ok) return toast(result.message, true);
      const merged = tryAutoMerge(id);
      state.selectedId = merged ? merged.into : id;
      if (merged) {
        el.manualNodeLabel.value = "";
        el.manualEdgeLabel.value = "";
        renderAll();
        return toast(`Same state in context — merged into “${getNode(merged.into)?.label || merged.into}”`);
      }
    } else {
      const result = addEdge({ from, to, type, label });
      if (!result.ok) return toast(result.message, true);
    }
    el.manualNodeLabel.value = "";
    el.manualEdgeLabel.value = "";
    renderAll();
    toast("Graph edit added");
  }

  function addEdge(edgeItem) {
    if (!getNode(edgeItem.from) || !getNode(edgeItem.to)) return { ok: false, message: "Edge endpoint is missing" };
    if (wouldCreateCycle(edgeItem.from, edgeItem.to)) return { ok: false, message: "Rejected because that edge would create a cycle" };
    edgeItem.id = edgeItem.id || ids.edgeId({ from: edgeItem.from, to: edgeItem.to, type: edgeItem.type }, state.graph);
    state.graph.edges.push(edgeItem);
    return { ok: true };
  }

  function deleteSelectedNode() {
    const selected = getNode(state.selectedId);
    if (!selected) return;
    if (selected.id === state.graph.root) return toast("The root node cannot be deleted", true);
    state.graph.nodes = state.graph.nodes.filter((item) => item.id !== selected.id);
    state.graph.edges = state.graph.edges.filter((item) => item.from !== selected.id && item.to !== selected.id);
    state.selectedId = state.graph.root;
    renderAll();
    toast("Selected node deleted");
  }

  function saveSelectedNodeEdits() {
    const selected = getNode(state.selectedId);
    if (!selected) return toast("Select a node first", true);
    selected.label = el.editLabel.value.trim() || selected.label;
    selected.expr = el.editExpr.value.trim() || selected.expr;
    selected.state = el.editState.value.trim();
    selected.tags = el.editTags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
    selected.createdBy = selected.createdBy === "seed" ? "human-edited" : selected.createdBy;
    renderAll();
    toast("Node updated");
  }

  function validateGraph(graph = state.graph) {
    const errors = [];
    const warnings = [];
    const ids = new Set(graph.nodes.map((item) => item.id));
    graph.edges.forEach((edgeItem) => {
      if (!ids.has(edgeItem.from) || !ids.has(edgeItem.to)) errors.push(`Missing endpoint on ${edgeItem.id}`);
      if (edgeItem.from === edgeItem.to) errors.push(`Self-loop on ${edgeItem.from}`);
    });
    graph.edges.forEach((edgeItem) => {
      const without = graph.edges.filter((candidate) => candidate.id !== edgeItem.id);
      if (reachable(edgeItem.to, edgeItem.from, without)) errors.push(`Cycle through ${edgeItem.from} → ${edgeItem.to}`);
    });
    graph.nodes.forEach((item) => {
      if (item.id !== graph.root && !graph.edges.some((edgeItem) => edgeItem.to === item.id)) warnings.push(`Orphan node: ${item.label}`);
      if (item.kind === "branch" && !graph.edges.some((edgeItem) => edgeItem.from === item.id && edgeItem.type === "rejoins")) warnings.push(`Open branch without rejoin: ${item.label}`);
    });
    return { ok: errors.length === 0, errors: unique(errors), warnings: unique(warnings) };
  }

  function showValidation(result) {
    el.validationReport.className = `report ${result.ok ? "good" : "bad"}`;
    const errors = result.errors.length ? `<strong>Errors</strong><br>${result.errors.map(escapeHtml).join("<br>")}` : "No structural errors.";
    const warnings = result.warnings.length ? `<br><strong>Warnings</strong><br>${result.warnings.map(escapeHtml).join("<br>")}` : "<br>No warnings.";
    el.validationReport.innerHTML = `${errors}${warnings}`;
    toast(result.ok ? "DAG validation passed" : "DAG validation failed", !result.ok);
  }

  function topoRanks(graph) {
    const indegree = {};
    const adj = {};
    graph.nodes.forEach((item) => { indegree[item.id] = 0; adj[item.id] = []; });
    graph.edges.forEach((edgeItem) => {
      if (edgeItem.to in indegree) indegree[edgeItem.to] += 1;
      if (adj[edgeItem.from]) adj[edgeItem.from].push(edgeItem.to);
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
    graph.nodes.forEach((item) => { if (ranks[item.id] === undefined) ranks[item.id] = 0; });
    return ranks;
  }

  function importFromTextArea() {
    const raw = el.jsonText.value.trim();
    if (!raw) return toast("Paste JSON first", true);
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return toast(`Invalid JSON: ${error.message}`, true);
    }
    if (Array.isArray(data.branches)) {
      const origin = state.selectedId;
      const failures = [];
      data.branches.forEach((branch) => {
        const made = insertBranch(origin, {
          label: branch.label || "Assisted branch",
          expr: branch.expr || "alternate(?)",
          state: branch.state || "",
          delta: branch.delta || "LLM-assisted branch",
          invariants: branch.invariants || "",
          tags: Array.isArray(branch.tags) ? branch.tags : ["counterfactual", "assist"],
          createdBy: "assist"
        }, branch.rejoinTargetId || "");
        if (made.error) failures.push(made.error);
      });
      renderAll();
      toast(failures.length ? `Imported with ${failures.length} rejected: ${failures[0]}` : "Imported assisted branches", failures.length > 0);
      return;
    }
    importGraph(data);
  }

  function importGraph(data, message = "Graph JSON restored") {
    const candidate = normalizeGraph(structuredClone(data));
    const result = validateGraph(candidate);
    if (!result.ok) {
      showValidation(result);
      return toast("Import rejected: graph has structural errors", true);
    }
    state.graph = candidate;
    state.activeSeed = null;
    state.selectedId = state.graph.root;
    renderSeeds();
    renderAll();
    showValidation(result);
    toast(message);
  }

  // ── Lab: the grow bridge (tools/grow_server.js) ─────────────────────────
  // The page never calls the model: it POSTs the graph to the bridge, which
  // runs the grower or the continuation probe Node-side and records the run
  // exactly as the CLI would.

  // The one prompt template (prompts/branch.v4.txt).
  const PROMPT_VERSION = "branch.v4";

  async function bridge(pathname, body) {
    const response = await fetch(`${GROW_SERVER_URL}${pathname}`, body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `bridge returned ${response.status}`);
    }
    return response;
  }

  function bridgeError(error, what) {
    const offline = error instanceof TypeError;
    toast(offline ? "Grow bridge not reachable — run: npm run grow:serve" : `${what} failed: ${error.message}`, true);
    if (offline) setLabStatus(false);
  }

  function setLabStatus(online, modelFile = null) {
    el.labStatus.className = `report ${online && modelFile ? "good" : online ? "" : "bad"}`;
    el.labStatus.textContent = !online
      ? "Bridge offline — run: npm run grow:serve"
      : modelFile
        ? `Model: ${modelFile}`
        : "Model server offline — run: ./tools/serve_reference.sh (baseline source still works)";
  }

  async function checkBridge() {
    try {
      const data = await (await bridge("/health")).json();
      setLabStatus(true, data.model ? data.modelFile : null);
      loadRuns();
    } catch {
      setLabStatus(false);
    }
  }

  // Runs a long bridge call with the button disabled and an elapsed-time
  // label, restoring both whatever happens.
  async function busy(button, task) {
    const label = button.textContent;
    const started = Date.now();
    button.disabled = true;
    const timer = setInterval(() => { button.textContent = `${label} · ${Math.round((Date.now() - started) / 1000)}s`; }, 1000);
    try {
      return await task();
    } finally {
      clearInterval(timer);
      button.textContent = label;
      button.disabled = false;
    }
  }

  const fmt = (value) => (value === null || value === undefined ? "—" : typeof value === "number" ? String(+value.toFixed(2)) : String(value));

  // The §6 metric rows eval.js prints, this run beside the model-free
  // baseline grown to the same node count through the same traversal.
  const METRIC_ROWS = [
    ["grown nodes", (s) => s.grownNodes],
    ["merge rate", (s) => s.mergeRate],
    ["null transitions", (s) => s.nullTransitionRate],
    ["duplicate expr", (s) => s.dupExprRate],
    ["branch diversity", (s) => s.branchDiversity],
    ["rejoin validity", (s) => s.rejoinValidity],
    ["rank spread (n, max)", (s) => `${s.maxRankSpread} (${s.scoredRanks}, ${s.maxRankSize})`],
    ["contradictions", (s) => s.contradictionRate]
  ];

  function metricsTable(score, baseline, label) {
    const head = `<tr><th>metric</th><th>${escapeHtml(label)}</th>${baseline ? `<th>baseline@${baseline.grownNodes}</th>` : ""}</tr>`;
    const rows = METRIC_ROWS.map(([name, pick]) => `<tr><td>${name}</td><td>${escapeHtml(fmt(pick(score)))}</td>${baseline ? `<td>${escapeHtml(fmt(pick(baseline)))}</td>` : ""}</tr>`).join("");
    return `<table class="metrics">${head}${rows}</table>`;
  }

  // Loads a grown graph and marks the run's own nodes (`.fresh`).
  function showGrown(graph, runId, from) {
    importGraph(graph, `Loaded ${runId} — its nodes are outlined green`);
    state.lastRunId = runId;
    if (from && getNode(from)) state.selectedId = from;
    renderAll();
    setTimeout(fitGraph, 350);
  }

  async function autoGrow() {
    const from = state.selectedId;
    if (!from) return toast("Select a node to grow from", true);
    const source = el.growSource.value;
    await busy(el.autoGrowBtn, async () => {
      try {
        const data = await (await bridge("/grow", {
          graph: state.graph,
          from,
          source,
          depth: +el.growDepth.value || 1,
          width: +el.growWidth.value || 1,
          maxNodes: +el.growMaxNodes.value || 1,
          seed: +el.growSeed.value || 1,
          prompt: PROMPT_VERSION
        })).json();
        showGrown(data.graph, data.runId, from);
        logTrace(`grow ${data.runId}`, data.trace);
        el.growReport.innerHTML = `<div>${escapeHtml(data.runId)} · +${data.stats.created} nodes, ${data.stats.mergedDuplicates} merged, ${data.stats.rejectedNullTransitions || 0} null, ${data.stats.rejectedCycles} cyclic</div>`
          + metricsTable(data.score, data.baseline, source === "baseline" ? "baseline" : PROMPT_VERSION);
        loadRuns();
      } catch (error) {
        bridgeError(error, "Grow");
      }
    });
  }

  async function loadRuns() {
    try {
      const { runs } = await (await bridge("/runs")).json();
      el.runSelect.innerHTML = runs.map((run) => `<option value="${escapeHtml(run.runId)}">${escapeHtml([
        String(run.createdAt || "").slice(0, 16).replace("T", " "),
        run.source,
        run.story || "ui graph",
        `from ${run.from}`,
        `+${run.created}`
      ].join(" · "))}</option>`).join("");
    } catch {
      el.runSelect.innerHTML = "";
    }
  }

  async function loadRun() {
    const runId = el.runSelect.value;
    if (!runId) return toast("No recorded run selected", true);
    try {
      const data = await (await bridge(`/runs/${encodeURIComponent(runId)}`)).json();
      showGrown(data.graph, runId, data.manifest.traversal && data.manifest.traversal.from);
      if (data.trace) logTrace(`run ${runId}`, data.trace);
      else logPrompts([{ title: `run ${runId} · no trace`, parts: [{ name: "", text: "No trace.json: the run was grown before tracing, or from the CLI." }] }]);
      const label = data.manifest.source ? data.manifest.source.name : data.manifest.prompt.template;
      el.growReport.innerHTML = `<div>${escapeHtml(runId)} (recorded)</div>` + metricsTable(data.score, null, label);
    } catch (error) {
      bridgeError(error, "Load run");
    }
  }

  // ── Lab: prompts ───────────────────────────────────────────────────────
  // Every prompt the page caused the model to see, as sent, with its grammar
  // and the raw completions — newest first. Plus a no-model preview for the
  // selected node and the raw templates in prompts/.
  const PROMPT_LOG_MAX = 60; // entries kept; one grow adds one per expansion

  const nodeLabel = (id) => getNode(id)?.label || id;

  // The request parts every entry shares: the prompt and whichever
  // constraint it carried.
  function constraintParts(request) {
    return [
      { name: "prompt", text: request.prompt },
      ...(request.grammar ? [{ name: "grammar (GBNF)", text: request.grammar }] : []),
      ...(request.schema ? [{ name: "JSON schema", text: JSON.stringify(request.schema, null, 2) }] : [])
    ];
  }

  function logTrace(prefix, trace) {
    logPrompts((trace || []).map((expansion) => ({
      title: `${prefix} · ${nodeLabel(expansion.from)} · ${expansion.draws.length} draw${expansion.draws.length === 1 ? "" : "s"}`,
      parts: [
        ...constraintParts(expansion),
        {
          name: "completions",
          text: expansion.draws.map((d) => `seed ${d.seed}${d.truncated ? " (truncated)" : ""}\n${d.content}`).join("\n\n")
        }
      ]
    })));
  }

  // A batch goes on top in its own order (a grow's expansions read top-down).
  function logPrompts(entries) {
    state.promptLog = [...entries, ...(state.promptLog || [])].slice(0, PROMPT_LOG_MAX);
    renderPromptLog();
  }

  function renderPromptLog() {
    const log = state.promptLog || [];
    el.promptSummary.textContent = log.length ? `Prompts (${log.length})` : "Prompts";
    el.promptLog.innerHTML = log.map((entry) => `<details class="prompt-entry">
      <summary>${escapeHtml(entry.title)}</summary>
      ${entry.parts.map((part) => `${part.name ? `<div class="prompt-part">${escapeHtml(part.name)}</div>` : ""}<pre class="prompt-text">${escapeHtml(part.text)}</pre>`).join("")}
    </details>`).join("");
  }

  async function previewPrompt() {
    const from = state.selectedId;
    if (!from) return toast("Select a node", true);
    try {
      const data = await (await bridge("/prompt", { graph: state.graph, from, prompt: PROMPT_VERSION })).json();
      logPrompts([{ title: `preview · ${data.promptVersion} · ${nodeLabel(from)}`, parts: constraintParts(data) }]);
      el.promptPanel.open = true;
    } catch (error) {
      bridgeError(error, "Preview");
    }
  }

  async function showTemplates() {
    try {
      const { templates } = await (await bridge("/prompts")).json();
      logPrompts(templates.map((t) => ({
        title: `template ${t.name} · sha256 ${t.sha256.slice(0, 12)}`,
        parts: [{ name: "", text: t.text }]
      })));
      el.promptPanel.open = true;
    } catch (error) {
      bridgeError(error, "Templates");
    }
  }

  // ── Lab: continuations (experiments/continue_probe.js + grade.js) ──────
  // Draws K continuations per prompt version at the selected node, shows them
  // in grade.js's seeded shuffle with the version hidden, and records y/n
  // answers as a grade.js graded file. Versions are revealed once saved.
  // One version today; the arm machinery stays for the next A/B.
  const PROBE_ARMS = [PROMPT_VERSION];

  const GRADE_KEYS = ["consistent", "advances"];

  async function runProbe() {
    const from = state.selectedId;
    if (!from) return toast("Select a node to continue from", true);
    await busy(el.probeBtn, async () => {
      try {
        const response = await bridge("/continue", {
          graph: state.graph,
          from,
          arms: PROBE_ARMS,
          k: +el.probeK.value || 1,
          seed: +el.probeSeed.value || 1
        });
        let done = null;
        await readNdjson(response, (event) => {
          if (event.type === "progress") {
            el.probeReport.textContent = Object.entries(event.counts)
              .map(([arm, c]) => `${arm}: ${c.samples} kept / ${c.attempts} drawn`).join(" · ");
          } else if (event.type === "error") {
            throw new Error(event.error);
          } else if (event.type === "done") {
            done = event;
          }
        });
        if (!done) throw new Error("bridge closed the stream early");
        state.probe = { ...done, from, revealed: Object.keys(done.answers).length > 0 };
        logPrompts((done.prompts || []).map((p) => ({
          title: `draw · ${p.arm} · ${nodeLabel(from)}`,
          parts: constraintParts(p)
        })));
        el.probeReport.textContent = Object.entries(done.stats)
          .map(([arm, c]) => `${arm}: ${c.samples} kept / ${c.attempts} drawn${c.saturated ? " (saturated)" : ""}`).join(" · ");
        el.probeShowBtn.disabled = false;
        openProbe();
      } catch (error) {
        bridgeError(error, "Draw");
      }
    });
  }

  async function readNdjson(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    for (;;) {
      const { value, done } = await reader.read();
      buffered += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffered.split("\n");
      buffered = lines.pop();
      lines.filter(Boolean).forEach((line) => onEvent(JSON.parse(line)));
      if (done) break;
    }
  }

  function openProbe() {
    const probe = state.probe;
    if (!probe) return;
    el.probeTitle.textContent = `Continuations after “${getNode(probe.from)?.label || probe.from}”`;
    el.probeHistory.innerHTML = probe.history.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
    renderProbeList();
    renderTally(probe.tally);
    if (!el.probeDialog.open) el.probeDialog.showModal();
  }

  function renderProbeList() {
    const probe = state.probe;
    el.probeList.innerHTML = probe.pool.map((item, index) => {
      const given = probe.answers[item.labelKey] || {};
      const complete = GRADE_KEYS.every((key) => typeof given[key] === "boolean");
      const toggles = GRADE_KEYS.map((key) => `${key}
        <button type="button" data-i="${index}" data-key="${key}" data-value="yes" class="${given[key] === true ? "on-yes" : ""}">y</button>
        <button type="button" data-i="${index}" data-key="${key}" data-value="no" class="${given[key] === false ? "on-no" : ""}">n</button>`).join(" ");
      const arm = probe.revealed
        ? `<span class="arm-tag">${escapeHtml(item.arm)}</span>`
        : "";
      return `<div class="probe-item${complete ? " done" : ""}">
        <div class="probe-text">${index + 1}. ${escapeHtml(item.display)}</div>
        <div class="probe-controls">${toggles} ${arm}
          <button type="button" data-i="${index}" data-add="1">Add to graph</button></div>
      </div>`;
    }).join("");
  }

  function onProbeClick(event) {
    const button = event.target.closest("button[data-i]");
    if (!button) return;
    const item = state.probe.pool[+button.dataset.i];
    if (button.dataset.add) return addProbeCandidate(item);
    const answers = state.probe.answers;
    answers[item.labelKey] = { ...(answers[item.labelKey] || {}), [button.dataset.key]: button.dataset.value === "yes" };
    renderProbeList();
  }

  // A candidate becomes the node the grower would make from it.
  function addProbeCandidate(item) {
    const branch = item.branch;
    const made = insertBranch(state.probe.from, {
      label: branch.label || branch.expr,
      expr: branch.expr,
      state: branch.state || "",
      tags: ["counterfactual", "probe"],
      createdBy: "probe"
    });
    if (made.error) return toast(made.error, true);
    state.selectedId = made.merged ? made.merged.into : made.id;
    renderAll();
    toast(made.merged ? "Same state in context — merged" : "Added as a branch");
  }

  async function saveGrades() {
    const probe = state.probe;
    const complete = probe.pool.filter((item) => GRADE_KEYS.every((key) => typeof (probe.answers[item.labelKey] || {})[key] === "boolean"));
    if (!complete.length) return toast("Answer both questions for at least one candidate", true);
    try {
      const data = await (await bridge("/grades", { file: probe.file, answers: probe.answers })).json();
      probe.revealed = true;
      probe.tally = data;
      renderProbeList();
      renderTally(data);
      toast(`Saved ${data.graded}/${probe.pool.length} graded → experiments/out/ui/${data.gradedFile}`);
    } catch (error) {
      bridgeError(error, "Save grades");
    }
  }

  function tallyTable(title, summaries) {
    const rows = Object.entries(summaries || {}).filter(([, s]) => s).map(([arm, s]) =>
      `<tr><td>${escapeHtml(arm)}</td><td>${s.n}</td><td>${fmt(s.consistent)}</td><td>${fmt(s.advances)}</td><td>${fmt(s.usable)}</td></tr>`).join("");
    return `<table class="metrics"><tr><th>${escapeHtml(title)}</th><th>n</th><th>consistent</th><th>advances</th><th>usable</th></tr>${rows}</table>`;
  }

  function renderTally(data) {
    el.probeTally.innerHTML = data
      ? tallyTable("this batch", data.summary) + tallyTable(`all UI batches (${data.cumulative.batches})`, data.cumulative.arms)
      : "";
  }

  function exportJson() {
    return ids.canonicalJson(state.graph);
  }

  function showExportJson() {
    const text = exportJson();
    el.jsonText.value = text;
    showDialog("Graph JSON", text);
  }

  function downloadJson() {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(state.graph.meta.title)}.story-dag.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function saveLocal() {
    localStorage.setItem(STORAGE_KEY, exportJson());
    toast("Saved to localStorage");
  }

  function loadLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return toast("No local save found", true);
    try {
      importGraph(JSON.parse(saved));
    } catch (error) {
      toast(`Local save is invalid: ${error.message}`, true);
    }
  }

  function loadBlankGraph() {
    state.graph = normalizeGraph({
      root: "root",
      title: "Blank Story DAG",
      meta: { title: "Blank Story DAG", summary: "A blank graph for custom story analysis.", version: 2 },
      nodes: [{
        id: "root",
        label: "Initial state",
        expr: "start(story)",
        state: "The starting state of a custom story.",
        kind: "root",
        tags: ["start"],
        createdBy: "seed",
        delta: "",
        invariants: "",
      }],
      edges: []
    });
    state.activeSeed = null;
    state.selectedId = "root";
    renderSeeds();
    renderAll();
    toast("Blank DAG created");
  }

  function showDialog(title, body) {
    el.dialogTitle.textContent = title;
    el.dialogBody.textContent = body;
    if (typeof el.jsonDialog.showModal === "function") el.jsonDialog.showModal();
  }

  function fitGraph() {
    if (!state.nodes.length) return;
    const dimensions = graphDimensions();
    const xExtent = d3.extent(state.nodes, (item) => item.x);
    const yExtent = d3.extent(state.nodes, (item) => item.y);
    const padding = 140;
    const width = Math.max(1, xExtent[1] - xExtent[0] + padding * 2);
    const height = Math.max(1, yExtent[1] - yExtent[0] + padding * 2);
    const scale = Math.min(2, Math.max(0.18, Math.min(dimensions.width / width, dimensions.height / height) * 0.92));
    const centerX = (xExtent[0] + xExtent[1]) / 2;
    const centerY = (yExtent[0] + yExtent[1]) / 2;
    svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(dimensions.width / 2 - centerX * scale, dimensions.height / 2 - centerY * scale).scale(scale));
  }

  function getNode(id) {
    return state.graph.nodes.find((item) => item.id === id);
  }

  function reachable(from, to, edges = state.graph.edges) {
    const queue = [from];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (id === to) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.filter((edgeItem) => edgeItem.from === id).forEach((edgeItem) => queue.push(edgeItem.to));
    }
    return false;
  }

  function wouldCreateCycle(from, to) {
    return from === to || reachable(to, from);
  }

  function graphDimensions() {
    const rect = el.graphSvg.getBoundingClientRect();
    return { width: Math.max(640, rect.width || 900), height: Math.max(520, rect.height || 700) };
  }

  function nodeWidth(item) {
    return Math.max(176, Math.min(300, item.label.length * 7.6 + 46));
  }

  function nodeFill(item) {
    if (isBottleneck(item.id)) return "#3b2608";
    if (item.kind === "branch") return "#3a1230";
    if (item.kind === "root") return "#0d2a3f";
    return "#0e2035";
  }

  function isDimmedEdge(edgeItem) {
    if (!state.search) return false;
    return !matchesSearch(edgeItem.source) && !matchesSearch(edgeItem.target) && !(edgeItem.label || "").toLowerCase().includes(state.search);
  }

  function matchesSearch(item) {
    if (!state.search) return false;
    return [item.label, item.expr, item.state, ...(item.tags || [])].join(" ").toLowerCase().includes(state.search);
  }

  // Content-addressed node id, against the live graph so collisions get a
  // deterministic `_2` suffix. Replaces the old `uniqueId`, which retried with
  // a fresh `Date.now()` + `Math.random()` draw — meaning two identical
  // editing sessions produced graphs that differed on every id and could not
  // be compared at all (LOCAL_LLM.md §3).
  function contentId({ parentId, expr, label }) {
    return ids.nodeId({ parentId, expr, label }, state.graph);
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "story";
  }

  function truncate(text, length) {
    const value = String(text || "");
    return value.length > length ? `${value.slice(0, length - 1)}…` : value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[char]));
  }

  function toast(message, bad = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle("bad", bad);
    el.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }
})();
