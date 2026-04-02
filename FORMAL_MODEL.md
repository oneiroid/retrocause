# Retrocause: Formal Model (Draft 2)

A consistent formalization of the retrocause framework.
Each section builds on the previous. Claims are numbered for reference.
Internal tensions are flagged, not hidden.

---

## 1. Axioms

**A1 (Existence).** There exists an infinite directed acyclic graph G = (V, E), where V is the set of events and E encodes direct causation. G is pre-existing and complete -- it does not grow, evolve, or change.

**A2 (Structure).** G is not arbitrary. At each node v, the set of outgoing edges E+(v) is constrained by v's local neighborhood (ancestors, siblings). Not all conceivable continuations exist. This constraint is what we call "physical law" -- not a separate entity governing G, but a description of G's regularity.

**A3 (Self-similarity).** G has fractal structure: the same topological motifs appear at micro and macro scales. The distribution of local patterns at scale s is the same as at scale ks for any k. This self-similarity constitutes the "eternal melody."

**A4 (Convergence).** G contains convergence nodes -- nodes with in-degree >> 1, where multiple independent directed paths merge. These nodes are topologically real features of G. Their existence means that branches are not independent: paths sharing a downstream convergence node are mutually constrained.

**A5 (Acyclicity as causation).** G is acyclic. This is not an empirical claim but a definitional one: "causation" means the partial ordering defined by directed paths in G. If cycles existed, the nodes in the cycle would lack causal ordering, and "cause" would lose its meaning. What appears as retrocausation is structural constraint from convergence nodes (A4), not temporal reversal.

**A6 (Perception primacy).** The only epistemically direct access to G is through traversal. All claims about G's structure must in principle be traceable to what traversing agents observe. This is the epistemic anchor -- we build the ontology FROM perception, not from assumed first principles.

---

## 2. Derived Concepts

### 2.1 Time

**D1.** For a traversing agent following path P = (v_0, v_1, ..., v_k), the time at position v_k is k (the path length from origin to current position). Time is a property of a specific path, not of G itself.

**Consequence 1:** There is no global time. "Simultaneity" is undefined in G. Two events can only be temporally compared if they lie on the same path or have a common ancestor/descendant.

**Consequence 2:** "Before" and "after" are path-relative. Event u is "before" event w only if u appears earlier on some traversal path. In G's own structure, the relation is ancestor/descendant (reachability), not temporal.

### 2.2 Space

**D2.** Space is a perceptual coordinate system constructed by a mind-cursor to compare branches. When multiple directed paths emanate from a shared ancestor or converge to a shared descendant, the mind needs a way to represent them "side by side." Spatial dimensions are the minimum needed to embed the local branching structure for comparison without edge-crossings.

**Conjecture C1:** Three spatial dimensions = the minimum embedding dimension required for the typical local branching complexity of G. The out-degree distribution of G determines how many dimensions are needed.

**Informal:** We don't perceive distance -- we perceive causal chains. Riding a bus for 20 minutes = traversing a chain of events. "20 km" is lossy compression of that chain into a spatial coordinate. We invented space to unfold branches; the branches are real, the space is the unfolding.

### 2.3 Mind

**D3.** A mind-cursor is a traversal of G: an agent following a directed path P = (v_0, v_1, v_2, ...) equipped with:
- A **bandwidth** epsilon > 0: features of G with scale < epsilon are imperceptible
- A **position** v_k: the current node
- An **agency function** sigma: at each branch point, sigma selects which outgoing edge to follow

**Note on ontological status:** D3 does not say what a mind IS -- only what it DOES. A mind traverses, filters by bandwidth, and selects at branch points. Whether the mind is identical to the path it produces, or is something separate that follows the path, is left open. (See Tension T1 below.)

**D4.** The "present" for a mind at position v_k is v_k itself -- the unique position where the past (the traversed path v_0...v_k) is determined and the future (the downstream subgraph) is multiple. If v_k has out-degree > 1, the mind is at a branch point (saddle point in local topology). If out-degree = 1, the mind is on a determined segment between branch points.

### 2.4 Meaning

**D5.** The meaning of an event v is M(v) = sum over convergence structures C_i passing through v, weighted by the persistence (scale) of each C_i.

