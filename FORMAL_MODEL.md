# Retrocause: Formal Model

## Role of this document

This is the apparatus the intuitions in `INTUITIONS.md` require in
order to be operational. **It is not the project's thesis.** The
thesis is upstream: narrative structure is ontologically primary; G
is the substrate; convergence nodes are real attractors; etc. The
formalism's job is to give those claims sharp enough machinery that
they can fail.

Read `CONCEPT.md` first. Then `INTUITIONS.md` for the claims tagged
`operational` / `partial` / `open`. This document implements every
`operational` claim and pieces of the `partial` ones. The `open`
claims have no formal correlate here, by design.

When this document and `INTUITIONS.md` disagree, **the disagreement is
the data** — neither side silently wins. The expected resolution is
that one side updates and the other is then consistent. When this
document and the code disagree, the document wins.

## Rebase on Lessard & Levison (2013)

Grounded in the threaded-DAG formalism of "Groundhog DAG" (W13-1408).
That paper's operational machinery -- semantic expressions, subDAGs,
threading, parametrization -- replaces the v1 draft's abstract
topology talk (now archived at `prior_research/FORMAL_MODEL_v1.md`).
Where the paper is unfinished (most places), we extend. Where the
retrocause intuitions are compatible, we keep them. Where they
conflict with the paper's formalism, the formalism wins *within this
document* — the intuition stays open, marked as such in
`INTUITIONS.md`.

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

### 1.5 Extension: Preconditions and Effects

The paper's L entries declare only a type signature and a gloss. That
is enough to *represent* an event but not enough to *decide* whether
the event is allowed at a particular point in a story. To make the
formalism executable -- in particular, to enumerate the set of branches
that may legally follow a given node -- each L entry may additionally
declare:

```
name :: (type_1, ..., type_n) -> result_type
name(x_1, ..., x_n) = "informal natural-language gloss"
requires: <state predicate over the x_i, evaluated in the pre-state>
effects:  <list of +fact / -fact deltas applied to produce the post-state>
```

Both `requires` and `effects` are **optional**. An entry without
`requires` is interpreted as `requires: true` (always applicable). An
entry without `effects` is interpreted as `effects: {}` (no state
change). This keeps every entry written before this extension
backward-compatible: untyped narrative expressions remain legal and
behave as unconditional, pure events.

Worked example:

```
confess :: (entity, entity, completion) -> completion
confess(X, Y, Z) = "[X] confesses [Z] to [Y]"
requires: knows(X, Z) and not knows(Y, Z)
effects:  +knows(Y, Z)

recognize :: (entity, completion, mode) -> completion
recognize(X, Z, M) = "[X] recognizes [Z], in mode [M]"
requires: present(X, Z)
effects:  +knows(X, Z)
```

The state language used inside `requires` and `effects` is defined in
§1.6 below.

This extension addresses one of the v2-as-written gaps: §4.5 defines
agency `sigma` as "the function selecting the next node at DAG branch
points" but never defines the **set** from which `sigma` selects.
Section 7.8 (the frontier operator) gives that set its formal
definition, and that definition is only computable once L entries
carry preconditions and effects.

### 1.6 Extension: State Predicate Vocabulary P

P is a typed vocabulary of world-state predicates, parallel to L but
operating at the level of facts about the storyworld rather than
events within it.

```
predicate_name :: (type_1, ..., type_n) -> bool
```

A **state** sigma is a finite set of saturated predicate applications
(ground atoms). Closed-world assumption: a predicate application is
true iff it is in sigma. Negation in `requires` is interpreted as
absence from sigma.

A small initial vocabulary (extensible per analysis, like L itself):

| Predicate | Arity | Meaning |
|-----------|-------|---------|
| `knows`     | (entity, completion) | The entity has information about an event |
| `has`       | (entity, entity)     | The first entity possesses the second |
| `at`        | (entity, place)      | The entity is located at the place |
| `alive`     | (entity,)            | The entity is alive |
| `trusts`    | (entity, entity)     | The first entity trusts the second |
| `intends`   | (entity, completion) | The entity has the event as a goal |
| `present`   | (entity, completion) | The entity is co-located with the event |

State propagation along the DAG. For a node v with causal predecessors
preds(v), the pre-state is the union of the predecessors' post-states:

```
pre-state(v)  = union { post-state(u) : u in preds(v) }
post-state(v) = apply(effects(v), pre-state(v))
```

where `apply(delta, sigma)` adds every `+f` in delta to sigma and
removes every `-f` in delta from sigma.

Sources (nodes with no predecessors) receive an initial state declared
by the enclosing subDAG -- see §3.5.

**OPEN: convergence conflicts.** When two parallel branches set
contradictory facts and both feed a convergence node, the union is
ill-defined. v2 leaves this as set-union with collision noted (a
collision is a contradiction between `+f` from one branch and `-f`
from another). A principled resolution probably requires the
convergence node to declare which branch's facts it commits to, or
equivalently to declare its own pre-state preconditions.

**OPEN: predicate vocabulary growth.** P, like L, is meant to grow
with analysis. We do not commit to a fixed P. Whatever predicates a
story's `requires` clauses mention are the predicates that story
needs.

### 1.7 Extension: Derivation Rules over P

State updates as defined in §1.6 are purely additive/subtractive:
post-state is pre-state with effects applied as set deltas. This is
not always enough. Some facts in a storyworld are **derived** from
others -- they follow logically from the explicit state but are not
themselves declared as effects of any single event. The cleanest case
arises at parallel-branch convergence (§3.3, §8.1), where merging
two post-states produces a state that entails facts neither
post-state alone entailed. The worked example in Appendix C names
this case directly: dramatic irony in "The Gift of the Magi" is
structurally an entailed fact at the merge of Della's and Jim's
parallel sacrifice chains.

#### 1.7.1 Definition

A **derivation rule** has the form:

```
rule_name: <antecedent> ==> <consequent>
```

The antecedent is a conjunction of P-atoms, possibly with free
variables that bind by pattern matching against the current state.
The consequent is one or more P-atoms (possibly mentioning derived
terms not present in the antecedent).

#### 1.7.2 When rules fire

After every state update -- whether from materializing an atomic
event (§7.8) or merging post-states at a convergence node (§1.6) --
the **derivation closure** is computed by forward chaining:
repeatedly apply rules whose antecedents match the current state
until a fixed point is reached. The fixed-point state is what later
nodes see as their pre-state.

#### 1.7.3 Worked rule (from Magi, Appendix C)

