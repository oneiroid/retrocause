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

### 1.3 What L Is and Is Not

L is **not** a controlled vocabulary frozen in advance. It is an open,
extensible lexicon that grows as analysis requires. New domains bring
new entities, actions, qualities. The formalism is in the typing and
composition rules, not in a specific word list.

L is also **not** natural language. The informal gloss is a convenience.
The formal object is the typed functional expression. Two expressions
are identical iff they have the same function and arguments, regardless
of gloss.

### 1.4 Extension: Compound Types (UNFINISHED)

The paper uses only simple types. We need:

- **Sequence type** `slist(expr_1, expr_2, ...)` -- an ordered list of
  sub-expressions forming a composite event. Used inside subDAGs.
- **Set type** `set(expr_1, expr_2, ...)` -- an unordered collection.
  For independent sub-events with no internal dependency.
- **Conditional type** `if(condition, then_expr, else_expr)` -- branching
  within a single node's content. (Tentative -- may be better handled
  by DAG structure than by expression-internal branching.)

**OPEN:** Do we need a recursive type? An expression whose arguments
are themselves completions? The paper hints at this with nested subDAGs
but doesn't formalize the type signature.

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

### 3.2 SubDAGs

A **subDAG** is a node D that contains interior nodes and edges.
From outside, D looks like a single node with a single semantic
expression. From inside, D has structure.

```
wakeup(phil) = slist(
    hear(phil, song),
    hear(phil, dj_banter)
)
```

Here `wakeup(phil)` is the exterior expression. The `slist` reveals
two interior nodes with an implicit ordering dependency.

SubDAGs nest: a subDAG can contain subDAGs to arbitrary depth.
This gives the multi-scale hierarchy:

```
improve(phil)                          -- scale 0: the whole movie
  ├── setup(phil, punxsutawney)        -- scale 1: act-level
  ├── recursion(phil)                  -- scale 1
  │     ├── explore_no_consequences()  -- scale 2: sequence-level
  │     ├── attempt_seduction()        -- scale 2
  │     │     ├── meet(phil, rita)      -- scale 3: event-level
  │     │     ├── learn(phil, ...)      -- scale 3
  │     │     └── ...
  │     └── develop_altruism()         -- scale 2
  └── escape(phil)                     -- scale 1
```

### 3.3 Dependency Within and Across SubDAGs

Interior nodes of a subDAG may have:

1. **Internal dependencies** -- edges between interior nodes
   (e.g., buy_drink -> make_toast: must buy to toast)
2. **No internal dependencies** -- independent sub-events
   (e.g., get_tattoo, throw_party: either order)
3. **Mixed** -- some dependent, some independent

Edges can also cross subDAG boundaries. An interior node of one
subDAG can depend on an interior node of another. This is how
the paper captures connections between otherwise separate story
segments.

### 3.4 The Universal DAG G (Retrocause Ontological Claim)

**Axiom (retained from v1):** G is not a model. It IS the substrate.

Every local DAG analyzed from a text, an ecosystem, a gene network
is a projection of G -- a finite subgraph extracted through a
specific lens. The formalism works identically whether or not you
accept this ontological claim. The claim's role is interpretive:
it tells you what the mathematics IS ABOUT, not how to do the
mathematics.

---

## 4. Threading

### 4.1 Definition

A **thread** T on a DAG D is an ordered sequence of nodes:

```
T = (v_t1, v_t2, ..., v_tn)
```

where each v_ti is a node of D, and the subscript t_i is the
thread segment number.

Crucially, a thread:

- **Need not follow edges.** T can jump between non-adjacent nodes.
- **Need not be acyclic.** T can revisit the same node. (The DAG is
  acyclic; the thread is not.)
- **Need not cover all nodes.** T can skip nodes entirely.
- **Has ordered segments.** The ordering represents narrative time
  (the sequence of telling, not the sequence of the fabula).

### 4.2 The Fabula/Sjuzhet Distinction

This is the paper's core structural insight, and it maps directly
to retrocause's "two graphs" (Intuition #21):

| Paper's Term | Retrocause Term | Formal Object |
|-------------|----------------|---------------|
| Fabula (histoire) | Structure graph | The DAG D |
| Sjuzhet (recit) | Traversal graph | A threading T on D |

The DAG is the reality. The threading is a telling of it.

