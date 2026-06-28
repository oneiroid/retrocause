# Intuitions

The philosophical core of Retrocause. Read `CONCEPT.md` first for the
thesis; this document is the disciplined long-form.

Each claim below carries a tag:

- **`operational`** — the app exercises this directly.
- **`partial`** — the app exercises a fragment, the rest is informal or contested.
- **`open`** — no correlate in the app yet; kept as a stated conjecture.

The tagging is the discipline. It is what stops the philosophy from
drifting into free speculation. When a claim moves from `open` to
`partial` to `operational`, that is the project working.

---

## 1. The graph is the substrate, not a model of it `open`

Base reality is a causality DAG — call it G — taken as ontologically
primary rather than as a representation of something else. Events are
nodes. Edges are dependencies (in G, dependency *is* causation; there
is no separate physical law constraining an otherwise-unconstrained
graph). The regularity is the topology.

This is the project's central bet. The app works regardless of whether
you accept it — you can edit a story DAG and branch it either way — but
the claim tells you what the thing is *about*. Without it, Retrocause
is a small causal-story editor. With it, the editor is an instrument
for looking at the substrate.

The claim is `open` because no current test discriminates "G is
substrate" from "G is a useful abstraction over substrate." Every
observation is already projected (see §6).

---

## 2. Events are atomic, meaning is relational `partial`

Single nodes are semantically thin, like letters. Meaning lives in
relational structure: which nodes connect to which, what subgraphs they
participate in, what recurring shapes they instantiate.

The app exercises a fragment of this: a node on its own carries only a
label and a state note, but selecting it shows its incoming and
outgoing edges — its meaning *is* its position in the graph. The
stronger claim (that meaning is the set of templates a node
participates in) has no extraction procedure yet, which is why this is
`partial`.

---

## 3. All events exist; "counterfactual" is a property of a path `operational`

There is no ontological gap between events that "did happen" and
events that "didn't." Every event compatible with G's constraints is
in G. What differs across observers is which paths a given reader
threads through G. "Counterfactual" describes a path that a particular
reader did not take, not a property of the events themselves.

This is operational in the app: the builder treats the original story
and a counterfactual branch as the same kind of object, distinguished
only by edge type and by which path the analyst follows. Branching from
any state node is structurally identical to extending the story — only
which path you read differs.

---

## 4. Time = thread position; space = perceptual embedding `partial`

**Time** is the segment counter along a threading. There is no global
clock in G; "before" and "after" exist only relative to a chosen
thread. The app exercises a fragment of this: it lays nodes out
left→right by topological rank, so "later" is a position in the graph,
not a clock reading.

**Space**, in this framework, is the dimensional structure a mind adds
to unfold branching chains for simultaneous comparison without
edge-crossings. We do not perceive distance; we perceive chains of
events, and spatial dimensions are the embedding that makes those
chains laid-out and comparable. This part is `open` — no measurement.

Conjecture (`open`): the number of spatial dimensions a mind perceives
equals the minimum embedding dimension required for the typical local
branching complexity of G at that mind's resolution. Three for us
would then be a structural fact about G + human resolution, not a
contingent fact about physics.

---

## 5. Convergence nodes are real, and they create non-local influence `operational`

A convergence node is a node with multiple independent incoming paths.
These are real topological features of any DAG, not perceptual
artifacts. Two branches that share a downstream convergence are not
independent — the convergence constrains what can happen on each
branch leading into it.

This is the mechanism behind what feels like destiny: knowing the
destination constrains the routes. Nothing dynamic is happening — the
constraint is structural, baked into G — but a forward-threading
reader experiences it as pull. The future "reaches back" through
structure, not through time.

The app exercises the topological part directly: convergence nodes are
first-class, branches can rejoin them, and the layout makes the
shared-destination structure visible. This claim is the core of the
name **retrocause**.

---

## 6. Archetypes are parametrized templates `open`

A story shape (Booker, Vonnegut, Campbell, the monomyth) is not a
mysterious topological equivalence class. It is a parametrized subgraph
template with typed slots. Two stories are "of the same archetype" iff
there exist parameter vectors such that both equal the same template
under substitution.

