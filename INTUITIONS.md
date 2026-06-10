# Intuitions

The philosophical core of Retrocause. Read `CONCEPT.md` first for the
thesis; this document is the disciplined long-form.

Each claim below carries a tag:

- **`operational`** — the formal model implements this, the code exercises it.
- **`partial`** — formalism captures a fragment, the rest is informal or contested.
- **`open`** — no formal correlate yet; kept as a stated conjecture.

The tagging is the discipline. It is what stops philosophy from
drifting into free speculation and what stops the formalism from
quietly absorbing claims it hasn't earned. When a claim moves from
`open` to `partial` to `operational`, that is the project working.

---

## 1. The graph is the substrate, not a model of it `open`

Base reality is a causality DAG — call it G — taken as ontologically
primary rather than as a representation of something else. Events are
nodes. Edges are dependencies (in G, dependency *is* causation; there
is no separate physical law constraining an otherwise-unconstrained
graph). The regularity is the topology.

This is the project's central bet. The formalism works regardless of
whether you accept it — typed L-expressions and frontier enumeration
do the same thing either way — but it tells you what the mathematics
**is about**. Without this claim, Retrocause is a typed planner. With
it, the apparatus is an instrument for looking at the substrate.

The claim is `open` because no current test discriminates "G is
substrate" from "G is a useful abstraction over substrate." Every
observation is already projected (see §6).

---

## 2. Events are atomic, meaning is relational `partial`

Single nodes are semantically thin, like letters. Meaning lives in
relational structure: which nodes connect to which, what subDAGs they
participate in, what templates they instantiate.

The formal correlate is `M(v) = { templates A : v participates in some
instance A[q] within the DAG }` (FORMAL_MODEL §8.3). That definition
is computable once template extraction is. Template extraction is
itself only partially specified (anti-unification on typed DAGs is
sketched, not implemented), which is why this whole claim is `partial`.

---

## 3. All events exist; "counterfactual" is a property of a path `operational`

There is no ontological gap between events that "did happen" and
events that "didn't." Every event compatible with G's constraints is
in G. What differs across observers is which paths a given reader
threads through G. "Counterfactual" describes a path that a
particular reader did not take, not a property of the events
themselves.

This is operational in the engine: the branching builder treats
canonical and counterfactual branches as the same kind of object,
distinguished only by edge type and by which path the analyst declared
canonical. Branching from any state node is structurally identical to
canonical extension — only the threading marker differs.

*What bounds* which *branches exist — why this is a structured DAG and
not "all compatible events" — is claim 9 (the possibility cone). The gap
this claim abolishes is actual/counterfactual* within *the cone; the
possible/impossible gap at its rim belongs to claim 9 and is `open`.*

---

## 4. Time = thread position; space = perceptual embedding `partial`

**Time** is the segment counter along a threading. There is no global
clock in G; "before" and "after" exist only relative to a chosen
thread. This maps directly to FORMAL_MODEL §4 (threading) and is
operational at that level — the engine's state walker is exactly a
topo-replay along canonical thread segments.

**Space**, in this framework, is the dimensional structure a mind adds
to unfold branching chains for simultaneous comparison without
edge-crossings. We do not perceive distance; we perceive chains of
events, and spatial dimensions are the embedding that makes those
chains laid-out and comparable. This part is `open` — no formal
correlate, no measurement.

Conjecture (`open`): the number of spatial dimensions a mind perceives
equals the minimum embedding dimension required for the typical local
branching complexity of G at that mind's resolution. Three for us
would then be a structural fact about G + human resolution, not a
contingent fact about physics.

---

## 5. Convergence nodes are real, and they create non-local influence `operational`

A convergence node is a node with multiple independent incoming paths
(or, in general, a small *set* of nodes — a **waist**; claim 9 and
FORMAL_MODEL §8.1, §8.3.3 — a pinch need not be strictly one node).
These are real topological features of any DAG, not perceptual
artifacts. Two branches that share a downstream convergence are not
independent — the convergence constrains what can happen on each
branch leading into it.

This is the mechanism behind what feels like destiny: knowing the
destination constrains the routes. Nothing dynamic is happening — the
constraint is structural, baked into G — but a forward-threading
reader experiences it as pull.

This is operational. FORMAL_MODEL §1.7 + §8.1 give the precise
content: at a convergence node, merging post-states from independent
parents triggers derivation rules that no upstream post-state alone
could trigger. The merged storyworld state entails facts no character
on either branch knows. That is the formal definition of dramatic
irony (Appendix C of FORMAL_MODEL, the Magi case), and it is also the
local mechanism of "destiny" — the future attractor reaches back
through entailment, not through time.

This claim is the operational core of the name **retrocause**.

*Claim 9 adds a* generative *reading: a convergence is the waist where
the shared possibility cone narrows. That account is `open`; the
topological convergence defined here stays `operational`.*

