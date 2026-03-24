// renderer.js - Canvas rendering for the causality graph
// Visualizes: nodes (events), edges (causal links), attractors, attention cursor
// Space = horizontal spread, Time = vertical depth

class GraphRenderer {
  constructor(canvas, layout) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = layout;
    this.animTime = 0;

    // Visual state
    this.cursorNodeId = null;
    this.cursorTrail = [];         // recent cursor positions for glow trail
    this.highlightAttractors = false;
    this.activeStory = null;       // highlighted story archetype
    this.hoveredNode = null;
    this.selectedNode = null;

    // Colors
    this.colors = {
      bg: '#0a0a0f',
      edge: 'rgba(60, 70, 110, 0.35)',
      edgeActive: 'rgba(100, 160, 255, 0.6)',
      edgeConverge: 'rgba(180, 140, 50, 0.5)',
      node: '#3a4a7a',
      nodeGlow: 'rgba(80, 120, 200, 0.2)',
      attractor: '#c09030',
      attractorGlow: 'rgba(200, 160, 60, 0.4)',
      cursor: '#60c0ff',
      cursorGlow: 'rgba(96, 192, 255, 0.5)',
      cursorTrail: 'rgba(96, 192, 255, 0.15)',
      text: '#606080',
      textBright: '#a0a0c0',
      storyOverlay: 'rgba(255, 255, 255, 0.08)'
    };