**Informal:** An event that participates in many large-scale convergence patterns is "more meaningful" than an event on an unbranched chain. A letter has some meaning; the same letter at the junction of multiple storylines has more. Meaning is not subjective (it depends on G's topology, not on who is traversing) but it IS scale-dependent (meaning at scale s may differ from meaning at scale s').

### 2.5 Story

**D6.** A story is a subgraph S of G with the following structure: there exist regions R_source and R_target such that S consists of multiple directed paths from R_source to R_target, passing through shared convergence nodes. The paths represent alternative causal routes through the same "situation."

**D7.** A story archetype is an equivalence class [S] of stories under topological equivalence: two stories are of the same archetype if their branching-convergence patterns are homeomorphic (same qualitative shape of splitting, merging, and path relationships, regardless of size or specific content).

**Claim C2:** The number of topologically distinct archetypes |{[S]}| is small, finite, and determined by axioms A2-A5 alone. However, the number of archetypes PERCEIVED by a specific mind-form may differ -- filtered by bandwidth epsilon and cognitive architecture. Booker's 7, Vonnegut's 6, Campbell's monomyth are human projections of |{[S]}|, not necessarily |{[S]}| itself.

### 2.6 Free Will

**D8.** Free will is the agency function sigma from D3: the process by which a mind selects among outgoing edges at branch points. The selection is constrained by attractor structure -- downstream convergence nodes limit which branches are reachable, so the effective choice set at any branch point is smaller than the full out-degree.

**Two interpretations, both compatible with G being static:**
- **Deterministic:** sigma is determined by G's structure. The selection is encoded in the graph; the experience of "choosing" is an artifact of the narrow bandwidth (the mind can't see that the path is already determined).
- **Libertarian:** sigma operates from outside G in some sense. This creates tension with A1 (G is complete), suggesting that if free will is real, G may not be fully self-contained.

---

## 3. The Central Claim: Why Few Archetypes?

### 3.1 The Question

If G is infinite and structurally rich, why should the number of fundamentally distinct convergence patterns be small? This is the framework's most distinctive structural prediction.

Note: the question is NOT "why exactly 7?" The specific counts from Booker (~7), Vonnegut (~6), or Campbell (1 monomyth) are human projections -- what human minds with human-scale bandwidth and human language perceive. The structural question is: why is |{[S]}| finite and small at all? A different form of mind might perceive a different subset of |{[S]}|, or slice it along different joints into a different count.

### 3.2 What the Mechanism Is NOT

**Not selection/die-off.** In biology, few species survive because competitors are eliminated. This requires a dynamic process -- things "happening" over time. But G is static (A1). All branches exist. Nothing dies. Competitive exclusion makes attractor structure VISIBLE in ecological data (it's a window into G's convergence structure), but it doesn't CREATE that structure.

**Not cultural convention.** Independent cultures produce the same archetypes. (Empirical observation.)