---

## 6. Archetypes are parametrized templates `partial`

A story shape (Booker, Vonnegut, Campbell, the monomyth) is not a
mysterious topological equivalence class. It is a parametrized subDAG
template `A[p_1, …, p_n]` with typed slots. Two stories are "of the
same archetype" iff there exist parameter vectors `q_1, q_2` such that
both equal `A[q]` under the same template.

This is `partial` because the formal definition exists (FORMAL_MODEL
§5.3) but the *extraction* operator — given a corpus, find the
non-trivial recurring templates — is open. Cross-cultural agreement
on a small finite set of archetypes is, in this framework, evidence
that the templates correspond to genuine topological features of G
rather than cultural conventions. The framework predicts that the
same instrument pointed at non-narrative DAGs should find templates
of the same approximate count. It cannot yet do so.

The number ~7 (Booker), ~6 (Vonnegut), 1 (Campbell) is *not* a claim
the framework defends. The framework claims only: the count is
small and finite, for reasons of G's topology, and what humans count
is a projection of that through human cognition. Whether human counts
match the structural count is an open empirical question.

---

## 7. Minds are narrow threading agents `partial`

A mind is a thread T equipped with a position (current segment), a
resolution (the minimum subDAG depth it explicitly expands rather than
treating as atomic), and an agency function (at branch points,
something selects the next edge). The narrowness is constitutive —
widen the read-head enough and the result is no longer a mind but
something else.

Threading is operational (FORMAL_MODEL §4); the engine's walker
implements topo-replay along thread segments. Resolution and agency
are formalized in §4.5 but not implemented in the current code — the
app's user *is* the agency function at the moment. This is why the
claim is `partial`, not `operational`.

The `bandwidth ε` and `persistence threshold` terms used in earlier
drafts borrow precision from topological data analysis without earning
it. They are retained here only as informal pointers to "the
resolution at which a mind threads." Until there is a measurement
procedure, they remain metaphors, not quantities.

Free will, in these terms, is the agency function — whether it is
determined by G's structure (the appearance of choice is an artifact
of the narrow read-head) or genuinely undetermined (the mind selects
freely among edges compatible with downstream attractors). The
framework is agnostic between determinist and libertarian readings;
both are compatible with G being static.

*Claim 9 extends the agency function two ways: the* simulation gradient
*(non-agent = bare least-action selection; agent = model-carrying,
`open`) and the* influence weighting *(an agent's weight = the
cut-criticality of its transitions toward the attractor, FORMAL_MODEL
§8.3.3, `partial`).*

---

## 8. We see only projections `partial`

We have no direct access to G. Every observation is already projected
through perception and, for communicable observations, through
language. The framework acknowledges this as a methodological
constraint, not a flaw: every test of the framework is testing a
projection of a prediction, not the prediction itself.

Two consequences the project takes seriously:

- **Sand-castle problem.** Hand-crafted graphs embed the analyst's
  assumptions. Finding structure in a graph designed to have that
  structure proves nothing. Real tests need DAGs from external sources
  where the structure (if any) was not put there by the experimenter.
  This invalidated earlier toy-graph experiments and is the reason the
  current focus is on canonical literary DAGs (red, magi, iliad,
  odyssey) — they are external to the framework.

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

## 9. The possibility cone `open`

Not every combinatorially compatible continuation of a node exists. Of
all successors whose preconditions (FORMAL_MODEL §1.5) are satisfiable,
only those inside the **shared deemed-possible cone of frontier agents**
are in G. This supplies the content of claim 3's otherwise-blank phrase
"compatible with G's constraints": the constraint *is* the agents'
collective forward-simulation. Without it G is a structureless
near-complete graph — the cone is what gives G the topology claim 1
asserts.

The cone is no longer *stipulated*. FORMAL_MODEL §8.3 **derives** it:
given an attractor Ω (a destination), the cone's support is bidirectional
source↔Ω reachability and its measure is cut-criticality toward Ω. The one
remaining input is Ω, not the cone — and even Ω has a candidate structural
derivation (§8.3.4). This is what moves the sub-claims below from "asserted"
toward `partial`.

Five sub-claims, tagged separately so the formalism absorbs nothing it
hasn't earned:

- **The cone is influence-weighted `partial`; capability-weighted only in
  the ideal case `open`.** The derived weight of a transition is its
  **cut-criticality** toward the attractor (FORMAL_MODEL §8.3.3) — how
  load-bearing it is for reaching Ω. An agent's weight aggregates its
  transitions'; a meta-agent's (corporation ← nation ← culture) aggregates
  its constituents'. Criticality concentrates at narrow waists, so the
  weighting is heavy-tailed *when the cone is waisted* — inherited from
  claim 1's topology bet, not free. **Influence is not capability**:
  equating them presumes selection at every meta-level has placed the most
  capable agents on the most critical transitions — true at best in the
  ideal case, plainly false in failed states. The capability↔influence
  *gap* is itself a measurable: how well evolution is working at that
  meta-level. The weighting governs *existence/measure in the cone*, not
  election of a path.

