/* global d3 */
(() => {
  const EDGE_TYPES = ["causes", "enables", "blocks", "choice", "rejoins", "parallels", "foreshadows"];
  const STORAGE_KEY = "retrocause.storyDagBuilder.v2";

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
  // Temporarily limited to the Red seed for QA. To re-enable the others,
  // restore the full key list (or drop the renderSeeds filter).
  const ENABLED_SEEDS = ["red", "magi", "torgsin"];
  const NODE_COLORS = {
    root: "#38bdf8",
    canonical: "#38bdf8",
    branch: "#f472b6",
    convergence: "#f59e0b",
    invariant: "#34d399",
    note: "#94a3b8"
  };
  const EDGE_COLORS = {
    causes: "#64748b",
    enables: "#34d399",
    blocks: "#fb7185",
    choice: "#f472b6",
    rejoins: "#f59e0b",
    parallels: "#a78bfa",
    foreshadows: "#38bdf8"
  };

  const seeds = (typeof window !== "undefined" && window.RetrocauseSeeds)
    ? window.RetrocauseSeeds.seeds
    : (typeof require !== "undefined" ? require("./seeds.js").seeds : {});

  const Cone = (typeof window !== "undefined" && window.RetrocauseCone)
    ? window.RetrocauseCone
    : (typeof require !== "undefined" ? require("./cone.js") : null);

  // Bridge from seed-level nodes to typed fixtures (FORMAL_MODEL.md
  // Appendices B + C). Per seed: fixture global. Post-states are now
  // computed generically by state_walker.postStateAt — no hand-coded
  // per-seed state table. Seeds without a `fixture` entry show
  // "No typed fixture for this seed."
  const phiBindings = {
    red: {
      fixture: () => (typeof window !== "undefined" ? window.RetrocauseRedFixture : null),
    },
    magi: {
      fixture: () => (typeof window !== "undefined" ? window.RetrocauseMagiFixture : null),
    },
    torgsin: {
      fixture: () => (typeof window !== "undefined" ? window.RetrocauseTorgsinFixture : null),
    },
  };

  const state = {
    graph: makeGraph(seeds.red),
    activeSeed: "red",
    selectedId: "red_start",
    nodes: [],
    edges: [],
    ranks: {},
    showEdgeLabels: true,
    search: "",
    viewMode: "all",
    promptText: "",
    phiGroupByEntry: true,
    phiHideNoop: false,
    draggingId: null,
    autoBranchRunning: false,
    stopAutoBranch: false,
    cone: null,
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

  // Rendered candidates kept in render order so the materialize-button
  // event delegation can look up the original candidate (with closures)
  // by index without round-tripping JSON through data-attributes.
  let phiCandidatesByIndex = [];

  init();

  function init() {
    renderSeeds();
    renderEdgeTypeOptions();
    bindEvents();
    renderAll();
    setTimeout(fitGraph, 350);
    window.__storyDagApp = {
      getGraph: () => structuredClone(state.graph),
      exportJson,
      importGraph,
      validateGraph,
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
    // Default to "no Ω defined" on load. The seed's omega (§8.3.1) stays
    // selectable in the dropdown, but the possibility cone stays off until
    // the user designates one.
    graph.omega = [];
    return normalizeGraph(graph);
  }

  function normalizeGraph(graph) {
    graph.nodes = (graph.nodes || []).map((item) => ({
      kind: "canonical",
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
      label: item.label || item.type || "edge",
      canonical: item.canonical ?? item.type === "causes",
      ...item
    }));
    graph.root = graph.root || graph.nodes[0]?.id || "root";
    graph.meta = graph.meta || { title: graph.title || "Untitled Story DAG", version: 2 };
    return graph;
  }

  function renderSeeds() {
    el.seedList.innerHTML = "";
    Object.entries(seeds).filter(([key]) => ENABLED_SEEDS.includes(key)).forEach(([key, seed]) => {
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
    el.suggestBranchBtn.addEventListener("click", prefillFirstSuggestion);
    el.addManualBtn.addEventListener("click", addManualEdit);
    el.deleteSelectedBtn.addEventListener("click", deleteSelectedNode);
    el.validateBtn.addEventListener("click", () => showValidation(validateGraph()));
    el.fitBtn.addEventListener("click", fitGraph);
    el.reheatBtn.addEventListener("click", untangleReheat);
    el.toggleLabelsBtn.addEventListener("click", () => { state.showEdgeLabels = !state.showEdgeLabels; renderGraph(); });
    el.searchInput.addEventListener("input", () => { state.search = el.searchInput.value.trim().toLowerCase(); renderGraph(); });
    el.viewMode.addEventListener("change", () => { state.viewMode = el.viewMode.value; renderAll(); });
    if (el.phiGroupToggle) el.phiGroupToggle.addEventListener("change", () => { state.phiGroupByEntry = el.phiGroupToggle.checked; renderPhiPanel(getNode(state.selectedId)); });
    if (el.phiHideNoopToggle) el.phiHideNoopToggle.addEventListener("change", () => { state.phiHideNoop = el.phiHideNoopToggle.checked; renderPhiPanel(getNode(state.selectedId)); });
    if (el.autoBranchBtn) el.autoBranchBtn.addEventListener("click", autoBranchFromSelected);
    if (el.frontierSimBtn) el.frontierSimBtn.addEventListener("click", runFrontierSim);
    if (el.stopAutoBranchBtn) el.stopAutoBranchBtn.addEventListener("click", () => {
      state.stopAutoBranch = true;
      setAutoBranchStatus("Stopping after the current insert...");
    });
    if (el.omegaSelect) el.omegaSelect.addEventListener("change", () => {
      const value = el.omegaSelect.value;
      state.graph.omega = value ? [value] : [];
      renderAll();
      toast(value ? `Ω set to ${getNode(value)?.label || value}` : "Ω cleared");
    });
    if (el.suggestOmegaBtn) el.suggestOmegaBtn.addEventListener("click", suggestOmega);
    el.saveNodeBtn.addEventListener("click", saveSelectedNodeEdits);
    el.buildPromptBtn.addEventListener("click", () => showPrompt(true));
    el.copyPromptBtn.addEventListener("click", copyPrompt);
    el.importJsonBtn.addEventListener("click", importFromTextArea);
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
    state.cone = computeCone();
    renderGraph();
    renderPanels();
    el.jsonText.value = exportJson();
  }

  // §8.3: the cone overlay is *derived* from the one author input Ω
  // (graph.omega, §8.3.1). Support/rim (§8.3.2), waists and edge
  // criticality (§8.3.3) come from cone.js. Rim nodes are dimmed, never
  // removed; criticality is a measure on transitions, never an election
  // of "the real path".
  function computeCone() {
    const omega = (state.graph.omega || []).filter((id) => getNode(id));
    if (!Cone || !omega.length) return null;
    try {
      const support = Cone.support(state.graph, omega);
      const rim = Cone.rim(state.graph, omega);
      if (!support.has(state.graph.root)) {
        return { omega, support, rim, unreachable: true, waists: [], waistNodeIds: new Set(), edgeCrit: {}, width: 0, maxCrit: 0 };
      }
      const waists = Cone.waists(state.graph, omega);
      const edgeCrit = Cone.edgeCriticalities(state.graph, omega);
      return {
        omega,
        support,
        rim,
        unreachable: false,
        waists,
        waistNodeIds: new Set(waists.flatMap((w) => w.nodes)),
        edgeCrit,
        width: Cone.mengerWidth(state.graph, omega),
        maxCrit: Math.max(0, ...Object.values(edgeCrit))
      };
    } catch (error) {
      console.warn("Cone derivation failed", error);
      return null;
    }
  }

  function visibleNodeIds() {
    if (state.viewMode === "all") return new Set(state.graph.nodes.map((item) => item.id));
    if (state.viewMode === "canonical") {
      return new Set(state.graph.nodes.filter((item) => item.kind !== "branch" || item.id === state.selectedId).map((item) => item.id));
    }
    const ids = new Set(state.graph.nodes.filter((item) => item.kind === "branch" || item.kind === "convergence" || item.id === state.selectedId).map((item) => item.id));
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
      .attr("stroke-dasharray", (item) => item.type === "rejoins" ? "7 5" : item.canonical ? null : "3 4")
      .classed("dimmed", (item) => isDimmedEdge(item))
      .classed("rim", (item) => isRimEdge(item))
      .style("stroke-width", (item) => edgeStrokeWidth(item));

    edgeLabelSelection = labelLayer.selectAll("text.edge-label").data(state.edges, (item) => item.id);
    edgeLabelSelection.exit().remove();
    edgeLabelSelection = edgeLabelSelection.enter()
      .append("text")
      .attr("class", "edge-label")
      .attr("text-anchor", "middle")
      .merge(edgeLabelSelection)
      .classed("hidden", !state.showEdgeLabels)
      .text((item) => item.label || item.type);

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
      .classed("rim", (item) => !!state.cone && state.cone.rim.has(item.id))
      .classed("waist", (item) => !!state.cone && state.cone.waistNodeIds.has(item.id))
      .classed("omega", (item) => !!state.cone && state.cone.omega.includes(item.id))
      .classed("locked", (item) => state.lockedIds.has(item.id));

    nodeSelection.select("rect")
      .attr("width", (item) => nodeWidth(item))
      .attr("height", 64)
      .attr("x", (item) => -nodeWidth(item) / 2)
      .attr("y", -32)
      .attr("fill", (item) => nodeFill(item))
      .attr("stroke", (item) => NODE_COLORS[item.kind] || NODE_COLORS.note);
    nodeSelection.select(".node-label").text((item) => truncate(displayLabel(item), 33));
    nodeSelection.select(".node-state").text((item) => truncate(item.state, 42));
    nodeSelection.select(".node-meta").text((item) => `${item.kind} · r${item.rank}${coneMarker(item)} · ${(item.tags || []).slice(0, 3).join(", ")}`);
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
    el.joinCount.textContent = graph.edges.filter((item) => item.type === "rejoins").length;
    renderSelects();
    renderConePanel();
    renderSelected(selected);
    renderPhiPanel(selected);
    renderHeuristics(selected);
    syncEditor(selected);
  }

  function renderPhiPanel(selected) {
    if (!el.phiList || !el.phiSummary) return;
    const data = getPhiData(selected);
    if (!data.ok) {
      el.phiSummary.className = "muted phi-summary";
      if (data.warn) el.phiSummary.className += " warn";
      el.phiSummary.textContent = data.message;
      el.phiList.innerHTML = "";
      return;
    }

    const { candidates, nodeState } = data;
    phiCandidatesByIndex = candidates;

    const indexByCandidate = new Map(candidates.map((c, i) => [c, i]));
    const byEntry = new Map();
    for (const c of candidates) {
      if (!byEntry.has(c.entry.name)) byEntry.set(c.entry.name, []);
      byEntry.get(c.entry.name).push(c);
    }

    el.phiSummary.className = "phi-summary good";
    // Meaningful frontier width (§9 / FRONTIER_SIM.md): auto-branch +
    // auto-merge at this node — distinct post-WORLDS among effectful
    // candidates, not raw candidate count. This is the founding measurement.
    const width = meaningfulFrontierWidth(candidates, nodeState, data.fixture);
    let summaryText = `Frontier width: ${width} meaningful continuation${width === 1 ? "" : "s"} `
      + `(${candidates.length} raw candidate${candidates.length === 1 ? "" : "s"}, ${byEntry.size} L entr${byEntry.size === 1 ? "y" : "ies"}).`;
    if (data.rimNode) {
      el.phiSummary.className = "phi-summary warn";
      summaryText += " This node is on the cone's rim — no continuation reaches Ω (§8.3.2); showing the combinatorial Φ.";
    } else if (data.droppedByCone > 0) {
      summaryText += ` ${data.droppedByCone} rim-matching candidate${data.droppedByCone === 1 ? "" : "s"} dropped (Φ ∩ cone, §7.8).`;
    }
    el.phiSummary.textContent = summaryText;

    if (state.phiGroupByEntry) {
      const groups = Array.from(byEntry.entries()).sort((a, b) => b[1].length - a[1].length);
      el.phiList.innerHTML = groups.map(([entryName, list]) => {
        const noop = !list[0].entry.effects || !hasAnyEffects(list[0].entry, list[0].binding, nodeState);
        if (state.phiHideNoop && noop) return "";
        const open = list.length <= 6 ? " open" : "";
        const items = list.map((c) => phiCandidateMarkup(c, nodeState, indexByCandidate.get(c))).join("");
        return `<details class="phi-group" data-noop="${noop ? "true" : "false"}"${open}>
          <summary><span>${escapeHtml(entryName)}${noop ? " (no effects)" : ""}</span><span class="phi-count">${list.length}</span></summary>
          ${items}
        </details>`;
      }).join("");
    } else {
      el.phiList.innerHTML = candidates.map((c, i) => phiCandidateMarkup(c, nodeState, i)).join("");
    }

    el.phiList.querySelectorAll("[data-phi-cidx]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const idx = Number(btn.dataset.phiCidx);
        const candidate = phiCandidatesByIndex[idx];
        if (!candidate) return;
        materializeCandidate(selected, candidate);
      });
    });
  }

  // Meaningful frontier width at a state: enumerate-then-merge. Apply each
  // candidate, drop non-effectful ones, group post-states by Phi.stateKey,
  // count distinct worlds. This is the per-node auto-branch+auto-merge census.
  function meaningfulFrontierWidth(candidates, nodeState, fx) {
    const Phi = (typeof window !== "undefined" && window.RetrocausePhi) || null;
    if (!Phi || !nodeState) return candidates.length;
    const rules = (fx && fx.scope && fx.scope.derivations) || [];
    const worlds = new Set();
    for (const c of candidates) {
      let post;
      try { post = Phi.step(nodeState, c.entry, c.binding, rules); }
      catch { continue; }
      if (Phi.statesEqual(nodeState, post)) continue;
      worlds.add(Phi.stateKey(post));
    }
    return worlds.size;
  }

  // Build the DERIVED possibility cone (frontier_sim) from the active
  // fixture's initial state, run cone.js on it, and report the breathing
  // width profile + waist + Menger width into the sim status line.
  function runFrontierSim() {
    const Sim = (typeof window !== "undefined" && window.RetrocauseFrontierSim) || null;
    const out = el.frontierSimStatus;
    const binding = state.activeSeed ? phiBindings[state.activeSeed] : null;
    const fx = binding && binding.fixture && binding.fixture();
    if (!Sim || !Cone || !fx) {
      if (out) { out.className = "muted auto-branch-status warn"; out.textContent = "Frontier sim needs a typed seed (Red, Magi, or Torgsin)."; }
      return;
    }
    const maxDepth = Math.max(2, Number(el.frontierSimDepth && el.frontierSimDepth.value) || 40);
    // Terminal = where to stop expanding a world: the fixture's explicit
    // terminalMarker (the scene complete) if it declares one, else any Ω
    // marker, else never (the depth bound stops it).
    const markers = fx.omegaMarkers || [];
    const isTerminal = fx.terminalMarker
      ? (s) => s.has(fx.terminalMarker)
      : (s) => markers.length > 0 && markers.some((m) => s.has(m));
    let res;
    try {
      res = Sim.simulate({ lexicon: fx.lexicon, scope: fx.scope, isTerminal, maxDepth });
    } catch (err) {
      if (out) { out.className = "muted auto-branch-status warn"; out.textContent = `Frontier sim failed: ${err.message}`; }
      return;
    }
    const { graph, info } = res;
    // Ω = terminal worlds (or, if none, the deepest worlds).
    let omega = graph.nodes.map((n) => n.id).filter((id) => info.get(id).terminal);
    if (!omega.length) {
      const maxd = Math.max(...[...info.values()].map((i) => i.depth));
      omega = graph.nodes.map((n) => n.id).filter((id) => info.get(id).depth === maxd);
    }
    const profile = Cone.widthProfile(graph, omega).map((p) => p.width);
    const waists = Cone.waists(graph, omega);
    const menger = Cone.mengerWidth(graph, omega);
    if (out) {
      out.className = "phi-summary good";
      out.innerHTML = `Derived cone: <strong>${graph.nodes.length}</strong> worlds, ${graph.edges.length} transitions`
        + `${res.truncated ? " (truncated)" : ""}.<br>`
        + `Width profile: <code>${profile.join(" ")}</code><br>`
        + `Menger width ${menger} · ${waists.length} waist${waists.length === 1 ? "" : "s"}`
        + `${waists.length ? ` (narrowest at level${waists.length === 1 ? "" : "s"} ${waists.map((w) => w.level).join(", ")})` : ""}.`;
    }
    toast(`Frontier sim: ${graph.nodes.length} worlds, peak width ${Math.max(...profile)}`);
  }

  function hasAnyEffects(entry, binding, state) {
    if (!entry.effects) return false;
    try {
      const d = entry.effects(binding, state) || {};
      return (d.add && d.add.length) || (d.remove && d.remove.length);
    } catch { return false; }
  }

  function getPhiData(selected) {
    const Phi = (typeof window !== "undefined" && window.RetrocausePhi) || null;
    const binding = state.activeSeed ? phiBindings[state.activeSeed] : null;
    if (!Phi || !binding) {
      return { ok: false, message: "No typed fixture for this seed. Φ available for Red, Magi, and Torgsin." };
    }
    const fx = binding.fixture && binding.fixture();
    if (!fx) {
      return { ok: false, warn: true, message: "Typed fixture script did not load. Check console." };
    }
    if (!selected) {
      return { ok: false, message: "Select a node." };
    }
    const Walker = (typeof window !== "undefined" && window.RetrocauseStateWalker) || null;
    if (!Walker) {
      return { ok: false, warn: true, message: "state_walker.js not loaded." };
    }
    let postStates;
    try {
      postStates = Walker.computeAllPostStates(state.graph, fx, Phi);
    } catch (err) {
      return { ok: false, warn: true, message: `State walker failed: ${err.message}` };
    }
    const nodeState = postStates.get(selected.id);
    if (!nodeState) {
      return { ok: false, message: "No typed state available at this node (no action annotation upstream)." };
    }
    const combinatorial = Phi.phi({
      lexicon: fx.lexicon,
      scope: fx.scope,
      state: nodeState,
      downstreamExprs: new Set(),
    });
    // §7.8 realized frontier = Phi(v) ∩ cone. Conservative: only what
    // is provably outside the cone is dropped (rim-matching candidates;
    // everything, when v itself is on the rim).
    let candidates = combinatorial;
    let droppedByCone = 0;
    let rimNode = false;
    if (state.cone && Cone && !state.cone.unreachable) {
      if (state.cone.rim.has(selected.id)) {
        rimNode = true;
      } else if (state.cone.support.has(selected.id)) {
        candidates = Cone.realizedFrontier(state.graph, state.cone.omega, selected.id, combinatorial);
        droppedByCone = combinatorial.length - candidates.length;
      }
    }
    return {
      ok: true,
      fixture: fx,
      nodeState,
      candidates,
      droppedByCone,
      rimNode,
    };
  }

  function phiCandidateMarkup(candidate, contextState, idx) {
    const gloss = candidate.entry.gloss ? safeGloss(candidate.entry, candidate.binding) : "";
    return `<div class="phi-candidate">
      <button type="button" class="phi-add-btn" data-phi-cidx="${idx}" title="Materialize as branch node">+</button>
      <code>${escapeHtml(candidate.expr)}</code>
      ${gloss ? `<span class="phi-gloss">${escapeHtml(gloss)}</span>` : ""}
    </div>`;
  }

  // Insert a Phi candidate as a new branch node descended from `source`.
  // - Edge type is `causes` (canonical) so the walker replays through it.
  // - Node kind is `branch` (visual: user-introduced, not the original DAG).
  // - The `action` field is carried verbatim so re-walking yields the same
  //   post-state the Phi panel was reasoning about.
  function materializeCandidate(source, candidate, options = {}) {
    const {
      render = true,
      select = true,
      notify = true,
      extraTags = [],
      createdBy = "phi",
    } = options;
    if (!source) return toast("Select a source node first", true);
    const entry = candidate.entry;
    const gloss = safeGloss(entry, candidate.binding) || candidate.expr;
    const id = uniqueId("phi");
    const newNode = {
      id,
      label: gloss,
      expr: candidate.expr,
      state: "",
      kind: "branch",
      tags: unique(["phi", ...extraTags, entry.name]),
      createdBy,
      delta: "",
      invariants: "",
      action: { entry: entry.name, binding: { ...candidate.binding } },
    };
    state.graph.nodes.push(newNode);
    const result = addEdge({
      from: source.id,
      to: id,
      type: "causes",
      label: `phi: ${entry.name}`,
      canonical: true,
    });
    if (!result.ok) {
      state.graph.nodes = state.graph.nodes.filter((n) => n.id !== id);
      if (notify) toast(result.message, true);
      return null;
    }
    if (select) state.selectedId = id;
    if (render) renderAll();
    if (notify) toast(`Materialized ${entry.name}(...) from Phi`);
    return newNode;
  }

  async function autoBranchFromSelected() {
    if (state.autoBranchRunning) return;
    const root = getNode(state.selectedId);
    if (!root) return toast("Select a node first", true);
    if (!phiBindings[state.activeSeed]) return toast("Auto branching needs a typed seed: Red, Magi, or Torgsin.", true);

    const maxDepth = clampNumber(el.autoDepth?.value, 1, 4, 2);
    const perNode = clampNumber(el.autoWidth?.value, 1, 4, 2);
    const maxNodes = clampNumber(el.autoMaxNodes?.value, 1, 40, 12);
    const mergeEnabled = !!(el.autoMergeToggle && el.autoMergeToggle.checked);
    const runNodeIds = new Set();
    const queue = [{ id: root.id, depth: 0, pathEntryNames: entryPathTo(root.id) }];
    const autoSeenStateKeys = new Set();
    let made = 0;
    let skipped = 0;
    let lastMadeId = null;
    let mergeSummary = null;

    state.autoBranchRunning = true;
    state.stopAutoBranch = false;
    syncAutoBranchControls();
    setAutoBranchStatus(`Running from ${root.label}: depth ${maxDepth}, width ${perNode}, cap ${maxNodes}.`);

    try {
      while (queue.length && made < maxNodes && !state.stopAutoBranch) {
        const { id, depth, pathEntryNames } = queue.shift();
        if (depth >= maxDepth) continue;
        const source = getNode(id);
        if (!source) continue;
        const data = getPhiData(source);
        if (!data.ok) {
          skipped += 1;
          continue;
        }
        const candidates = chooseAutoCandidates(source, data.candidates, data.nodeState, {
          fixture: data.fixture,
          limit: perNode,
          seenStateKeys: mergeEnabled ? new Set() : autoSeenStateKeys,
          pathEntryNames,
        });
        if (!candidates.length) {
          skipped += 1;
          continue;
        }
        for (const candidate of candidates) {
          if (state.stopAutoBranch || made >= maxNodes) break;
          const newNode = materializeCandidate(source, candidate, {
            render: false,
            select: false,
            notify: false,
            extraTags: ["auto"],
            createdBy: "phi-auto",
          });
          if (!newNode) {
            skipped += 1;
            continue;
          }
          made += 1;
          lastMadeId = newNode.id;
          runNodeIds.add(newNode.id);
          if (candidate.autoPostStateKey) autoSeenStateKeys.add(candidate.autoPostStateKey);
          queue.push({ id: newNode.id, depth: depth + 1, pathEntryNames: [...pathEntryNames, candidate.entry.name] });
          setAutoBranchStatus(`Auto branching: ${made}/${maxNodes} nodes, queue ${queue.length}.`);
          state.selectedId = newNode.id;
          renderAll();
          await yieldToBrowser();
        }
      }
      if (mergeEnabled && runNodeIds.size) {
        mergeSummary = runAutoMerge(runNodeIds);
        if (mergeSummary && lastMadeId && mergeSummary.victimToSurvivor.has(lastMadeId)) {
          lastMadeId = mergeSummary.victimToSurvivor.get(lastMadeId);
        }
      }
    } finally {
      state.autoBranchRunning = false;
      const stopped = state.stopAutoBranch;
      state.stopAutoBranch = false;
      if (lastMadeId) state.selectedId = lastMadeId;
      renderAll();
      syncAutoBranchControls();
      const suffix = skipped ? ` ${skipped} expansion point${skipped === 1 ? "" : "s"} had no usable candidates.` : "";
      const mergeSuffix = mergeSummary && mergeSummary.merged
        ? ` Merged ${mergeSummary.merged} convergent node${mergeSummary.merged === 1 ? "" : "s"}.${mergeSummary.skipped ? ` ${mergeSummary.skipped} pair${mergeSummary.skipped === 1 ? "" : "s"} skipped (would cycle).` : ""}`
        : "";
      setAutoBranchStatus(`${stopped ? "Stopped" : "Finished"}: created ${made} node${made === 1 ? "" : "s"}.${suffix}${mergeSuffix}`);
      toast(`${stopped ? "Stopped" : "Finished"} auto branching: ${made} node${made === 1 ? "" : "s"}`);
    }
  }

  function chooseAutoCandidates(source, candidates, nodeState, options = {}) {
    const {
      fixture = null,
      limit = 2,
      seenStateKeys = new Set(),
      pathEntryNames = [],
    } = options;
    const Phi = (typeof window !== "undefined" && window.RetrocausePhi) || null;
    const outgoingExprs = new Set(state.graph.edges
      .filter((edgeItem) => edgeItem.from === source.id)
      .map((edgeItem) => getNode(edgeItem.to)?.expr)
      .filter(Boolean));
    const graphExprs = new Set(state.graph.nodes.map((node) => node.expr));
    const repeatedTooOften = new Set(pathEntryNames.filter((name, idx, arr) => arr.indexOf(name) !== idx));
    const candidatesWithEffects = candidates
      .filter((candidate) => hasAnyEffects(candidate.entry, candidate.binding, nodeState))
      .filter((candidate) => !outgoingExprs.has(candidate.expr))
      .filter((candidate) => !repeatedTooOften.has(candidate.entry.name));

    if (!Phi || !fixture) {
      return candidatesWithEffects
        .sort((a, b) => {
          const aNew = graphExprs.has(a.expr) ? 0 : 1;
          const bNew = graphExprs.has(b.expr) ? 0 : 1;
          if (aNew !== bNew) return bNew - aNew;
          return a.expr.localeCompare(b.expr);
        })
        .slice(0, limit);
    }

    const ranked = Phi.rankMeaningfulCandidates(candidatesWithEffects, {
      state: nodeState,
      rules: fixture.scope?.derivations || [],
      seenExprs: outgoingExprs,
      seenStateKeys,
      pathEntryNames,
      canonicalCandidate: canonicalCandidateAfter(source, candidatesWithEffects),
      relevanceFacts: relevanceFactsFor(source, nodeState),
      influenceWeight: influenceWeightFor(source),
    });

    const chosen = [];
    const localStateKeys = new Set(seenStateKeys);
    for (const item of ranked) {
      const candidate = item.candidate;
      const key = item.evaluation.postStateKey;
      if (key && localStateKeys.has(key)) continue;
      if (key) localStateKeys.add(key);
      candidate.autoPostStateKey = key;
      chosen.push(candidate);
      if (chosen.length >= limit) break;
    }
    return chosen;
  }

  // Post-pass for auto-branch: bucket this run's nodes by post-state and
  // collapse each ≥2-node bucket via the engine (spec R1-R6). Returns
  // { merged, skipped, victimToSurvivor } or null when prerequisites are
  // missing (no Phi/walker/fixture or walker error) — caller no-ops then.
  function runAutoMerge(runNodeIds) {
    const Phi = (typeof window !== "undefined" && window.RetrocausePhi) || null;
    const Walker = (typeof window !== "undefined" && window.RetrocauseStateWalker) || null;
    const Engine = (typeof window !== "undefined" && window.StoryDagEngine) || null;
    const binding = state.activeSeed ? phiBindings[state.activeSeed] : null;
    const fx = binding && binding.fixture && binding.fixture();
    if (!Phi || !Walker || !Engine || !fx) return null;

    let postStates;
    try {
      postStates = Walker.computeAllPostStates(state.graph, fx, Phi);
    } catch (err) {
      return null;
    }

    const buckets = new Map();
    for (const id of runNodeIds) {
      const st = postStates.get(id);
      if (!st) continue;
      const key = Phi.stateKey(st);
      if (!buckets.has(key)) buckets.set(key, { ids: [], state: st });
      buckets.get(key).ids.push(id);
    }
    // Group entries carry the shared post-state so the engine can pin it
    // onto the survivor as `mergedState` (R7 / §1.6 convergence resolution).
    const groups = Array.from(buckets.values())
      .filter((b) => b.ids.length >= 2)
      .map((b) => ({ ids: b.ids, state: Array.from(b.state).sort() }));
    if (!groups.length) return { merged: 0, skipped: 0, victimToSurvivor: new Map() };

    const result = Engine.mergeEquivalentStates(state.graph, { groups, eligibleIds: runNodeIds });

    // victim→survivor: the survivor is the group id the engine reports as a
    // survivor that is still present after the merge; remaining absent group
    // ids mapped to it (used to repair selection when lastMadeId was merged).
    const survivorsSet = new Set(result.survivors);
    const present = new Set(state.graph.nodes.map((n) => n.id));
    const victimToSurvivor = new Map();
    for (const grp of groups) {
      const survivor = grp.ids.find((id) => survivorsSet.has(id) && present.has(id));
      if (!survivor) continue;
      for (const id of grp.ids) if (id !== survivor && !present.has(id)) victimToSurvivor.set(id, survivor);
    }
    return { merged: result.merged, skipped: result.skipped, victimToSurvivor };
  }

  // §7.9 influence_weight for frontier candidates. Criticality is
  // defined on existing transitions (§8.3.3), so a candidate inherits
  // the weight of an already-materialized edge source→node whose expr
  // matches it; otherwise 0 (unknown — a fresh transition's criticality
  // exists only after it joins the raw graph).
  function influenceWeightFor(source) {
    if (!state.cone || state.cone.unreachable) return null;
    const byExpr = new Map();
    for (const edgeItem of state.graph.edges) {
      if (edgeItem.from !== source.id) continue;
      const crit = state.cone.edgeCrit[edgeItem.id];
      if (crit === undefined) continue;
      const expr = getNode(edgeItem.to)?.expr;
      if (expr) byExpr.set(expr, Math.max(byExpr.get(expr) || 0, crit));
    }
    return (candidate) => byExpr.get(candidate.expr) || 0;
  }

  function entryPathTo(nodeId) {
    const byId = new Map(state.graph.nodes.map((node) => [node.id, node]));
    const incoming = new Map();
    for (const edgeItem of state.graph.edges) {
      if (edgeItem.canonical === true || (edgeItem.canonical === undefined && edgeItem.type === "causes")) {
        if (!incoming.has(edgeItem.to)) incoming.set(edgeItem.to, edgeItem.from);
      }
    }
    const entries = [];
    const seen = new Set();
    let current = nodeId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const node = byId.get(current);
      if (node?.action?.entry) entries.push(node.action.entry);
      current = incoming.get(current);
    }
    return entries.reverse();
  }

  function canonicalCandidateAfter(source, candidates) {
    const nextEdges = state.graph.edges.filter((edgeItem) =>
      edgeItem.from === source.id
      && (edgeItem.canonical === true || (edgeItem.canonical === undefined && edgeItem.type === "causes")));
    const nextExprs = new Set(nextEdges.map((edgeItem) => getNode(edgeItem.to)?.expr).filter(Boolean));
    return candidates.find((candidate) => nextExprs.has(candidate.expr)) || null;
  }

  function relevanceFactsFor(source, nodeState) {
    const facts = new Set(nodeState || []);
    const downstream = downstreamCanonicalNodes(source.id);
    for (const node of downstream) {
      for (const token of String(node.expr || "").match(/[a-z_]+(?:\([^)]+\))?|[a-z_]+/g) || []) {
        if (token.length > 2) facts.add(token);
      }
      for (const tag of node.tags || []) facts.add(tag);
    }
    return Array.from(facts);
  }

  function downstreamCanonicalNodes(sourceId) {
    const out = [];
    const byId = new Map(state.graph.nodes.map((node) => [node.id, node]));
    const queue = [sourceId];
    const seen = new Set(queue);
    while (queue.length) {
      const id = queue.shift();
      for (const edgeItem of state.graph.edges) {
        if (edgeItem.from !== id) continue;
        if (!(edgeItem.canonical === true || (edgeItem.canonical === undefined && edgeItem.type === "causes"))) continue;
        if (seen.has(edgeItem.to)) continue;
        seen.add(edgeItem.to);
        const node = byId.get(edgeItem.to);
        if (node) out.push(node);
        queue.push(edgeItem.to);
      }
    }
    return out;
  }

  function syncAutoBranchControls() {
    if (el.autoBranchBtn) el.autoBranchBtn.disabled = state.autoBranchRunning;
    if (el.stopAutoBranchBtn) el.stopAutoBranchBtn.disabled = !state.autoBranchRunning;
  }

  function setAutoBranchStatus(text) {
    if (el.autoBranchStatus) el.autoBranchStatus.textContent = text;
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 35));
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  }

  function safeGloss(entry, binding) {
    try { return entry.gloss(binding) || ""; } catch { return ""; }
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
    if (el.omegaSelect) {
      const current = (state.graph.omega || [])[0] || "";
      el.omegaSelect.innerHTML = `<option value="">No Ω designated</option>` + state.graph.nodes
        .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === current ? "selected" : ""}>${escapeHtml(item.label)}</option>`)
        .join("");
    }
  }

  function renderConePanel() {
    if (!el.coneSummary) return;
    if (!state.cone) {
      el.coneSummary.className = "muted cone-summary";
      el.coneSummary.textContent = Cone
        ? "Designate Ω (the story's destination) to derive support, rim, waists and influence (§8.3)."
        : "cone.js did not load; cone overlay unavailable.";
      if (el.waistList) el.waistList.innerHTML = "";
      return;
    }
    const c = state.cone;
    const omegaLabels = c.omega.map((id) => escapeHtml(getNode(id)?.label || id)).join(", ");
    if (c.unreachable) {
      el.coneSummary.className = "cone-summary warn";
      el.coneSummary.innerHTML = `Ω (<strong>${omegaLabels}</strong>) is unreachable from the root — the cone is empty (§8.3.2).`;
      if (el.waistList) el.waistList.innerHTML = "";
      return;
    }
    el.coneSummary.className = "cone-summary good";
    el.coneSummary.innerHTML = `Cone toward <strong>${omegaLabels}</strong>: `
      + `${c.support.size} node${c.support.size === 1 ? "" : "s"} in support, `
      + `${c.rim.size} on the rim, Menger width ${c.width}.`;
    if (el.waistList) {
      el.waistList.innerHTML = c.waists.length
        ? c.waists.map((w) => `<div class="waist-row">waist @ phase ${w.level} · width ${w.width} · ${w.nodes.map((id) => escapeHtml(getNode(id)?.label || id)).join(", ")}</div>`).join("")
        : `<div class="muted">No interior waists (§8.3.3): the width profile has no clean local minimum.</div>`;
    }
  }

  // §8.3.4 (deriving Ω) is `open`: this is a labeled conjecture, shown
  // as a suggestion only — it NEVER applies the choice. Proxy used:
  // terminal node (no outgoing transitions) reachable from the root
  // with the highest transition in-degree; the meaning half of the
  // §8.3.4 candidate (§8.2 template participation) is unimplemented.
  function suggestOmega() {
    if (!Cone) return toast("cone.js did not load", true);
    const transitions = Cone.transitionEdges(state.graph);
    const outCount = new Map();
    const inCount = new Map();
    transitions.forEach((edgeItem) => {
      outCount.set(edgeItem.from, (outCount.get(edgeItem.from) || 0) + 1);
      inCount.set(edgeItem.to, (inCount.get(edgeItem.to) || 0) + 1);
    });
    const terminals = state.graph.nodes.filter((item) =>
      !outCount.get(item.id) && Cone.support(state.graph, [item.id]).has(state.graph.root));
    if (!terminals.length) return toast("No terminal node is reachable from the root", true);
    const best = terminals.sort((a, b) => (inCount.get(b.id) || 0) - (inCount.get(a.id) || 0))[0];
    if (el.coneSummary) {
      el.coneSummary.innerHTML += ` <span class="cone-conjecture">Suggested Ω (conjectural — §8.3.4 is open): ${escapeHtml(best.label)}. Not applied; pick it above if you agree.</span>`;
    }
    toast(`Conjectural Ω suggestion: ${best.label} (§8.3.4 open — not applied)`);
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
    const actionLine = selected.action
      ? `<div class="action-row"><strong>Action:</strong> <code>${escapeHtml(selected.action.entry)}(${escapeHtml(Object.values(selected.action.binding || {}).join(", "))})</code></div>`
      : "";
    const coneLine = coneStatusLine(selected);
    const mergedLine = mergedDetail(selected);
    el.selectedNode.innerHTML = `
      <h3>${escapeHtml(selected.label)}</h3>
      <div class="expr">${escapeHtml(selected.expr)}</div>
      ${actionLine}
      ${mergedLine}
      ${coneLine}
      <div>${escapeHtml(selected.state || "No state note.")}</div>
      ${selected.delta ? `<div><strong>Changed:</strong> ${escapeHtml(selected.delta)}</div>` : ""}
      ${selected.invariants ? `<div><strong>Invariant:</strong> ${escapeHtml(selected.invariants)}</div>` : ""}
      <div class="tag-row">${(selected.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="muted"><strong>Incoming</strong><br>${incoming}</div>
      <div class="muted"><strong>Outgoing</strong><br>${outgoing}</div>`;
  }

  function edgeSummary(edgeItem) {
    const other = getNode(edgeItem.from === state.selectedId ? edgeItem.to : edgeItem.from);
    const crit = state.cone ? state.cone.edgeCrit[edgeItem.id] : undefined;
    const influence = crit !== undefined ? ` · influence ${crit}` : "";
    return `<span style="color:${EDGE_COLORS[edgeItem.type] || EDGE_COLORS.causes}">${escapeHtml(edgeItem.type)}</span> ${escapeHtml(other?.label || "?")} ${edgeItem.label ? `· ${escapeHtml(edgeItem.label)}` : ""}${influence}`;
  }

  // Detail-panel block for a merged (join) node: the composed join-title, the
  // distinct moves it spans, and the pinned joint state (§1.6 / R7). Empty for
  // ordinary nodes. This is where the full truth lives — the card only shows
  // the short composed title.
  function mergedDetail(selected) {
    if (!selected || !Array.isArray(selected.mergedActions) || !selected.mergedActions.length) return "";
    const Engine = (typeof window !== "undefined" && window.StoryDagEngine) || null;
    const title = Engine && Engine.composeMergedLabel ? Engine.composeMergedLabel(selected) : null;
    const moves = [selected.action, ...selected.mergedActions]
      .filter((a) => a && a.entry)
      .map((a) => `${a.entry}(${Object.values(a.binding || {}).join(", ")})`)
      .map((text) => `<code>${escapeHtml(text)}</code>`)
      .join(" + ");
    const stateRows = Array.isArray(selected.mergedState) && selected.mergedState.length
      ? `<div class="muted">Joint state: ${selected.mergedState.map((atom) => `<code>${escapeHtml(atom)}</code>`).join(" ")}</div>`
      : "";
    return `<div class="merged-row"><strong>Join${title ? ` (${escapeHtml(title)})` : ""}:</strong> ${moves}</div>${stateRows}`;
  }

  function coneStatusLine(selected) {
    if (!state.cone) return "";
    let status;
    if (state.cone.omega.includes(selected.id)) status = "Ω — the designated attractor (§8.3.1)";
    else if (state.cone.waistNodeIds.has(selected.id)) status = "in support, on a waist (§8.3.3)";
    else if (state.cone.support.has(selected.id)) status = "in support (§8.3.2)";
    else if (state.cone.rim.has(selected.id)) status = "rim — precondition-satisfiable but cannot reach Ω (§8.3.2)";
    else status = "outside the forward reach of the source";
    return `<div><strong>Cone:</strong> ${escapeHtml(status)}</div>`;
  }

  function renderHeuristics(selected) {
    const suggestions = selected ? buildSuggestions(selected) : [];
    el.heuristicList.innerHTML = suggestions.length ? suggestions.map((suggestion, index) => `
      <article class="card">
        <strong>${escapeHtml(suggestion.label)}</strong>
        <p>${escapeHtml(suggestion.state)}</p>
        <button type="button" class="secondary" data-suggestion="${index}">Use this branch</button>
      </article>`).join("") : `<div class="muted">Select a node to see branch suggestions.</div>`;
    el.heuristicList.querySelectorAll("[data-suggestion]").forEach((button) => {
      button.addEventListener("click", () => fillBranchForm(suggestions[Number(button.dataset.suggestion)]));
    });
  }

  function syncEditor(selected) {
    el.editLabel.value = selected?.label || "";
    el.editExpr.value = selected?.expr || "";
    el.editState.value = selected?.state || "";
    el.editTags.value = (selected?.tags || []).join(", ");
  }

  function addBranchFromForm() {
    const source = getNode(state.selectedId);
    if (!source) return toast("Select a source node first", true);
    const label = el.branchLabel.value.trim();
    if (!label) return toast("Branch title is required", true);
    const id = uniqueId("branch");
    const branch = {
      id,
      label,
      expr: el.branchExpr.value.trim() || `alternate(${source.id})`,
      state: el.branchState.value.trim(),
      delta: el.branchDelta.value.trim(),
      invariants: el.branchInvariants.value.trim(),
      kind: "branch",
      tags: ["counterfactual"],
      createdBy: "human"
    };
    state.graph.nodes.push(branch);
    const choice = addEdge({ from: source.id, to: id, type: "choice", label: branch.delta || "alternative branch", canonical: false, branchId: id });
    if (!choice.ok) {
      state.graph.nodes = state.graph.nodes.filter((item) => item.id !== id);
      return toast(choice.message, true);
    }
    const rejoinTarget = el.rejoinSelect.value;
    if (rejoinTarget) {
      const rejoin = addEdge({ from: id, to: rejoinTarget, type: "rejoins", label: "rejoins canonical path", canonical: false, branchId: id });
      if (!rejoin.ok) toast(rejoin.message, true);
    }
    [el.branchLabel, el.branchExpr, el.branchState, el.branchDelta, el.branchInvariants].forEach((input) => { input.value = ""; });
    state.selectedId = id;
    renderAll();
    toast("Branch added");
  }

  function addManualEdit() {
    const from = el.manualFrom.value;
    const to = el.manualTo.value;
    const type = el.manualEdgeType.value;
    const label = el.manualEdgeLabel.value.trim() || type;
    if (to === "__new__") {
      const nodeLabel = el.manualNodeLabel.value.trim();
      if (!nodeLabel) return toast("New node label is required", true);
      const id = uniqueId("node");
      state.graph.nodes.push({
        id,
        label: nodeLabel,
        expr: `event(${slug(nodeLabel)})`,
        state: "",
        kind: type === "rejoins" ? "convergence" : "note",
        tags: [],
        createdBy: "human",
        delta: "",
        invariants: ""
      });
      const result = addEdge({ from, to: id, type, label, canonical: false });
      if (!result.ok) return toast(result.message, true);
      state.selectedId = id;
    } else {
      const result = addEdge({ from, to, type, label, canonical: false });
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
    edgeItem.id = edgeItem.id || uniqueId(`edge_${edgeItem.type}`);
    state.graph.edges.push(edgeItem);
    // R8: a new canonical parent changes a merged node's predecessor set,
    // so its pinned state (§1.6 commitment) no longer reflects one agreed
    // world; clear it so the walker recomputes from the new parents.
    const target = getNode(edgeItem.to);
    if (target && Array.isArray(target.mergedState)
        && (edgeItem.canonical === true || (edgeItem.canonical === undefined && edgeItem.type === "causes"))) {
      delete target.mergedState;
    }
    return { ok: true };
  }

  function deleteSelectedNode() {
    const selected = getNode(state.selectedId);
    if (!selected) return;
    if (selected.id === state.graph.root) return toast("The root node cannot be deleted", true);
    state.graph.nodes = state.graph.nodes.filter((item) => item.id !== selected.id);
    state.graph.edges = state.graph.edges.filter((item) => item.from !== selected.id && item.to !== selected.id);
    if (Array.isArray(state.graph.omega)) state.graph.omega = state.graph.omega.filter((id) => id !== selected.id);
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
    // R8: an explicit edit overrides the merged-state commitment so the
    // editor's own state/expr fields govern the walker again.
    if (Array.isArray(selected.mergedState)) delete selected.mergedState;
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
    if (Array.isArray(graph.omega) && graph.omega.length && Cone) {
      const missing = graph.omega.filter((id) => !ids.has(id));
      missing.forEach((id) => warnings.push(`Ω node missing from graph: ${id}`));
      if (!missing.length && !Cone.support(graph, graph.omega).has(graph.root)) {
        warnings.push("Ω is unreachable from the root — the cone is empty (§8.3.2)");
      }
    }
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

  function buildSuggestions(selected) {
    const tags = new Set(selected.tags || []);
    const actor = selected.expr.match(/\(([^,\)]+)/)?.[1] || "protagonist";
    const suggestions = [
      {
        label: `${selected.label}: ask for counsel first`,
        expr: `ask_help(${actor}, ally)`,
        state: "Information enters before the risky action, changing later causes without erasing the original desire.",
        delta: "The character seeks counsel before acting alone.",
        invariants: "The original goal remains active."
      },
      {
        label: `${selected.label}: refuse the shortcut`,
        expr: `refuse(${actor}, shortcut)`,
        state: "Delay or effort replaces the tempting quick path; conflict must arise from cost rather than deception.",
        delta: "The shortcut is not taken.",
        invariants: "The story's motivating need remains."
      }
    ];
    if (tags.has("deception") || tags.has("disguise")) {
      suggestions.push({ label: "Disguise is detected early", expr: `recognize(${actor}, deception, early)`, state: "The trap is still present, but the victim is no longer epistemically isolated.", delta: "Recognition moves earlier.", invariants: "The antagonist still wants the same outcome." });
    }
    if (tags.has("scarcity") || tags.has("loss")) {
      suggestions.push({ label: "The loss is confessed immediately", expr: `confess(${actor}, loss)`, state: "Social embarrassment replaces a long hidden cost because information returns to the system.", delta: "Truth replaces concealment.", invariants: "The loss or scarcity still happened." });
    }
    if (tags.has("hubris") || tags.has("pride")) {
      suggestions.push({ label: "Pride is interrupted by feedback", expr: `learn(${actor}, humility, before_failure)`, state: "A small warning changes behavior before the major reversal locks in.", delta: "Feedback is accepted before failure.", invariants: "The contest and status pressure remain." });
    }
    return suggestions.slice(0, 4);
  }

  function fillBranchForm(suggestion) {
    el.branchLabel.value = suggestion.label;
    el.branchExpr.value = suggestion.expr;
    el.branchState.value = suggestion.state;
    el.branchDelta.value = suggestion.delta || "";
    el.branchInvariants.value = suggestion.invariants || "";
  }

  function prefillFirstSuggestion() {
    const selected = getNode(state.selectedId);
    const suggestion = selected && buildSuggestions(selected)[0];
    if (!suggestion) return toast("No suggestion available", true);
    fillBranchForm(suggestion);
  }

  function showPrompt(openDialog = false) {
    const selected = getNode(state.selectedId);
    if (!selected) return toast("Select a node first", true);
    const downstream = state.graph.edges.filter((edgeItem) => edgeItem.from === selected.id).map((edgeItem) => getNode(edgeItem.to)).filter(Boolean);
    state.promptText = `You are helping enrich a causal narrative DAG. Return only JSON.\n\n${JSON.stringify({
      task: el.assistInstruction.value,
      story: state.graph.meta.title,
      selected,
      downstream,
      allowedEdgeTypes: EDGE_TYPES,
      requiredJsonShape: {
        branches: [{
          label: "short node label",
          expr: "typed_semantic_expression(actor, object)",
          state: "state after this branch",
          delta: "what changed from the canonical path",
          invariants: "facts preserved from the original story",
          tags: ["counterfactual"],
          rejoinTargetId: "optional existing node id"
        }]
      },
      constraints: [
        "Preserve DAG acyclicity.",
        "Make causal change explicit, not just a prose variation.",
        "Prefer one branch that rejoins a later convergence node and one branch that remains open.",
        "Do not rewrite upstream nodes."
      ]
    }, null, 2)}`;
    if (openDialog) showDialog("LLM assist prompt", state.promptText);
    return state.promptText;
  }

  async function copyPrompt() {
    const text = showPrompt(false);
    try {
      await navigator.clipboard.writeText(text);
      toast("Prompt copied");
    } catch {
      showDialog("LLM assist prompt", text);
      toast("Clipboard unavailable; opened prompt", true);
    }
  }

  function importFromTextArea() {
    const raw = el.importText.value.trim() || el.jsonText.value.trim();
    if (!raw) return toast("Paste JSON first", true);
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return toast(`Invalid JSON: ${error.message}`, true);
    }
    if (Array.isArray(data.branches)) {
      const origin = state.selectedId;
      data.branches.forEach((branch) => {
        state.selectedId = origin;
        fillBranchForm({
          label: branch.label || "Assisted branch",
          expr: branch.expr || "alternate(?)",
          state: branch.state || "",
          delta: branch.delta || "LLM-assisted branch",
          invariants: branch.invariants || ""
        });
        el.rejoinSelect.value = branch.rejoinTargetId || "";
        addBranchFromForm();
        const made = getNode(state.selectedId);
        if (made) {
          made.createdBy = "assist";
          made.tags = Array.isArray(branch.tags) ? branch.tags : ["counterfactual", "assist"];
        }
      });
      renderAll();
      toast("Imported assisted branches");
      return;
    }
    importGraph(data);
  }

  function importGraph(data) {
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
    toast("Graph JSON restored");
  }

  function exportJson() {
    return JSON.stringify({
      ...state.graph,
      meta: { ...state.graph.meta, savedAt: new Date().toISOString() }
    }, null, 2);
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
    if (item.kind === "branch") return "#3a1230";
    if (item.kind === "convergence") return "#3b2608";
    if (item.kind === "invariant") return "#082f27";
    if (item.kind === "root") return "#0d2a3f";
    return "#0e2035";
  }

  function coneMarker(item) {
    if (!state.cone) return "";
    if (state.cone.omega.includes(item.id)) return " · Ω";
    if (state.cone.waistNodeIds.has(item.id)) return " · waist";
    if (state.cone.rim.has(item.id)) return " · rim";
    return "";
  }

  // A transition edge with no criticality entry lies outside the
  // support (§8.3.2). Annotation edges are orthogonal to the cone.
  function isRimEdge(edgeItem) {
    if (!state.cone || !Cone) return false;
    if (!Cone.TRANSITION_EDGE_TYPES.includes(edgeItem.type)) return false;
    return !(edgeItem.id in state.cone.edgeCrit);
  }

  // Influence (§8.3.3) is a measure, never an election: width scales
  // with cut-criticality toward Ω, but no edge is hidden or picked.
  function edgeStrokeWidth(edgeItem) {
    if (!state.cone || !state.cone.maxCrit) return null;
    const crit = state.cone.edgeCrit[edgeItem.id] || 0;
    return `${2 + 2.5 * (crit / state.cone.maxCrit)}px`;
  }

  function isDimmedEdge(edgeItem) {
    if (!state.search) return false;
    return !matchesSearch(edgeItem.source) && !matchesSearch(edgeItem.target) && !(edgeItem.label || "").toLowerCase().includes(state.search);
  }

  function matchesSearch(item) {
    if (!state.search) return false;
    return [item.label, item.expr, item.state, ...(item.tags || [])].join(" ").toLowerCase().includes(state.search);
  }

  function uniqueId(prefix) {
    let id;
    do {
      id = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    } while (getNode(id) || state.graph.edges.some((item) => item.id === id));
    return id;
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

  // Card title for a node. Merged (join) nodes get an action-set title
  // ("red: warn + give → woodcutter") from the engine so the convergence
  // reads as a join, not a duplicate of one parent. Falls back to the
  // stored label (which the detail panel still shows verbatim).
  function displayLabel(item) {
    const Engine = (typeof window !== "undefined" && window.StoryDagEngine) || null;
    const joined = Engine && Engine.composeMergedLabel ? Engine.composeMergedLabel(item) : null;
    return joined || item.label || item.type || "";
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
