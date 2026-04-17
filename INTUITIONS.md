# Retrocause: Collected Intuitions and Statements

All valuable ideas, insights, and philosophical positions gathered across the collaboration.
Organized by theme, not chronologically. Each item is a substantive claim or insight,
not a status report.

---

## I. Core Ontology

### 1. The Graph IS Reality
Base reality is an infinite, self-similar, pre-existing causality DAG. It doesn't "grow" or evolve -- it IS, in its whole infinity. Events don't "happen" -- they exist. "Happening" is the mind-cursor's experience of traversal. There is no process of construction; the graph is eternal and complete.

This is not a model. Models represent something else. G is not representing anything -- it IS the thing. When we say "the causality graph," we mean the actual ontological substrate, the way a materialist means "atoms" or an idealist means "consciousness."

### 2. Events Are Atomic but Low-Meaning
Events are nodes -- individually as meaningless as individual letters. Meaning lives entirely in relational structure: how events connect, what patterns they form, what topological features they participate in. An isolated event is ontologically real but semantically empty.

## VIII. Computation, Prediction, and Interestingness

### 32. Minds Are DAG Simulators (and So Are Their Substrates)
Biological neural networks are not strictly DAGs — cortex is heavily recurrent, with feedback at every scale. But the computation a mind performs at any given moment unrolls to a DAG: the computation graph is acyclic even when the underlying wiring has loops. Artificial neural networks make this explicit — feedforward nets are literal DAGs, and RNNs/transformers are DAGs per forward pass once unrolled in time.

This points to a structural homology: the thing doing the simulating shares topology with the thing being simulated. Minds are DAG-shaped processes embedded in a DAG-shaped substrate, and their primary operation is running forward-simulations of local subDAGs from the current position of the mind-cursor.

Conjecture: brains evolved specifically as devices for simulating the subDAG downstream of the mind-cursor's current node — and, crucially, for simulating what other mind-cursors will do in the next N steps through G. The recurrence in biological wiring is the implementation detail; the computation is always a forward-DAG-rollout. This explains why attention, working memory, and planning horizons are all bandwidth-limited in the same characteristic way: they are instances of the same underlying operation — unrolling a local subDAG to a bounded depth from the cursor's position.

### 33. Interestingness as Mutual Predictive Entanglement
"Meaning," "interestingness," and "what is worth talking or thinking about" emerge under a specific structural condition: multiple entities are simulating each other's forward-rollouts, and each entity's path selection non-trivially depends on the other's predictions.

Refinement: the sand-pile vs human contrast shows that the distinction is one of predictive depth, not kind. The sand pile is a trivially shallow predictor; humans are deeper predictors of other agents. A subDAG S of G registers as a story when it contains at least two entities whose forward-simulations of each other are non-trivial — each entity's chosen edge depends on its model of the other, which in turn depends on its model of the first, and so on.

This nesting (simulation-of-simulation) raises practical questions:
- How deep should nesting go? Presumably until predictions stabilize (a fixed-point criterion).
- How does an entity distinguish its own reasoning from its simulation of another's reasoning? There must be scoping or tagging mechanisms in the substrate.
- What if nesting diverges? Mutual paranoia or arms races may themselves be signatures of interestingness.

Refinement: strict parity of predictive power is unnecessary — dramatic irony works when the audience (a meta-level entity) knows more than a character. The minimal condition is non-trivial mutual modeling: neither side's model collapses to certainty, and each side's path selection materially depends on the other's anticipated moves.

Effect on path count: mutual-predictive-entanglement is a selection principle on G. Not all subDAGs are stories — only those satisfying the mutual-modeling condition. This should prune the space of narratively possible paths dramatically; most of G is not narrative.

Predicted observable: story-worthy subDAGs should show high mutual information between entity trajectories conditional on each entity's internal model of the other. This is measurable in multi-agent simulations and provides an empirical handle on the framework.

### 34. Predictive Reach Over Others: The Real Metric
The substrate sequence (atoms → molecules → cells → organisms → language) can be read as a ladder of prediction capability, but self-persistence is only the floor. The key metric is how many DAG steps ahead an entity E can correctly predict other entities' actions — its predictive reach.

