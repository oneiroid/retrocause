// stories.js - The 7 base story archetypes as graph topologies
// These are low-dimensional projections of the Great Story
// Each archetype defines a characteristic pattern of branching and convergence
// in the causality graph - they are REAL structure, not narrative convenience

const STORY_ARCHETYPES = [
  {
    id: 'monster',
    name: 'Overcoming the Monster',
    description: 'Narrow path through expanding threat, converging to confrontation node',
    topology: 'funnel -> expansion -> bottleneck -> release',
    color: '#e05050',
    // Graph signature: branches expand (monster grows), then hard convergence (confrontation),
    // then moderate branching (aftermath)
    pattern: {
      phases: [
        { name: 'Call', branchFactor: 1.2, duration: 0.15, converge: false },
        { name: 'Threat Grows', branchFactor: 2.5, duration: 0.35, converge: false },
        { name: 'Confrontation', branchFactor: 0.3, duration: 0.1, converge: true, attractor: true },
        { name: 'Thrilling Escape', branchFactor: 1.8, duration: 0.15, converge: false },
        { name: 'Resolution', branchFactor: 0.5, duration: 0.25, converge: true, attractor: true }
      ]
    }
  },
  {
    id: 'rags',
    name: 'Rags to Riches',
    description: 'Steady branch expansion from constricted origin toward wide attractor basin',
    topology: 'pinch -> gradual expansion -> setback bottleneck -> full bloom',
    color: '#50c050',
    pattern: {
      phases: [
        { name: 'Humble Origin', branchFactor: 0.5, duration: 0.15, converge: true },
        { name: 'Rising', branchFactor: 1.8, duration: 0.25, converge: false },
        { name: 'Central Crisis', branchFactor: 0.4, duration: 0.1, converge: true, attractor: true },
        { name: 'Transformation', branchFactor: 2.2, duration: 0.25, converge: false },
        { name: 'Fulfillment', branchFactor: 1.5, duration: 0.25, converge: false, attractor: true }
      ]
    }
  },
  {
    id: 'quest',
    name: 'The Quest',
    description: 'Long chain with periodic bottlenecks - waypoints on the path',
    topology: 'start -> [expand -> bottleneck] x N -> destination',
    color: '#5080e0',
    pattern: {
      phases: [
        { name: 'Departure', branchFactor: 1.0, duration: 0.1, converge: false },
        { name: 'First Trial', branchFactor: 2.0, duration: 0.15, converge: false },
        { name: 'Waypoint', branchFactor: 0.4, duration: 0.05, converge: true, attractor: true },
        { name: 'Deepening', branchFactor: 2.2, duration: 0.2, converge: false },
        { name: 'Ordeal', branchFactor: 0.3, duration: 0.05, converge: true, attractor: true },
        { name: 'Final Push', branchFactor: 1.8, duration: 0.2, converge: false },
        { name: 'Arrival', branchFactor: 0.5, duration: 0.25, converge: true, attractor: true }
      ]
    }
  },
  {
    id: 'voyage',
    name: 'Voyage and Return',
    description: 'Symmetric graph: expand out from origin, mirror-converge back',
    topology: 'origin -> expansion -> far point -> contraction -> origin-echo',
    color: '#c0a030',
    pattern: {
      phases: [
        { name: 'Home', branchFactor: 0.8, duration: 0.1, converge: true },
        { name: 'Departure', branchFactor: 2.0, duration: 0.2, converge: false },
        { name: 'Strange Land', branchFactor: 2.5, duration: 0.2, converge: false },
        { name: 'Turning Point', branchFactor: 0.3, duration: 0.05, converge: true, attractor: true },
        { name: 'Return Journey', branchFactor: 1.5, duration: 0.2, converge: false },
        { name: 'Homecoming', branchFactor: 0.5, duration: 0.25, converge: true, attractor: true }
      ]
    }
  },
  {
    id: 'comedy',
    name: 'Comedy',
    description: 'Branches tangle and cross chaotically, then untangle into convergence',
    topology: 'order -> chaos (high cross-links) -> untangling -> harmony',
    color: '#e0c050',
    pattern: {
      phases: [
        { name: 'Initial Order', branchFactor: 1.2, duration: 0.15, converge: false },
        { name: 'Confusion', branchFactor: 2.5, duration: 0.3, converge: false, crossLinks: 0.3 },
        { name: 'Darkest Muddle', branchFactor: 1.0, duration: 0.1, converge: false, crossLinks: 0.4, attractor: true },
        { name: 'Untangling', branchFactor: 0.8, duration: 0.2, converge: true },
        { name: 'Harmony', branchFactor: 0.5, duration: 0.25, converge: true, attractor: true }
      ]
    }
  },
  {
    id: 'tragedy',
    name: 'Tragedy',
    description: 'Branches expand promisingly, then systematically close down to single terminal',
    topology: 'rise -> peak expansion -> progressive narrowing -> terminal node',
    color: '#a040a0',
    pattern: {
      phases: [
        { name: 'Temptation', branchFactor: 1.5, duration: 0.15, converge: false },
        { name: 'Dream Stage', branchFactor: 2.5, duration: 0.25, converge: false },
        { name: 'Frustration', branchFactor: 1.5, duration: 0.2, converge: false, attractor: true },
        { name: 'Nightmare', branchFactor: 0.6, duration: 0.2, converge: true },
        { name: 'Destruction', branchFactor: 0.2, duration: 0.2, converge: true, attractor: true }
      ]
    }
  },
  {
    id: 'rebirth',
    name: 'Rebirth',
    description: 'Contraction to near-death bottleneck, then explosive re-branching',
    topology: 'normal -> constriction -> near-zero bottleneck -> explosive expansion',
    color: '#40c0c0',
    pattern: {
      phases: [
        { name: 'Living Death', branchFactor: 1.0, duration: 0.2, converge: false },
        { name: 'Constriction', branchFactor: 0.4, duration: 0.2, converge: true },
        { name: 'Dark Point', branchFactor: 0.2, duration: 0.1, converge: true, attractor: true },
        { name: 'Miraculous Release', branchFactor: 3.0, duration: 0.2, converge: false },
        { name: 'New Life', branchFactor: 2.0, duration: 0.3, converge: false, attractor: true }
      ]
    }
  }
];