The same DAG can support many different threadings:
- Chronological ("once upon a time...")
- Reverse ("they were preparing for the wedding... she had been kidnapped...")
- Point-of-view (thread following one character's nodes only)
- Thematic (thread following one motif across the narrative)

### 4.3 Thread Revisitation = Semantic Repetition

When a thread passes through the same node more than once, that
IS semantic repetition. The event exists once in the DAG; the
narrative mentions it multiple times.

```
Thread: ... t9:meet(phil, beggar), ...,
            t53:meet(phil, beggar), ...,
            t146:meet(phil, beggar), ...
```

Three threadings through one node. The beggar encounter is one
event (or one subDAG) in the fabula, visited three times in the
sjuzhet.

### 4.4 Thread Shortcuts

Later revisitations can traverse fewer interior nodes of a subDAG:

```
First pass (thread 5-6):   wakeup -> hear(song) -> hear(banter)
Later pass (thread 36):    wakeup -> hear(banter)     [song skipped]
Later pass (thread 120):   wakeup -> hear(song)        [banter skipped]
```

The subDAG hasn't changed. The threading takes shortcuts through it.
This is narrative compression: mentioning one interior node to
activate the entire subDAG in the reader's mind.

**Retrocause extension:** Thread shortcuts formalize what a
mind-cursor with finite bandwidth does. A mind that has already
traversed a subDAG can re-enter it at lower resolution, touching
fewer interior nodes. The bandwidth epsilon from v1 maps to the
minimum subDAG scale that the threading still explicitly visits.

### 4.5 Retrocause: Mind-Cursor as Threading Agent

A mind-cursor (v1's D3) IS a threading T equipped with:

- **Position** t_k: the current segment number
- **Bandwidth** epsilon: the minimum subDAG scale still explicitly
  threaded (below epsilon, subDAGs are traversed as atomic nodes)
- **Agency** sigma: at nodes with multiple outgoing edges in G,
  sigma selects which edge the thread follows next

This collapses two previously separate concepts (mind-cursor and
traversal path) into one: the threading IS the mind's experience.

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

## 7. Operators (DRAFT -- UNFINISHED)

The paper provides the representational machinery but no operators.
We need operators to COMPUTE with this formalism.

### 7.1 Refinement: D -> D'

Expand a node into its interior subDAG.

```
refine(wakeup(phil)) = slist(hear(phil, song), hear(phil, dj_banter))
```

Inverse: **abstraction** -- collapse a subDAG into a single node.

```
abstract({hear(phil,song), hear(phil,dj_banter)}) = wakeup(phil)
```

These must be mutual inverses: refine(abstract(D)) = D.

### 7.2 Instantiation: A[p] -> S

Fill a parametrized template with concrete values.

```
instantiate(experiment, [phil, rita]) = slist(
    meet(phil, rita),
    learn(phil, of(rita, characteristics)),
    apply(phil, knowledge, to(rita))
)
```

### 7.3 Anti-Unification: (S_1, S_2) -> A[p]

Given two concrete subDAGs, compute their most specific common template.

```
anti_unify(
    slist(meet(phil,rita), learn(phil, of(rita, ...))),
    slist(meet(phil,nancy), learn(phil, of(nancy, ...)))
) = slist(meet(phil, X), learn(phil, of(X, ...)))
  with X :: entity
```

This is the archetype extraction operator.

**OPEN:** Anti-unification of DAG structures (not just flat
expressions) is non-trivial. We need to handle:
- Different numbers of interior nodes
- Different edge structures
- Partial matches (some sub-structure shared, some not)

### 7.4 Threading: (D, constraints) -> T

Produce a threading of a DAG given narrative constraints:
- Point of view (which character's nodes to include)
- Temporal ordering (chronological, reverse, in-medias-res)
- Detail level (which subDAGs to expand, which to skip)
- Repetition pattern (which nodes to revisit)

```
thread(groundhog_dag,
    pov = phil,
    order = chronological,
    detail = medium,
    repeat = {wakeup, meet_beggar}
) = T
```

### 7.5 Contrast: (A[q_1], A[q_2]) -> diff

Compute the meaningful differences between parallel instances.

```
contrast(
    experiment(phil, rita),
    experiment(phil, nancy)
) = {target: rita/nancy, outcome: fail/succeed}
```

### 7.6 Dependency Analysis: D -> properties

Compute structural properties of a subDAG:

- **in_degree(v):** number of incoming edges (convergence measure)
- **out_degree(v):** number of outgoing edges (divergence measure)
- **depth(D):** longest directed path in the subDAG
- **width(D):** maximum number of independent paths at any level
- **convergence_nodes(D):** nodes with in-degree >> mean

### 7.7 OPEN: Composition Operator

How do subDAGs compose into larger DAGs? The paper shows hierarchical
nesting (subDAGs within subDAGs) but doesn't formalize the composition
rules. We need:

- **Sequential composition:** D_1 ; D_2 -- target of D_1 feeds
  source of D_2
- **Parallel composition:** D_1 | D_2 -- independent subDAGs
  sharing only external dependencies
- **Convergent composition:** D_1 >< D_2 -- independent subDAGs
  merging at a shared target node

These may be the fundamental operations from which all DAG structure
is built. If so, the archetype question becomes: how many distinct
well-formed compositions exist at bounded depth?

---

## 8. Retrocause-Specific Extensions

### 8.1 Convergence (retained, reformulated)

In the paper's terms, a convergence node is a node with high in-degree:
many edges arrive at it. In retrocause terms, this is an attractor.

**Reformulation:** A convergence node v in a story DAG S is a node
such that multiple independent directed paths within S terminate at v.
"Independent" = no shared ancestor within S other than S's source region.

The paper doesn't discuss convergence explicitly because Groundhog Day's
structure is mostly iterative (thread revisitation), not convergent
(multiple paths merging). But the formalism supports it directly.

### 8.2 Mind-Cursor (retained, grounded in threading)

A mind-cursor is a threading agent (Section 4.5). The v1 formalism
(bandwidth epsilon, position v_k, agency sigma) maps onto threading
operations:

| v1 Concept | v2 Formalization |
|-----------|------------------|
| Position v_k | Current thread segment t_k |
| Bandwidth epsilon | Minimum subDAG depth that the thread expands |
| Agency sigma | At DAG branch points, the function selecting the next node |
| "Present" | The current segment: past = threaded so far, future = DAG downstream |
| Attention | Locally decreasing epsilon (expanding more subDAGs) |
| Shortcuts | Locally increasing epsilon (threading subDAGs atomically) |

### 8.3 Meaning (retained, reformulated)

**Definition (new):** The meaning of a node v is:

```
M(v) = the set of all templates A such that v participates in
        some instance A[q] within the DAG
```

A node that appears in many template instances (many parallel subDAGs
pass through it) has richer meaning than a node that appears in only
one. This replaces v1's "sum over convergence structures" with a
concrete, computable definition.

### 8.4 Time, Space, Free Will

These retrocause concepts are compatible with the paper's formalism
and don't need reformulation. They remain as stated in v1:

- **Time** = segment counter along a threading (D1)
- **Space** = perceptual embedding of branching structure (D2)
- **Free will** = the agency function sigma in the threading agent (D8)

---

## 9. What This Formalism Buys Us

### 9.1 Over the Paper

The paper provides: representation of a single analyzed text.
We add:

1. **Ontological interpretation** -- the DAG as reality, not just model
2. **Mind-cursor theory** -- threading as cognition, not just narration
3. **Archetype as template** -- parametrized subDAGs as the mechanism
   for structural recurrence across stories
4. **Operators** -- computational operations on DAGs and templates
5. **Convergence theory** -- high-in-degree nodes as structural attractors

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

---

## 10. Tensions and Open Problems

### T1: Static Graph, Dynamic Threading (retained)

The paper sidesteps this: it treats threading as an analytical tool
applied by a human analyst. We treat it as cognition itself. The
tension from v1 remains: what does it mean for a threading to "happen"
in a static DAG?

### T2: Human-Dependent Template Identification

The paper admits: "only human intelligence has permitted the
identification of semantic repetition in its various forms." We need
automated extraction. Anti-unification on typed DAGs is the path,
but the specifics are unfinished.

### T3: Granularity Anchoring

At what granularity do you analyze? The same story can be one node
or ten thousand. The paper chose "intermediate" without formal criteria.
We need a principled way to select analysis granularity -- possibly
tied to bandwidth epsilon (analyze at the granularity your mind-cursor
operates at).

### T4: Dependency Sub-Classification

The paper uses a single undifferentiated "dependency" relation. Real
causal structure has types: temporal, logical, material, informational.
Do we sub-classify edges? The paper says "we will not do that here."
We probably need to eventually. The typing would enrich the template
language: two subDAGs might share the same node structure but differ
in edge types, making them distinct archetypes at one level and
equivalent at another.

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **Completion** | A fully-saturated semantic expression (all argument slots filled). One node. |
| **Contrast** | The parameter differences between two parallel instances of the same template. |
| **DAG** | Directed acyclic graph. Nodes = events, edges = dependencies. |
| **Dependency** | An edge e(v,w): w's semantic content relies on information from v. |
| **Fabula** | The story's underlying event structure. = the DAG. |
| **G** | The universal DAG. All events, all dependencies. Reality itself (ontological claim). |
| **L** | The semantic lexicon. Typed vocabulary for building expressions. |
| **Parallel DAGs** | Two subDAGs that instantiate the same template with different parameters. |
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
- Threading as sjuzhet representation
- Semantic expressions as node content
- SubDAG hierarchy for multi-scale structure
- Parametrized subDAGs for repeated-with-variation patterns
- Parallel DAGs for cross-segment structural similarity
- Thread shortcuts for narrative compression

Concepts extended beyond the paper:
- Ontological interpretation of G
- Mind-cursor as threading agent with bandwidth
- Formal operators (7.1 -- 7.7)
- Archetype as template equivalence class
- Convergence nodes and attractor theory
- Anti-unification as archetype extraction

Concepts from v1 that are REPLACED:
- "Topological equivalence class" -> parametrized template
- "Persistence homology" -> subDAG hierarchy
- "Scale-dependent meaning" -> multi-level subDAG expansion
- Abstract topology talk -> concrete typed expressions

Concepts from v1 that are DEFERRED:
- Base narrative catalogs (Booker, Vonnegut, Campbell)
- Archetype count derivation
- Observable domain windows (ecology, markets, gene regulation)
- Substrate sequence (atoms -> ... -> language -> ?)
- Spatial dimension conjecture