```
useless_pairing:
  has(X, GiftA) and has(Y, GiftB)
  and pairs_with(GiftA, RequiredA)
  and not has(Y, RequiredA)
  ==> useless(GiftA, sacrificed(Y, RequiredA))
```

With `pairs_with(watch_chain, watch)` and `pairs_with(combs, hair)`
declared as story-level givens, the merged state at `magi_reveal`
(see §C.4) fires this rule symmetrically and yields the two `useless`
atoms that the `reveal` effects then propagate as knowledge.

The audience sees these `useless` atoms because they sit outside the
DAG and observe its merged state; the characters do not, until
`reveal` updates their `knows` predicates. This is the formal content
of "dramatic irony": **a fact logically entailed by the merged
storyworld state that no individual character's pre-state entails.**

#### 1.7.4 Termination and confluence

Naive forward chaining can loop. The formalism restricts rule libraries
to **stratified** rules: derived predicates form a DAG with no cycles.
This guarantees the closure step terminates. **Confluence** (closure
result is independent of firing order) is stronger; rule libraries
that need it must verify it case-by-case. The formalism does not
enforce confluence — that is an analysis obligation on the library.

Three rule shapes occur in practice: (a) **entailment** — consequent
follows by classical FOL from antecedent; safe and monotone;
(b) **defeasible** — consequent holds unless explicitly contradicted;
non-monotone, used sparingly; (c) **constructive** — consequent
introduces a fresh derived term (the Magi `useless_pairing` rule of
§1.7.3 is constructive). Constructive rules need a depth bound or
stratification to terminate. The taxonomy is descriptive, not a
required typing — most rules are entailments.

#### 1.7.5 Where rules live (OPEN)

Two routes:

(a) **Per-story** rules declared in scope(D) alongside cast/setting/
    props/initial_state (see §3.5's extended `derivations` field).
    Story-specific rules like `useless_pairing` belong here because
    `pairs_with` is per-story data.

(b) **Per-predicate** rules attached to predicates in P, applying
    across all stories that use those predicates. Genuinely universal
    rules belong here.

v2 recommends route (a) as the default and lifting only verified-
universal rules into a shared default-rule library. Magi's
`useless_pairing` is borderline: "useless gift" is a general human
concept, but it bottoms out on a per-story `pairs_with`, so the rule
as written is correctly per-story.

#### 1.7.6 Section relationships

- Extends §1.6 (state propagation): rules fire after every state
  update, between effects-application and the next node's pre-state
  computation.
- Partially closes the §1.6 OPEN on convergence conflicts: explicit
  derivation rules can encode conflict-resolution policy, replacing
  the silent set-union default with a declared policy.
- Grounds §8.1 (convergence): a convergence node is structurally
  significant precisely because it is where merge-derivations can
  fire that no upstream node could have triggered.
- Modifies §7.8 (frontier): post-state for a candidate is the
  derivation closure of (apply effects to pre-state), not just
  (apply effects to pre-state). `requires` clauses of subsequent
  candidates may reference derived facts.

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

### 3.5 Extension: Scope (cast, setting, props)

A subDAG D additionally declares a typed environment that bounds the
parameter values its interior nodes may bind:

```
scope(D) = (cast, setting, props, initial_state, derivations)
  cast          :: set of (name :: type) entity declarations
  setting       :: set of (name :: type) static-place declarations
  props         :: set of (name :: type) other static-typed values
  initial_state :: a state (set of P-atoms) seeding the source nodes
  derivations   :: set of derivation rules (§1.7) fired in state-update
                   closure; optional, defaults to empty
```

Nesting rule: an interior subDAG D' inherits the scope of its
enclosing D and may extend it with declarations introduced by its own
nodes (e.g., a node that introduces a new character extends `cast`).
A node v may bind a parameter slot to a value only if that value is
declared in some scope on the path from v out to the root subDAG.

Worked example -- "Little Red Riding Hood":

```
scope(red_story) = (
  cast = {
    red :: entity, mother :: entity, wolf :: entity,
    grandmother :: entity, woodcutter :: entity
  },
  setting = {
    home :: place, woods :: place, grandmother_house :: place
  },
  props = {
    basket :: object, path :: object
  },
  initial_state = {
    alive(red), alive(mother), alive(wolf),
    alive(grandmother), alive(woodcutter),
    at(red, home), at(mother, home),
    at(grandmother, grandmother_house),
    has(mother, basket), trusts(red, mother)
  }
)
```

Why this is required for §7.8. The frontier operator enumerates "all
allowed continuations" by ranging the L entries' parameter slots over
some set of values. Without `scope`, that set is undefined -- we'd be
ranging over an unbounded universe. With `scope`, enumeration is
finite and per-story.

This extension closes one of the gaps surfaced when trying to make
the §7 operators computable on real stories: §3.2 describes subDAG
nesting but does not say which entities are visible at a given node.

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

### 7.8 Frontier Operator: Phi

The **frontier** at a node v in subDAG D is the set of well-formed
candidate continuations: every generator the lexicon and template
registry permit to follow v, given the current state.

```
Phi(v) = { (g, b) :
  g in L union T,                            -- generator
  b = parameter binding for g,
  every parameter in b is drawn from scope(D),
  precondition_check(g, b, post-state(v)) succeeds,
  the materialization of (g, b) introduces no node already downstream of v in D
}
```

The generator g is either an **atomic** L entry or a **template** from
the registry T (§5). The two cases differ only in:

| | Atomic generator (g in L) | Template generator (g in T) |
|---|---|---|
| Binding | saturate all argument slots of g | bind every typed parameter slot of the template |
| Precondition check | `requires(g)[b]` holds in `post-state(v)` | for every interior node u of `g[b]`, visited in dependency order, `requires(u)` holds in the state reached just before u; plus `precondition_pattern(g)` matches `(expr(v), tags(v))` |
| Materialization | one new node + one edge | instantiate the full subDAG `g[b]` and attach with the choice / causes / rejoins edges declared by g |
| Post-state update | `post-state(v') = derivation_closure(apply(effects(g)[b], post-state(v)))` per §1.7 | per-interior-node, in dependency order, with derivation closure after each |
| Acyclicity check | yes, on the resulting DAG | yes, on the resulting DAG |

Candidates carry their generator's identity (atomic vs template, which
entry, which template) so consumers can distinguish them downstream.
The acyclicity check (§3.1) is the only filter outside L + P + scope.

