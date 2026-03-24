// layout.js - Graph layout algorithm
// Depth (vertical) = time (event count from origin)
// Spread (horizontal) = space (emerges from branch comparison)
// Attractors pull branches together; branching pushes them apart

class GraphLayout {
  constructor(graph, width, height) {
    this.graph = graph;
    this.width = width;
    this.height = height;
    this.padding = { top: 80, bottom: 80, left: 60, right: 60 };
    this.nodePositions = new Map(); // id -> {x, y}
    this.scaleLevel = 0; // 0=events, 1=sequences, 2=arcs, 3=stories
    this.camera = { x: 0, y: 0, zoom: 1 };
  }

  // Main layout computation
  compute() {
    const graph = this.graph;
    if (!graph || graph.nodes.size === 0) return;

    // Group nodes by depth
    const layers = new Map();
    for (const node of graph.nodes.values()) {
      if (!layers.has(node.depth)) layers.set(node.depth, []);
      layers.get(node.depth).push(node);
    }

    const maxDepth = graph.maxDepth;
    // Use generous spacing - the graph is meant to be scrolled/zoomed
    const usableHeight = Math.max(this.height * 2, maxDepth * 25);
    const usableWidth = this.width * 3;
    const depthStep = maxDepth > 0 ? usableHeight / maxDepth : usableHeight;

    // First pass: assign x positions based on branch structure
    // Use a modified Sugiyama-style layered layout
    this._assignInitialX(layers, usableWidth);

    // Second pass: reduce crossings and improve aesthetics
    for (let iter = 0; iter < 4; iter++) {
      this._reduceCrossings(layers, maxDepth);
    }

    // Third pass: center and space nodes properly
    this._finalizePositions(layers, maxDepth, depthStep, usableWidth);

    // Apply attractor gravity (pull nearby nodes closer)
    this._applyAttractorGravity();
  }

  _assignInitialX(layers, usableWidth) {
    for (const [depth, nodes] of layers) {
      const count = nodes.length;
      const spacing = count > 1 ? usableWidth / (count - 1) : 0;
      const startX = count > 1 ? this.padding.left : this.padding.left + usableWidth / 2;

      // Sort by parent position if parents exist
      nodes.sort((a, b) => {
        const aParentX = this._avgParentX(a);
        const bParentX = this._avgParentX(b);
        if (aParentX !== null && bParentX !== null) return aParentX - bParentX;
        if (aParentX !== null) return -1;
        if (bParentX !== null) return 1;
        return a.branchIndex - b.branchIndex;
      });

      for (let i = 0; i < count; i++) {
        const node = nodes[i];
        node.x = startX + i * spacing;
      }
    }
  }

  _avgParentX(node) {
    if (node.causes.length === 0) return null;
    let sum = 0;
    let count = 0;
    for (const pid of node.causes) {
      const parent = this.graph.getNode(pid);
      if (parent && parent.x !== undefined) {
        sum += parent.x;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  }

  _reduceCrossings(layers, maxDepth) {
    // Barycenter method: position each node at the average of its parents
    for (let depth = 1; depth <= maxDepth; depth++) {
      const nodes = layers.get(depth);
      if (!nodes) continue;

      for (const node of nodes) {
        const avgX = this._avgParentX(node);
        if (avgX !== null) {
          node.x = node.x * 0.3 + avgX * 0.7; // Blend toward parent average
        }
      }

      // Prevent overlaps
      nodes.sort((a, b) => a.x - b.x);
      const minGap = 20;
      for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].x - nodes[i - 1].x < minGap) {
          nodes[i].x = nodes[i - 1].x + minGap;
        }
      }
    }

    // Reverse pass: pull parents toward children
    for (let depth = maxDepth - 1; depth >= 0; depth--) {
      const nodes = layers.get(depth);
      if (!nodes) continue;

      for (const node of nodes) {
        if (node.effects.length === 0) continue;
        let sum = 0;
        let count = 0;
        for (const cid of node.effects) {
          const child = this.graph.getNode(cid);
          if (child) {
            sum += child.x;
            count++;
          }
        }
        if (count > 0) {
          node.x = node.x * 0.5 + (sum / count) * 0.5;
        }
      }
    }
  }

  _finalizePositions(layers, maxDepth, depthStep, usableWidth) {
    for (const [depth, nodes] of layers) {
      // Center the layer
      if (nodes.length > 0) {
        const minX = Math.min(...nodes.map(n => n.x));
        const maxX = Math.max(...nodes.map(n => n.x));
        const layerWidth = maxX - minX;
        const offset = (usableWidth - layerWidth) / 2 + this.padding.left - minX;

        for (const node of nodes) {
          node.x += offset;
          node.y = this.padding.top + depth * depthStep;
        }
      }
    }
  }

  _applyAttractorGravity() {
    // Attractors pull neighboring-depth nodes toward them
    for (const aid of this.graph.attractors) {
      const attractor = this.graph.getNode(aid);
      if (!attractor) continue;

      const strength = 0.15 * Math.min(attractor.attractorStrength, 5);

      // Pull parents toward attractor x
      for (const pid of attractor.causes) {
        const parent = this.graph.getNode(pid);
        if (parent) {
          parent.x = parent.x * (1 - strength * 0.5) + attractor.x * strength * 0.5;
        }
      }
    }
  }

  // Convert world coordinates to screen coordinates
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.camera.x) * this.camera.zoom + this.width / 2,
      y: (wy - this.camera.y) * this.camera.zoom + this.height / 2
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2) / this.camera.zoom + this.camera.x,
      y: (sy - this.height / 2) / this.camera.zoom + this.camera.y
    };
  }

  // Get visible nodes for current scale level
  getVisibleNodes() {
    const visible = [];
    const scale = this.scaleLevel;

    if (scale === 0) {
      // Show all individual events
      for (const node of this.graph.nodes.values()) {
        visible.push(node);
      }
    } else {
      // Show meta-group representatives
      const seen = new Set();
      for (const node of this.graph.nodes.values()) {
        if (node.metaGroup && node.metaGroup[scale - 1]) {
          const groupKey = node.metaGroup[scale - 1].id;
          if (!seen.has(groupKey)) {
            seen.add(groupKey);
            visible.push(node); // Use first node as representative
          }
        }
      }
    }
    return visible;
  }

  // Find node nearest to screen position
  findNodeAt(screenX, screenY, radius) {
    radius = radius || 15;
    const world = this.screenToWorld(screenX, screenY);
    let closest = null;
    let closestDist = Infinity;

    for (const node of this.graph.nodes.values()) {
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist && dist < radius / this.camera.zoom) {
        closest = node;
        closestDist = dist;
      }
    }
    return closest;
  }

  // Center camera on a node
  centerOn(node, animate) {
    this.camera.x = node.x;
    this.camera.y = node.y;
  }

  // Zoom
  zoomBy(factor) {
    this.camera.zoom = Math.max(0.1, Math.min(10, this.camera.zoom * factor));
  }
}

window.GraphLayout = GraphLayout;
