# Retrocause: The Concept

## Claim

Narrative structure is ontologically primary. Story-shaped causality is
not what brains do with matter — it is what matter looks like at the
event scale, perceived sequentially by a narrow agentic read-head.

This is a bet, not a result. Everything in this repository is the work
of taking the bet seriously enough to operationalize parts of it: a
graph of story states, causal edges between them, and branching any
state into the alternatives that did not happen. The bet is upstream of
the code.

If the bet is wrong, the app collapses to "a small causal-story
editor" — still useful, less interesting. If the bet is right, it is a
first crude instrument for looking at narrative-as-substrate.

## The name

**Retrocause** is not a claim that effects literally precede their
causes. It is the claim that **a downstream convergence node in a
static causality graph constrains which upstream branches are
reachable**, and that this constraint, perceived by a forward-threading
mind, *feels like* backward causation. Destiny, prophecy, the sense
that "something is pulling events into place" — these are projection
artifacts of a real structural feature: convergence in the graph.

The name picks out one phenomenon the framework predicts. The
framework is more than its name.

## Two layers, in dependency order

```
INTUITIONS  ─────►  the claims the project asserts about reality
    │
    ▼
CODE / APP  ─────►  the ground where the claims get exercised
```

The flow is **claim → exercise**, not the reverse. The code exists
because the intuitions, if real, must do something a person can see and
manipulate.

## What each layer commits to

**INTUITIONS** commits to philosophical claims with a discipline
attached: every claim is tagged `operational` (the app exercises it),
`partial` (the app exercises a fragment, the rest is informal), or
`open` (no correlate in the app yet, kept as a conjecture). The
discipline prevents the philosophy from drifting into free-form
speculation.

**CODE / APP** commits to direct manipulability. A browser, D3, one
story DAG, branch from any node, export JSON. No backend, no LLM call
from inside the page. The artifact is a reusable story-world object,
not a generator.

## How to read this repository

| If you want… | Read |
|---|---|
| The thesis | `CONCEPT.md` (this file) |
| The philosophy, disciplined | `INTUITIONS.md` |
| The product spec | `RESEARCH_AND_DESIGN.md` |

When the code and the intuitions disagree, the **disagreement is the
data** — it tells you either the intuition is wrong, or the code is
missing something. Suppressing either side in favor of the other
defeats the point of the project.

## What this project is not

- Not a generative-narrative engine. It does not write stories.
- Not a literary-theory contribution. It does not claim to settle
  questions about narrative ontology; it claims those questions
  are sharp enough to build instruments for.
- Not a finished framework. Most of the interesting claims are still
  `open`.
- Not religious. The claim that narrative structure is substrate is
  a structural hypothesis, not a metaphysical commitment to any
  particular telos.

## Why this might be worth doing

If narrative is substrate, then the small finite set of recurring
story shapes (Booker, Vonnegut, Campbell counted differently — but
all counted *small and finite*) is not a fact about human cognition.
It is a fact about the graph's large-scale topology, perceived through
human-shaped projection. That would mean the same instrument, pointed
at non-narrative graphs (gene networks, ecosystem successions, market
collapses), should detect the same small finite set of recurring
patterns.

The app is currently nowhere near able to test that. The point is to
get to a position where the test becomes possible.