**Boundedness.** L is finite at any moment of analysis, T is finite by
enumeration, and `scope(D)` is finite by §3.5. So Phi(v) is finite,
*unless* T contains a template applicable to its own output, in which
case the frontier is potentially unbounded under iteration. The
formalism currently restricts T to non-self-applicable templates;
recursive templates are deferred.

**Use.** This is the operator the branching story DAG builder calls
when a user selects a node and asks "what outgoing branches are
allowed here?" The answer is Phi(v).

### 7.9 Ranking Metrics on Frontier Candidates

Phi(v) can be large. The formalism defines three orthogonal scores
for ordering candidates; **contrast** is the headline (it is what
surfaces counterfactually informative branches and is what the app's
default UI sorts by), the other two are sorts available when
contrast is not what the application wants.

**Specificity.** How concretely the candidate's parameters are bound.

```
specificity((e, p)) = (# of p_i that are concrete entities in scope)
                      / (arity of e)
```

Atomic candidates always have specificity = 1 because L entries are
saturated at materialization. The metric is most useful for template
candidates whose declared slots may remain abstract.

**Contrast.** How much the candidate diverges from the canonical
continuation at v, in the sense of §6.2.

```
contrast(c, c_canonical) =
  | { i : c.binding[i] != c_canonical.binding[i] } |
                                  if c and c_canonical share a template
  edit_distance(expr(c), expr(c_canonical))
                                  otherwise
```

High contrast = counterfactually informative; low contrast = a near
paraphrase of the canonical path.

**Convergence proximity.** How close the candidate is to a downstream
convergence node it could rejoin.

```
convergence_proximity(c) =
  min { rank(w) - rank(c) : w reachable from c in D
                          and (in_degree(w) >= 2 or w.kind == convergence)
                          and requires-of-w satisfiable from post-state(c) }
```

Smaller proximity = tighter counterfactual loop, easier rejoin. If no
such w exists, the candidate is **open** (no rejoin available); the
metric is undefined and the UI should mark it accordingly.

**Composition.** v2 does not commit to a scalar combination of these
three. Default presentation: a Pareto front over
`(specificity, contrast, -convergence_proximity)`, so no aesthetic is
pre-baked into the ranking.

**OPEN: MDL-style ranking.** A description-length metric over the
template registry would let the system prefer candidates whose
materialized subDAGs are best compressed by an existing template
(reward archetypal continuations) or, dually, prefer candidates that
extend the registry (reward novelty). The choice between these depends
on whether the application wants conventional or surprising stories.

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

**Structural significance via §1.7.** A convergence node is more than
a topological feature -- it is the unique kind of node at which
derivation rules can fire that no upstream node could have triggered.
Merging two parallel post-states can entail facts neither post-state
alone entails, and §1.7's `derivation_closure` is what surfaces them.
This is the mathematical content of phenomena like dramatic irony
(see Appendix C.4): the merged storyworld state entails a fact that
no individual character's pre-state did. Convergence is therefore
not just where paths meet -- it is where emergent facts appear.

### 8.2 Meaning of a node

The meaning of a node v is:

```
M(v) = the set of all templates A such that v participates in
        some instance A[q] within the DAG
```

A node that appears in many template instances has richer meaning than
one that appears in few. This is the formal correlate of
`INTUITIONS.md` claim 2 (events are atomic, meaning is relational)
and is computable once template extraction (§5.5) is. Until then it is
definable but not measurable on real DAGs.

The other retrocause concepts — mind-cursor as threading agent,
time-as-segment-counter, free will as the agency function at branch
points — are tracked in `INTUITIONS.md` (claims 4 and 7) with their
operational status. They live in the philosophical layer, not here.

---

## 9. What is still missing

The formalism does not yet provide:

1. **Template extraction.** Anti-unification on typed DAGs (§5.5,
   §7.3) is sketched, not implemented. Without it, claim 6 of
   `INTUITIONS.md` (archetype = parametrized template) remains
   `partial`.
2. **Composition algebra.** Formal rules for sequential / parallel /
   convergent composition of subDAGs (§7.7).
3. **Template quality metrics.** No principled way to distinguish
   meaningful templates from trivial ones at scale.
4. **Domain bridging.** No worked apparatus for applying the
   formalism to non-narrative DAGs (gene networks, ecosystems).
   The §8 ontological claim makes this the project's central
   empirical bet; the formalism cannot yet support the test.
5. **Convergence-conflict resolution policy.** §1.6 OPEN: when
   parallel branches set contradictory facts, the merge is currently
   set-union with collision noted. A principled policy is deferred.
6. **Granularity anchoring.** Same story can be one node or ten
   thousand; the formalism does not commit to a principled grain.
7. **Dependency sub-classification.** L&L's paper and this formalism
   use one undifferentiated "dependency" relation. Real causal
   structure has typed flavors (temporal, logical, material,
   informational). Sub-classification would enrich the template
   language but is not currently implemented.

These limits are deliberate. The formalism captures what the project
can defend; the rest is in `INTUITIONS.md` as `partial` or `open`.

---

## 10. Glossary

Restricted to terms whose meaning is non-obvious or whose ordinary
sense differs from the technical sense used here. Terms whose
definition is already given in section text (e.g., pre-state,
post-state, requires, effects, initial_state, cast, setting) are not
glossed.

| Term | Definition |
|------|-----------|
| **Completion** | A fully-saturated semantic expression (all argument slots bound). The content of one DAG node. |
| **Derivation closure** | The fixed-point state reached by forward-chaining stratified derivation rules. Computed after every state update (§1.7). |
| **Dramatic irony (formal)** | A fact entailed by the merged post-states at a convergence node that no upstream post-state alone entailed (§1.7.3, §8.1, Appendix C.4). |
| **Fabula** | The story's underlying event structure. The DAG. (As opposed to sjuzhet.) |
| **Frontier (Phi)** | The set of allowed continuations from a node, given L, P, scope, and the template registry. Defined in §7.8. |
| **G** | The universal DAG. The ontological claim that G *is* the substrate (rather than a model of it) lives in `INTUITIONS.md` claim 1. |
| **L** | The semantic lexicon. Typed vocabulary of event-template entries. |
| **P** | The world-state predicate vocabulary. Parallel to L but at the state level. |
| **Parametrized subDAG / Template** | A subDAG with typed parameter slots; the formal correlate of "archetype" (`INTUITIONS.md` claim 6). |
| **Sjuzhet** | A particular telling of a story; a threading of the DAG. (As opposed to fabula.) |
| **SubDAG** | A node with interior structure. From outside, one node; from inside, a DAG. |
| **Stratified rules** | A derivation rule library whose derived predicates form a DAG, guaranteeing closure termination (§1.7.4). |
| **Thread** | An ordered sequence of node visits. May revisit, skip, jump. Not the same as a path in the DAG. |
| **Thread shortcut** | A thread that traverses only some interior nodes of a subDAG; the formalism's model of narrative compression and attention. |

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
- State-conditioned L entries with `requires` and `effects` (§1.5)
- Predicate vocabulary P for world state (§1.6)
- Derivation rules and closure semantics, with dramatic irony as the
  formal case of a merge-derived entailment at a convergence node (§1.7, §8.1)