    // Node sizes
    this.sizes = {
      node: 4,
      attractor: 7,
      cursor: 8,
      edgeWidth: 1.2,
    };
  }

  render(dt) {
    this.animTime += dt;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, w, h);

    const graph = this.layout.graph;
    if (!graph || graph.nodes.size === 0) return;

    ctx.save();

    // Apply camera transform
    const cam = this.layout.camera;
    ctx.translate(w / 2, h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Draw story phase backgrounds (if story overlay active)
    if (this.activeStory) {
      this._drawStoryOverlay(ctx, graph);
    }

    // Draw edges
    this._drawEdges(ctx, graph);

    // Draw nodes
    this._drawNodes(ctx, graph);

    // Draw cursor
    if (this.cursorNodeId !== null) {
      this._drawCursor(ctx, graph);
    }

    ctx.restore();

    // Draw depth markers on left edge (time axis)
    this._drawTimeAxis(ctx, graph, w, h);
  }

  _drawEdges(ctx, graph) {
    const cursorNode = this.cursorNodeId !== null ? graph.getNode(this.cursorNodeId) : null;
    const cursorPath = new Set();

    // Build cursor's causal path for highlighting
    if (cursorNode) {
      let n = cursorNode;
      while (n) {
        cursorPath.add(n.id);
        n = n.causes.length > 0 ? graph.getNode(n.causes[0]) : null;
      }
    }

    for (const node of graph.nodes.values()) {
      for (const childId of node.effects) {
        const child = graph.getNode(childId);
        if (!child) continue;

        const fromScreen = this._toScreen(node);
        const toScreen = this._toScreen(child);

        // Determine edge style
        const isOnCursorPath = cursorPath.has(node.id) && cursorPath.has(childId);
        const isConvergence = child.isAttractor && child.causes.length > 1;
        const isStoryEdge = this.activeStory && node.storyTag === this.activeStory.id;

        ctx.beginPath();
        ctx.moveTo(fromScreen.x, fromScreen.y);

        // Slight curve for cross-branch edges
        if (Math.abs(child.depth - node.depth) <= 0 || node.depth === child.depth) {
          // Same-depth edge (entanglement) - draw as arc
          const midX = (fromScreen.x + toScreen.x) / 2;
          const midY = (fromScreen.y + toScreen.y) / 2 - 20;
          ctx.quadraticCurveTo(midX, midY, toScreen.x, toScreen.y);
        } else {
          // Normal causal edge - gentle curve
          const ctrlX = (fromScreen.x + toScreen.x) / 2;
          const ctrlY1 = fromScreen.y + (toScreen.y - fromScreen.y) * 0.3;
          ctx.quadraticCurveTo(ctrlX, ctrlY1, toScreen.x, toScreen.y);
        }

        if (isOnCursorPath) {
          ctx.strokeStyle = this.colors.edgeActive;
          ctx.lineWidth = 2;
        } else if (isConvergence && this.highlightAttractors) {
          ctx.strokeStyle = this.colors.edgeConverge;
          ctx.lineWidth = 1.5;
        } else if (isStoryEdge) {
          ctx.strokeStyle = this.activeStory.color + '60';
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = this.colors.edge;
          ctx.lineWidth = this.sizes.edgeWidth;
        }

        ctx.stroke();
      }
    }
  }

  _drawNodes(ctx, graph) {
    for (const node of graph.nodes.values()) {
      const pos = this._toScreen(node);
      const isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
      const isSelected = this.selectedNode && this.selectedNode.id === node.id;

      if (node.isAttractor) {
        this._drawAttractorNode(ctx, pos, node, isHovered || isSelected);
      } else {
        this._drawEventNode(ctx, pos, node, isHovered || isSelected);
      }
    }
  }

  _drawEventNode(ctx, pos, node, highlighted) {
    const size = this.sizes.node;
    const pulse = Math.sin(this.animTime * 2 + node.id * 0.5) * 0.3 + 1;

    // Glow
    if (highlighted) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * 3, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.nodeGlow;
      ctx.fill();
    }

    // Story coloring
    let color = this.colors.node;
    if (this.activeStory && node.storyTag === this.activeStory.id) {
      color = this.activeStory.color;
    }

    // Node dot
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size * pulse, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Label on hover
    if (highlighted && node.label) {
      ctx.fillStyle = this.colors.textBright;
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, pos.x, pos.y - size * 2 - 4);
    }
  }

  _drawAttractorNode(ctx, pos, node, highlighted) {
    const size = this.sizes.attractor;
    const pulse = Math.sin(this.animTime * 1.5 + node.id) * 0.5 + 1;
    const glowSize = size * 2 + node.attractorStrength * 1.5;

    // Outer glow
    const gradient = ctx.createRadialGradient(
      pos.x, pos.y, size * 0.5,
      pos.x, pos.y, glowSize * pulse
    );
    gradient.addColorStop(0, this.colors.attractorGlow);
    gradient.addColorStop(1, 'rgba(200, 160, 60, 0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowSize * pulse, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.attractor;
    ctx.fill();

    // Ring if highlighted
    if (highlighted || this.highlightAttractors) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size + 3, 0, Math.PI * 2);
      ctx.strokeStyle = this.colors.attractor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Label
    if (highlighted || this.highlightAttractors) {
      ctx.fillStyle = this.colors.attractor;
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, pos.x, pos.y - size - 6);

      // Show convergence count
      ctx.font = '8px Consolas, monospace';
      ctx.fillStyle = this.colors.text;
      ctx.fillText(node.causes.length + ' paths converge', pos.x, pos.y + size + 12);
    }
  }

  _drawCursor(ctx, graph) {
    const node = graph.getNode(this.cursorNodeId);
    if (!node) return;
    const pos = this._toScreen(node);
    const size = this.sizes.cursor;

    // Trail
    for (let i = 0; i < this.cursorTrail.length; i++) {
      const trailNode = graph.getNode(this.cursorTrail[i]);
      if (!trailNode) continue;
      const tpos = this._toScreen(trailNode);
      const alpha = (i + 1) / this.cursorTrail.length * 0.4;
      ctx.beginPath();
      ctx.arc(tpos.x, tpos.y, size * 0.6 * (i + 1) / this.cursorTrail.length, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(96, 192, 255, ${alpha})`;
      ctx.fill();
    }

    // Perception window - shows nearby branches the cursor "can see"
    const windowRadius = 60;
    const gradient = ctx.createRadialGradient(
      pos.x, pos.y, 0,
      pos.x, pos.y, windowRadius
    );
    gradient.addColorStop(0, 'rgba(96, 192, 255, 0.08)');
    gradient.addColorStop(0.7, 'rgba(96, 192, 255, 0.03)');
    gradient.addColorStop(1, 'rgba(96, 192, 255, 0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, windowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Cursor ring pulse
    const pulse = Math.sin(this.animTime * 3) * 0.3 + 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size * pulse + 3, 0, Math.PI * 2);
    ctx.strokeStyle = this.colors.cursorGlow;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cursor core
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    const coreGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.5, this.colors.cursor);
    coreGrad.addColorStop(1, 'rgba(96, 192, 255, 0.5)');
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Label
    ctx.fillStyle = this.colors.cursor;
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ATTENTION', pos.x, pos.y - size - 10);
    if (node.label) {
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = this.colors.textBright;
      ctx.fillText(node.label, pos.x, pos.y - size - 22);
    }
  }

  _drawStoryOverlay(ctx, graph) {
    if (!this.activeStory) return;

    const shaper = new StoryShaper(this.activeStory);
    const maxDepth = graph.maxDepth;

    // Draw phase backgrounds
    const allNodes = Array.from(graph.nodes.values());
    const minX = Math.min(...allNodes.map(n => n.x)) - 30;
    const maxX = Math.max(...allNodes.map(n => n.x)) + 30;

    for (const boundary of shaper.phaseBoundaries) {
      const yStart = this.layout.padding.top + boundary.start * maxDepth *
        ((this.layout.height - this.layout.padding.top - this.layout.padding.bottom) / maxDepth);
      const yEnd = this.layout.padding.top + boundary.end * maxDepth *
        ((this.layout.height - this.layout.padding.top - this.layout.padding.bottom) / maxDepth);

      ctx.fillStyle = this.activeStory.color + '08';
      ctx.fillRect(minX, yStart, maxX - minX, yEnd - yStart);

      // Phase label
      ctx.fillStyle = this.activeStory.color + '40';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(boundary.phase.name, minX + 5, yStart + 12);

      // Separator line
      ctx.beginPath();
      ctx.moveTo(minX, yStart);
      ctx.lineTo(maxX, yStart);
      ctx.strokeStyle = this.activeStory.color + '15';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  _drawTimeAxis(ctx, graph, w, h) {
    const maxDepth = graph.maxDepth;
    const usableHeight = h - this.layout.padding.top * this.layout.camera.zoom - this.layout.padding.bottom * this.layout.camera.zoom;
    const cam = this.layout.camera;

    ctx.fillStyle = this.colors.text;
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';

    // Draw time markers every 10 depth units
    const step = Math.max(1, Math.floor(10 / cam.zoom));
    for (let d = 0; d <= maxDepth; d += step) {
      const worldY = this.layout.padding.top + d * ((this.layout.height - this.layout.padding.top - this.layout.padding.bottom) / maxDepth);
      const screenY = (worldY - cam.y) * cam.zoom + h / 2;

      if (screenY > 50 && screenY < h - 30) {
        ctx.fillStyle = '#252540';
        ctx.fillRect(0, screenY, 40, 1);
        ctx.fillStyle = this.colors.text;
        ctx.fillText('t=' + d, 4, screenY - 2);
      }
    }

    // Time arrow
    ctx.fillStyle = this.colors.text;
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(14, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('TIME (event depth) -->', 0, 0);
    ctx.restore();

    // Space label at bottom
    ctx.fillText('<-- SPACE (branch spread) -->', w / 2, h - 8);
  }

  _toScreen(node) {
    // Node already has world coords from layout, just return them
    // Camera transform is applied via ctx transform
    return { x: node.x, y: node.y };
  }

  // Move cursor to a node
  setCursor(nodeId) {
    if (this.cursorNodeId !== null) {
      this.cursorTrail.push(this.cursorNodeId);
      if (this.cursorTrail.length > 12) {
        this.cursorTrail.shift();
      }
    }
    this.cursorNodeId = nodeId;
  }

  // Clear cursor trail
  resetCursor() {
    this.cursorTrail = [];
    this.cursorNodeId = null;
  }
}

window.GraphRenderer = GraphRenderer;
