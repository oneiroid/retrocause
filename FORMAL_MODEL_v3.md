# Retrocause: Formal Model v3

## Status

This supersedes `FORMAL_MODEL_v2.md`. Delete v2 once v3 is accepted;
keeping both around will accrete.

v3 is a deletion pass. The goal is a document short enough that each
construct maps to a function in `builder/`, and when code produces
unexpected output, the wrong section is locatable. If a v4 grows past v3,
the project is going the wrong way.

### What v3 drops from v2, and why

- **The ontological claim** ("G IS reality," v2 §3.4 and the framing
  around it). Unfalsifiable; v2 §3.4 already admitted the formalism works
  without it. Retained as one paragraph of context (§3.3), not load-bearing.
- **Predictive reach, persistence depth** (v2 §1.2.1, T5, T6). Introduced
  as entity metadata, never calibrated. Every downstream claim that used
  them was downstream of a missing operational definition.
- **Story boundary** (v2 §8.3 *and* §8.5 -- near-duplicated sections).
  Required predictive reach and a nested-simulation operator `sim` that
  does not exist. The build plan already abandoned it.
- **Mutual predictive entanglement; predictive surplus; self-multiplication**
  (v2 §8.2, §8.6). Same dependency chain as story boundary.
- **Convergence as a global-G phenomenon** (v2 §8.1). Not detectable by
  any finite tool. Collapsed to merge-node detection in §9.1 here.
- **Threading as a major section** (v2 §4). Demoted to one paragraph; the
  builder does not traverse, so threading is not a computational object
  in this project.
- **"What this buys us" / v1-v2 comparison chapters.** Self-review.
- **INTUITIONS.md number citations.** A debt signal. Load-bearing
  intuitions are absorbed; the rest are dropped.

### What v3 retains as operational

Lexicon L, semantic expressions, DAG structure, parametrized subDAGs as
archetypes, parallel DAGs, instantiation, contrast.

### What v3 names as the one open problem

Anti-unification on typed DAGs (§8.3, §10). Every other "open problem" in
v2 was either downstream of this, or philosophy.

---

## 1. Lexicon L

L is a typed vocabulary. Each entry has a name, an argument-type
signature, and a result type.

    name :: (type_1, ..., type_n) -> result_type

Types are not fixed. The current builder uses `entity`, `action`,
`quality`, `completion`. Domains extend the type set as needed. A
*completion* is a fully-saturated expression -- all argument slots filled.

L is open and extensible. It is not natural language. Two expressions are
identical iff they have the same function and the same arguments;
natural-language glosses are decoration.

---

## 2. Semantic Expressions

A semantic expression is a well-typed application of L entries. Each
expression is the content of exactly one DAG node.

    meet(phil, rita)
    counter(a, 7)
    replicate()

The same stretch of reality admits multiple granularities: a coarse node
`improve(phil)` can be a subDAG containing finer nodes
`hear(phil, song)`, `meet(phil, rita)`, and so on. Granularity is a
choice, not an ambiguity.

Two expressions are:

- *identical* if syntactically equal;
- *equivalent under template A* if both are instances of A (§6).

Identity gives repetition. Equivalence gives pattern. The operator that
decides equivalence is the one unsolved piece of this formalism (§8.3).

---

## 3. The DAG

### 3.1 Definition

A DAG is a directed acyclic graph D = (V, E):

- V: nodes, each carrying a semantic expression.
- E: directed edges. An edge e(v, w) means w depends on v.

Dependency is a single undifferentiated relation: "the content of w
relies on information established at v." Operational test:
counterfactually, if v were removed, could w still hold as described?
The formalism does not sub-classify dependency (temporal, logical,
material). If subclasses prove necessary, they enter later as edge
labels.

### 3.2 Scale

A node may be atomic (no interior) or a subDAG (interior structure). A
session operates at a single declared scale, fixed by the choice of
domain rules. Scale changes are explicit re-expansions, not implicit.

### 3.3 Interpretation (non-load-bearing)

The project's informal position is that a universal DAG G of all events
is substrate, and every analyzed DAG is a finite projection of G.
Nothing in the formalism or the builder depends on this. It is preserved
here as context for why the project exists; it is not cited below and
must not be used in downstream arguments.