Self-persistence is necessary but not sufficient for interestingness. The sand pile persists but predicts little about agents; humans persist less but predict a lot about other humans. The threshold conjecture: Depth 1 (predicting others one step ahead) is trivial; Depth 2 is often degenerate; Depth 3 is the first nontrivial threshold where modeling others generally becomes substantially harder and requires dedicated machinery.

Reasons why "3" recurs:
- The three-body problem exhibits chaos while two-body is solvable.
- Three is the minimum dimension for many nontrivial topological phenomena.
- Branching factor 3 enables genuinely exponential tree growth beyond degenerate binary cases.
- It matches our observed number of spatial dimensions (an open connection).

Conjecture: these are related structural facts — other-prediction-depth ≈ 3 is where mind-like modeling emerges and story-space opens.

### 35. Predictive Surplus and Self-Multiplication
When an entity E has predictive surplus (it can predict its environment better than the environment can resist), the cheapest available move is self-multiplication: produce copies. Copies are similar to E and thus hardest for E to predict, making them ideal sources of rich mutual-predictive-entanglement.

This process is gradual: reproduction begins as soon as any surplus exists, matching biological observation. Copies become primary objects of prediction — similar enough for deep modeling, different enough to preserve uncertainty.

Formal restatement: let R(E) be E's predictive reach. Self-multiplication begins when R(E) exceeds copying cost. Copies E_1..E_k will have high template overlap with E, small parametric differences, and satisfy mutual-modeling conditions that enrich the predictive environment. This creates a continuous gradient: as predictive reach grows, self-multiplication increases and the predictive field becomes richer.

Connection to substrates and archetypes: each substrate level has its mode of self-multiplication (molecules, cells, organisms, minds, culture), and the small number of archetypes may correspond to a small number of distinct self-multiplication modes under the branching constraints of G.

- "Insight" = sudden decrease in epsilon that reveals previously invisible structure

### 16. Coincidence Density as Navigation Signal
Does consciousness have non-inferential (direct) access to causal phase space structure? Near attractors, the density of converging paths increases. Multiple independent causal chains start pointing the same way. This might be perceptible as "coincidence density" -- the sense that unrelated events are aligning.

If real, this would explain intuition, premonition, the "something's about to happen" sense -- not as mystical but as legitimate perception of increasing convergence density in the local graph neighborhood. The mind detects that many branches are funneling, even without knowing the destination.

Mechanism unknown. Could be spurious (pattern-matching bias). But worth noting because the framework predicts it: near convergence nodes, ANY traversal path should encounter more "related" events per unit time.

### 17. Present as Saddle Point
"Now" is 0-dimensional in time, yet the only place where trajectories diverge. Not a singularity (infinite curvature) but a saddle point -- where paths split onto different slopes simultaneously. In graph terms: a branch point IS a saddle in local topology.

The mind-cursor sits at saddle points, experiencing the moment of divergence. The past (traversed path) is fixed; the future (downstream branches) is multiple. This topological characterization gives "now" a precise non-mystical definition.

### 18. Free Will as Constrained Path Choice
At each branch point, the mind-cursor follows one outgoing edge. "Free will" = this selection process. But the selection is constrained by attractor basins -- the convergence nodes downstream limit which branches are reachable.

Full determinism: the selection is determined by G's structure, and the experience of "choosing" is an illusion of the narrow read-head. Full libertarian free will: the mind genuinely selects among available edges. The framework is agnostic between these -- both are compatible with G being static. In the deterministic case, the "choice" was always encoded in G. In the libertarian case, the mind is somehow outside G, which creates problems for A1.

---

## IV. Graph Structure and Constraints

### 19. Constrained Branching
Not all possible outcomes exist at each node. "Lighting a match never results in supernova." The graph has structure -- branching is not uniform or unconstrained. This is crucial: G isn't a complete tree of all conceivable continuations. It's a structured object with specific topology.

What constrains it? In the framework, the constraints ARE G's structure -- there is no separate "law of physics" constraining an otherwise unconstrained graph. The regularity IS the graph. Asking "why these constraints?" is asking "why does G have this topology?" which is the deepest question (see the "eternal melody" open question).

### 20. Why Few Attractors? The Central Mystery
The small number of dominant convergence patterns (~7 archetypes) does NOT emerge from:

