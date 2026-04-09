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

### 8.2 Meaning (hypothesis, not definition)

**Hypothesis:** The structural importance of a node v correlates with
the number of templates it participates in:

```
importance(v) ~ |{A : v in some instance A[q]}|
```

A node that appears in many template instances carries more structural
weight. This is testable once we have a corpus of extracted DAGs.
It is NOT a definition of "meaning" -- it is a measurable proxy.

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
2. **Quality metrics** -- when is a template meaningful vs. trivial?
3. **Domain bridging** -- how to apply this to non-narrative DAGs (gene networks, ecosystems)
4. **The archetype count** -- can we derive a finite bound on templates at a given abstraction level?
5. **Cross-narrative convergence** -- building domain-scale DAGs where convergence is meaningful

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
| **L** | The semantic lexicon. Vocabulary for building expressions. |
| **Merge node** | A node with in-degree >= 2 within a single DAG. Not convergence. |
| **Parallel DAGs** | Two subgraphs that instantiate the same template with different parameters. |
| **Semantic expression** | A composition of L entries. The content of a node. |
| **Sjuzhet** | A particular telling. = a threading of the DAG. Analytical tool, not core structure. |
| **Template** | A parametrized pattern with open parameter slots. The archetype mechanism. |
| **Thread** | An ordered sequence of node visits. Describes telling order. |

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
- Instantiation + contrast as operational tools
- Convergence as global-DAG attractor (cross-narrative scope)

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