---

## 4. Threading (analytical tool)

A thread T on D is an ordered sequence of node visits. Threading
describes narrative *telling order* (sjuzhet); the DAG describes *causal
order* (fabula). When telling and causal order agree, threading adds
nothing. When they disagree -- flashback, in medias res -- threading is
the tool for describing the disagreement.

The builder does not operate on threads. Threading is retained as
vocabulary for discussing extracted DAGs, not as a computational object.

---

## 5. Methodological constraints

Two constraints on how the formalism is used. Both came out of earlier
experimental work; both are load-bearing for reading any output of the
builder.

### 5.1 Structure vs. traversal

Two different objects are routinely called "the story's graph":

- **Structure graph (a):** the subgraph of the domain containing all
  branches, convergences, and alternatives relevant to a situation. The
  object the formalism is about.
- **Traversal graph (b):** a single path through (a), followed once.
  The experience of (a).

Any extraction of a "graph" from a single narrative trace produces (b),
never (a). Testing whether (b) has chain-like or tree-like topology
tests only whether traversals are sequential -- trivially true by
definition. Real tests of (a) require either (i) reconstructing (a)
from many (b)'s, or (ii) working in a domain where (a) is directly
observable -- which is exactly what the DAG builder is for.

The formalism must not silently substitute (b) for (a). When this
document says "DAG," "subDAG," "template," or "archetype," it always
means (a).

### 5.2 The sand-castle problem

Hand-crafted DAGs embed the builder's expectations. Any structure found
in a DAG the analyst designed to have that structure is circular. This
disqualifies: toy graphs written to illustrate a point, graphs tuned
until the detector fires, and domains whose rules were adjusted after
inspecting early output.

The working rule: domain rules are fixed before expansion starts. If
output is uninteresting, that is a finding. Tuning the rules to produce
more interesting output invalidates the finding.

---

## 6. Parametrized SubDAGs (Archetypes)

### 6.1 Definition

A parametrized subDAG is a template

    A = D[p_1 :: t_1, ..., p_n :: t_n]

where D is a DAG structure and each p_i is a typed parameter slot. An
instantiation substitutes concrete L-values of the correct types for
each slot, yielding a concrete subDAG.

### 6.2 Example

    experiment(X :: entity, Y :: entity) = [
      meet(X, Y)          ->
      learn(X, of(Y, *))  ->
      apply(X, *, to(Y))
    ]

    experiment[phil, nancy]
    experiment[phil, rita]

These are two instantiations of one template. The template is what the
theory calls an *archetype*.

### 6.3 Archetype = Template

Two subDAGs S_1 and S_2 are *of the same archetype* iff there exists a
template A and parameter vectors q_1, q_2 such that S_1 = A[q_1] and
S_2 = A[q_2].

This is operational only if A can be computed from (S_1, S_2) -- i.e.,
if anti-unification on typed DAGs is available. Without that operator,
"same archetype" is a human judgment, not a test. See §8.3.

### 6.4 No hierarchy claim

v2 claimed archetypes form a hierarchy (specific templates lifting to
more abstract ones). v3 drops this until anti-unification exists; a
hierarchy is a byproduct of the lifting operator, not a separate
construct.

---

## 7. Parallel DAGs

Two subDAGs are *parallel* if they are instances of the same template.
Parallelism creates structural resonance; the meaning of the resonance
lives in the *contrast* -- the parameter positions where the two
instantiations differ.

    contrast(A[q_1], A[q_2]) = { i : q_1[i] != q_2[i] }

Parallel DAGs can occur within a single analyzed DAG (intra) or across
independently analyzed DAGs (cross). The formalism treats them
identically.

---

## 8. Operators

### 8.1 Instantiation: (A, p) -> S

Substitute parameter vector p into template A, producing concrete subDAG
S. Trivial; implemented.

### 8.2 Contrast: (A[q_1], A[q_2]) -> diff

Return the set of parameter positions where q_1 and q_2 differ. Trivial
given instantiations; implemented.

