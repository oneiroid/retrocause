# Design: The Possibility Cone

**Date:** 2026-06-09
**Status:** model formalized + derivation pass done; **code propagation
deliberately deferred** until the derivation is solid (no sloppy inputs in code)
**Affects:** `INTUITIONS.md`, `FORMAL_MODEL.md` only; engine/UI later

This records the model settled in the 2026-06-09 brainstorm. It is the
philosophy/formal layer; code propagation is deferred by design. Per
`CLAUDE.md` conflict rule, where a new claim outruns the formalism it is
tagged `open` and any tension is flagged as **data**, never silently absorbed.

**Derivation pass (the real current task).** "Author-supplied input" for the
cone and the weights was a fudge — the sand-castle problem (INTUITIONS §8). It
is removed: FORMAL_MODEL **§8.3** derives, from `(L, scope, attractor Ω)`,
the cone's support (bidirectional source↔Ω reachability), its waists (clean
cuts at local width-minima, Menger; multi-node, not strictly one), and the
influence weight (cut-criticality toward Ω, heavy-tailed when the cone is
waisted — inherited from the topology bet, not free).
Three fuzzy inputs collapse to one concrete one (Ω) plus two named `open`
gaps: deriving Ω (§8.3.4 → Open-Q 1) and the structural-criticality↔agent-
fitness bridge. Convergence is correspondingly relaxed (§8.1) to a waist set.

## The settled model

1. **A node is a partial world-state.** Closed-world over the story's
   *relevant/derived* domain (a `Set` of P-atoms, possibly post-derivation
   closure §1.7). Nothing about "actors" is structural — there are no
   per-node actor arrays, no per-edge actor ownership. This is the rollback's
   positive content.

2. **Out-branches are compatible successors — no decider.** A transition is
   an L-entry gated by `requires` (§1.5). Actor-attributed and
   world-attributed transitions are the *same kind of object*; "the world" is
   an agency source (a `sigma` with no deliberation) exactly like an actor.
   The words **"decision"** and **(ontological) "author"** are dropped: there
   is no privileged selector. Attribution (which actor / the world) is
   metadata on a transition, used for organizing and weighting, never structure.

3. **Not all compatible paths exist — the *possibility cone*.** Of all
   combinatorially precondition-satisfying successors, only those inside the
   **shared deemed-possible cone of frontier agents** exist. This is the
   *content* of §3's hitherto-blank phrase "compatible with G's constraints":
   the constraint is the agents' collective forward-simulation. This is what
   gives G non-trivial topology (vs. a structureless "all paths exist").

4. **The cone is influence-weighted; capability-weighted only ideally.**
   *(Revised 2026-06-10; the original "capability-weighted, founder-dominated"
   wording overclaimed.)* The derived weight of a transition is its
   **cut-criticality** toward the attractor (FORMAL_MODEL §8.3.3) — structural
   influence, heavy-tailed when the cone is waisted. An agent's weight
   aggregates its transitions'; a meta-agent's (corporation ← nation ←
   culture) aggregates its constituents'. **Influence ≠ capability**: equating
   them presumes selection at each meta-level put the most capable agents on
   the most critical transitions — ideal-world only; failed states refute it
   empirically. The capability↔influence *gap* is itself a measurable of how
   well selection works at that meta-level. Weighting governs
   *existence/persistence in the cone*, NOT election of one path (see 6). The
   founders/Anthropic anecdote was removed — decorative, no formal work.

5. **Convergence = the waist of the cone.** A convergence is where the shared
   cone narrows toward a node — or a small *set* of nodes, a width-k waist
   (FORMAL_MODEL §8.1, §8.3.3; not strictly a single node); divergence is
   where it widens. The DAG "breathes": a waist radiates a wider cone (mouth)
   → narrows again at the next waist. This is a *generative* account of
   §5/§8.1, which previously defined convergence only topologically (high
   in-degree).