**Not selection/die-off.** In biology and ecology, few species survive because competitors are eliminated. This is a dynamic process -- things "happen" over time. But G is static and pre-existing. All branches exist. Nothing dies. Die-off is a feature of specific observable domains (ecology, evolution) -- domains where we CAN observe parallel branches precisely because elimination makes differences visible there. But the visibility mechanism is not the generative mechanism.

**Not cultural convention.** If archetypes were cultural, independent cultures would produce different sets. They don't.

The small count must emerge from the topology of G itself. This is the central unsolved problem of the framework: what structural property of a constrained, convergent, self-similar DAG forces its large-scale convergence patterns into a small finite number of equivalence classes?

### 21. The Two Graphs: Structure vs. Traversal
There are two completely different objects that can both be called "the story's graph":

(a) **The structure graph**: the subgraph of G containing all branches, convergences, and alternatives relevant to a narrative situation. This is the reality.
(b) **The traversal graph**: the single path a mind-cursor actually follows through that structure. This is the experience.

Extracting a "story graph" from a narrative always gives (b), not (a). Testing whether (b) is chain-like tests whether mind-cursors traverse sequentially -- which is trivially true by definition. The real test would require reconstructing (a) from multiple (b)'s, or finding a domain where (a) is directly observable.

This confusion -- using (b) when we meant (a) -- is the concept drift that corrupted our experimental work. The meaning of "directed graph" silently shifted from (a) to (b) without anyone flagging the substitution.

---

## V. Language, Evolution, and Substrate

### 22. The Substrate Sequence
Evolution produces increasingly capable substrates, each serving the next level:

atoms -> molecules -> cells -> organisms -> language -> [?]

