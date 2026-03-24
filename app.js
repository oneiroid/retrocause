// app.js - Main application controller
// Wires together graph generation, layout, rendering, and interaction

(function () {
  // --- State ---
  let graph = null;
  let layout = null;
  let renderer = null;
  let generator = null;

  let traversing = false;
  let traverseTimer = null;
  let traverseSpeed = 200; // ms between cursor steps
  let currentScaleLevel = 0;
  let showStoryPanel = false;
  let activeStoryId = null;

  // --- Canvas setup ---
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    if (layout) {
      layout.width = window.innerWidth;
      layout.height = window.innerHeight;
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // --- Generate graph ---
  function generateGraph(storyId) {
    const seed = Math.floor(Math.random() * 999999);
    generator = new CausalGraphGenerator(seed);

    graph = generator.generate({
      totalDepth: 50,
      baseBranching: 2.3,
      attractorFrequency: 0.14,
      fractalLevels: 3,
      storyTemplate: storyId ? getStoryArchetype(storyId) : null
    });

    // If a story is active, tag nodes with story phases
    if (storyId) {
      const archetype = getStoryArchetype(storyId);
      if (archetype) {
        const shaper = new StoryShaper(archetype);
        for (const node of graph.nodes.values()) {
          const normalized = node.depth / graph.maxDepth;
          const params = shaper.getParamsAtDepth(normalized);
          node.storyTag = storyId;
          node.label = node.isAttractor ? params.phaseName : node.label;
        }
      }
    }

    // Create layout
    layout = new GraphLayout(graph, window.innerWidth, window.innerHeight);
    layout.compute();

    // Center camera on the root, zoomed to show top portion
    const root = graph.getNode(graph.rootId);
    const allNodes = Array.from(graph.nodes.values());
    if (root && allNodes.length > 0) {
      const avgX = allNodes.reduce((s, n) => s + n.x, 0) / allNodes.length;
      layout.camera.x = avgX;
      layout.camera.y = root.y + (layout.height * 0.3);
      layout.camera.zoom = 0.9;
    }

    // Create renderer
    renderer = new GraphRenderer(canvas, layout);
    renderer.cursorNodeId = graph.rootId;
    renderer.activeStory = storyId ? getStoryArchetype(storyId) : null;

    updateStats();
  }

  // --- Traversal (attention cursor moving through graph) ---
  function startTraversal() {
    if (traversing) return;
    traversing = true;

    document.getElementById('btn-play').style.display = 'none';
    document.getElementById('btn-pause').style.display = '';

    function step() {
      if (!traversing || !graph || !renderer) return;

      const currentNode = graph.getNode(renderer.cursorNodeId);
      if (!currentNode || currentNode.effects.length === 0) {
        // Reached a leaf - stop
        stopTraversal();
        return;
      }

      // Choose next node - prefer paths toward attractors
      let nextId;
      if (currentNode.effects.length === 1) {
        nextId = currentNode.effects[0];
      } else {
        // Weighted random: attractors pull more
        const candidates = currentNode.effects.map(id => {
          const child = graph.getNode(id);
          const weight = child && child.isAttractor ? 3 : 1;
          return { id, weight };
        });
        const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
        let r = Math.random() * totalWeight;
        for (const c of candidates) {
          r -= c.weight;
          if (r <= 0) { nextId = c.id; break; }
        }
        if (nextId === undefined) nextId = candidates[0].id;
      }

      renderer.setCursor(nextId);

      // Smoothly pan camera to follow cursor
      const node = graph.getNode(nextId);
      if (node) {
        layout.camera.x += (node.x - layout.camera.x) * 0.25;
        layout.camera.y += (node.y - layout.camera.y) * 0.25;
      }

      updateCursorInfo();
      updateStats();

      traverseTimer = setTimeout(step, traverseSpeed);
    }

    step();
  }

  function stopTraversal() {
    traversing = false;
    if (traverseTimer) clearTimeout(traverseTimer);
    traverseTimer = null;

    document.getElementById('btn-play').style.display = '';
    document.getElementById('btn-pause').style.display = 'none';
  }

  function resetTraversal() {
    stopTraversal();
    if (renderer && graph) {
      renderer.resetCursor();
      renderer.cursorNodeId = graph.rootId;

      const root = graph.getNode(graph.rootId);
      if (root) {
        layout.camera.x = root.x;
        layout.camera.y = root.y;
      }
    }
    updateCursorInfo();
    updateStats();
  }

  // --- UI Updates ---
  function updateStats() {
    if (!graph) return;

    const cursorNode = renderer ? graph.getNode(renderer.cursorNodeId) : null;
    document.getElementById('stat-depth').textContent = cursorNode ? cursorNode.depth : 0;
    document.getElementById('stat-branches').textContent = graph.nodes.size;
    document.getElementById('stat-attractors').textContent = graph.attractors.length;

    const scaleLabels = ['events', 'sequences', 'arcs', 'stories'];
    document.getElementById('stat-scale').textContent = scaleLabels[currentScaleLevel];
  }

  function updateCursorInfo() {
    if (!graph || !renderer) return;
    const node = graph.getNode(renderer.cursorNodeId);
    if (!node) {
      document.getElementById('cursor-event').textContent = '---';
      document.getElementById('cursor-story').textContent = '---';
      return;
    }

    const eventText = node.isAttractor
      ? 'ATTRACTOR: ' + node.label + ' [' + node.causes.length + ' paths]'
      : 'event: ' + node.label + ' (d=' + node.depth + ')';
    document.getElementById('cursor-event').textContent = eventText;

    // Show story phase if active
    if (activeStoryId) {
      const archetype = getStoryArchetype(activeStoryId);
      if (archetype) {
        const shaper = new StoryShaper(archetype);
        const phase = shaper.getPhaseAt(node.depth / graph.maxDepth);
        document.getElementById('cursor-story').textContent = archetype.name + ' / ' + phase;
      }
    } else {
      // Show branch count at this depth
      const siblings = graph.getNodesAtDepth(node.depth);
      document.getElementById('cursor-story').textContent =
        siblings.length + ' parallel branches at this depth';
    }
  }

  function setScale(level) {
    currentScaleLevel = level;
    if (layout) layout.scaleLevel = level;

    document.querySelectorAll('.scale-level').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.level) === level);
    });

    // Adjust zoom based on scale
    if (layout) {
      const zoomLevels = [0.8, 0.4, 0.2, 0.1];
      layout.camera.zoom = zoomLevels[level];
    }

    updateStats();
  }

  function buildStoryPanel() {
    const list = document.getElementById('story-list');
    list.innerHTML = '';

    for (const arch of STORY_ARCHETYPES) {
      const item = document.createElement('div');
      item.className = 'story-item';
      item.dataset.id = arch.id;
      item.innerHTML =
        '<div class="story-name" style="color:' + arch.color + '">' + arch.name + '</div>' +
        '<div class="story-desc">' + arch.description + '</div>' +
        '<div class="story-topology">' + arch.topology + '</div>';

      item.addEventListener('click', function () {
        const id = this.dataset.id;
        if (activeStoryId === id) {
          // Deselect
          activeStoryId = null;
          this.classList.remove('active');
          if (renderer) renderer.activeStory = null;
        } else {
          // Select - regenerate graph with this story shape
          document.querySelectorAll('.story-item').forEach(el => el.classList.remove('active'));
          activeStoryId = id;
          this.classList.add('active');
          generateGraph(id);
        }
        updateCursorInfo();
      });

      list.appendChild(item);
    }
  }

  // --- Input handling ---
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragCamStart = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', function (e) {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    dragCamStart = { x: layout.camera.x, y: layout.camera.y };
  });

  canvas.addEventListener('mousemove', function (e) {
    if (isDragging && layout) {
      const dx = (e.clientX - dragStart.x) / layout.camera.zoom;
      const dy = (e.clientY - dragStart.y) / layout.camera.zoom;
      layout.camera.x = dragCamStart.x - dx;
      layout.camera.y = dragCamStart.y - dy;
    }

    // Hover detection
    if (layout && renderer) {
      const node = layout.findNodeAt(e.clientX, e.clientY, 20);
      renderer.hoveredNode = node;
      canvas.style.cursor = node ? 'pointer' : 'grab';
    }
  });

  canvas.addEventListener('mouseup', function (e) {
    if (isDragging && layout && renderer) {
      const dx = Math.abs(e.clientX - dragStart.x);
      const dy = Math.abs(e.clientY - dragStart.y);

      // If it was a click (not drag), select node / move cursor
      if (dx < 5 && dy < 5) {
        const node = layout.findNodeAt(e.clientX, e.clientY, 20);
        if (node) {
          renderer.selectedNode = node;
          renderer.setCursor(node.id);
          updateCursorInfo();
          updateStats();
        }
      }
    }
    isDragging = false;
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (layout) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      layout.zoomBy(factor);
    }
  }, { passive: false });

  // --- Button handlers ---
  document.getElementById('btn-play').addEventListener('click', startTraversal);
  document.getElementById('btn-pause').addEventListener('click', stopTraversal);
  document.getElementById('btn-reset').addEventListener('click', resetTraversal);

  document.getElementById('btn-zoom-in').addEventListener('click', function () {
    if (currentScaleLevel > 0) setScale(currentScaleLevel - 1);
    else if (layout) layout.zoomBy(1.5);
  });

  document.getElementById('btn-zoom-out').addEventListener('click', function () {
    if (currentScaleLevel < 3) setScale(currentScaleLevel + 1);
    else if (layout) layout.zoomBy(0.67);
  });

  document.getElementById('btn-stories').addEventListener('click', function () {
    showStoryPanel = !showStoryPanel;
    document.getElementById('story-panel').classList.toggle('hidden', !showStoryPanel);
    this.classList.toggle('active', showStoryPanel);
  });

  document.getElementById('btn-attractors').addEventListener('click', function () {
    if (renderer) {
      renderer.highlightAttractors = !renderer.highlightAttractors;
      this.classList.toggle('active', renderer.highlightAttractors);
    }
  });

  document.getElementById('btn-regen').addEventListener('click', function () {
    generateGraph(activeStoryId);
  });

  // Scale level buttons
  document.querySelectorAll('.scale-level').forEach(el => {
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () {
      setScale(parseInt(this.dataset.level));
    });
  });

  // --- Keyboard ---
  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      if (traversing) stopTraversal();
      else startTraversal();
    }
    if (e.key === 'r' || e.key === 'R') {
      resetTraversal();
    }
    if (e.key === 'a' || e.key === 'A') {
      if (renderer) {
        renderer.highlightAttractors = !renderer.highlightAttractors;
        document.getElementById('btn-attractors').classList.toggle('active', renderer.highlightAttractors);
      }
    }
    if (e.key === 's' || e.key === 'S') {
      showStoryPanel = !showStoryPanel;
      document.getElementById('story-panel').classList.toggle('hidden', !showStoryPanel);
      document.getElementById('btn-stories').classList.toggle('active', showStoryPanel);
    }
    // Arrow keys for manual traversal
    if (e.key === 'ArrowDown' && renderer && graph) {
      const node = graph.getNode(renderer.cursorNodeId);
      if (node && node.effects.length > 0) {
        // Move to first child
        renderer.setCursor(node.effects[0]);
        updateCursorInfo();
        updateStats();
        // Pan camera
        const next = graph.getNode(renderer.cursorNodeId);
        if (next) {
          layout.camera.y += (next.y - layout.camera.y) * 0.3;
        }
      }
    }
    if (e.key === 'ArrowUp' && renderer && graph) {
      const node = graph.getNode(renderer.cursorNodeId);
      if (node && node.causes.length > 0) {
        renderer.setCursor(node.causes[0]);
        updateCursorInfo();
        updateStats();
        const prev = graph.getNode(renderer.cursorNodeId);
        if (prev) {
          layout.camera.y += (prev.y - layout.camera.y) * 0.3;
        }
      }
    }
    if (e.key === 'ArrowLeft' && renderer && graph) {
      // Move to sibling branch
      const node = graph.getNode(renderer.cursorNodeId);
      if (node) {
        const siblings = graph.getNodesAtDepth(node.depth).sort((a, b) => a.x - b.x);
        const idx = siblings.findIndex(n => n.id === node.id);
        if (idx > 0) {
          renderer.setCursor(siblings[idx - 1].id);
          updateCursorInfo();
          const next = graph.getNode(renderer.cursorNodeId);
          if (next) layout.camera.x += (next.x - layout.camera.x) * 0.3;
        }
      }
    }
    if (e.key === 'ArrowRight' && renderer && graph) {
      const node = graph.getNode(renderer.cursorNodeId);
      if (node) {
        const siblings = graph.getNodesAtDepth(node.depth).sort((a, b) => a.x - b.x);
        const idx = siblings.findIndex(n => n.id === node.id);
        if (idx < siblings.length - 1) {
          renderer.setCursor(siblings[idx + 1].id);
          updateCursorInfo();
          const next = graph.getNode(renderer.cursorNodeId);
          if (next) layout.camera.x += (next.x - layout.camera.x) * 0.3;
        }
      }
    }
  });

  // --- Render loop ---
  let lastTime = performance.now();

  function renderLoop(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    if (renderer) {
      // Save and reset transform for fresh frame
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      renderer.render(dt);
    }

    requestAnimationFrame(renderLoop);
  }

  // --- Init ---
  buildStoryPanel();
  generateGraph(null);
  requestAnimationFrame(renderLoop);

})();
