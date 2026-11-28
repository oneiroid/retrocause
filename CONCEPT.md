# Retrocause: The Concept

## Core idea

The human brain is a learning network, and myths are what tens of
thousands of years of human learners kept. They are the longest-trained
human representation of reality, and the base stories in them are few
in shape, however many they are in content. Retrocause exists to find
those base stories as structure, to tell which parts of them are
imprints of the world and which are imprints of the mind that kept
them, and to make that recipe usable by modern neural networks.

Three layers: **mind** is the learner, **language** is the shared space
minds write into, and **stories** are the durable checkpoint inside
language, what survived being rewritten by billions of learners. The
target is the recipe for mind read off that checkpoint; the world is
reached through it, not around it. Evolution shaped the brain, so the
human prior is a compressed record of the world, but one selected for
fitness at human scale rather than for accuracy.

Why expect a recipe to be there: learners trained on different data and
objectives appear to converge on one representation of what they
observe (Huh, Cheung, Wang, Isola, "The Platonic Representation
Hypothesis", ICML 2024). Myths are that convergence, run on human
brains over the longest time available. See `INTUITIONS.md` §9 and §10.

How the graph serves this: base stories show up as the convergence
nodes of a story graph, the states many different tellings are forced
through (§5). Propp defined his functions the same way, by what an act
does to what follows, which is the sense of "same state" the grower is
moving toward.

## Claim

The strongest version of the core idea: narrative structure is
ontologically primary. Story-shaped causality is
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

## Working scope (2026-11-28)

What the instrument can test now, and what is parked. Parked claims stay in
`INTUITIONS.md`; they are background, not roadmap, until something in the
app can move one of them.

- **Now:** convergence as merging on world state (§5), and with it the
  question whether automatic growth produces convergence nodes at all.
- **Next, made cheap by that:** grow the same seed with two local models and
  check whether their convergence nodes coincide (§9). It is the first test
  of the core idea that needs neither a tale corpus nor an extractor.
- **Parked:** §1 (substrate), §4 (space as embedding), §6 and §10's
  extraction work (no corpus, no extractor), and open questions 1–7. The
  "myth probe" waits on a tale corpus.

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

**CODE / APP** commits to direct manipulability, and splits across two
surfaces that commit to different things.

*The page* — a browser, D3, one story DAG, branch from any node, export
JSON. Opened from disk: no backend, no key, and no model call from
inside the page. This commitment is unchanged.

*The grower* (`LOCAL_LLM.md`): a Node-side module that grows the DAG
automatically by calling a local model through `llama.cpp`, driven from the
page's Lab panel through a loopback bridge. It exists because the project's
open questions need a *corpus* of graphs, and hand-building them one form
submission at a time does not get there.

The project once ruled a generator out; it now rules out only a generator *in
the page*. Machine-grown graphs carry a run record saying how they were grown
(model, parameters, prompts, every request and completion), so they can be
inspected rather than taken on trust. They are records, not replays.

## How to read this repository

| If you want… | Read |
|---|---|
| The thesis | `CONCEPT.md` (this file) |
| The philosophy, disciplined | `INTUITIONS.md` |
| The product spec | `RESEARCH_AND_DESIGN.md` |
| The automatic grower | `LOCAL_LLM.md` |

When the code and the intuitions disagree, the **disagreement is the
data** — it tells you either the intuition is wrong, or the code is
missing something. Suppressing either side in favor of the other
defeats the point of the project.

## What this project is not

- Not a prose generator. It does not write stories. The grower proposes
  *structure*: nodes, edges, and what each event changed, as facts; every
  proposal is a graph operation the editor could equally have received
  from a human. It does write one sentence per event, as the node's
  label, because a node needs a name. (Revised 2026-11-28: this used to
  say nothing in the project produces narrative text, which stopped being
  true when the grower arrived.)
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