**Not purely cognitive limitation.** If humans could only distinguish ~7 categories (Miller's 7+-2), this would explain why we SEE ~7, but not why the underlying count is small. The claim has two layers: (1) the structural count |{[S]}| is small -- this is about G's topology; (2) the human-perceived count (~7) is one projection of |{[S]}| -- a different mind-form might count differently. Layer 1 is the core prediction. Layer 2 is the caveat that Booker/Vonnegut/Campbell are data about human perception, not direct measurements of |{[S]}|.

### 3.3 Candidate Mechanisms

**M1: Combinatorial classification of convergence-divergence patterns.**

The most promising approach. Consider a node v with in-degree C (convergence) and out-degree B (subsequent divergence). The "local story pattern" at v is determined by:
- How many paths arrive (C)
- How they relate to each other (shared history? independent origins?)
- How many paths depart (B)
- How arrivals map to departures (which incoming paths connect to which outgoing paths)

With bounded B and C (axiom A2 -- branching is constrained), the number of topologically distinct local patterns is finite: bounded by the number of non-isomorphic bipartite graphs on C + B nodes, modulo structural equivalences.

The archetypes would then be the small number of distinct COMPOSITIONS of these local patterns -- the ways local convergence-divergence motifs chain together at the story scale. The key insight: composition is much more constrained than combination. Not every sequence of local patterns is globally consistent (some combinations create cycles, violating A5; some create disconnections, failing to form a coherent story).

**Status:** This is the mechanism most likely to yield a proof. The bound would come from enumerating consistent compositions of bounded-degree convergence-divergence motifs in a DAG. This is a combinatorics problem with known techniques (species theory, pattern-avoiding permutations, graph grammar enumeration).

**M2: Self-similarity as scale-invariant pattern count.**

If G is self-similar (A3), then any structural property measurable at scale s must have the same value at scale ks. In particular, the number of distinct convergence patterns at scale s = the number at scale ks. A scale-invariant finite quantity is a topological invariant. Therefore: the archetype count is a fixed number, the same at every scale.

**Status:** This tells us the count is fixed but doesn't compute it. It's a constraint, not a derivation. It also assumes that "number of distinct convergence patterns" is a well-defined scale-invariant quantity, which needs proof.

**M3: NK network analogy (structural attractor count).**

In Kauffman's random Boolean networks with N nodes and K connections per node, the number of dynamical attractors is ~sqrt(N). The count comes from structural connectivity alone, without selection.

**Status:** The analogy is suggestive but imprecise. NK networks are DYNAMIC (states evolve on a fixed topology). G is static. The NK analog would be: the number of distinct topological convergence basins in a random DAG with bounded degree K is sub-linear in graph size. This is a well-posed mathematical question that could be answered computationally if not analytically. But "attractor" in NK means "dynamical fixed point," which doesn't directly map to "convergence node" in G.

---

## 4. Observable Domains as Windows

We cannot observe G directly (A6). We observe projections through specific domains. Each domain reveals some aspect of G and distorts others.

The crucial insight: domains where convergence structure is VISIBLE (ecology, markets) are those with internal dynamics that differentiate branches -- typically through elimination. The elimination is the visibility mechanism, not the generative mechanism. We see the structure BECAUSE things die, not because dying creates the structure.

| Domain | What it reveals | Why it's visible | Distortion |
|--------|----------------|------------------|------------|
| Narrative | Traversal paths of mind-cursors | Language compresses traversals into transmissible form | Shows only the experienced chain, not the branching structure (the two-graphs problem) |
| Ecology | Convergence patterns (few species = few basins) | Competitive exclusion eliminates non-converging branches | Die-off dynamics are domain-specific overlay |
| Gene regulation | Constrained branching (NK-like local structure) | Cell differentiation makes branch choices irreversible | Scale may be too small for archetype-level patterns |
| Markets | Convergence under competition | Bankruptcy eliminates non-converging strategies | Heavily influenced by reflexive human agency |
| Physics | Local causal regularity (law-like behavior) | Repeatability of experiments | Extremely fine-grained; archetype structure is invisible like seeing atoms but not molecules |

---

## 5. Language and Substrate

### 5.1 The Substrate Sequence

atoms -> molecules -> cells -> organisms -> language -> [?]

Each level is not an "invention" by the previous one but what the previous level was FOR. Organisms are the substrate language required; language is the substrate [?] requires. (Same inversion as section 2.5: it's not "brains produce language," it's "language grew brains to propagate itself.")

### 5.2 The Archetype Count: Structural vs. Perceived

The framework's claim has two layers:

**Layer 1 (structural):** |{[S]}| -- the number of topologically distinct convergence patterns in G -- is small and finite. This is a property of G (axioms A2-A5), independent of any observer.

**Layer 2 (perceptual):** Any specific mind-form perceives a SUBSET of |{[S]}|, filtered through its bandwidth, cognitive architecture, and language. Booker's 7, Vonnegut's 6, Campbell's monomyth are human perceptions of |{[S]}|. A mind with wider bandwidth might perceive finer distinctions; a mind with alien architecture might slice along different joints; a collective mind might perceive patterns too large for individuals.

**Consequence:** The human catalog of archetypes is data about human perception of G's topology, not a direct measurement of |{[S]}|. It tells us |{[S]}| >= ~7 (humans perceive at least this many), but not the exact structural count.

**What would distinguish the layers:**
- If the same small count appears in non-narrative, non-human domains: evidence for Layer 1
- If different mind-forms (AI, collective) perceive different counts: evidence that human ~7 is partly Layer 2
- If |{[S]}| turns out to be provably small from graph theory: Layer 1 confirmed regardless of empirical data

---

## 6. Internal Tensions

### T1: What Traverses a Static Graph?

G is static and complete (A1). Yet mind-cursors "traverse" it (D3), implying a process, a sequence, something dynamic. This is the framework's deepest tension.

**Resolution attempts:**
(a) **Identity view:** The mind IS the path. The sequential experience is what it's like to be a directed path in G. Nothing moves -- the path exists statically, and "traversal" is how paths experience their own existence. (Problem: what distinguishes a path that is "experienced" from one that isn't? All paths exist.)
(b) **Indexical view:** "Traversal" is not a process but a perspectival fact. At position v_k, the path v_0...v_k is "past" and the downstream subgraph is "future" -- not because anything happened, but because this is the indexical structure at v_k. (Problem: this is essentially the block universe view, which is well-known but doesn't explain why there is an experience of traversal at all.)
(c) **Dual-aspect view:** G has two aspects -- its static structure AND the experiential quality of being a path in it. These are not reducible to each other. (Problem: this is essentially property dualism, which many find unsatisfying.)

**Current position:** We acknowledge the tension without resolving it. The framework is productive even with this gap, in the same way that quantum mechanics is productive without a resolution to the measurement problem.

### T2: Retrocausation and Acyclicity

The framework is called "retrocause" but assumes a DAG (no causal loops). Apparent retrocausation = structural constraint from convergence nodes: a future attractor constraining present branches looks like backward causation but is really forward-looking structural constraint in a static graph.

But this redefines retrocausation so thoroughly that the word might be misleading. In the framework, there IS no "backward" -- there is convergence in a graph that has no temporal direction (time being path-relative, D1). What people call retrocausation is the mind-cursor's experience of being constrained by a convergence node it hasn't reached yet: feeling "pulled" toward a future event. In graph terms: the branches available at the current node are filtered by which convergence nodes are reachable, and the mind doesn't know this until it arrives.

---

## 7. Falsifiable Predictions

Ordered from strongest to weakest. Stronger predictions risk more but would be more convincing if confirmed.

**P1 (Strong).** A sufficiently large real-world causal graph from a non-narrative domain (gene regulatory network, ecological food web, economic input-output network) will have a small number of dominant convergence structures, and some of their topological patterns will be recognizable as story archetypes -- not because stories were projected onto them, but because both are projections of the same structural features of G.

**P2 (Medium).** Across multiple domains (ecology, gene regulation, markets), the number of stable convergence basins is small, bounded, and approximately invariant to system size. The counts need not be identical across domains (each domain is a different projection of G), but all should be small (single digits, not hundreds).

**P3 (Testable now).** In large causal graphs with constrained branching (bounded out-degree) and convergence (some high-in-degree nodes), the number of topologically distinct convergence-divergence motifs at the story scale (spanning ~10-50 nodes) is small and bounded, independent of graph size. This is a pure graph theory prediction testable by computational enumeration.

**P4 (Weak).** Story-structured causal graphs have measurably different topology from random graphs with the same degree distribution. (Partially tested -- betweenness gap on hand-crafted graphs. Not yet confirmed on real data.)

---

## 8. Key Distinctions

1. **G vs. projections of G.** The base graph vs. what we observe. Never conflate.
2. **Static existence vs. dynamic process.** G doesn't evolve. "Happening" is traversal, not change. (But see T1.)
3. **Structure graph vs. traversal graph.** The full branching topology of a situation vs. the single path a mind takes through it. Extracting "story graphs" from narratives gives traversal graphs, not structure graphs.
4. **Visibility mechanism vs. generative mechanism.** Die-off makes convergence structure observable in ecology. Die-off does not create convergence structure in G.
5. **Topological pattern vs. narrative content.** An archetype is an equivalence class of branching-convergence topologies, not a specific story with specific characters.
6. **Path-relative vs. graph-absolute.** Time, "before/after," and "happening" are path-relative. Topology, convergence, and meaning are graph-absolute.