- Typed subDAG scope: cast, setting, props, initial_state, derivations (§3.5)
- Frontier operator Phi for enumerating allowed continuations (§7.8)
- Ranking metrics on frontier candidates (§7.9)

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

---

## Appendix B: Worked Example -- Little Red Riding Hood

This appendix annotates one of the builder's seeded story DAGs
end-to-end against the v2 formalism as extended by §1.5, §1.6, §3.5,
§7.8, and §7.9. It is concrete enough that the builder's frontier
enumerator can be written directly against the declarations below.

The seed being annotated is the `red` story in `story_builder_app.js`.

### B.1 Scope

```
scope(red_story) = (
  cast = {
    red :: entity,
    mother :: entity,
    wolf :: entity,
    grandmother :: entity,
    woodcutter :: entity
  },
  setting = {
    home :: place,
    woods :: place,
    grandmother_house :: place
  },
  props = {
    basket :: entity
  },
  initial_state = {
    alive(red), alive(mother), alive(wolf),
    alive(grandmother), alive(woodcutter),
    at(red, home), at(mother, home),
    at(wolf, woods), at(woodcutter, woods),
    at(grandmother, grandmother_house),
    has(mother, basket),
    trusts(red, mother), trusts(red, grandmother),
    intends(red, deliver_basket),
    knows(red, destination(red, grandmother_house))
  }
)
```

The basket is typed `entity` (rather than introducing a separate
`object` base type) because the existing L entries take two `entity`
arguments. This is a convenience -- L's base types are extensible per
§1.2.

`knows(red, destination(red, grandmother_house))` is in initial_state
deliberately; §B.4 below shows why omitting it would block the wolf's
deception precondition.

### B.2 Lexicon L (entries used in this story)

Seven entries are annotated fully (preconditions + effects). Two
entries that appear in node expressions but do not affect frontier
enumeration in the canonical path are annotated only with their type
signature.

#### Fully annotated

```
give :: (entity, entity, entity) -> completion
give(Giver, Receiver, Item) = "[Giver] gives [Item] to [Receiver]"
requires: has(Giver, Item)
          and exists P (at(Giver, P) and at(Receiver, P))
effects:  -has(Giver, Item), +has(Receiver, Item)

move :: (entity, place, place) -> completion
move(X, From, To) = "[X] moves from [From] to [To]"
requires: at(X, From) and alive(X)
effects:  -at(X, From), +at(X, To)

learn_from :: (entity, entity, completion, place) -> completion
learn_from(L, S, F, P) = "[L] learns [F] from [S] at [P]"
requires: at(L, P) and at(S, P) and knows(S, F)
effects:  +knows(L, F)

impersonate :: (entity, entity, place) -> completion
impersonate(X, Y, P) = "[X] impersonates [Y] at [P]"
requires: at(X, P) and not at(Y, P) and alive(X)
effects:  (see OPEN B.3-1 below: introduces a quantified belief
           predicate not yet expressible in P)

recognize :: (entity, completion, mode) -> completion
recognize(X, Z, M) = "[X] recognizes [Z], in mode [M]"
requires: present(X, Z)
effects:  +knows(X, Z)

ask_help :: (entity, entity) -> completion
ask_help(Asker, Helper) = "[Asker] asks [Helper] for help"
requires: alive(Helper)
          and exists P (at(Asker, P) and at(Helper, P))
effects:  +intends(Helper, aid(Asker))

rescue :: (entity, entity, entity) -> completion
rescue(Rescuer, Victim, Bystander) = "[Rescuer] rescues [Victim] and [Bystander]"
requires: intends(Rescuer, aid(Victim))
          and exists P (at(Rescuer,P) and at(Victim,P) and at(Bystander,P))
effects:  +safe(Victim), +safe(Bystander)
```

#### Lightly annotated (signature only)

```
delay :: (entity, entity) -> completion
delay(X, Distractor) = "[X] is delayed by [Distractor]"

warn :: (entity, entity, completion) -> completion
warn(Sender, Receiver, Topic) = "[Sender] warns [Receiver] about [Topic]"
```

`delay` is duration-creating; v2 does not yet have a temporal
predicate vocabulary. `warn` has a clear precondition (a communication
channel between sender and receiver), but the story does not model
how Red would reach grandmother without arriving in person; the entry
is listed for completeness but its branch instance
(`red_branch_warning`) implicitly assumes co-location.

### B.3 Typed expressions for every node

| Node id              | Seed expression                       | Fully typed form                                                  |
|----------------------|---------------------------------------|-------------------------------------------------------------------|
| red_start            | send(mother, red, basket)             | give(mother, red, basket)                                         |
| red_woods            | enter(red, woods)                     | move(red, home, woods)                                            |
| red_wolf             | deceive(wolf, red)                    | learn_from(wolf, red, destination(red, grandmother_house), woods) |
| red_delay            | delay(red, flowers)                   | delay(red, flowers)                                               |
| red_grandma          | arrive(wolf, grandmother_house)       | move(wolf, woods, grandmother_house)                              |
| red_disguise         | impersonate(wolf, grandmother)        | impersonate(wolf, grandmother, grandmother_house)                 |
| red_recognition      | recognize(red, wolf, late)            | recognize(red, deception(wolf, grandmother), late)                |
| red_rescue           | rescue(woodcutter, red, grandmother)  | rescue(woodcutter, red, grandmother)                              |
| red_branch_help      | ask_help(red, woodcutter)             | ask_help(red, woodcutter)                                         |
| red_branch_warning   | warn(red, grandmother)                | warn(red, grandmother, deception(wolf, grandmother))              |

`destination(red, grandmother_house)` and `deception(wolf,
grandmother)` are nested completion expressions used as completion-
typed arguments. They are named completion values, not separate L
entries -- the model permits this per §1.4's OPEN note on recursive
types.

