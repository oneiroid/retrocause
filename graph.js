// graph.js - Causality DAG with fractal self-similarity and attractor structure
// Base reality: an infinite, self-similar, pre-existing causality graph
// Nodes = events (atomic, low-meaning individually)
// Edges = causal links (directed, A caused B)
// Attractors = convergence nodes with high in-degree (prophecy points)

class CausalNode {
  constructor(id, depth, label) {
    this.id = id;
    this.depth = depth;           // time = depth in graph
    this.label = label || '';
    this.causes = [];             // parent node ids (incoming edges)
    this.effects = [];            // child node ids (outgoing edges)
    this.isAttractor = false;     // convergence point
    this.attractorStrength = 0;   // how many paths converge here
    this.storyTag = null;         // which story archetype this belongs to
    this.metaGroup = null;        // fractal grouping at higher scale
    this.branchIndex = 0;         // lateral position among siblings (-> space)
    // layout coords (computed later)
    this.x = 0;
    this.y = 0;
    this.scale = 0;               // which zoom level this node is visible at
  }
}

class CausalGraph {
  constructor() {
    this.nodes = new Map();       // id -> CausalNode
    this.nextId = 0;
    this.maxDepth = 0;
    this.attractors = [];
    this.metaGroups = [];         // fractal meta-groupings
    this.rootId = null;
  }

  createNode(depth, label) {
    const id = this.nextId++;
    const node = new CausalNode(id, depth, label);
    this.nodes.set(id, node);
    if (depth > this.maxDepth) this.maxDepth = depth;
    return node;
  }

  addEdge(fromId, toId) {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (from && to) {
      if (!from.effects.includes(toId)) from.effects.push(toId);
      if (!to.causes.includes(fromId)) to.causes.push(fromId);
    }
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  getChildren(id) {
    const node = this.nodes.get(id);
    return node ? node.effects.map(cid => this.nodes.get(cid)).filter(Boolean) : [];
  }

  getParents(id) {
    const node = this.nodes.get(id);
    return node ? node.causes.map(pid => this.nodes.get(pid)).filter(Boolean) : [];
  }

  getNodesAtDepth(depth) {
    const result = [];
    for (const node of this.nodes.values()) {
      if (node.depth === depth) result.push(node);
    }
    return result;
  }

  // Get all paths from a node to a target depth
  getPathsForward(nodeId, targetDepth) {
    const paths = [];
    const dfs = (current, path) => {
      const node = this.nodes.get(current);
      if (!node) return;
      path.push(current);
      if (node.depth >= targetDepth) {
        paths.push([...path]);
      } else {
        for (const child of node.effects) {
          dfs(child, path);
        }
      }
      path.pop();
    };
    dfs(nodeId, []);
    return paths;
  }
}

// ---------- Graph Generation ----------

class CausalGraphGenerator {
  constructor(seed) {
    this.seed = seed || Date.now();
    this.rng = this._makeRng(this.seed);
  }