### 8.3 Anti-unification: (S_1, S_2) -> (A, q_1, q_2)

Given two concrete subDAGs, compute the most specific template A and
parameter vectors q_1, q_2 such that S_1 = A[q_1] and S_2 = A[q_2].

This is the one operator the theory requires and does not yet have.
Prior art: least general generalization (Plotkin 1970); anti-unification
in inductive logic programming; frequent subgraph mining (gSpan, FFSM)
as a statistical cousin.

A usable anti-unifier needs, at minimum:

- a type-compatible matching rule on L entries,
- a canonicalization for DAG structure so isomorphic subDAGs share one
  representative,
- a specificity/coverage tradeoff (MDL-style): the template that covers
  more instances at the cost of more abstraction, vs. the template that
  covers fewer instances more precisely.

Until this exists, `builder/detect.py::templates` is a placeholder that
canonicalizes linear paths by action-type sequence. The placeholder is
honest about being one (see §9.2).

---

## 9. Detection

Three things are currently computable on a built DAG. None is the full
theory; each is a concrete operation the code does.

### 9.1 Merge nodes

A node with in-degree >= k from topologically distinct predecessors.
This is *not* the "cross-narrative convergence" of v2 -- that concept
required G to be observable and is dropped. At single-domain scale,
"convergence" is merge-node detection, which is what the builder
computes. No more is claimed.

### 9.2 Recurring linear paths (placeholder for §8.3)

Enumerate linear paths of length k, canonicalize on action-type
sequence, count occurrences. A cheap stand-in for anti-unification.
Output is dominated by combinatorial noise when the domain has few
action types; this is a known limitation and is why §8.3 is the
priority.

### 9.3 Parameter contrast across recurrences

For each canonicalized recurring path, list the concrete action labels
of its instances. §7's contrast, computed on the placeholder templates
of §9.2.

---

## 10. Known Gaps

1. **Anti-unification (§8.3).** The central missing operator. Without
   it, archetype detection is a placeholder.
2. **Quality metric.** Once anti-unification exists, a metric is needed
   to separate meaningful templates from trivial ones (`do(X, Y)`
   matches everything). Candidate: MDL.
3. **Domain suitability precondition.** A domain with two action types
   combinatorially forces trivial recurring paths; a domain with k > 4
   action types is likely required to produce non-trivial templates.
   This should be stated as a precondition on inputs, not discovered
   per-domain. The lineage domain (2 action types: replicate + mutate)
   violates it; the negotiation domain (4 action types: propose +
   counter + accept + walk) satisfies it. Both are kept in-repo as
   confirming and disconfirming cases, to be compared once (1) exists.

No other open problems are named at this level. If one surfaces during
implementation, it is either a special case of (1)-(3) or a signal that
the model and the code have diverged.

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| Archetype | A parametrized subDAG template. Same as "template." |
| Completion | A fully-saturated semantic expression. |
| Contrast | Parameter positions where two instantiations of a template differ. |
| DAG | Directed acyclic graph. Nodes carry expressions; edges are dependency. |
| Dependency | e(v, w): w's content relies on v. Tested counterfactually. |
| Fabula | The causal DAG. |
| Instantiation | Substituting a parameter vector into a template. |
| L | The typed lexicon. |
| Parallel | Two subDAGs that instantiate the same template. |
| Semantic expression | A well-typed L-application. The content of a node. |
| Sjuzhet | A threading of the DAG. |
| Template | Same as archetype. |
| Thread | An ordered node-visit sequence; presentation order, not causal. |

---

## Appendix: Correspondence with Lessard & Levison (2013)

Adopted directly: DAG as fabula, threading as sjuzhet, semantic
expressions, parametrized subDAGs for repeated-with-variation patterns,
parallel DAGs for cross-segment structural similarity.

Not adopted: the paper's metaphors around "compression," "shortcuts,"
and narrative bandwidth. Those are presentation-order phenomena; the
builder constructs DAGs, it does not traverse them.

Extended: the archetype = template claim (§6.3) is stated as operational
*only if* anti-unification exists (§8.3). The paper leaves template
identification to human judgment; v3 names that gap as the single open
problem, not as a general caveat.