OPEN (B.3-1): the effect of `impersonate` is "any third party who
arrives at P and does not know about the impersonation comes to
believe Y is at P." This is a quantified, conditional effect that P
as defined in §1.6 does not yet support. For this example we treat it
as a derived rule applied at the moment a third party performs
`move(?, ?, P)` during the impersonation. A principled solution would
extend P with a `holds_during` operator over thread segments.

### B.4 State propagation along the canonical path

Tracking sigma through the first three canonical nodes makes the
precondition checks of §1.5 concrete.

```
pre-state(red_start) = initial_state                       -- per §3.5

red_start = give(mother, red, basket)
  requires: has(mother, basket)
            and exists P (at(mother,P) and at(red,P))   [P = home]
  STATUS:   satisfied
  effects:  -has(mother, basket), +has(red, basket)
post-state(red_start) = initial_state
                        \ { has(mother, basket) }
                        u { has(red, basket) }

red_woods = move(red, home, woods)
  pre-state = post-state(red_start)
  requires: at(red, home) and alive(red)
  STATUS:   satisfied
  effects:  -at(red, home), +at(red, woods)
post-state(red_woods) = pre-state
                        \ { at(red, home) }
                        u { at(red, woods) }

red_wolf = learn_from(wolf, red, destination(red, grandmother_house), woods)
  pre-state = post-state(red_woods)
  requires: at(wolf, woods)                  [from initial_state, untouched]
            and at(red, woods)               [just established]
            and knows(red, destination(red, grandmother_house))
                                             [from initial_state]
  STATUS:   satisfied
  effects:  +knows(wolf, destination(red, grandmother_house))
post-state(red_wolf) = pre-state
                       u { knows(wolf, destination(red, grandmother_house)) }
```

If `knows(red, destination(red, grandmother_house))` were not in
initial_state (as it was not in the v2 §3.5 draft), the precondition
check above would fail at red_wolf and the canonical path would be
flagged unsatisfiable. That a careful pass through the formalism
surfaces this implicit assumption is exactly the validation-by-
execution benefit anticipated in §7.8.

### B.5 Frontier computation at red_wolf

Choose v = red_wolf. We enumerate Phi(red_wolf) given scope(red_story),
the L entries of §B.2, and post-state(red_wolf) from §B.4.

#### Phi_atomic(red_wolf) -- sample candidates considered

| Candidate                                            | requires satisfied? | Note                                                 |
|------------------------------------------------------|---------------------|------------------------------------------------------|
| move(red, woods, grandmother_house)                  | yes                 | continues the canonical journey                      |
| move(red, woods, home)                               | yes                 | turn back                                            |
| move(wolf, woods, grandmother_house)                 | yes                 | wolf races ahead (this is canonical red_grandma)     |
| ask_help(red, woodcutter)                            | yes                 | both at woods; matches the seed's existing branch    |
| ask_help(red, wolf)                                  | yes                 | type-correct, narratively absurd (see B.6 OPEN)      |
| give(red, wolf, basket)                              | yes                 | placation; novel relative to seed                    |
| give(red, woodcutter, basket)                        | yes                 | novel                                                |
| delay(red, flowers)                                  | (sig-only)          | accepted as always-applicable in this example        |
| impersonate(wolf, grandmother, grandmother_house)    | no                  | at(wolf, woods), not at grandmother_house            |
| recognize(red, deception(wolf, grandmother), late)   | no                  | present(red, deception) not yet established          |
| rescue(woodcutter, red, grandmother)                 | no                  | intends(woodcutter, aid(red)) not yet established    |

Phi_atomic(red_wolf) returns the eight rows marked "yes" / "sig-only".
The three "no" rows are filtered by their unsatisfied preconditions.
Notice that the seed's existing branch -- `ask_help(red, woodcutter)`
-- appears as one candidate among others. The formalism does not
single it out; the ranking metrics in §B.6 do.

#### Phi_T(red_wolf) -- template candidates

Assume a minimal template registry T with two entries.

```
T1: counsel(Asker :: entity, Ally :: entity) = slist(
      ask_help(Asker, Ally),
      learn_from(Asker, Ally, advice, ?),
      reconsider(Asker)
    )
    precondition_pattern: any node with tag in {"threshold","deception"}

T2: recognize_early(X :: entity, F :: completion) = slist(
      observe(X, anomaly),
      recognize(X, F, early)
    )
    precondition_pattern: any node whose expr's L entry is in
                          {"learn_from","deceive","impersonate"}
```

| Template candidate                                       | Binding             | Applicable?                                         |
|----------------------------------------------------------|---------------------|-----------------------------------------------------|
| counsel(red, woodcutter)                                 | Ally = woodcutter   | yes                                                 |
| counsel(red, wolf)                                       | Ally = wolf         | yes (typed-correct, semantically poor)              |
| counsel(red, mother)                                     | Ally = mother       | no -- mother at home, ask_help requires co-location |
| recognize_early(red, deception(wolf, grandmother))       | --                  | yes                                                 |

Unified frontier: eight atomic + three template = eleven candidates.

### B.6 Ranking the frontier

Apply §7.9 to the unified frontier. Take the canonical continuation
at red_wolf to be `move(red, woods, grandmother_house)` (Red's
implicit next step before delay/arrival). Convergence target for
proximity scoring is `red_recognition` (the seed's tagged convergence
node).

| Candidate                                              | spec | contrast | conv. prox. | Pareto-optimal?                |
|--------------------------------------------------------|------|----------|-------------|--------------------------------|
| move(red, woods, grandmother_house)                    | 1.0  | 0        | 4           | yes (canonical baseline)       |
| move(red, woods, home)                                 | 1.0  | 1        | infinity    | no (open, dominated by ask_help) |
| move(wolf, woods, grandmother_house)                   | 1.0  | high     | 3           | yes (the canonical wolf move)  |
| ask_help(red, woodcutter)                              | 1.0  | high     | 3           | yes                            |
| ask_help(red, wolf)                                    | 1.0  | high     | 3           | survives in bare formalism; see B.6-1 |
| give(red, wolf, basket)                                | 1.0  | high     | infinity    | yes (open, unique on contrast) |
| give(red, woodcutter, basket)                          | 1.0  | high     | infinity    | dominated by ask_help/woodcutter |
| delay(red, flowers)                                    | 1.0  | 0        | 3           | yes (canonical sequence)       |
| counsel(red, woodcutter)            [template T1]      | 1.0  | high     | 3           | yes                            |
| counsel(red, wolf)                  [template T1]      | 1.0  | high     | 3           | survives; see B.6-1            |
| recognize_early(red, deception(wolf, grandmother)) [T2] | 1.0  | very high| 2           | yes (strongest counterfactual) |