  _makeRng(seed) {
    // Simple seeded PRNG (mulberry32)
    let s = seed | 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  _pick(arr) {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  _chance(p) {
    return this.rng() < p;
  }

  // Generate a fractal causality graph
  // The graph has self-similar branching patterns at multiple scales
  generate(config) {
    const {
      totalDepth = 60,
      baseBranching = 2.2,       // average branches per node
      attractorFrequency = 0.12, // chance of convergence point
      fractalLevels = 3,         // levels of self-similarity
      storyTemplate = null       // optional story archetype to follow
    } = config || {};

    const graph = new CausalGraph();

    // Create root event
    const root = graph.createNode(0, 'Origin');
    graph.rootId = root.id;

    // Generate layer by layer
    let currentLayer = [root];

    for (let depth = 1; depth <= totalDepth; depth++) {
      const nextLayer = [];
      const isAttractorDepth = this._shouldPlaceAttractor(depth, totalDepth, attractorFrequency);

      if (isAttractorDepth && currentLayer.length > 1) {
        // CONVERGENCE: multiple paths merge into attractor(s)
        const numAttractors = Math.max(1, Math.floor(currentLayer.length * 0.3));
        const attractorNodes = [];

        for (let a = 0; a < numAttractors; a++) {
          const attractor = graph.createNode(depth, this._attractorLabel(depth, totalDepth));
          attractor.isAttractor = true;
          attractorNodes.push(attractor);
          nextLayer.push(attractor);
          graph.attractors.push(attractor.id);
        }

        // Connect current layer to attractors
        for (const parent of currentLayer) {
          const target = this._pick(attractorNodes);
          graph.addEdge(parent.id, target.id);
          target.attractorStrength++;
          // Some nodes connect to multiple attractors
          if (attractorNodes.length > 1 && this._chance(0.3)) {
            const target2 = this._pick(attractorNodes.filter(a => a.id !== target.id));
            if (target2) {
              graph.addEdge(parent.id, target2.id);
              target2.attractorStrength++;
            }
          }
        }
      } else {
        // BRANCHING: nodes split into multiple effects
        for (const parent of currentLayer) {
          // Fractal branching: vary branching factor with self-similar pattern
          const fractalMod = this._fractalBranching(depth, fractalLevels);
          const numChildren = Math.max(1, Math.round(baseBranching * fractalMod + (this.rng() - 0.5)));

          for (let c = 0; c < numChildren; c++) {
            const child = graph.createNode(depth, '');
            child.branchIndex = c;
            graph.addEdge(parent.id, child.id);
            nextLayer.push(child);

            // Occasional cross-branch causal links (entanglement)
            if (nextLayer.length > 1 && this._chance(0.08)) {
              const other = this._pick(nextLayer.filter(n => n.id !== child.id));
              if (other && other.depth === depth) {
                graph.addEdge(child.id, other.id);
              }
            }
          }
        }

        // Prevent exponential blowup - prune if too many nodes
        if (nextLayer.length > 80) {
          // Merge some branches (natural convergence)
          while (nextLayer.length > 60) {
            const removeIdx = Math.floor(this.rng() * nextLayer.length);
            const removed = nextLayer.splice(removeIdx, 1)[0];
            const mergeTarget = this._pick(nextLayer);
            // Redirect parents of removed node to merge target
            for (const pid of removed.causes) {
              graph.addEdge(pid, mergeTarget.id);
              const pnode = graph.getNode(pid);
              if (pnode) {
                pnode.effects = pnode.effects.filter(e => e !== removed.id);
              }
            }
            graph.nodes.delete(removed.id);
          }
        }
      }

      currentLayer = nextLayer;
    }

    // Assign fractal meta-groups
    this._assignMetaGroups(graph, fractalLevels);

    // Label nodes based on position
    this._labelNodes(graph);

    return graph;
  }

  _shouldPlaceAttractor(depth, totalDepth, freq) {
    // Attractors tend to cluster at certain depths (self-similar)
    // More likely at golden-ratio intervals
    const phi = 1.618033988749895;
    const normalized = depth / totalDepth;
    // Check if near a golden ratio subdivision
    for (let i = 1; i <= 5; i++) {
      const target = (i / phi) % 1;
      if (Math.abs(normalized - target) < 0.03) return true;
    }
    return this._chance(freq * 0.5);
  }

  _fractalBranching(depth, levels) {
    // Self-similar branching pattern
    let mod = 1.0;
    for (let l = 0; l < levels; l++) {
      const period = Math.pow(7, l + 1);
      const phase = (depth % period) / period;
      // Sine-like oscillation between expansion and contraction
      mod *= 0.7 + 0.6 * Math.sin(phase * Math.PI * 2);
    }
    return Math.max(0.3, Math.min(2.0, mod));
  }

  _attractorLabel(depth, totalDepth) {
    const position = depth / totalDepth;
    const labels = [
      'Threshold', 'Convergence', 'Nexus', 'Crucible',
      'Fulcrum', 'Meridian', 'Apex', 'Nadir',
      'Crossroads', 'Singularity', 'Confluence', 'Pivot'
    ];
    return this._pick(labels);
  }

  _assignMetaGroups(graph, levels) {
    // Group nodes into fractal meta-structures
    // Level 0: individual events
    // Level 1: sequences (5-10 events)
    // Level 2: arcs (3-5 sequences)
    // Level 3: stories (2-4 arcs)

    const groupSizes = [1, 7, 35, 140];
    const groupLabels = ['event', 'sequence', 'arc', 'story'];

    for (let level = 0; level < levels; level++) {
      const size = groupSizes[Math.min(level, groupSizes.length - 1)];
      let groupId = 0;

      for (const node of graph.nodes.values()) {
        const group = Math.floor(node.depth / size);
        if (!node.metaGroup) node.metaGroup = {};
        node.metaGroup[level] = {
          id: group,
          label: groupLabels[level],
          level: level
        };
      }
    }

    graph.metaGroups = groupLabels;
  }

  _labelNodes(graph) {
    const eventVerbs = [
      'shift', 'pulse', 'spark', 'echo', 'ripple', 'fold',
      'turn', 'surge', 'fade', 'bloom', 'crack', 'weave',
      'drift', 'flash', 'merge', 'split', 'coil', 'leap'
    ];
    for (const node of graph.nodes.values()) {
      if (!node.label && !node.isAttractor) {
        node.label = this._pick(eventVerbs);
      }
    }
  }
}

// Export for use by other modules
window.CausalNode = CausalNode;
window.CausalGraph = CausalGraph;
window.CausalGraphGenerator = CausalGraphGenerator;