// Apply a story archetype to shape graph generation
class StoryShaper {
  constructor(archetype) {
    this.archetype = archetype;
    this.phases = archetype.pattern.phases;
    // Pre-compute phase boundaries
    let cumulative = 0;
    this.phaseBoundaries = this.phases.map(p => {
      const start = cumulative;
      cumulative += p.duration;
      return { start, end: cumulative, phase: p };
    });
  }

  // Get the branching parameters for a given normalized depth (0-1)
  getParamsAtDepth(normalizedDepth) {
    for (const boundary of this.phaseBoundaries) {
      if (normalizedDepth >= boundary.start && normalizedDepth < boundary.end) {
        return {
          branchFactor: boundary.phase.branchFactor,
          converge: boundary.phase.converge,
          isAttractor: boundary.phase.attractor || false,
          crossLinks: boundary.phase.crossLinks || 0,
          phaseName: boundary.phase.name
        };
      }
    }
    // Past end - use last phase
    const last = this.phases[this.phases.length - 1];
    return {
      branchFactor: last.branchFactor,
      converge: last.converge,
      isAttractor: false,
      crossLinks: 0,
      phaseName: last.name
    };
  }

  // Get current phase name at depth
  getPhaseAt(normalizedDepth) {
    return this.getParamsAtDepth(normalizedDepth).phaseName;
  }
}

// Get archetype by id
function getStoryArchetype(id) {
  return STORY_ARCHETYPES.find(a => a.id === id);
}

window.STORY_ARCHETYPES = STORY_ARCHETYPES;
window.StoryShaper = StoryShaper;
window.getStoryArchetype = getStoryArchetype;