OPEN (B.6-1): the bare §7.9 metrics do not penalize narrative
incoherence (`ask_help(red, wolf)`, `counsel(red, wolf)`). Two routes
forward: (a) extend P with adversarial/trust predicates so a
precondition like `not_adversary(Asker, Helper)` filters such
candidates at §7.8, or (b) leave coherence to a higher-level metric
beyond §7.9. v2 recommends (a) where the relationship can be declared
in initial_state -- consistent with the preference for filtering by
formal preconditions over filtering by external taste. The minimal
addition for red_story is a single fact: `adversarial(wolf, red)` in
initial_state plus `not adversarial(Helper, Asker)` in ask_help's
requires.

### B.7 What this example demonstrates

1. Every section of v2 (incl. §1.5, §1.6, §3.5, §7.8, §7.9) lands on
   real story content -- not just on abstract diagrams.
2. State propagation through `requires`/`effects` immediately surfaced
   one implicit assumption in the seed (Red's knowledge of her
   destination, §B.4) and one expressive gap in P (quantified
   `believes_during` for impersonation, §B.3 OPEN). Both are
   improvements, not failures.
3. The seed's hand-authored branch (`ask_help(red, woodcutter)`) is
   recovered automatically as a Pareto-optimal frontier candidate at
   `red_wolf` -- the enumerator can re-derive human authoring choices,
   not just generate alternatives.
4. A stronger candidate (`recognize_early(...)`) appears in the
   frontier that the seed does not currently include -- the enumerator
   can also propose authoring moves the human did not.
5. A narratively poor candidate (`ask_help(red, wolf)`) shows up too,
   identifying the next concrete extension of L/P needed before
   automation can fully replace authorial judgment (§B.6 OPEN).

---

## Appendix C: Worked Example -- The Gift of the Magi

A second worked example. Magi is chosen over the other seeded stories
because it stresses parts of the formalism Red did not: parallel
subDAGs that converge (§6.1, §8.1), state-merge at convergence (§1.6
OPEN), dyadic-group entities, and dramatic irony as a property
emerging from merged post-states. Necklace would stress temporal
predicates that v2 explicitly defers, so it is held back until a
temporal extension of P is in scope.

The goal of this appendix is not to re-demonstrate the formalism --
that was Appendix B's job. The goal is to **calibrate** which OPEN
markers from Appendix B are general gaps in v2 versus which were
Red-specific quirks, and to identify any new gaps Red did not expose.

The seed being annotated is the `magi` story in `story_builder_app.js`.

### C.1 Scope

```
scope(magi_story) = (
  cast = {
    della :: entity,
    jim :: entity,
    couple :: entity,           -- a dyadic group entity; see OPEN C.1-1
    buyer_hair :: entity,       -- the (off-stage) hair purchaser
    buyer_watch :: entity       -- the (off-stage) watch purchaser
  },
  setting = {
    home :: place,
    shop :: place
  },
  props = {
    hair :: entity,
    watch :: entity,
    watch_chain :: entity,
    combs :: entity
  },
  initial_state = {
    alive(della), alive(jim),
    married(della, jim),
    members_of(couple, della), members_of(couple, jim),
    at(della, home), at(jim, home),
    has(della, hair), has(jim, watch),
    values(della, hair), values(jim, watch),
    intends(della, gift_for(jim)),
    intends(jim, gift_for(della)),
    not has_funds(della), not has_funds(jim)
  }
)
```

OPEN (C.1-1): `couple` is treated as a first-class entity with
`members_of` linking it to its constituents. This was not needed in
Red because every action took individual actors. Magi's canonical
nodes mention `couple` as the subject of `recognize(couple, love)`,
which only makes sense if `couple` is a separately bindable parameter.
Two principled routes: (a) lift `couple` to a derived entity whose
properties are computed from members' properties (extending §1.2 with
a derivation operator), or (b) treat any `couple`-subject action as
sugar for the conjunction of single-actor actions over the membership.
Route (b) is simpler and preserves §1.6's closed-world semantics; the
worked nodes in §C.3 use it.

OPEN (C.1-2): `gift_for(jim)` and `gift_for(della)` are intentional
completions appearing in `intends` as predicate arguments. These are
goal-typed values (a completion that hasn't happened yet but is held
as an aim). Red's `intends(red, deliver_basket)` had the same shape.
This is a recurring pattern -- the same shape was flagged in §1.4 as
the OPEN around recursive types and shows up immediately in two
independent stories. v2 should likely promote `intends(X, F)` to a
first-class construct with declared semantics rather than continuing
to treat F as a generic completion.

### C.2 Lexicon L (entries used in this story)

Five entries fully annotated. Three entries from Appendix B (recognize,
confess, choose) are reused with the same signatures.

```
realize :: (entity, state_atom) -> completion
realize(X, F) = "[X] realizes that [F]"
requires: F                                  -- the state must actually hold
effects:  +knows(X, F)

sacrifice :: (entity, entity) -> completion
sacrifice(X, Item) = "[X] sacrifices [Item]"
requires: has(X, Item) and values(X, Item)
effects:  -has(X, Item), +has_funds(X)

buy :: (entity, entity) -> completion
buy(X, Item) = "[X] buys [Item]"
requires: has_funds(X)
effects:  +has(X, Item), -has_funds(X)

reveal :: (completion) -> completion
reveal(F) = "[F] is revealed to everyone present"
requires: F
effects:  for each Z in cast with at(Z, P_F): +knows(Z, F)
          where P_F is the place at which F was made manifest
```

OPEN (C.2-1): `reveal`'s effects clause uses a per-entity quantifier
("for each Z in cast"). This is the same shape as Red's
`impersonate` (§B.3 OPEN B.3-1) -- a quantified effect that P as
defined in §1.6 does not yet directly express. **Two independent
stories now need this feature.** It is no longer a Red-specific quirk;
it is a real gap that the next revision of P should close. Candidate
fix: extend §1.6 with a `forall X in S: <delta>` form for effects.

#### Reused from Appendix B

```
recognize :: (entity, completion, mode) -> completion
confess   :: (entity, entity, completion) -> completion
choose    :: (entity, completion) -> completion
```