This is `open` because the app cannot yet *extract* templates — given a
corpus, find the non-trivial recurring shapes. Cross-cultural agreement
on a small finite set of archetypes would be evidence that the
templates correspond to genuine topological features of G rather than
cultural conventions, and the framework predicts the same instrument
pointed at non-narrative DAGs should find templates of similar count.
It cannot yet do so.

The number ~7 (Booker), ~6 (Vonnegut), 1 (Campbell) is *not* a claim
the framework defends. The framework claims only: the count is small
and finite, for reasons of G's topology, and what humans count is a
projection of that through human cognition.

---

## 7. Minds are narrow threading agents `partial`

A mind is a thread equipped with a position (current segment), a
resolution (the minimum subgraph depth it explicitly expands rather
than treating as atomic), and an agency function (at branch points,
something selects the next edge). The narrowness is constitutive —
widen the read-head enough and the result is no longer a mind but
something else.

The app exercises a fragment: the user *is* the agency function,
choosing which node to branch and which path to follow. Resolution and
an explicit agency model are not implemented, which is why this is
`partial`, not `operational`.

Free will, in these terms, is the agency function — whether it is
determined by G's structure (the appearance of choice is an artifact
of the narrow read-head) or genuinely undetermined (the mind selects
freely among compatible edges). The framework is agnostic between
determinist and libertarian readings; both are compatible with G being
static.

---

## 8. We see only projections `partial`

We have no direct access to G. Every observation is already projected
through perception and, for communicable observations, through
language. The framework treats this as a methodological constraint,
not a flaw: every test of the framework is testing a projection of a
prediction, not the prediction itself.

Two consequences the project takes seriously:

- **Sand-castle problem.** Hand-crafted graphs embed the analyst's
  assumptions. Finding structure in a graph designed to have that
  structure proves nothing. Real tests need DAGs from external sources
  where the structure (if any) was not put there by the experimenter.
  The current seed (the Red story) is a familiar narrative used to
  exercise the editor, not yet such a test.

- **Observable-domain insight.** Domains that show clear convergence
  patterns (ecology, markets, gene networks) do so because their
  internal dynamics make branch differences *visible* (extinction,
  bankruptcy, selection). Visibility is not the same as generative
  mechanism. Such domains are windows on G's convergence structure,
  not models of it.

This claim is `partial` because the project applies the constraint as
methodology but has not yet performed a test that uses external DAGs
in a way that could falsify the framework's predictions.

---

## Open questions

These are conjectures the project explicitly does not have apparatus
for. Listed so the framework cannot quietly pretend it does.

1. **The eternal melody.** Why does G have *this* self-similar
   topology and not some other? The deepest question; no handle.
2. **The archetype count.** Can the small-finite count be derived
   from G's constraints alone, or is it purely a projection through
   human cognition? Test: do non-narrative convergence domains
   converge to similar counts?
3. **Spatial dimension.** Is 3 the minimum embedding dimension for
   G's local branching at human resolution, or contingent physics?
4. **Coincidence density.** Is the felt sense of "events lining up"
   near major life events real perception of local convergence
   density, or pattern-matching bias? The framework predicts it; no
   measurement exists.
5. **The traversal problem.** What does "threading" mean in a static
   graph? Three candidate resolutions: (a) the thread *is* the path,
   no process applies; (b) threading happens at a meta-level not
   captured by G; (c) static/dynamic is a human conceptual artifact
   and G is both, the way a block universe is. The project has not
   chosen.
6. **Retrocausation and acyclicity.** If G contains all events,
   including apparently retrocausal phenomena, does this conflict with
   acyclicity? The working answer is no — what looks retrocausal is
   convergence constraint (§5) — but the answer has not been
   stress-tested against actual physics cases.
7. **The substrate sequence.** Atoms → molecules → cells → organisms
   → language → ? Each level appears to exist *for* the next. What is
   language a substrate for? Open by construction; the framework only
   frames the question.
8. **Template extraction.** Can recurring subgraph templates be found
   in a corpus automatically? Until they can, claim §6 stays `open`.

The promotion of any open question to `partial` or `operational` is a
measurable advance for the project. Demoting an `operational` claim to
`partial` because of a discovered flaw is equally valid progress.