- **No materialization `operational` (sharpening of claim 3).** No path in
  the cone is privileged as "the actual one." Two gaps stay separate:
  *possible / impossible* lives at the **rim** of the cone (`open`);
  *actual / counterfactual* is abolished **within** it (claim 3,
  `operational`). This separation is the guardrail against re-introducing
  a selected "real" path.

- **Convergence is the waist of the cone `partial` (generative reading of
  claim 5).** A convergence is where the shared cone narrows toward a node
  — or a small *set* of nodes, a width-k waist (FORMAL_MODEL §8.1, §8.3.3);
  divergence is where it widens. The DAG breathes: a waist radiates a
  wider cone, which narrows again at the next waist. A
  waist is now *derivable* — a clean cut at a local minimum of the cone's
  width (Menger, §8.3.3). Claim 5's topological convergence stays
  `operational`; the generative account of *why* branches converge is
  `partial` (mechanism defined, unimplemented).

- **Simulation gradient `open`.** Every entity forward-simulates. A
  non-agent is the degenerate case — bare variational path-selection (least
  action / the path integral select a trajectory by reference to its whole
  extent) with no explicit model. An agent carries a model of futures;
  "more agentic" = richer model. Threading (claim 7, FORMAL_MODEL §4.5) is a
  forward-simulating agency function choosing its next segment over the
  static-but-agent-constituted cone: reader-over-static, which reconciles
  claim 3 (nothing is created) with claim 7 (the reader simulates to choose).

- **Retrocausal dominance, held as tension `open`.** The downstream
  attractor shapes which upstream paths exist and what they mean (claim 5,
  FORMAL_MODEL §8.2), pulling *against* forward preconditions (`requires`:
  past constrains future). When the two conflict, the conflict is itself the
  content — dramatic irony, "destiny" (FORMAL_MODEL §8.1) — and is recorded
  as **data**, never resolved by deleting either direction. The tempting
  meta-rule "later claims erase earlier fixed rules" is rejected: it is
  self-eating (a fixed rule forbidding fixed rules), and applied literally it
  deletes preconditions — which are *what carve the cone*.

Status, honestly split. The cone, its waists, and the weighting are now
`partial` — a derivation exists (FORMAL_MODEL §8.3: reachability + Menger
cut-criticality from an attractor Ω) but is unimplemented and untested.
What stays `open` is narrower than before: **deriving Ω itself** (§8.3.4
reduces it to Open-Question 1, the eternal melody) and the
**capability↔influence bridge** — cut-criticality measures structural
influence, and equating that with agent capability holds only in an ideal
selection regime. The progress of
this whole pass was pushing three fuzzy author-supplied quantities (cone,
waists, weights) down to one concrete input (Ω) plus two named `open`
gaps — not earning the claim outright.

---

## Open questions

These are conjectures the project explicitly does not have apparatus
for. Listed so the framework cannot quietly pretend it does.

1. **The eternal melody.** Why does G have *this* self-similar
   topology and not some other? This is the deepest question; no
   formal handle.
2. **The archetype count.** Can the small-finite count be derived
   from G's constraints alone, or is it purely a projection through
   human cognition? Test: do non-narrative attractor domains converge
   to similar counts?
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
   acyclicity? The framework's working answer is no — what looks
   retrocausal is convergence constraint (§5) — but the answer has
   not been stress-tested against actual physics cases.
7. **The substrate sequence.** Atoms → molecules → cells → organisms
   → language → ? Each level appears to exist *for* the next. What is
   language a substrate for? Open by construction; the framework only
   frames the question.
8. **Template extraction.** Anti-unification on typed DAGs is sketched
   (FORMAL_MODEL §5.5, §7.3) but not implemented. Without it, claim
   §6 stays `partial`.
9. **The attractor Ω.** FORMAL_MODEL §8.3 now derives the cone, its
   waists, and the weighting from an attractor Ω, so the open part is no
   longer "the whole cone" but only Ω: which terminal node(s) the cone
   funnels toward. §8.3.4 offers a candidate — Ω as the *dominant
   convergence* (max meaning + in-degree) — but that reduces to Open-Q 1
   (the eternal melody) in local form. Two further gaps: the closure is
   unimplemented/untested, and cut-criticality measures *influence* while
   its identification with agent *capability* holds only in an ideal
   selection regime (the gap between them — failed states — is itself
   data). Until these close, the derived quantities are `partial` and must
   not be rendered as `operational`.

The promotion of any open question to `partial` or `operational` is a
measurable advance for the project. Demoting an `operational` claim to
`partial` because of a discovered flaw is equally valid progress.