The fact that three of Red's L entries are reusable verbatim is a
calibration signal in itself: the lexicon has genuine cross-story
reuse, which is exactly the §3.4 ontological-G claim in operational
form. (If L were truly per-story, Red and Magi should share zero
entries.)

### C.3 Typed expressions for every node

| Node id              | Seed expression                  | Fully typed form                                                                                  |
|----------------------|----------------------------------|---------------------------------------------------------------------------------------------------|
| magi_start           | lack(della, money)               | realize(della, not has_funds(della))                                                              |
| magi_sell_hair       | sacrifice(della, hair)           | sacrifice(della, hair)                                                                            |
| magi_buy_chain       | buy(della, watch_chain)          | buy(della, watch_chain)                                                                           |
| magi_jim_watch       | sacrifice(jim, watch)            | sacrifice(jim, watch)                                                                             |
| magi_jim_combs       | buy(jim, combs)                  | buy(jim, combs)                                                                                   |
| magi_reveal          | reveal(useless(chain, combs))    | reveal(useless(watch_chain, sacrificed(jim, watch))) and reveal(useless(combs, sacrificed(della, hair))) |
| magi_love            | recognize(couple, love)          | recognize(della, mutual_sacrifice(della, jim), profound) and recognize(jim, mutual_sacrifice(della, jim), profound)         |
| magi_branch_talk     | confess(couple, scarcity)        | confess(della, jim, not has_funds(della)) ; confess(jim, della, not has_funds(jim))               |
| magi_branch_simple   | choose(couple, shared_meal)      | choose(della, shared_meal) ; choose(jim, shared_meal)                                             |
| magi_branch_revalue  | recognize(couple, love, without_loss) | recognize(della, love(della, jim), early) and recognize(jim, love(della, jim), early)        |

Three structural notes:

1. `magi_start` is a state-marker event, not a state-changing one.
   `realize` was added to L precisely to handle this case: it lets
   the formalism distinguish "X discovers that F" from "X causes F".
   Red did not need this -- its first node (`give(mother, red, basket)`)
   was a real state-changer.
2. `magi_reveal`'s typed form is a conjunction of two `reveal`
   applications -- one per gift's uselessness. The seed compresses
   both into the single expression `reveal(useless(chain, combs))`.
   The formalism is more explicit about the two facts being revealed
   independently.
3. `couple`-subject actions are desugared to per-member conjunctions
   per §C.1 OPEN C.1-1's route (b).

OPEN (C.3-1): the canonical edges in the seed treat Della's and
Jim's sacrifice chains as **sequential** (`magi_sell_hair` ->
`magi_buy_chain` -> `magi_jim_watch` -> `magi_jim_combs`) with a
single `parallels` edge annotating the symmetry. The story's irony,
however, depends on the two chains being **concurrent and
information-isolated** (neither spouse knows the other is sacrificing).
A faithful formalization would split these into actual parallel
subDAGs whose convergence is `magi_reveal`. This is a structural
finding the v2 formalism is ready to express (§3.2 supports it) but
the seed does not yet use; it is not a gap in v2 itself.

### C.4 State propagation along the canonical path

```
pre-state(magi_start) = initial_state

magi_start = realize(della, not has_funds(della))
  requires: not has_funds(della)              [in initial_state]
  STATUS:   satisfied
  effects:  +knows(della, not has_funds(della))
post-state(magi_start) = initial_state
                         u { knows(della, not has_funds(della)) }

magi_sell_hair = sacrifice(della, hair)
  pre-state = post-state(magi_start)
  requires: has(della, hair) and values(della, hair)
  STATUS:   satisfied
  effects:  -has(della, hair), +has_funds(della)
post-state(magi_sell_hair) = pre-state
                             \ { has(della, hair) }
                             u { has_funds(della) }

magi_buy_chain = buy(della, watch_chain)
  pre-state = post-state(magi_sell_hair)
  requires: has_funds(della)                  [just established]
  STATUS:   satisfied
  effects:  +has(della, watch_chain), -has_funds(della)
```

Now the parallel chain (treated per §C.3 OPEN C.3-1 as a separate
subDAG even though the seed sequences it):

```
magi_jim_watch = sacrifice(jim, watch)
  pre-state = post-state(magi_start)          [parallel branch, not chained off della]
  requires: has(jim, watch) and values(jim, watch)
  STATUS:   satisfied
  effects:  -has(jim, watch), +has_funds(jim)

magi_jim_combs = buy(jim, combs)
  pre-state = post-state(magi_jim_watch)
  requires: has_funds(jim)
  STATUS:   satisfied
  effects:  +has(jim, combs), -has_funds(jim)
```

Convergence at `magi_reveal`:

```
pre-state(magi_reveal) = post-state(magi_buy_chain)  union  post-state(magi_jim_combs)
                       = initial_state
                         u { knows(della, not has_funds(della)) }
                         \ { has(della, hair), has(jim, watch) }
                         u { has(della, watch_chain), has(jim, combs) }

The fact useless(watch_chain, sacrificed(jim, watch)) is DERIVABLE
from this state: watch_chain has utility only if has(jim, watch);
that fact has been removed. Symmetrically for useless(combs, ...).
So the precondition of reveal -- that the revealed F actually holds
-- is satisfied by the merged state, but **only via a derivation rule
that v2 does not yet formalize**.

effects: +knows(della, useless(watch_chain, sacrificed(jim, watch)))
         +knows(jim, useless(combs, sacrificed(della, hair)))
         (both at home, where they exchange gifts)
```

OPEN (C.4-1) -- **RESOLVED in §1.7**: the irony in Magi is structurally
a **derivation rule fired at a convergence node**. Two parallel
post-states, when merged, entail a derived fact that neither post-state
alone entailed. The original §1.6 set-union merge did not include a
derivation step; §1.7 (added after this appendix flagged the gap)
introduces derivation rules and a closure operator that fire after
every state update. The Magi `useless_pairing` rule used here is the
worked rule in §1.7.3. The structural claim -- dramatic irony is a
logical consequence of parallel-branch merge plus an entailment rule
-- is now part of the formalism rather than an appendix observation.

### C.5 Frontier computation at magi_start

Mirroring §B.5: we pick the seed's actual branch-source node so the
seed's hand-authored alternative appears in the frontier and can be
ranked. The seed's branch fires at `magi_start` (the `magi_branch_talk`
edge originates there).

#### Phi_atomic(magi_start)

