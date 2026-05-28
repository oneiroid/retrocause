# Retrocause: The Concept

## Claim

Narrative structure is ontologically primary. Story-shaped causality is
not what brains do with matter — it is what matter looks like at the
event scale, perceived sequentially by a narrow agentic read-head.

This is a bet, not a result. Everything in this repository is the work
of taking the bet seriously enough to operationalize parts of it:
typed event vocabularies, world-state predicates, derivation closures
under convergence, frontier enumeration of allowed continuations,
threading as the formal model of "experiencing a story." The bet is
upstream of the apparatus. The apparatus is upstream of the code.

If the bet is wrong, the apparatus collapses to "a typed planner with
storyworld semantics" — still useful, less interesting. If the bet is
right, the apparatus is the first crude instrument for looking at
narrative-as-substrate the way early microscopes were instruments for
looking at cells.

## The name

**Retrocause** is not a claim that effects literally precede their
causes. It is the claim that **a downstream convergence node in a
static causality graph constrains which upstream branches are
reachable**, and that this constraint, perceived by a forward-threading
mind, *feels like* backward causation. Destiny, prophecy, the sense
that "something is pulling events into place" — these are projection
artifacts of a real structural feature: attractors in G.

The name picks out one phenomenon the framework predicts. The
framework is more than its name.

## Three layers, in dependency order

```
INTUITIONS  ─────►  the claims the project asserts about reality
    │
    ▼
FORMAL MODEL  ───►  the minimum apparatus the claims need to be testable
    │
    ▼
CODE / APP  ─────►  the experimental ground where the apparatus runs
```

The flow is **claim → apparatus → exercise**, not the reverse. The
formal model exists because the intuitions, if taken seriously, demand
machinery sharp enough to fail on. The code exists because the
machinery, if real, must do something a person can see and manipulate.

This ordering is deliberate. Reading `FORMAL_MODEL.md` first will give
you a clean typed framework that looks like it could have been built
for any narrative-tooling purpose. Reading `INTUITIONS.md` first tells
you why *this* framework, with *these* constructs (convergence,
derivation closure at merge, frontier enumeration over an open lexicon)
and not some other.

## What each layer commits to

**INTUITIONS** commits to philosophical claims with a discipline
attached: every claim is tagged `operational` (the formalism implements
it), `partial` (formalism implements a fragment, the rest is informal),
or `open` (no formal correlate yet, kept as a conjecture). The
discipline prevents the philosophy from drifting into free-form
speculation; the philosophy prevents the formalism from being mistaken
for the thing itself.

**FORMAL MODEL** commits to a typed substrate borrowed from
Lessard & Levison's threaded-DAG formalism (`prior_research/W13-1408.md`)
and extended where their work is unfinished. It does not commit to
metaphysics. It is honest about what it cannot yet compute
(template extraction, archetype counts, convergence-conflict
resolution policies). It is the *apparatus the claims require*, not
the apparatus itself.

**CODE / APP** commits to direct manipulability. A browser, D3,
canonical story DAGs, branch from any node, export JSON. No backend,
no LLM call from inside the page. The artifact is a reusable
story-world object, not a generator. Canonical seeds are actor-thread
DAGs, not linearized single-protagonist spines: each main character can
move on a separate path, share nodes with others when they act as one
unit, and split again. Branch choices are attributed to the actor whose
outgoing path is being expanded.

## How to read this repository

| If you want… | Read |
|---|---|
| The thesis | `CONCEPT.md` (this file) |
| The philosophy, disciplined | `INTUITIONS.md` |
| The formal apparatus | `FORMAL_MODEL.md` |
| The product spec | `RESEARCH_AND_DESIGN.md` |
| Worked DAGs | `DAG_ILIAD.md`, `DAG_ODYSSEY.md` |
| The paper this rebases on | `prior_research/W13-1408.md` |
| The superseded v1 formalism | `prior_research/FORMAL_MODEL_v1.md` |

When code and the formal model disagree, the model wins. When the
formal model and the intuitions disagree, the **disagreement is the
data** — it tells you either the intuition is wrong, or the formalism
is missing something. Suppressing either side in favor of the other
defeats the point of the project.

## What this project is not

- Not a generative-narrative engine. It does not write stories.
- Not a literary-theory contribution. It does not claim to settle
  questions about narrative ontology; it claims those questions
  are sharp enough to build instruments for.
- Not a finished framework. Several core operations (template
  extraction, convergence-conflict resolution, archetype counting)
  are explicitly open.
- Not religious. The claim that narrative structure is substrate is
  a structural hypothesis, not a metaphysical commitment to any
  particular telos.

## Why this might be worth doing

If narrative is substrate, then the small finite set of recurring
story shapes (Booker, Vonnegut, Campbell counted differently — but
all counted *small and finite*) is not a fact about human cognition.
It is a fact about G's large-scale topology, perceived through
human-shaped projection. That would mean the same instrument, pointed
at non-narrative DAGs (gene networks, ecosystem successions, market
collapses), should detect the same small finite set of attractor
patterns — and the count, if measurable, would be the same.

The framework is currently unable to test that. The point of the
apparatus is to get to a position where the test becomes possible.
