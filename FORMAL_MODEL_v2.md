# Retrocause: Formal Model v2

## Rebase on Lessard & Levison (2013)

Grounded in the threaded-DAG formalism of "Groundhog DAG" (W13-1408).
That paper's operational machinery -- semantic expressions, subDAGs,
threading, parametrization -- replaces the prior draft's abstract
topology talk. Where the paper is unfinished (most places), we extend.
Where retrocause's ontological claims are compatible, we keep them.
Where they conflict, the paper's formalism wins.

Base narratives (Booker's 7, Vonnegut shapes, Campbell's monomyth)
are deferred -- they are empirical data points, not axioms.

---

## 0. Notation Conventions

| Symbol | Meaning |
|--------|---------|
| G | The universal DAG (all events, all dependencies) |
| S | A story: a bounded subDAG of G with source and target regions |
| T | A threading (narrative traversal) of a DAG or subDAG |
| v, w | Nodes (events) |
| e(v,w) | Directed edge from v to w (dependency) |
| D | A subDAG: a node that contains interior structure |
| D[p] | A parametrized subDAG with parameter vector p |
| L | The semantic lexicon |
| expr | A semantic expression (a node's content) |

---

## 1. The Semantic Lexicon L

### 1.1 Definition

L is a typed vocabulary of meaning-elements. Each entry has:

```
name :: (type_1, type_2, ..., type_n) -> result_type
name(x_1, x_2, ..., x_n) = "informal natural-language gloss"
```

The paper's example:

```
meet :: (entity, entity) -> completion
meet(x, y) = "[x] meets [y]"
```

### 1.2 Base Types

| Type | Description | Examples |
|------|-------------|----------|
| entity | An actor, object, or place | phil, rita, punxsutawney |
| action | Something that happens | meet, kill, learn |
| quality | A property or state | ironic, confused, profound |
| completion | A fully-specified event (a saturated expression) | meet(phil, rita) |
| mode | How an action is performed | with(electricity), with(jump) |

### 1.2.1 Entity Predictive Reach (from INTUITIONS #34)

Entities are not generic. Each entity carries a **predictive reach**
over other entities -- how many DAG steps ahead E can correctly predict
what other entities will do. This is metadata on the entity, not a
separate type:

```
phil :: entity @ reach=mind            -- models others modeling him
rita :: entity @ reach=mind
groundhog :: entity @ reach=organism   -- reacts to environment
punxsutawney :: entity @ reach=institution
rock :: entity @ reach=matter          -- predicts nothing about others
```

Reach is a coarse ordinal: `matter < organism < mind < institution`.
Self-persistence (maintaining identity over N steps) is a prerequisite
-- an entity that disperses cannot predict others -- but self-persistence
is the floor, not the metric. The load-bearing quantity is how many
steps ahead the entity can model what *other* entities will do.

**Why this matters for the formalism.** Template matching should be
reach-compatible type-checking. The template `experiment(X, Y)` whose
internal structure includes `learn(X, of(Y, characteristics))` followed
by `apply(X, knowledge, to(Y))` requires Y to have reach >= organism
(Y must be complex enough to have learnable characteristics that respond
to X's actions). Binding Y to `rock` is not a type error but a **reach
error**: the resulting subDAG fails the story-boundary condition (8.5)
because mutual predictive entanglement is impossible when one entity's
reach is too shallow.

This blocks a class of vacuous template matches that pure type-checking
would accept. Reach-aware matching prevents binding mind-slots to
non-minds.

**Open:** The exact ordinal has no closed-form definition yet. See
INTUITIONS open questions #15 and #17.

### 1.3 What L Is and Is Not

L is **not** a controlled vocabulary frozen in advance. It is an open,
extensible lexicon that grows as analysis requires. New domains bring
new entities, actions, qualities. The formalism is in the typing and
composition rules, not in a specific word list.

L is also **not** natural language. The informal gloss is a convenience.
The formal object is the typed functional expression. Two expressions
are identical iff they have the same function and arguments, regardless
of gloss.

---

## 2. Semantic Expressions

### 2.1 Definition

A semantic expression is a well-typed application of L entries.

```
kill(phil, phil, with(electricity))
describe(phil, groundhog, ironic)
improve(phil, altruism, 0)
```

Each expression corresponds to exactly one node of a DAG.

### 2.2 Granularity

The SAME stretch of story can be represented at different granularities:

- **Coarsest:** `improve(phil)` -- one node, the whole movie
- **Intermediate:** `explore_no_consequences(phil)` -- one node, one act
- **Finest:** `rob(phil, bank)`, `buy(phil, car)`, `tour(phil, town)` --
  three nodes for three sub-events

This is not ambiguity -- it is the multi-scale structure of the DAG itself.
A coarse node IS a subDAG whose interior can be expanded.

### 2.3 Identity and Equivalence

Two expressions are **identical** if they are syntactically the same:
`meet(phil, rita)` = `meet(phil, rita)`.

Two expressions are **equivalent** if they share a parametrized template:
`meet(phil, rita)` ~ `meet(phil, nancy)` under template `meet(phil, X)`.

This distinction is critical. Identity gives repetition.
Equivalence gives pattern. The paper calls the first "representational
repetition" and the second "class-based repetition."

**OPEN:** We need a formal definition of template matching. When are two
expressions "equivalent enough" to count as instances of the same
pattern? The paper leaves this to human judgment. We need an operator.

---

## 3. The DAG

### 3.1 Definition

A DAG is a directed acyclic graph D = (V, E) where:

- V is a set of nodes, each carrying a semantic expression
- E is a set of directed edges e(v, w) indicating that w **depends on** v
- Acyclicity: no directed path from any node back to itself

Dependency means: the semantic content of w relies on information
established at v. This subsumes temporal ordering, logical prerequisite,
causal necessity. The paper does not sub-classify dependency types.

**Retrocause extension:** In G (the universal DAG), dependency IS
causation. There is no separate "law of physics" -- G's edge structure
is physical law. In local story DAGs, dependency is whatever the
analyst identifies as relevant connection.

**Self-reference (from INTUITIONS #32).** The analyzer running this
formalism is itself a DAG-shaped computation (a mind unrolling forward
from the cursor's current position) processing DAG-shaped data,
embedded in the universal DAG G. The distinction between "analyzer"
and "analyzed" is one of scope, not of kind.

### 3.2 SubDAGs

### 3.2 Two Scales

The DAG has two operational scales:

- **Scale 0:** The whole story (or domain) as a single node with a
  one-line gloss. This IS a subDAG -- it contains all of Scale 1.
- **Scale 1:** Events -- individual causal nodes with semantic
  expressions, connected by dependency edges.

```
improve(phil)                          -- scale 0: the whole movie
  |- hear(phil, song)                  -- scale 1: event
  |- meet(phil, rita)                  -- scale 1: event
  |- kill(phil, phil, with(toaster))   -- scale 1: event
  |- learn(phil, of(rita, poetry))     -- scale 1: event
  ...
```

Scale 1 is the working level: the DAG of events and their causal
dependencies. There is no imposed grouping (no "acts," no "sequences").
If events cluster, that clustering **emerges from the causal topology**
(connected components, bottleneck nodes, dense subgraphs) and is
computed downstream, not declared by the analyst.

### 3.3 Dependency

Nodes may have:

1. **Dependencies** -- edges between nodes
   (e.g., buy_drink -> make_toast: must buy to toast)
2. **No dependencies** -- causally independent events
   (e.g., get_tattoo, throw_party: either order)
3. **Mixed** -- some nodes connected, some independent

The edge structure IS the causal structure. No sub-classification
of edge types (temporal, logical, material) is imposed -- a
dependency means "the semantic content of w relies on information
established at v," tested by counterfactual: if v hadn't happened,
could w have happened as described?

### 3.4 The Universal DAG G (Retrocause Ontological Claim)

**Axiom (retained from v1):** G is not a model. It IS the substrate.

Every local DAG analyzed from a text, an ecosystem, a gene network
is a projection of G -- a finite subgraph extracted through a
specific lens. The formalism works identically whether or not you
accept this ontological claim. The claim's role is interpretive:
it tells you what the mathematics IS ABOUT, not how to do the
mathematics.

---

## 4. Threading (analytical tool, not core structure)

Threading describes how a narrative TELLS a causal structure. It is
metadata about presentation, not about the DAG itself. The DAG
(causal flow) is primary; threading is secondary.

### 4.1 Definition

A **thread** T on a DAG D is an ordered sequence of nodes:

```
T = (v_t1, v_t2, ..., v_tn)
```

A thread need not follow edges, can revisit nodes, and can skip nodes.
The ordering represents narrative telling order (sjuzhet), which may
differ from causal order (fabula = a topological sort of the DAG).

### 4.2 When Threading Matters

Threading is analytically useful when the telling order **deviates**
from causal order -- flashbacks, in-medias-res, withholding. When
sjuzhet = fabula (as in most fairy tales), threading adds no information.

Thread revisitation (same node visited multiple times) and thread
shortcuts (abbreviating repeated structure) are the paper's tools for
describing narrative compression. These are properties of the TELLING,
not of the causal structure.

---

## 5. Parametrized SubDAGs

### 5.1 Definition

A **parametrized subDAG** is a subDAG template D[p] where p is a
vector of parameters drawn from L. Different instantiations of p
produce different concrete subDAGs with the same structure.

The paper's example -- Phil's reportings at Gobbler's Knob:

```
describe :: (entity, entity, quality) -> completion

describe(phil, groundhog, ironic)      -- instantiation 1
describe(phil, groundhog, confused)    -- instantiation 2
describe(phil, groundhog, professional)-- instantiation 3
describe(phil, groundhog, learned)     -- instantiation 4
describe(phil, groundhog, poetic)      -- instantiation 5
describe(phil, groundhog, profound)    -- instantiation 6
```

Template: `describe(phil, groundhog, Q)` where Q ranges over qualities.

### 5.2 This Is the Archetype Mechanism

The paper doesn't use the word "archetype," but parametrized subDAGs
ARE what retrocause means by archetypes -- with one critical upgrade:
archetypes are not mysterious topological equivalence classes. They
are **concrete templates with typed parameter slots**.

The seduction parallel from the paper:

```
experiment(X, Y) = slist(
    meet(X, Y),
    learn(X, of(Y, characteristics)),
    apply(X, knowledge, to(Y))
)
```

This template is instantiated as:
- experiment(phil, nancy) -- succeeds
- experiment(phil, rita) -- fails

Same structure, different parameters, different outcomes. The TEMPLATE
is the archetype. The INSTANTIATIONS are the individual stories.

### 5.3 Archetype as Template Signature

**Definition (new):** An archetype A is a parametrized subDAG template:

```
A = D[p_1 :: type_1, p_2 :: type_2, ..., p_n :: type_n]
```

where D is a DAG structure (nodes, edges, subDAGs) and p_i are
typed parameter slots.

Two stories S_1 and S_2 are **of the same archetype** iff there
exists a template A and parameter vectors q_1, q_2 such that
S_1 = A[q_1] and S_2 = A[q_2].

**This replaces the v1 definition (D7)** which used "topological
equivalence / homeomorphism" -- too vague, no operational test.
The new definition is operational: two stories match an archetype
iff you can write the template and fill in both parameter vectors.

### 5.4 Archetype Hierarchy

Templates can be more or less abstract:

```
-- Very specific (paper's "representational repetition"):
wake_and_hear(phil, song, banter)

-- Intermediate (paper's "class-based repetition"):
experiment(X, Y) = slist(meet(X,Y), learn(X, of(Y,...)), ...)

-- Very abstract (cross-text):
star_crossed(X, Y, F1, F2) = slist(
    meet(X, Y),
    love(X, Y),
    conflict(F1, F2),
    die(X), die(Y)
)
-- Instantiates as Romeo/Juliet, Pyramus/Thisbe, etc.
```

The archetype count question becomes: **how many distinct templates
exist at a given abstraction level?** This is more tractable than
"how many topological equivalence classes" because templates are
concrete, enumerable objects.

### 5.5 OPEN: Template Extraction

The paper acknowledges that only human intelligence currently
identifies these templates. We need:

1. **A matching operator** -- given two subDAGs S_1 and S_2,
   compute the most specific template A such that both are
   instances of A. (This is anti-unification / least general
   generalization from ML/logic programming.)

2. **A quality metric** -- not all templates are meaningful. The
   trivial template `do(X, Y)` matches everything. We need a
   measure of template specificity vs. coverage. (Analogous to
   MDL: the best template minimizes description length.)

3. **Automated extraction** -- given a corpus of subDAGs, find
   the non-trivial templates that recur. (This is pattern mining
   on typed DAGs -- existing literature in graph mining, ILP.)

---

## 6. Parallel DAGs

### 6.1 Definition

Two subDAGs D_1 and D_2 within a larger DAG are **parallel** if they
are instances of the same parametrized template:

```
D_1 = A[q_1]
D_2 = A[q_2]
```

The paper's example: Phil's pursuit of Nancy and Phil's pursuit of
Rita share the `experiment(X, Y)` template.

### 6.2 Intra-Narrative Parallelism

Within a single narrative, parallel subDAGs create resonance.
The reader perceives the structural similarity and extracts meaning
from the DIFFERENCES between parameter instantiations.

The paper doesn't formalize this, but we can:

**Definition:** The **contrast** between two parallel instances
A[q_1] and A[q_2] is the set of parameter positions where
q_1 and q_2 differ:

```
contrast(A[q_1], A[q_2]) = {i : q_1[i] != q_2[i]}
```

The meaning of the parallelism lives in the contrast.
Phil pursues Nancy and Rita with the same strategy; the contrast
is in the target and the outcome. That contrast IS the point.

### 6.3 Cross-Narrative Parallelism

Across narratives, parallel DAGs create what literature calls
"the same story." Romeo/Juliet and Pyramus/Thisbe are parallel
under `star_crossed(X, Y, F1, F2)`.

**Retrocause claim (retained):** Cross-narrative parallelism is
evidence that the template corresponds to a real structural feature
of G, not a cultural convention. Independent cultures discovering
the same template = independent projections detecting the same
topology.

### 6.4 OPEN: Structural vs. Parametric Parallelism

The paper treats all parallelism as parametric (same template,
different parameters). But two subDAGs could have:

- **Same template, different parameters** -- parametric parallelism
  (the paper's case)
- **Different templates, same abstract shape** -- structural
  parallelism (e.g., both are "branching choice with irreversible
  consequences" but with different internal structure)

The second kind is what the v1 model called "topological equivalence."
We haven't yet formalized what "same abstract shape" means for
templates themselves. This is where the hierarchy from 5.4 matters:
at a high enough abstraction level, structurally parallel DAGs
become parametrically parallel under a more abstract template.

---

## 7. Operators

Two operators are currently operational. Others are deferred.

### 7.1 Instantiation: A[p] -> S

Fill a parametrized template with concrete values.

```
instantiate(experiment, [phil, rita]) = {
    meet(phil, rita),
    learn(phil, of(rita, characteristics)),
    apply(phil, knowledge, to(rita))
}
```

### 7.2 Contrast: (A[q_1], A[q_2]) -> diff

Compute the meaningful differences between parallel instances.

```
contrast(
    experiment(phil, rita),
    experiment(phil, nancy)
) = {target: rita/nancy, outcome: fail/succeed}
```

The meaning of a parallelism lives in the contrast -- the parameter
positions where instances differ.

### 7.3 DEFERRED: Anti-Unification, Composition

**Anti-unification** (computing the most specific common template from
two concrete subgraphs) and **composition** (formal rules for combining
subDAGs) are needed but unfinished. See Section 5.5 for the template
extraction problem statement.

---

## 8. Retrocause-Specific Extensions

### 8.1 Convergence (retained, reformulated -- SCOPE CORRECTION)

Convergence is a **global DAG (G) concept**, not a single-story concept.
A convergence node is a node in G where multiple *independent* causal
paths originating from *different* source regions arrive. This requires
a domain with many branches and high die-out rate -- most paths fail,
and the few that survive funnel into convergence nodes (attractors).

Within a single story DAG S, high in-degree nodes are just **merge
nodes** -- structurally interesting but not convergence in the
retrocause sense, because events in S typically share a common origin.
True convergence requires cross-narrative scope: multiple independent
stories (or branches of G) arriving at the same structural outcome.

The paper doesn't discuss convergence because Groundhog Day's structure
is iterative (thread revisitation), not convergent. The formalism
supports convergence directly, but only at the scale of G or
domain-level DAGs with sufficient branching.

**Persistence-depth filter on convergence (from INTUITIONS #34).** Not
all branches that point toward a convergence node actually reach it.
Patterns with low persistence depth disperse before arriving -- the
sand-pile-shaped branches of G never make it to a Romeo-and-Juliet-shaped
attractor because they lack the depth to maintain identity that long.
Convergence nodes are therefore reachable only by branches whose
participating entities have sufficient persistence depth. This gives
8.1 a filter: `reachable_convergence(v) = {branches b : min_depth(b) >=
depth(v)}`. The deeper the convergence pattern, the higher the depth
floor on admissible incoming branches.

### 8.2 Meaning (two complementary hypotheses)

We now have two measurable proxies for the structural importance of a
node, from different directions. Neither is a definition of "meaning."
Both are testable on extracted DAG corpora.

### 8.3 Meaning (retained, reformulated, extended)

We now have two complementary proxies for structural importance.
Neither defines "meaning." Both are computable on extracted DAGs.

**Hypothesis A (template participation):**

```
importance_A(v) = |{A : v in some instance A[q] within the DAG}|
```

A node that appears in many template instances has richer structural
meaning -- it is a pivot around which many archetypes turn.

**Hypothesis B (mutual predictive entanglement, from INTUITIONS #33):**

```
importance_B(v) ~ MI(traj(M_i), traj(M_j) | model_i(M_j), model_j(M_i))
```

for mind-cursors M_i, M_j in the neighborhood of v. The importance of
v is high when agents near v are materially modeling each other and
their trajectories are strongly coupled conditional on those models.

**Conjecture C (equivalence).** A and B may measure the same quantity
from two sides. A node where agents are mutually modeling each other
is exactly a node that pivots many possible unfoldings (the unfoldings
that differ according to which model-of-the-other wins out). Conversely,
a node that participates in many templates is typically one where the
parameter bindings affect downstream structure, which requires the
parameter-bound entities to be agents whose choices matter. Proving
or refuting this equivalence is tractable once a DAG corpus is available.

**Hypothesis B (mutual predictive entanglement, from INTUITIONS #33).**
The importance of v correlates with how much mutual-modeling activity
happens at or around v. Formally, for a neighborhood N(v) containing
mind-cursors M_1, ..., M_k:

```
importance_B(v) ~ MI(trajectory(M_i), trajectory(M_j) | model_i(M_j), model_j(M_i))
```

where MI is mutual information and `model_i(M_j)` is M_i's internal
model of M_j. The importance of v is high when agents in N(v) are
materially modeling each other and their trajectories are strongly
coupled conditional on those models.

**Conjecture C (equivalence).** Hypotheses A and B may be the same
quantity viewed from two sides. A node where multiple agents are
mutually modeling each other is exactly a node that pivots many
possible unfoldings -- the unfoldings that differ according to which
model-of-the-other wins out. Conversely, a node that participates in
many templates is a node where the parameter bindings materially
affect downstream structure, which requires the parameter-bound
entities to be agents whose choices matter, which requires mutual
modeling. If this equivalence holds, it means template-density and
agent-entanglement measure the same structural fact. Proving or
refuting it is a tractable empirical question on any DAG corpus where
both quantities can be computed.

### 8.3 Story Boundary: The Selection Principle (from INTUITIONS #33)

The paper and v2 up to this section have been silent on a question
that an analyst must always answer before starting: **what picks out a
subDAG of G as a "story" in the first place?** The paper assumes the
analyst hands the formalism a bounded subgraph already marked "story."
This is a gap.

**Definition (story boundary).** A subDAG S of G is a *story* iff:

1. S contains at least two entities of depth >= mind (see 1.2.1), and
2. Each qualifying entity's path selection within S non-trivially
   depends on its internal model of at least one other qualifying
   entity in S, and
3. No such entity's model of the others collapses to certainty
   (i.e., genuine uncertainty remains about the other's future actions
   at every branch point in S).

Condition (3) is the **non-triviality** clause. It rules out both the
sand-pile case (no modeling at all -- fails condition 2) and the
omniscient-narrator-only case (modeling exists but collapses to
certainty -- fails condition 3). Note that dramatic irony is still
admitted: the *audience*'s model may be certain, but the audience is
a meta-level mind-cursor outside S, not one of the qualifying entities
inside it.

**What this buys us.** The formalism now has an internal criterion for
whether an input subDAG is analyzable as a story. It no longer depends
on a human analyst to pre-bound its input. Given a raw DAG extracted
from a domain (ecology, gene network, real-world event log), the
formalism can -- in principle -- locate the story-bearing subregions
by searching for subDAGs satisfying the three conditions above.

**Relation to archetypes (Section 5).** An archetype is a template. A
story is a template instantiation that *also* satisfies the story
boundary conditions. Not every instantiation of `experiment(X, Y)` is
a story -- only those where X and Y are both at least mind-depth and
genuinely model each other with residual uncertainty. This is why
`experiment(phil, rita)` is a story and `experiment(phil, rock)` is
not, even though both type-check at the entity level.

**Relation to convergence (8.1).** Mutual-predictive-entanglement tends
to create convergence. When agents mutually model each other with
genuine uncertainty, their joint trajectories funnel through nodes where
the mutual-modeling dynamics resolve. Those funnel nodes are candidate
convergence points in G. This links 8.3 (what makes a story) to 8.1
(what makes a convergent attractor) -- stories are the local dynamics
that generate global attractors.

**Open.** The quantitative threshold for "non-trivial" modeling in
condition (2) is not yet specified. At one limit, any non-zero mutual
information counts; at the other, we want a minimum complexity of the
internal model. This is related to the nesting depth problem (next
open problem T4).

### 8.5 Story Boundary: The Selection Principle (from INTUITIONS #33)

The paper and v2 up to this section are silent on a foundational
question: **what picks out a subDAG of G as a "story"?** The paper
assumes the analyst provides a bounded subgraph already labeled
"story." This is a gap.

**Definition (story boundary).** A subDAG S of G is a *story* iff:

1. S contains at least two entities with predictive reach >= mind
   (see 1.2.1), and
2. Each qualifying entity's path selection within S non-trivially
   depends on its model of at least one other qualifying entity, and
3. No qualifying entity's model of the others collapses to certainty
   (genuine uncertainty remains about others' future actions at
   branch points in S).

Condition (3) is the **non-triviality** clause. It rules out both the
sand-pile case (no mutual modeling -- fails 2) and the omniscient-
controller case (modeling exists but collapses to certainty -- fails 3).
Dramatic irony is admitted: the *audience* may be certain, but the
audience is a meta-level mind-cursor outside S.

**What this buys us.** The formalism now has an internal criterion for
whether an input subDAG is analyzable as a story, rather than depending
on a human analyst to pre-bound its input. Given a raw DAG from a
domain (ecology, gene network, event log), the formalism can locate
story-bearing subregions by searching for subDAGs satisfying the three
conditions.

**Relation to archetypes (Section 5).** An archetype is a template.
A story is a template instantiation that *also* satisfies the story-
boundary conditions. Not every instantiation of `experiment(X, Y)` is
a story -- only those where X and Y both have reach >= mind and
genuinely model each other with residual uncertainty. This is why
`experiment(phil, rita)` is a story and `experiment(phil, rock)` is not.

**Relation to convergence (8.1).** Mutual-predictive-entanglement tends
to create convergence. When agents mutually model each other with
genuine uncertainty, their joint trajectories funnel through nodes where
the mutual-modeling dynamics resolve. Those nodes are convergence
candidates in G. Stories are the local dynamics that generate global
attractors.

### 8.6 Predictive Surplus and Self-Multiplication (from INTUITIONS #35)

The story-boundary definition in 8.5 has a generative structural
consequence: predictive surplus produces self-multiplication.

**Statement.** Let R(E) be entity E's predictive reach over its
environment. When R(E) exceeds the cost of copying (which is typically
low -- biological reproduction is cheap relative to maintenance), the
entity self-multiplies. This is not a crisis response to dominance; it
is the mundane default output of surplus capacity. It begins early and
continues gradually, well before any "dominance" threshold.

The copies are the interesting thing:

1. Each copy E_i is structurally similar to E (high template overlap)
2. Each E_i differs from E and from other E_j by small parametric
   variations
3. Copies of a predictor are the entities hardest for it to predict
   (maximum similarity = maximum depth of mutual modeling with
   maximum residual uncertainty from variation)
4. The mutual-modeling condition of 8.5 is richly satisfied among
   {E_1, ..., E_k} -- copies are the most efficient source of new
   stories

The prediction-monopoly state (one entity predicting everything) is
not structurally forbidden -- it is simply never reached, because
self-multiplication starts first. The copies populate the predictive
environment before dominance can be achieved.

**Formal consequence for templates.** A parametrized template whose
entity bindings include agents with predictive surplus is structurally
adjacent to a multiplication template:

```
surplus(E) -> multiply(E) -> {E_1[p_1], ..., E_k[p_k]}
```

where each E_i is an instance of E's template with varied parameters.
The multiply template and the original archetype may always appear
paired in G -- wherever there is a story, there is also the
generation of new stories from its surplus.

**Observable instances (as continuous gradient, not crisis cycle):**
- Autocatalytic molecules: stable chemistry that also self-replicates,
  generating further complexity from surplus stability
- Cells with metabolic surplus: divide as the default output of
  having more energy than maintenance requires
- Organisms with behavioral surplus: reproduce with variation,
  offspring become the next generation of mutual predictors
- Species outcompeting others: radiate into subspecies, filling niches
  -- radiation starts before and continues through competitive success
- Cultures with technological surplus: proliferate schools of thought,
  factions, subcultures -- copies with variation

**Relation to convergence (8.1).** Self-multiplication enriches the
set of branches approaching convergence nodes. More copies = more
paths through the subDAG = richer convergence structure. But copies
that are too similar may converge trivially (no real story), while
copies that diverge too much may not converge at all. The interesting
range -- similar enough for deep mutual modeling, different enough
for genuine uncertainty -- defines the "story-width" of a convergence
basin.

---

## 9. What This Formalism Buys Us

### 9.1 Over the Paper

The paper provides: representation of a single analyzed text.
We add:

1. **Ontological interpretation** -- the DAG as reality, not just model
2. **Archetype as template** -- parametrized subDAGs as the mechanism
   for structural recurrence across stories
3. **Instantiation + contrast** -- operational tools for template analysis
4. **Convergence** -- global-DAG concept for cross-narrative attractor nodes

### 9.2 Over v1

The v1 model provided: philosophical claims with vague formalism.
The paper gives us:

1. **Concrete notation** -- semantic expressions instead of abstract "events"
2. **Operational multi-scale** -- subDAG hierarchy instead of hand-waving about "granularity"
3. **Operational archetypes** -- parametrized templates instead of "topological equivalence classes"
4. **Testable repetition** -- thread revisitation instead of undefined "pattern recurrence"
5. **The shortcuts mechanism** -- thread compression as the formalism for attention/bandwidth

### 9.3 What's Still Missing

1. **Template extraction algorithm** -- how to compute anti-unification on DAGs
2. **Composition algebra** -- formal rules for combining subDAGs
3. **Quality metrics** -- when is a template meaningful vs. trivial?
4. **Domain bridging** -- how to apply this to non-narrative DAGs (gene networks, ecosystems)
5. **The archetype count** -- can we derive a finite bound on templates at a given abstraction level from the composition algebra?
6. **Convergence analysis** -- the paper focuses on iteration (Groundhog Day's loops); we need the formalism for convergent structure (multiple paths merging)
7. **Nested simulation operator** -- formal representation of agent-internal models of other agents (T5)
8. **Reach ordinal calibration** -- making entity predictive-reach operational (T6)
9. **Multiplication-mode enumeration** -- characterizing the distinct ways predictive surplus generates copies (T7)

---

## 10. Open Problems

### T1: Human-Dependent Template Identification

The paper admits: "only human intelligence has permitted the
identification of semantic repetition in its various forms." We need
automated extraction. Anti-unification on typed DAGs is the path,
but the specifics are unfinished.

### T2: Granularity Anchoring

At what granularity do you analyze? The same story can be one node
or ten thousand. The paper chose "intermediate" without formal criteria.
We need a principled way to select analysis granularity -- possibly
tied to the domain's natural causal resolution.

### T3: Dependency Sub-Classification

The paper uses a single undifferentiated "dependency" relation. Real
causal structure has types: temporal, logical, material, informational.
Do we sub-classify edges? The typing would enrich the template
language: two subDAGs might share the same node structure but differ
in edge types.

### T4: Nested Simulation Representation (from INTUITIONS #33)

The formalism has no way to express subDAGs that exist *inside an
agent's head* -- i.e., representations of "X's model of Y's future
actions" as first-class objects alongside the actual causal DAG. The
paper's threading is purely presentational; it cannot mark a subDAG
as "simulated by X, modeling Y." But the story-boundary condition in
8.3 requires exactly this: we need to say that X's path selection
depends on X's model of Y, and Y's path selection depends on Y's
model of X, and possibly on Y's model of X's model of Y, and so on.

Candidate notation: a reflective operator `sim(A, D)` meaning "the
subDAG D as simulated by agent A." Then mutual modeling becomes:

```
X's next-edge selection depends on sim(X, D_Y)
Y's next-edge selection depends on sim(Y, D_X)
```

and k-level nesting becomes `sim(X, sim(Y, sim(X, D)))` and so on.

Open questions:
- How does `sim` interact with the acyclicity constraint on the outer
  DAG? Nested sims must not create cycles in the ground DAG even when
  they reference each other.
- Is there a fixed-point theorem that guarantees nesting depth
  stabilizes for "interesting" subDAGs (INTUITIONS open question #12)?
- How is an agent's own forward-rollout distinguished from its
  simulation of another's rollout, when both live in the same
  computational substrate (INTUITIONS open question #13)?

This is the most important formal gap added by the INTUITIONS #32-34
extensions. Solving it would make the story-boundary principle in 8.3
fully operational.

### T5: Entity Depth Ordinal Calibration (from INTUITIONS #34)

Section 1.2.1 introduces persistence-depth metadata on entities but
leaves the ordinal coarsely specified (`matter < organism < mind <
institution`). For depth-aware template matching to be operational we
need either (a) a principled ordering with decision procedures for
where a new entity sits, or (b) a continuous/numeric depth measure,
presumably something like "log of the number of DAG steps the pattern
maintains identity under a standard class of perturbations." The
"three" conjecture (INTUITIONS open question #15) predicts that depth
is effectively discrete up to ~3, then effectively continuous above.
Calibration against real-world entities is deferred.

### T5: Nested Simulation Representation (from INTUITIONS #33)

The formalism cannot currently represent subDAGs that exist *inside
an agent's head* -- "X's model of Y's future actions" as a first-class
object. Threading (Section 4) is about presentation order, not about
mental content. But the story-boundary condition (8.5) requires exactly
this: we need X's path selection to depend on X's model of Y, and
Y's on Y's model of X, and possibly on Y's model of X's model of Y.

Candidate notation: a reflective operator `sim(A, D)` meaning "the
subDAG D as simulated by agent A." Then mutual modeling becomes:

```
edge_choice(X) depends on sim(X, D_Y)
edge_choice(Y) depends on sim(Y, D_X)
```

k-level nesting: `sim(X, sim(Y, sim(X, D)))`.

Open: how does `sim` interact with acyclicity? How deep does nesting
go before predictions stabilize (fixed-point question, INTUITIONS #12)?
How is an agent's own rollout distinguished from its simulation of
another's rollout (INTUITIONS #13)?

### T6: Predictive Reach Calibration (from INTUITIONS #34)

Section 1.2.1 introduces predictive-reach metadata on entities but
leaves the ordinal coarsely specified. For reach-aware template matching
to be operational we need either (a) a principled ordinal with decision
procedures, or (b) a numeric measure (e.g., log of the number of DAG
steps over which the entity's predictions of others remain accurate
above some threshold). The "three" conjecture (INTUITIONS #15) predicts
the ordinal has a sharp transition around depth 3.

### T7: Multiplication Mode Enumeration (from INTUITIONS #35)

If predictive surplus produces self-multiplication, the number of
structurally distinct multiplication modes may be small and enumerable.
Each mode corresponds to a way a surplus-entity can produce copies
that become mutual predictors (varying along different parameter
dimensions, at different rates, with different degrees of divergence).
If these modes correspond to narrative archetypes, this would provide
the first derivation of the archetype count from first principles.

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **Completion** | A fully-saturated semantic expression (all argument slots filled). One node. |
| **Contrast** | The parameter differences between two parallel instances of the same template. |
| **Convergence** | A node in G where multiple independent causal paths from different origins meet. Global-DAG concept only. |
| **DAG** | Directed acyclic graph. Nodes = events, edges = dependencies. |
| **Dependency** | An edge e(v,w): w's semantic content relies on information from v. Tested by counterfactual. |
| **Fabula** | The underlying causal structure. = the DAG. |
| **G** | The universal DAG. All events, all dependencies. Reality itself (ontological claim). |
| **L** | The semantic lexicon. Typed vocabulary for building expressions. |
| **Mutual predictive entanglement** | Condition where >=2 mind-reach entities select paths based on models of each other with residual uncertainty. Story boundary criterion (8.5). |
| **Parallel DAGs** | Two subDAGs that instantiate the same template with different parameters. |
| **Predictive reach** | Entity metadata: how many DAG steps ahead E can correctly predict other entities' actions. The metric for story-worthiness (1.2.1). Self-persistence is the floor; other-prediction is the ceiling. |
| **Predictive surplus** | State where R(E) exceeds the cost of self-copying. The default output is self-multiplication, generating copies that become mutual predictors (8.6). |
| **Parametrized subDAG** | A subDAG template D[p] with typed parameter slots. = archetype. |
| **Semantic expression** | A well-typed composition of L entries. The content of a node. |
| **Sjuzhet** | A particular telling of a story. = a threading of the DAG. |
| **SubDAG** | A node with interior structure: contains its own nodes and edges. |
| **Template** | A parametrized subDAG with open parameter slots. The archetype mechanism. |
| **Thread** | An ordered sequence of node visits. May revisit, skip, jump. |
| **Thread shortcut** | A thread that traverses only some interior nodes of a subDAG. |

---

## Appendix A: Dependency on Lessard & Levison (2013)

Concepts adopted directly from the paper:
- DAG as fabula representation
- Threading as sjuzhet representation (demoted to analytical tool)
- Semantic expressions as node content
- Parametrized subDAGs for repeated-with-variation patterns
- Parallel DAGs for cross-segment structural similarity

Concepts extended beyond the paper:
- Ontological interpretation of G
- Archetype as template equivalence class
- Convergence nodes and attractor theory
- Anti-unification as archetype extraction
- Entity predictive-reach metadata (from INTUITIONS #34)
- Story boundary selection principle (from INTUITIONS #33)
- Dual meaning hypothesis: template-participation + entanglement (from INTUITIONS #33)
- Predictive surplus and self-multiplication (from INTUITIONS #35)
- Nested simulation as open formal gap (from INTUITIONS #32-33)

Concepts from v1 that are REPLACED:
- "Topological equivalence class" -> parametrized template
- "Persistence homology" -> two-scale DAG hierarchy
- Abstract topology talk -> concrete expressions
- Mind-cursor formalism -> simple threading (if needed)

Concepts from v1 that are DROPPED:
- Compound types (slist, set, conditional) -- redundant with edge structure
- Mind-cursor bandwidth/agency formalism -- renaming, not adding
- Time/space/free will mappings -- philosophy, not operational
- Arbitrary-depth nesting -- we use 2 scales

Concepts from v1 that are DEFERRED:
- Base narrative catalogs (Booker, Vonnegut, Campbell)
- Archetype count derivation
- Observable domain windows (ecology, markets, gene regulation)
- Anti-unification algorithm for template extraction