| Candidate                                       | requires satisfied?      | Note                                                |
|-------------------------------------------------|--------------------------|-----------------------------------------------------|
| sacrifice(della, hair)                          | yes                      | canonical next                                      |
| sacrifice(jim, watch)                           | yes                      | jim's parallel chain (canonical, but offstage)      |
| sacrifice(della, watch)                         | no                       | has(della, watch) is false                          |
| confess(della, jim, not has_funds(della))       | yes                      | both at home; della knows; jim does not             |
| confess(jim, della, not has_funds(jim))         | no                       | requires knows(jim, not has_funds(jim))             |
| realize(jim, not has_funds(jim))                | yes                      | the symmetric awareness event                       |
| buy(della, watch_chain)                         | no                       | not has_funds(della)                                |
| recognize(della, love(della, jim), early)       | depends on present()     | sig-only in this example                            |

Phi_atomic returns the five "yes" rows. Notice that `confess` fires
as available only one-way: della cannot confess what jim has not
realized. This asymmetry is exactly what the dramatic situation needs
-- and the formalism produces it without being told.

#### Phi_T(magi_start)

Reuse the registry from §B.5 (T1 = counsel, T2 = recognize_early).
Add one template:

```
T3: communicate_constraint(X :: entity, Y :: entity, F :: state_atom) = slist(
      realize(X, F),
      confess(X, Y, F),
      choose(couple_of(X, Y), shared_plan)
    )
    precondition_pattern: any node whose expr is realize(?, not has_funds(?))
                          or whose tags include "scarcity"
```

| Template candidate                                                          | Binding                                | Applicable? |
|-----------------------------------------------------------------------------|----------------------------------------|-------------|
| counsel(della, jim)                                                         | Ally = jim                             | yes         |
| counsel(della, buyer_hair)                                                  | Ally = buyer_hair                      | no (not at home) |
| communicate_constraint(della, jim, not has_funds(della))                    | X=della, Y=jim, F=funds-lack           | yes         |
| recognize_early(della, mutual_sacrifice(della, jim))                        | --                                     | depends     |

Unified frontier: five atomic + two template = seven candidates.

### C.6 Ranking the frontier

Apply §7.9. Canonical continuation at magi_start is
`sacrifice(della, hair)`. Convergence target for proximity scoring
is `magi_reveal`.

| Candidate                                                          | spec | contrast | conv. prox. | Pareto-optimal?            |
|--------------------------------------------------------------------|------|----------|-------------|----------------------------|
| sacrifice(della, hair)                                             | 1.0  | 0        | 4           | yes (canonical baseline)   |
| sacrifice(jim, watch)                                              | 1.0  | low      | 3           | yes (faster path to reveal)|
| confess(della, jim, not has_funds(della))                          | 1.0  | very high| reroutes to magi_branch_revalue (proximity 2) | yes (seed's authored branch step 1) |
| realize(jim, not has_funds(jim))                                   | 1.0  | medium   | 4           | dominated by confess on contrast |
| counsel(della, jim)                              [template T1]     | 1.0  | high     | 3 (via branch) | yes                    |
| communicate_constraint(della, jim, not has_funds(della)) [T3]      | 1.0  | very high| 2           | yes (whole branch in one step) |
| recognize_early(della, mutual_sacrifice(della, jim))               | 1.0  | very high| 2           | yes (the strongest counterfactual, same shape as in Red §B.6) |

Two observations:

1. **The seed's hand-authored branch is recovered**, mirroring Red's
   §B.6. The atomic `confess(della, jim, ...)` and the template
   `communicate_constraint` both appear and are Pareto-optimal.
2. **`recognize_early` is again the strongest counterfactual** by the
   bare metrics -- in both Red and Magi. This is suggestive: either
   the metric has a systematic bias toward early-recognition templates
   (it does -- they minimize convergence proximity and maximize
   contrast simultaneously), or recognition-shortcuts really are
   under-used by human authors. v2 cannot decide between these from
   two examples. **A third worked example (Necklace) once temporal
   predicates are in scope would calibrate this.**

### C.7 Calibration: which OPENs generalize?

This is the meta-point of doing a second worked example.

| Open from Appendix B                              | Status after Appendix C                                |
|---------------------------------------------------|--------------------------------------------------------|
| B.3-1: quantified effects (impersonate)           | **Recurs as C.2-1** (reveal). Confirmed structural gap; v2 should add `forall X in S: <delta>` to §1.6. |
| B.4: implicit knows() missing from initial_state  | Did not recur in Magi. May have been Red-specific; tentatively a per-story authoring discipline rather than a v2 gap. |
| B.6-1: type-correct-but-absurd candidates         | Did not surface in Magi at all. Magi's cast is two cooperating spouses + two off-stage shopkeepers; there is no antagonist for type-correct-but-absurd candidates to bind against. Magi-specific absence, not a refutation. |

**New OPENs from Magi:**

| New open       | What it is                                                                                  |
|----------------|---------------------------------------------------------------------------------------------|
| C.1-1          | Group entities (`couple`) need either a derivation operator (§1.2 extension) or a desugaring convention. |
| C.1-2 / B re-look | `intends(X, F)` is a recurring shape; both stories use F as a goal-typed completion. v2 should promote it. |
| C.3-1          | Seeds encode parallel chains as sequential. The formalism supports parallels; the seeds need a representation update. (Not a v2 gap; a builder-data gap.) |
| C.4-1 -- **RESOLVED** | Dramatic irony = derivation rule at convergence-merge. Promoted to §1.7. The most interesting new finding became spec, not appendix. |

Summary: of three B-OPENs, one was structural (quantified effects, now
confirmed) and two were Red-specific. Of four C-OPENs, three are
genuinely new (group entities, derivation-at-convergence, parallel
representation), and one (`intends`) reinforces an existing §1.4
opening. Two worked examples have been enough to separate signal from
noise on every one of B's findings.

### C.8 What this example demonstrates

1. The formalism scales from a single-protagonist quest (Red) to a
   dual-protagonist convergence story (Magi) with no structural
   changes -- only L extensions.
2. The most interesting finding is C.4-1: **dramatic irony is a
   logical consequence of parallel-branch merge plus an entailment
   rule**. This is a falsifiable claim the formalism makes that
   ordinary narrative theory does not.
3. Three L entries (`recognize`, `confess`, `choose`) carried over
   verbatim from Red. This is the first operational evidence that L
   is shareable across stories rather than per-story -- a small step
   toward the §3.4 ontological-G claim being testable.
4. The "strongest counterfactual = early recognition" pattern
   recurred in both stories. Worth flagging as either a metric bias
   or a real authorial blind spot; one more story would decide.