Each level is not an "invention" by the previous one -- it's what the previous level was FOR. Organisms didn't invent language; organisms are the substrate that language required to propagate. (Same inversion as #7: it's not "brains produce language," it's "language needed brains.")

### 23. Language as the Narrative Interface
Stories exist as topological features of G regardless of whether any mind perceives them. But language transforms what minds can do with stories:
- **Transmission**: compress a traversal path into symbols another mind can decompress
- **Comparison**: juxtapose different traversals to detect common structure
- **Abstraction**: name the common structures (archetypes), enabling meta-narrative reasoning
- **Composition**: combine archetypes into new stories, exploring G's topology indirectly

Without language, minds traverse and experience. With language, minds can MAP. The transition from experiencing stories to mapping them is as significant as the transition from sensing to thinking.

### 24. The Archetype Count: What Is Fixed, What Is Mind-Dependent?
The framework makes a layered claim:

**What is structural (mind-independent):** The number of topologically distinct convergence patterns in G is small and finite. This follows from constrained branching + convergence + self-similarity. A graph with these properties cannot support an unlimited number of qualitatively different large-scale patterns.

**What is mind-dependent:** Which patterns a specific mind-form perceives, how it categorizes them, and therefore how many "archetypes" it counts. Booker's 7, Vonnegut's 6, Campbell's 1 -- these are human projections. A mind with wider bandwidth (lower epsilon) might see finer distinctions. A mind with different cognitive architecture might carve the topology along entirely different joints. A collective mind might perceive patterns too large for individual minds.

**What is genuinely open:** Whether the human count (~7) happens to match the structural count, or is significantly smaller. If the structural count is, say, 50, and humans see 7 because of cognitive limits, that's interesting but less dramatic than if the count really is ~7 for topological reasons and human minds are tuned to detect exactly what's there.

The strongest test: find convergence patterns in non-narrative, non-human domains (ecology, gene networks) and check whether the count is similar to ~7 or systematically different.

### 25. What Comes After Language?
If language is a substrate, what is it substrate FOR? The substrate sequence (atoms -> ... -> language) suggests something is being built on top of language. Candidates:
- Collective intelligence (language enables coordination beyond individual minds)
- Formal mathematics (language enables structures that language itself can't express)
- Machine cognition (language enables the construction of non-biological minds)
- Something genuinely unnameable from our current position

The framework doesn't answer this but it frames the question precisely: what topological features of G become visible (persistence > epsilon) only through the lens of whatever comes after language?

---

## VI. Methodological Lessons

### 26. The Projection Problem
We cannot directly access G. Everything we observe is already projected through perception (and, for communicable observations, through language). Any empirical test of the framework must work with projections and infer properties of G indirectly -- the way cosmology infers properties of the early universe from the CMB, or the way we infer 3D structure from 2D retinal images.

This is not a flaw -- it's the fundamental epistemic situation. The framework acknowledges it as axiom A5. But it means that every "test" is really testing a projection of the prediction, not the prediction itself.

### 27. Sand Castle Problem
Hand-crafted graphs embed the researcher's assumptions. Finding structure in a graph you designed to have that structure is circular. This invalidated our toy (12-node) and scale-up (150-node) experiments -- the "signals" we found (betweenness gap, directed forks) were partly artifacts of design.

Real tests require graphs from external sources where the structure (if it exists) was not put there by the experimenter.

### 28. The Observable-Domain Insight
Why do some domains (ecology, gene networks, markets) show clear convergence patterns while others don't? Not because those domains are "more structured" -- but because their internal dynamics make branch differences VISIBLE.

In ecology: species compete, losers go extinct, survivors mark the attractor basins.
In markets: firms compete, losers go bankrupt, survivors mark the equilibria.
In physics: all branches coexist (quantum superposition?), no elimination, so convergence structure is invisible at our scale.

The analogy: we see stars because they emit light. Light emission is the visibility mechanism, not the formation mechanism. Similarly, competitive exclusion is what makes attractor structure observable in ecological data, not what creates attractor structure in G.

This means: domains with die-off are WINDOWS into G's convergence structure, not MODELS of it. The die-off is incidental to the domain. The convergence structure is fundamental to G.

### 29. Vonnegut's Fortune Axis Is Wrong but Useful
Vonnegut's good-fortune/bad-fortune axis is a useful simplified projection of narrative shape. But the real coordinate system is structural/topological. Hamlet's curve is "illegible" on the fortune axis because good/bad is indeterminate at each moment -- this mirrors honest physics where the universe doesn't label its own trajectories.

This is a methodological constraint: when formalizing narrative distance or meaning, the metric must be structural (topological), not evaluative (good/bad, success/failure). The evaluative axis is how minds EXPERIENCE the topology, not the topology itself.

---

## VII. Unresolved Tensions

### 30. What Moves in a Static Graph?
If G is pre-existing, complete, and static (Intuition #1), what does it mean for a mind to "traverse" it? Traversal implies a process, a sequence, something changing. But nothing changes in G.

Possible resolutions:
(a) The traversal IS the path. The mind doesn't move along it -- the mind IS it. The sequential experience is what it's like to be a path in G, not a process applied to a path.
(b) Traversal happens in a meta-level not captured by G. Minds operate "outside" the graph in some sense.
(c) The static/dynamic distinction is a human conceptual artifact that doesn't apply at this level. G is both -- the way a block universe in physics is both "all times exist" and "we experience time."

This is the deepest philosophical tension in the framework and we haven't resolved it.

### 31. Is G a DAG? Why No Causal Loops?
We assumed acyclicity (directed ACYCLIC graph). This means no causal loops -- no event can be among its own causes. This is non-trivial. If time is just an event counter (Intuition #4), what prevents loops? The answer might be: acyclicity IS what we mean by causation. If loops existed, the nodes in the loop wouldn't have a causal ordering, and "cause" would lose its meaning. Acyclicity is definitional, not contingent.

But: if G contains ALL events, including apparently retrocausal phenomena (the name "retrocause" itself!), does this conflict with acyclicity? Perhaps what looks like retrocausation is really convergence: a future attractor constraining present branches, which looks like backward causation but is really just structural constraint in a static graph.

---

## VIII. Computation, Prediction, and Interestingness

### 32. Minds Are DAG Simulators (and So Are Their Substrates)
Biological neural networks are not strictly DAGs -- cortex is heavily recurrent, with feedback at every scale. But the *computation* a mind performs at any given moment unrolls to a DAG: the computation graph is acyclic even when the underlying wiring has loops. Artificial NNs make this explicit -- feedforward networks are literal DAGs, and RNNs / transformers are DAGs per forward pass once unrolled in time.

This points to a structural homology: the thing doing the simulating shares topology with the thing being simulated. Minds are not arbitrary computing devices that happen to process G -- they are DAG-shaped processes embedded in a DAG-shaped substrate, and their primary operation is running forward-simulations of local subDAGs from the current position of the mind-cursor.

Conjecture: brains evolved specifically as devices for simulating the subDAG downstream of the mind-cursor's current node -- and, crucially, for simulating what *other* mind-cursors will do in the next N steps through G. The recurrence in biological wiring is the implementation detail; the computation is always a forward-DAG-rollout. This also explains why attention, working memory, and planning horizons are all bandwidth-limited in the same characteristic way: they are all instances of the same underlying operation -- unrolling a local subDAG to a bounded depth from the cursor's position.

### 33. Interestingness as Mutual Predictive Entanglement
"Meaning," "interestingness," "what is worth talking or thinking about" -- these emerge under a specific structural condition: *multiple mind-cursors are simulating each other's forward-rollouts, and each one's path selection non-trivially depends on the other's predictions*.

The sand-pile-versus-human contrast makes this vivid -- but see #34 for the important refinement: the sand pile is not a *non*-predictor, it is a *trivially shallow* predictor. The real contrast is one of predictive depth over others, not of kind. A human standing before another human, or before an animal, or before a weather system the human anthropomorphizes as agentic, *is* a story because now both sides are simulating the other's actions many steps ahead and each one's path selection materially includes the other's anticipated moves.

Stronger form: for a subDAG S of G to register as a story, S must contain at least two entities whose forward-simulations of *each other* are non-trivial. "Non-trivially" means: each entity's chosen edge depends on its model of what the other will do, which depends on its model of what the other thinks *it* will do, and so on.

This escalates rapidly. Simulation of simulation of simulation. The nesting raises real problems:
- How deep should nesting go? Presumably until predictions stabilize (a fixed-point criterion) -- each additional level stops changing the action choice.
- How does an entity distinguish its own reasoning from its simulation of another entity reasoning about it? The computational substrate is shared, so there must be some tag or scoping mechanism.
- What happens when nesting diverges instead of converging? (Mutual paranoia, arms races, instability -- these may be signatures of interestingness too, not its absence.)

**Refinement: parity is too strong.** Strict equality of predictive capability is not required -- dramatic irony works precisely because the audience (a meta-level mind-cursor) knows more than the character. The weaker and truer condition is *non-trivial mutual modeling*: neither side's model collapses to certainty, and each side's path selection materially depends on the other's anticipated moves.

**Effect on path count.** This is a selection principle on G. Not all subDAGs are stories -- only those satisfying the mutual-modeling condition. Intuitively this should prune the space of "narratively possible" paths dramatically. Most of G is not narrative. Narrative is the thin slice where mind-cursors are predictively entangled.

**What this adds to the framework.** Previously the framework said "topological features with persistence > epsilon are perceptible." That is a *bandwidth* criterion -- it tells you what a mind can see, not what is worth seeing. Mutual-predictive-entanglement is a *content* criterion: it picks out the subDAGs that deserve to be called stories, independent of which mind is looking.

**Predicted observable.** Story-worthy subDAGs should show high mutual information between entity trajectories *conditional on each entity's internal model of the other*. This is in principle measurable in multi-agent simulations and might give the framework its first non-tautological empirical handle.

### 34. Predictive Reach Over Others: The Real Metric
The substrate sequence in #22 (atoms -> molecules -> cells -> organisms -> language) has been described as a persistence ladder -- how long a pattern holds its shape against dispersion. But self-persistence is just the *floor*. The load-bearing quantity is **how many DAG steps ahead can entity E correctly predict what other entities will do**.

Self-persistence is a prerequisite: you can't predict others if you disperse. But the metric that drives interestingness (#33) and narrative (#35) is other-prediction depth. The sand pile persists as "sand pile" for eons but predicts nothing about the human standing on it. The human persists for fewer steps but can model the sand pile's behavior perfectly (trivial prediction) and other humans' behavior partially (non-trivial prediction, the zone where stories live).

**The threshold conjecture.** Depth 1 (predicting others one step ahead) is trivial -- mere reaction, physics. Depth 2 is still essentially degenerate: in a binary environment it collapses back. **Depth 3 is the first nontrivial threshold.** This is where prediction becomes exponentially hard:

- The three-body problem is chaotic; the two-body problem is solvable in closed form.
- Three is the minimum dimension for knots, for non-planar graph embeddings, for most nontrivial topology.
- Branching factor 3 is where trees grow genuinely exponentially (binary trees are degenerate in many senses).
- It is also the number of spatial dimensions we perceive (Open Question #5).

Conjecture: these are not coincidences. Three is the minimum other-prediction-depth at which *modeling what others will do* becomes an operation expensive enough to require dedicated machinery -- i.e., to require something recognizable as a mind rather than mere reactive matter.

**The prediction-reach ladder.** Re-reading the substrate sequence through other-prediction depth:

- Atoms: predict nothing about others. Pure physics. No story.
- Molecules: predict the behavior of nearby atoms (bonding). Still physics.
- Cells: predict local chemistry well enough to actively maintain their boundary (Markov blanket). Minimal other-prediction; self-persistence is the main game.
- Organisms: predict enough about their *environment* to act on it. Beginning of genuine other-modeling.
- Minds: predict what *other minds* will do -- and crucially, model how other minds model them. This is where story-space opens up.
- Humans as a collective: currently out-predicting the climate (we modify planetary systems faster than they modify us). We have *already* exceeded the prediction-reach of geological processes -- which is exactly what it means to out-simulate something. If we survive, we will out-predict ecosystems, then planetary geology, then stellar evolution.

**What matters for the framework.** The interestingness condition in #33 (mutual predictive entanglement) has a floor: it only kicks in when both entities have other-prediction-depth above the nontrivial threshold. Below that threshold, you get physics. Above it, you get story. The threshold IS the boundary between dead matter and narrative.

### 35. Predictive Surplus and Self-Multiplication
When an entity E can predict its environment better than the environment can "resist" -- i.e., E has predictive surplus -- the cheapest available move is self-multiplication: produce copies of yourself. This is not a dramatic crisis or structural fracture. It is the mundane, default output of surplus capacity. The copies are the interesting thing.

**Why copies, not something else?** A copy of E is the entity most similar to E -- therefore the entity hardest for E to predict. Two copies of E are almost perfectly matched predictors, which is exactly the condition for rich mutual-predictive-entanglement (#33). Self-multiplication is the most efficient way to generate interestingness from surplus.

**This is gradual, not threshold-triggered.** Self-multiplication does not wait for prediction dominance to be achieved. It starts well before -- as soon as there is *any* surplus. This is exactly what we observe in evolution: organisms reproduce continuously, not only when they "dominate" their niche. Speciation is not a crisis response to dominance; it is an ongoing consequence of reproduction + variation + selection. The copying IS the strategy, from the beginning.

**The "boring solitude" of total dominance is never actually reached.** An entity with growing predictive reach starts producing copies long before it runs out of things to predict. The copies then become the primary objects of prediction -- similar enough to be deeply modeled, different enough to remain uncertain. By the time E *could* have dominated everything, it is surrounded by variants of itself that constitute a richer predictive environment than the original.

**The pattern at every scale:**
- Molecules that stably predict their local chemistry: the ones that also self-replicate (autocatalytic sets) are the ones that generate further complexity. The replication is not a response to "dominance" -- it is what surplus stability *does*.
- Cells with metabolic surplus: they divide. They don't wait until they've "solved" their environment. Division is the default output of having more energy than maintenance requires.
- Organisms with behavioral surplus (they can predict and survive in their niche): they reproduce, and their offspring vary. The variation creates the next generation of mutual predictors.
- Species that outcompete others: they don't sit in lonely dominance. They radiate into subspecies, filling new niches. The radiation starts before and continues through competitive success.
- Cultures with technological surplus: they don't stagnate. They proliferate schools of thought, factions, subcultures -- copies with variation, each one a new locus of mutual prediction.

**Formal restatement.** Let R(E) be entity E's predictive reach over its environment. Self-multiplication begins as soon as R(E) exceeds the cost of copying (which is low -- biological reproduction is energetically cheap relative to maintenance). The copies E_1, ..., E_k satisfy:

1. Each E_i is structurally similar to E (high template overlap)
2. Each E_i differs from E and from other E_j by small parametric variations
3. The mutual-modeling condition (#33) is richly satisfied among {E_1, ..., E_k} precisely because similarity makes deep modeling possible while variation preserves uncertainty
4. The predictive environment becomes richer, not poorer, as copies accumulate

This is NOT a cycle (competition -> dominance -> crisis -> fragmentation). It is a **continuous gradient**: as predictive reach grows, self-multiplication grows with it, and the resulting copies constitute an ever-richer field of mutual predictors.

**"The story must unfold"** restated without drama: self-multiplication is trivially available to any entity with surplus, and copies of a predictor are the best possible source of new stories. The monopoly state is not structurally forbidden -- it is simply never reached, because copying starts first.

**Connection to #22 (substrate sequence).** Each level of the substrate sequence is characterized by a new mode of self-multiplication at higher predictive reach. Molecules that replicate -> cells that divide -> organisms that reproduce -> minds that propagate through language and culture -> whatever comes next. Each level's self-multiplication creates the predictive field that the next level operates in.

**Connection to #20 (why few attractors).** The small number of archetypes may correspond to the small number of structurally distinct self-multiplication patterns. How many qualitatively different ways can an entity with surplus produce copies that become mutual predictors? If constrained by branching complexity at depth ~3, the answer might be small.

---

## IX. Open Questions



1. **The eternal melody**: Why does G have THIS self-similar structure and not some other?
2. **Archetype identification**: Which topological pattern = which named archetype?
3. **Projection mechanics**: How does projection from full graph to mind-cursor perception work mathematically?
4. **Archetype count**: Can we derive ~7 from graph constraints alone? Is 7 a property of G or of the projection?
5. **Spatial dimensions**: Why 3? (Minimum embedding dimension for G's local branching complexity?)
6. **Lyapunov-Planck bridge**: Are Planck units = epsilon_min of the universe as a dynamical system? (Deferred to when physics is in scope)
7. **Tautology escape**: Can the framework make a prediction that isn't "structured systems have structure"?
8. **After language**: What is language the substrate for?
9. **Coincidence navigation**: Is convergence-density perception a real phenomenon or pattern-matching bias?
10. **The traversal problem**: What does "traversal" mean in a static graph? (#30 above)
11. **Retrocausation and acyclicity**: How does the framework's namesake phenomenon fit with the DAG assumption? (#31 above)
12. **Nesting depth and fixed points**: When mutually-modeling mind-cursors simulate each other recursively (#33), what principle determines the nesting depth? Is there a fixed-point theorem that guarantees convergence for "interesting" subDAGs and divergence for "uninteresting" ones?
13. **Cursor self-distinction**: In a mind that simulates other minds, how is the cursor's *own* forward-rollout distinguished from its simulation of another cursor's forward-rollout? If the substrate is shared, there must be a scoping or tagging mechanism -- and whatever it is, it is probably load-bearing for the concept of self.
14. **Narrative fraction of G**: If mutual-predictability is a selection principle, what fraction of G's subDAGs satisfy it? Is "story-space" a thin manifold in G or a bulk region?
15. **The "three" conjecture**: Is other-prediction-depth 3 really the first nontrivial threshold (#34)? Can we prove that depth-2 reduces to depth-1 for arbitrary processes and that depth-3 is where prediction of others becomes generically hard? And is this the same "3" as the three-body problem, three spatial dimensions (#5), and the minimum dimension for nontrivial topology?
16. **Prediction-reach hierarchy as substrate sequence**: Is the substrate sequence (#22) literally a prediction-reach ordering (atoms < molecules < cells < minds < ...), with each level characterized by a new mode of self-multiplication (#35)?
17. **Copying threshold**: At what predictive surplus does self-multiplication become the cheapest available move (#35)? Is this threshold related to the depth-3 conjecture (#15)? In biological terms, what is the minimal metabolic surplus that makes cell division favorable?
18. **Archetypes as multiplication modes**: Does the small number of archetypes (#20) correspond to the small number of structurally distinct self-multiplication patterns? How many qualitatively different ways can a surplus-entity produce copies that become mutual predictors?