6. **No materialization, no election.** Among the paths in the cone, none is
   privileged as "the actual one." Two gaps must stay separate:
   - **possible / impossible** — lives at the *rim* of the cone (`open`).
   - **actual / counterfactual** — *abolished within* the cone (§3 core,
     `operational`). This separation is the guardrail against sliding back
     into "one path gets selected."

7. **Simulation gradient.** Every entity forward-simulates. A non-agent is
   the degenerate case: bare variational path-selection (least action / path
   integral) with no explicit model. An agent carries an explicit model of
   futures; "more agentic" = richer model. Retrocause-in-the-world is agents
   acting on their estimated future flow; "threading" is a forward-simulating
   agency function picking its next segment over the static-but-agent-
   constituted cone (reader-over-static — reconciles §3 with §7/§4.5).

8. **Retrocausal dominance — flagged tension, not a deletion.** The downstream
   attractor/convergence shapes which upstream paths exist and what they mean
   (§5, §8.2). This coexists with **forward preconditions** (`requires`: the
   past constrains the future). They pull opposite directions. When they
   conflict, **that conflict is the content** (dramatic irony / "destiny",
   §8.1) — it is recorded as data, never resolved by deleting either side.
   Rejected meta-rule: "later claims always erase earlier fixed rules." It is
   self-eating (a fixed rule forbidding fixed rules) and, applied literally,
   would delete preconditions — which are *what carves the cone* — collapsing
   the model back to "all paths exist."

## Dropped

- Per-node actor structure / per-edge actor ownership (the rolled-back
  `actor-threads` overlay; preserved on branch `actor-threads-backup`).
- The notions **"decision"** and ontological **"author"**.
- The **expandable-node** UI idea.
- The meta-rule "newest intuition overrides older formalism."

## Honest tags

| Claim | Tag | Note |
|-------|-----|------|
| node = world-state | `operational` | already true in engine |
| transitions gated by `requires`, world = agency source | `partial` | §1.5 operational; "world as sigma" framing is new |
| possibility cone (3) | `open` | no measurement; answers part of open-Q1 |
| influence weighting via cut-criticality (4) | `partial` | derived (§8.3.3); capability reading ideal-world only, `open` |
| convergence = cone waist (5) | `partial` | derivable via Menger cuts (§8.3.3); topological convergence stays `operational` |
| rim vs interior separation (6) | `operational` | sharpens §3, adds no unearned claim |
| simulation gradient (7) | `open` | least-action analogy is suggestive, not measured |
| retrocausal dominance + tension (8) | `open` | flagged as data per conflict rule |

## Planned doc edits

- **INTUITIONS.md** — add **claim 9 "The possibility cone"** consolidating
  3/4/6/7/8; add one-line cross-refs from §3, §5, §7; add an Open-Questions
  entry for the cone-selection mechanism.
- **FORMAL_MODEL.md** — §3.4 (G's existing-path-set = cone, not all-compatible);
  §7.8 (realized frontier = `Phi(v) ∩ cone`; agency-source decomposition, no
  decider); §7.9 (new **influence weight**, a weighting not an election);
  §8.1 (generative cone-waist account); §9 (cone mechanism `open` + the
  forward/backward tension flagged as data).

## Forward pointer (deferred — do NOT start until the model is solid)

Code is intentionally not touched in this pass. Propagation waits on the
derivation being implementation-ready (and ideally on closing the two `open`
gaps, or at least deciding Ω is a deliberate per-story input). When it does
start, likely touch points:
- engine `phi.js` — realized frontier `Phi ∩ cone` via §8.3.2 reachability;
  influence weight via §8.3.3 cut-criticality (max-flow/min-cut), surfaced as
  a §7.9 ranking term. Ω is the one input (a chosen destination), not the cone.
- waist detection — clean cuts at width-minima (§8.3.3), generalizing any
  single-node convergence detection.
- seeds/fixtures — no actor structure; transitions carry optional attribution
  (the entry's agent argument), used only for aggregating agent weight.
- UI — represent the cone/waist shape and the criticality measure; no
  expandable nodes.
- Anything `open` (Ω derivation, fitness bridge) must not be rendered as if
  `operational`.
