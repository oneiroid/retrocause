/* global d3 */
(() => {
  const EDGE_TYPES = ["causes", "enables", "blocks", "choice", "rejoins", "parallels", "foreshadows"];
  const STORAGE_KEY = "retrocause.storyDagBuilder.v2";
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
  };

  const state = {
    graph: makeGraph(seeds.magi),
    activeSeed: "magi",
    selectedId: "magi_start",
    nodes: [],
    edges: [],
    ranks: {},
    showEdgeLabels: true,
    search: "",
    viewMode: "all",
    promptText: "",
    phiGroupByEntry: true,
    phiHideNoop: false,
    autoBranchRunning: false,
    stopAutoBranch: false
  };

  const el = Object.fromEntries(Array.from(document.querySelectorAll("[id]")).map((item) => [item.id, item]));
  const svg = d3.select("#graphSvg");
  const defs = svg.append("defs");
  defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 25)
    .attr("refY", 5)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,0 L10,5 L0,10 z")
    .attr("fill", "#64748b");
  const glow = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
  glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
  glow.append("feMerge").selectAll("feMergeNode").data(["blur", "SourceGraphic"]).join("feMergeNode").attr("in", (d) => d);

  const graphLayer = svg.append("g");
  const rankLayer = graphLayer.append("g").attr("class", "rank-layer");
  const edgeLayer = graphLayer.append("g").attr("class", "edge-layer");
  const labelLayer = graphLayer.append("g").attr("class", "edge-label-layer");
  const nodeLayer = graphLayer.append("g").attr("class", "node-layer");
  const zoom = d3.zoom().scaleExtent([0.15, 3]).on("zoom", (event) => graphLayer.attr("transform", event.transform));
  svg.call(zoom);

  let simulation;
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
      mainCharacters: seed.mainCharacters || [],
      version: 2,
      savedAt: null
    };
    return normalizeGraph(graph);
  }

  function normalizeGraph(graph) {
    graph.nodes = (graph.nodes || []).map((item) => ({
      kind: "canonical",
      tags: [],
      actors: [],
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
      actor: item.actor || "",
      canonical: item.canonical ?? item.type === "causes",
      ...item
    }));
    graph.root = graph.root || graph.nodes[0]?.id || "root";
    graph.meta = {
      title: graph.title || "Untitled Story DAG",
      version: 2,
      mainCharacters: graph.mainCharacters || [],
      ...(graph.meta || {}),
    };
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
    el.suggestBranchBtn.addEventListener("click", prefillFirstSuggestion);
    el.addManualBtn.addEventListener("click", addManualEdit);
    el.deleteSelectedBtn.addEventListener("click", deleteSelectedNode);
    el.validateBtn.addEventListener("click", () => showValidation(validateGraph()));
    el.fitBtn.addEventListener("click", fitGraph);
    el.reheatBtn.addEventListener("click", () => simulation?.alpha(0.8).restart());
    el.toggleLabelsBtn.addEventListener("click", () => { state.showEdgeLabels = !state.showEdgeLabels; renderGraph(); });
    el.searchInput.addEventListener("input", () => { state.search = el.searchInput.value.trim().toLowerCase(); renderGraph(); });
    el.viewMode.addEventListener("change", () => { state.viewMode = el.viewMode.value; renderAll(); });
    if (el.phiGroupToggle) el.phiGroupToggle.addEventListener("change", () => { state.phiGroupByEntry = el.phiGroupToggle.checked; renderPhiPanel(getNode(state.selectedId)); });
    if (el.phiHideNoopToggle) el.phiHideNoopToggle.addEventListener("change", () => { state.phiHideNoop = el.phiHideNoopToggle.checked; renderPhiPanel(getNode(state.selectedId)); });
    if (el.autoBranchBtn) el.autoBranchBtn.addEventListener("click", autoBranchFromSelected);
    if (el.stopAutoBranchBtn) el.stopAutoBranchBtn.addEventListener("click", () => {
      state.stopAutoBranch = true;
      setAutoBranchStatus("Stopping after the current insert...");
    });
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
    renderGraph();
    renderPanels();
    el.jsonText.value = exportJson();
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
    const rankBuckets = new Map();

    state.nodes = state.graph.nodes
      .filter((item) => visible.has(item.id))
      .map((item, index) => {
        const rank = state.ranks[item.id] || 0;
        const bucketIndex = rankBuckets.get(rank) || 0;
        rankBuckets.set(rank, bucketIndex + 1);
        const old = oldPositions.get(item.id);
        return {
          ...item,
          rank,
          x: old?.x ?? 120 + (rank / maxRank) * (dimensions.width - 240),
          y: old?.y ?? 120 + bucketIndex * 86 + (index % 2) * 18
        };
      });
    const nodeById = new Map(state.nodes.map((item) => [item.id, item]));
    state.edges = state.graph.edges
      .filter((item) => nodeById.has(item.from) && nodeById.has(item.to))
      .map((item) => ({ ...item, source: nodeById.get(item.from), target: nodeById.get(item.to) }));

    drawRankGuides(dimensions, maxRank);
    if (simulation) simulation.stop();
    simulation = d3.forceSimulation(state.nodes);
    applyForces(maxRank);
    simulation.on("tick", ticked).alpha(0.9).restart();

    edgeSelection = edgeLayer.selectAll("path.link").data(state.edges, (item) => item.id);
    edgeSelection.exit().remove();
    edgeSelection = edgeSelection.enter()
      .append("path")
      .attr("class", "link")
      .attr("marker-end", "url(#arrow)")
      .merge(edgeSelection)
      .attr("stroke", (item) => EDGE_COLORS[item.type] || EDGE_COLORS.causes)
      .attr("stroke-dasharray", (item) => item.type === "rejoins" ? "7 5" : item.canonical ? null : "3 4")
      .classed("dimmed", (item) => isDimmedEdge(item));

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
        state.selectedId = item.id;
        renderAll();
      });
    entering.append("rect").attr("rx", 12).attr("ry", 12);
    entering.append("text").attr("class", "node-label").attr("text-anchor", "middle").attr("dy", "-0.65em");
    entering.append("text").attr("class", "node-state").attr("text-anchor", "middle").attr("dy", "0.75em");
    entering.append("text").attr("class", "node-meta").attr("text-anchor", "middle").attr("dy", "2.15em");
    nodeSelection = entering.merge(nodeSelection)
      .classed("selected", (item) => item.id === state.selectedId)
      .classed("search-hit", (item) => matchesSearch(item))
      .classed("dimmed", (item) => state.search && !matchesSearch(item));

    nodeSelection.select("rect")
      .attr("width", (item) => nodeWidth(item))
      .attr("height", 64)
      .attr("x", (item) => -nodeWidth(item) / 2)
      .attr("y", -32)
      .attr("fill", (item) => nodeFill(item))
      .attr("stroke", (item) => NODE_COLORS[item.kind] || NODE_COLORS.note);
    nodeSelection.select(".node-label").text((item) => truncate(item.label, 33));
    nodeSelection.select(".node-state").text((item) => truncate(item.state, 42));
    nodeSelection.select(".node-meta").text((item) => `${item.kind} · r${item.rank} · ${(item.tags || []).slice(0, 3).join(", ")}`);
    nodeSelection.call(d3.drag()
      .on("start", (event, item) => {
        if (!event.active) simulation.alphaTarget(0.18).restart();
        item.fx = item.x;
        item.fy = item.y;
      })
      .on("drag", (event, item) => {
        item.fx = event.x;
        item.fy = event.y;
      })
      .on("end", (event, item) => {
        if (!event.active) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
      }));
  }

  function applyForces(maxRank = Math.max(1, ...Object.values(state.ranks))) {
    const dimensions = graphDimensions();
    simulation
      .force("link", d3.forceLink(state.edges).id((item) => item.id).distance((item) => item.type === "rejoins" ? 130 : 95).strength(0.45))
      .force("charge", d3.forceManyBody().strength(-520).distanceMax(650))
      .force("collide", d3.forceCollide((item) => nodeWidth(item) / 2 + 18))
      .force("x", d3.forceX((item) => 120 + ((item.rank || 0) / maxRank) * (dimensions.width - 240)).strength(0.58))
      .force("y", d3.forceY((item) => laneY(item, dimensions.height)).strength(0.08));
  }

  function laneY(item, height) {
    if (item.kind === "branch") return height * 0.68;
    if (item.kind === "convergence") return height * 0.46;
    if (item.kind === "invariant") return height * 0.28;
    return height * 0.38;
  }

  function drawRankGuides(dimensions, maxRank) {
    const data = d3.range(maxRank + 1).map((rank) => ({ rank, x: 120 + (rank / maxRank) * (dimensions.width - 240) }));
    const lines = rankLayer.selectAll("line.rank-line").data(data, (item) => item.rank);
    lines.exit().remove();
    lines.enter().append("line").attr("class", "rank-line").merge(lines)
      .attr("x1", (item) => item.x).attr("x2", (item) => item.x).attr("y1", 75).attr("y2", dimensions.height - 36);
    const labels = rankLayer.selectAll("text.rank-label").data(data, (item) => item.rank);
    labels.exit().remove();
    labels.enter().append("text").attr("class", "rank-label").attr("text-anchor", "middle").merge(labels)
      .attr("x", (item) => item.x).attr("y", 68).text((item) => `r${item.rank}`);
  }

  function ticked() {
    edgeSelection.attr("d", (item) => curvedPath(item.source, item.target, item.type));
    edgeLabelSelection
      .attr("x", (item) => (item.source.x + item.target.x) / 2)
      .attr("y", (item) => (item.source.y + item.target.y) / 2 - (item.type === "rejoins" ? 16 : 8));
    nodeSelection.attr("transform", (item) => `translate(${item.x},${item.y})`);
  }

  function curvedPath(source, target, type) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const curve = type === "rejoins" ? 0.45 : type === "choice" ? 0.25 : 0.14;
    const mx = source.x + dx / 2;
    return `M${source.x},${source.y} C${mx},${source.y + dy * curve} ${mx},${target.y - dy * curve} ${target.x},${target.y}`;
  }

  function renderPanels() {
    const graph = state.graph;
    const selected = getNode(state.selectedId);
    el.nodeCount.textContent = graph.nodes.length;
    el.edgeCount.textContent = graph.edges.length;
    el.branchCount.textContent = graph.nodes.filter((item) => item.kind === "branch").length;
    el.joinCount.textContent = graph.edges.filter((item) => item.type === "rejoins").length;
    renderSelects();
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
    el.phiSummary.textContent = `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} across ${byEntry.size} L entr${byEntry.size === 1 ? "y" : "ies"} at this node.`;

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
      return { ok: false, message: "No typed fixture for this seed. Phi available only for Red and Magi." };
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
    return {
      ok: true,
      fixture: fx,
      nodeState,
      candidates: actorAdmissibleCandidates(selected, Phi.phi({
        lexicon: fx.lexicon,
        scope: fx.scope,
        state: nodeState,
        downstreamExprs: new Set(),
      })),
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
    const actor = candidateActor(candidate) || actorForNode(source);
    if (!actorAllowedAtSource(source, actor)) {
      if (notify) toast(`${actor} cannot branch from ${source.label}`, true);
      return null;
    }
    const newNode = {
      id,
      label: gloss,
      expr: candidate.expr,
      state: "",
      kind: "branch",
      tags: unique(["phi", ...extraTags, entry.name]),
      actors: [actor],
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
      actor,
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
    if (!phiBindings[state.activeSeed]) return toast("Auto branching needs a typed seed; Magi or Red are supported.", true);

    const maxDepth = clampNumber(el.autoDepth?.value, 1, 4, 2);
    const perNode = clampNumber(el.autoWidth?.value, 1, 4, 2);
    const maxNodes = clampNumber(el.autoMaxNodes?.value, 1, 40, 12);
    const queue = [{ id: root.id, depth: 0, pathEntryNames: entryPathTo(root.id) }];
    const autoSeenStateKeys = new Set();
    let made = 0;
    let skipped = 0;
    let lastMadeId = null;

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
          seenStateKeys: autoSeenStateKeys,
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
          if (candidate.autoPostStateKey) autoSeenStateKeys.add(candidate.autoPostStateKey);
          queue.push({ id: newNode.id, depth: depth + 1, pathEntryNames: [...pathEntryNames, candidate.entry.name] });
          setAutoBranchStatus(`Auto branching: ${made}/${maxNodes} nodes, queue ${queue.length}.`);
          state.selectedId = newNode.id;
          renderAll();
          await yieldToBrowser();
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
      setAutoBranchStatus(`${stopped ? "Stopped" : "Finished"}: created ${made} node${made === 1 ? "" : "s"}.${suffix}`);
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

  function entryPathTo(nodeId) {
    const byId = new Map(state.graph.nodes.map((node) => [node.id, node]));
    const incoming = new Map();
    for (const edgeItem of state.graph.edges) {
      if (edgeItem.canonical === true || (edgeItem.canonical === undefined && edgeItem.type === "causes")) {
        if (!incoming.has(edgeItem.to)) incoming.set(edgeItem.to, []);
        incoming.get(edgeItem.to).push(edgeItem.from);
      }
    }
    const entries = [];
    const seen = new Set();
    const visit = (current) => {
      if (!current || seen.has(current)) return;
      seen.add(current);
      for (const pred of incoming.get(current) || []) visit(pred);
      const node = byId.get(current);
      if (node?.action?.entry) entries.push(node.action.entry);
    }
    visit(nodeId);
    return entries;
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
    const selected = getNode(state.selectedId);
    const options = state.graph.nodes.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === state.selectedId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
    const targetOptions = state.graph.nodes
      .filter((item) => item.id !== state.selectedId && (state.ranks[item.id] || 0) >= selectedRank)
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("");
    const actorOptions = actorOptionsForNode(selected)
      .map((actor) => `<option value="${escapeHtml(actor)}">${escapeHtml(actor)}</option>`)
      .join("");
    el.manualFrom.innerHTML = options;
    el.manualTo.innerHTML = `<option value="__new__">New node</option>${options}`;
    if (el.branchActor) el.branchActor.innerHTML = actorOptions;
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
    const actionLine = selected.action
      ? `<div class="action-row"><strong>Action:</strong> <code>${escapeHtml(selected.action.entry)}(${escapeHtml(Object.values(selected.action.binding || {}).join(", "))})</code></div>`
      : "";
    const actorsLine = (selected.actors || []).length
      ? `<div><strong>Actors:</strong> ${selected.actors.map(escapeHtml).join(", ")}</div>`
      : "";
    el.selectedNode.innerHTML = `
      <h3>${escapeHtml(selected.label)}</h3>
      <div class="expr">${escapeHtml(selected.expr)}</div>
      ${actorsLine}
      ${actionLine}
      <div>${escapeHtml(selected.state || "No state note.")}</div>
      ${selected.delta ? `<div><strong>Changed:</strong> ${escapeHtml(selected.delta)}</div>` : ""}
      ${selected.invariants ? `<div><strong>Invariant:</strong> ${escapeHtml(selected.invariants)}</div>` : ""}
      <div class="tag-row">${(selected.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="muted"><strong>Incoming</strong><br>${incoming}</div>
      <div class="muted"><strong>Outgoing</strong><br>${outgoing}</div>`;
  }

  function edgeSummary(edgeItem) {
    const other = getNode(edgeItem.from === state.selectedId ? edgeItem.to : edgeItem.from);
    return `<span style="color:${EDGE_COLORS[edgeItem.type] || EDGE_COLORS.causes}">${escapeHtml(edgeItem.type)}</span> ${escapeHtml(other?.label || "?")}${edgeItem.actor ? ` · ${escapeHtml(edgeItem.actor)}` : ""}${edgeItem.label ? ` · ${escapeHtml(edgeItem.label)}` : ""}`;
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
    const actor = selectedBranchActor(source);
    const branch = {
      id,
      label,
      expr: el.branchExpr.value.trim() || `alternate(${source.id})`,
      state: el.branchState.value.trim(),
      delta: el.branchDelta.value.trim(),
      invariants: el.branchInvariants.value.trim(),
      kind: "branch",
      tags: ["counterfactual"],
      actors: [actor],
      createdBy: "human"
    };
    state.graph.nodes.push(branch);
    const choice = addEdge({ from: source.id, to: id, type: "choice", label: branch.delta || "alternative branch", canonical: false, branchId: id, actor });
    if (!choice.ok) {
      state.graph.nodes = state.graph.nodes.filter((item) => item.id !== id);
      return toast(choice.message, true);
    }
    const rejoinTarget = el.rejoinSelect.value;
    if (rejoinTarget) {
      const rejoin = addEdge({ from: id, to: rejoinTarget, type: "rejoins", label: "rejoins actor path", canonical: false, branchId: id, actor });
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
        actors: [],
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
    const actorError = validateActorEdge(edgeItem);
    if (actorError) return { ok: false, message: actorError };
    if (wouldCreateCycle(edgeItem.from, edgeItem.to)) return { ok: false, message: "Rejected because that edge would create a cycle" };
    edgeItem.id = edgeItem.id || uniqueId(`edge_${edgeItem.type}`);
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
      const actorError = validateActorEdge(edgeItem, graph);
      if (actorError) errors.push(actorError);
    });
    graph.edges.forEach((edgeItem) => {
      const without = graph.edges.filter((candidate) => candidate.id !== edgeItem.id);
      if (reachable(edgeItem.to, edgeItem.from, without)) errors.push(`Cycle through ${edgeItem.from} → ${edgeItem.to}`);
    });
    graph.nodes.forEach((item) => {
      if (item.id !== graph.root && item.kind !== "root" && !graph.edges.some((edgeItem) => edgeItem.to === item.id)) warnings.push(`Orphan node: ${item.label}`);
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

  function buildSuggestions(selected) {
    const tags = new Set(selected.tags || []);
    const actor = actorForNode(selected);
    const suggestions = [
      {
        label: `${selected.label}: ask for counsel first`,
        expr: `ask_help(${actor}, ally)`,
        state: "Information enters before the risky action, changing later causes without erasing the original desire.",
        delta: "The character seeks counsel before acting alone.",
        invariants: "The original goal remains active.",
        actor
      },
      {
        label: `${selected.label}: refuse the shortcut`,
        expr: `refuse(${actor}, shortcut)`,
        state: "Delay or effort replaces the tempting quick path; conflict must arise from cost rather than deception.",
        delta: "The shortcut is not taken.",
        invariants: "The story's motivating need remains.",
        actor
      }
    ];
    if (tags.has("deception") || tags.has("disguise")) {
      suggestions.push({ label: "Disguise is detected early", expr: `recognize(${actor}, deception, early)`, state: "The trap is still present, but the victim is no longer epistemically isolated.", delta: "Recognition moves earlier.", invariants: "The antagonist still wants the same outcome.", actor });
    }
    if (tags.has("scarcity") || tags.has("loss")) {
      suggestions.push({ label: "The loss is confessed immediately", expr: `confess(${actor}, loss)`, state: "Social embarrassment replaces a long hidden cost because information returns to the system.", delta: "Truth replaces concealment.", invariants: "The loss or scarcity still happened.", actor });
    }
    if (tags.has("hubris") || tags.has("pride")) {
      suggestions.push({ label: "Pride is interrupted by feedback", expr: `learn(${actor}, humility, before_failure)`, state: "A small warning changes behavior before the major reversal locks in.", delta: "Feedback is accepted before failure.", invariants: "The contest and status pressure remain.", actor });
    }
    return suggestions.slice(0, 4);
  }

  function fillBranchForm(suggestion) {
    el.branchLabel.value = suggestion.label;
    el.branchExpr.value = suggestion.expr;
    el.branchState.value = suggestion.state;
    el.branchDelta.value = suggestion.delta || "";
    el.branchInvariants.value = suggestion.invariants || "";
    if (suggestion.actor && el.branchActor) {
      if (![...el.branchActor.options].some((option) => option.value === suggestion.actor)) {
        el.branchActor.add(new Option(suggestion.actor, suggestion.actor));
      }
      el.branchActor.value = suggestion.actor;
    }
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
      mainCharacters: state.graph.meta.mainCharacters || [],
      selected,
      downstream,
      allowedEdgeTypes: EDGE_TYPES,
      requiredJsonShape: {
        branches: [{
          label: "short node label",
          expr: "typed_semantic_expression(actor, object)",
          state: "state after this branch",
          delta: "what changed from this actor path",
          invariants: "facts preserved from the original story",
          actor: "main character choosing this branch",
          tags: ["counterfactual"],
          rejoinTargetId: "optional existing node id"
        }]
      },
      constraints: [
        "Preserve DAG acyclicity.",
        "Model character agency: outgoing branch choices should be chosen by the relevant actor.",
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
          invariants: branch.invariants || "",
          actor: branch.actor || ""
        });
        el.rejoinSelect.value = branch.rejoinTargetId || "";
        addBranchFromForm();
        const made = getNode(state.selectedId);
        if (made) {
          made.createdBy = "assist";
          made.tags = Array.isArray(branch.tags) ? branch.tags : ["counterfactual", "assist"];
          if (branch.actor) made.actors = [branch.actor];
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

  function actorForNode(node) {
    if (!node) return "protagonist";
    if (Array.isArray(node.actors) && node.actors.length === 1) return node.actors[0];
    const parsed = String(node.expr || "").match(/\(([^,\)]+)/)?.[1];
    return parsed || (state.graph.meta.mainCharacters || [])[0] || "protagonist";
  }

  function actorOptionsForNode(node) {
    if (Array.isArray(node?.actors) && node.actors.length) return unique(node.actors);
    const options = [];
    options.push(actorForNode(node));
    options.push(...(state.graph.meta.mainCharacters || []));
    return unique(options.filter(Boolean));
  }

  function selectedBranchActor(source) {
    return el.branchActor?.value || actorForNode(source);
  }

  function candidateActor(candidate) {
    const params = candidate?.entry?.params || [];
    const firstEntity = params.find((param) => param.type === "entity");
    return firstEntity ? candidate.binding?.[firstEntity.name] || "" : "";
  }

  function actorAdmissibleCandidates(source, candidates) {
    return candidates.filter((candidate) => {
      const actor = candidateActor(candidate);
      return !actor || actorAllowedAtSource(source, actor);
    });
  }

  function actorAllowedAtSource(source, actor) {
    if (!actor) return true;
    const sourceActors = source?.actors || [];
    return sourceActors.length === 0 || sourceActors.includes(actor);
  }

  function validateActorEdge(edgeItem, graph = state.graph) {
    if (!edgeItem.actor) return "";
    const source = (graph.nodes || []).find((node) => node.id === edgeItem.from);
    if (!source) return "";
    if (!actorAllowedAtSource(source, edgeItem.actor)) {
      return `Actor ${edgeItem.actor} cannot branch from ${source.label || source.id}`;
    }
    return "";
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
