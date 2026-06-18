# Hand-off for next session

**Branch:** `philostruct` @ `2b3be3c` (not pushed). PR base: `dagger`.
**Verify first (my recollection goes stale across compaction):**
`git log --oneline -8`, `git status`, `ls cone.js tests/cone.test.js`,
`npm test` (should be green). Trust disk over any summary, including this one.

## Read order (philosophy-first; CLAUDE.md is law)

1. `CONCEPT.md` → `INTUITIONS.md` (claim 9 + Open-Q 9 are the live edge)
2. `FORMAL_MODEL.md` §8.3 (the possibility-cone derivation) + §7.8–§7.9, §8.1
3. Spec docs, newest first:
   - `docs/superpowers/specs/2026-06-17-closing-open-gaps-research.md` (the two
     gaps; full research synthesis + citations)
   - `2026-06-09-possibility-cone-design.md` (the settled model; note: file is
     dated 06-09 but the work is the same thread — date drift, harmless)
   - `2026-06-10-code-propagation-handoff.md` (earlier code hand-off; partly
     superseded — cone.js now EXISTS, see below)

## Where things stand (verified 2026-06-17)

**Model is settled and formalized.** A node is a partial world-state; no
"decision", no ontological "author", no per-node/edge actor structure
(attribution is metadata only). Out-branches = precondition-satisfying
transitions (§1.5) restricted to the **possibility cone** derived from an
attractor **Ω**. Convergence is relaxed to a **waist** (a small antichain, not
strictly one node).

**Code exists and is wired.** `cone.js` (committed `de6fcc5`) implements §8.3:
`support`/`rim`, `widthProfile`, `waists`, `maxflow`/`mengerWidth`,
`criticality` + `edgeCriticalities` (= max-flow vitality), `agentInfluence`,
`metaAgentInfluence`, `realizedFrontier`. Wired through `phi.js` (influence as
a Pareto axis) and the UI. `seeds.js` designates `omega` per story
(red_rescue, magi_love, neck_fake, tor_finish). Tests: `tests/cone.test.js`
green against Red + Magi. So the earlier "code deferred" hand-off is stale.

**The two open gaps, current status (commit `2b3be3c`):**
- **Ω is NOT a gap** — reclassified as a *boundary condition* (a DAG cannot
  host an attractor; least-action fixes endpoints as inputs). The "derive Ω"
  candidate is **retracted** in §8.3.4. Why G has these termini = Open-Q1.
- **capability↔influence IS the live gap** (§8.3.5, `open`). Influence =
  max-flow vitality (structural, realized, *implemented*). Capability = two
  axes, *not yet computable from a DAG*: accuracy (`−KL(realized‖predicted)`)
  and empowerment (channel capacity actions→future). η = their coupling, a
  selection gradient, institution-dependent. Three holes: capability ≠
  alignment; reverse causation; no DAG-internal capability measure yet.

## Candidate next moves (pick with the user; don't assume)

1. **Make η a number, not prose** (the natural theory step). Define `accuracy`
   and `empowerment` computably over the seed DAGs, then η as their
   standardized covariance with `agentInfluence`. This is a real modeling step
   (needs: a notion of an agent's *private* predicted cone vs. the realized
   cone for accuracy; a tractable action→future mutual-information proxy for
   empowerment). Likely new `cone.js`/new-module functions + tests. Start by
   brainstorming the definitions before coding.
2. **cone.js performance** (`edgeCriticalities`): currently naive per-edge
   max-flow. Non-saturated edges have vitality 0 (one max-flow reveals them);
   all-edge vitality needs only `2(n−1)` max-flows (Ausiello et al. 2019).
   Pure optimization, behavior-preserving — good TDD target.
3. **Descriptive "structural convergence" author-aid** (§8.3.4): unweighted
   source→sink path-count mode via topo-DP, reported with the full hitting
   distribution + entropy, to *suggest* candidate Ω in the UI. Must never be
   presented as deriving Ω.
4. **Multi-edge / Shapley influence** (§8.3.3 caveat): vitality is marginal,
   not joint — redundant parallel routes are under-counted. Only worth it if a
   seed exposes the redundancy problem.
5. **External-DAG validation** (the standing empirical bet, INTUITIONS §8 /
   §9): every "tested" claim is internal-seeds only.

## Hard constraints (drift guards — burned the project twice)

- Model wins over code; intuitions-vs-formalism conflicts get flagged in BOTH
  docs as **data**, never silently absorbed.
- Honest tags: nothing past `partial`/`open` without earning it. The UI must
  not render an `open` claim as `operational`.
- **Influence ≠ capability** — never name a code identifier "capability" for a
  vitality quantity.
- No materialization/election: weights measure/order, never pick "the real
  path"; actual/counterfactual stays abolished *within* the cone.
- Ω is an input (boundary condition), not something to re-attempt deriving.
- Joint/product transitions across agency sources are `open` (§7.8) — out of
  scope unless explicitly promoted.
- TDD per superpowers; preserve the gotcha headers in `seeds.js` /
  `magi_fixture.js`; dual-mode IIFE pattern for new modules; cite §-anchors in
  code comments.

## One-line task seed for the new session

> Continue Retrocause on `philostruct` @ `2b3be3c`. Model is formalized
> (possibility cone, §8.3) and implemented (`cone.js`, wired through phi+UI).
> Ω is a settled boundary condition; the live open gap is the
> capability↔influence bridge (§8.3.5). Most likely next step: brainstorm then
> implement computable `accuracy`/`empowerment`/η over the seeds to turn η from
> prose into a measured quantity. Verify repo state from disk first; read
> `docs/superpowers/specs/2026-06-17-*` for context.
