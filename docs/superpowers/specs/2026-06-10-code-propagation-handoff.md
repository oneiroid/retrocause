# Hand-off: propagate the possibility-cone model into code

**Branch:** `philostruct` @ `55a9a3b` (not pushed). Base for PRs: `dagger`.
**Prereq reading (in order):** `docs/superpowers/specs/2026-06-09-possibility-cone-design.md`,
FORMAL_MODEL §8.3 (the whole derivation), §7.8–§7.9, §8.1, INTUITIONS claim 9.
**Test gate:** `npm test` (33 passing now; keep green at every step).

## Context in one paragraph

The actor-thread overlay was rolled back (`philostruct` reset to `08e0083`;
old work preserved on branch `actor-threads-backup` — concepts cherry-pickable,
code not). Three doc commits since (`71f9037`, `673ff2b`, `55a9a3b`) settled
the replacement model: a node is a partial world-state; no "decision", no
ontological "author", no per-node/per-edge actor structure; agency attribution
is metadata only. Out-branches at a node are precondition-satisfying
transitions (§1.5 `requires`/`effects`) restricted to the **possibility cone**
derived from a designated **attractor Ω** (§8.3). Convergence is relaxed to a
**waist** — a small antichain, not strictly one node.

## What to implement (FORMAL_MODEL §8.3, all `partial` = defined, unimplemented)

1. **Raw graph R** — finite DAG of precondition-satisfiable transitions
   forward from the source under scope (this is iterated Φ, §7.8; phi.js
   already enumerates one step).
2. **Cone support** (§8.3.2) — `support(R, Ω) = forward-reach(source) ∩
   backward-reach(Ω)`. Two linear passes. Everything outside = rim
   (precondition-OK but cannot reach Ω → not in G).
3. **Waists** (§8.3.3) — clean cuts (antichains every source→Ω path crosses)
   at local minima of the cone's width profile; min-cut size = # vertex-disjoint
   paths (Menger). Width 1 = classic convergence node; width k = k-node
   bottleneck. This *generalizes* single-node convergence detection.
4. **Influence weight** (§8.3.3) — `criticality(e) = maxflow(source→Ω) −
   maxflow(source→Ω without e)`. Agent weight = aggregate over transitions
   attributed to it (attribution = the entry's agent argument); meta-agent =
   aggregate of constituents. Surface as a §7.9 ranking term alongside
   specificity/contrast/convergence-proximity (Pareto, no scalar combination).
5. **Ω input** — the ONE legitimate user input: a chosen destination node(s)
   per story/scope. Deriving Ω automatically (§8.3.4 dominant-convergence
   fixed point) is `open` — do NOT implement as if settled; at most offer it
   as a labeled suggestion.

## Likely touch points

- `phi.js` — realized frontier = `Phi(v) ∩ cone`; add influence ranking.
  New module for reachability/maxflow may be cleaner (dual-mode IIFE pattern —
  see CLAUDE.md Conventions; cite §-anchors in comments, e.g. "§8.3.2").
- `state_walker.js` — unchanged in principle (topo-replay of canonical edges).
- `story_builder_engine.js` — waist detection API (generalize any
  convergence/rejoin logic to antichain waists).
- `seeds.js` / fixtures — NO actor arrays/edge-actor fields; an `omega`
  designation per seed (terminal node id(s)) is the new input.
- UI (`story_builder_app.js`) — show cone membership (rim dimmed?), waists,
  influence measure. NO expandable nodes (idea dropped). UI must not render
  `open` claims as `operational` (e.g., auto-Ω must be marked conjectural).

## Hard constraints (drift guards — these have burned the project twice)

- Model wins over code (CLAUDE.md); when intuitions vs formalism conflict,
  flag in both docs as data, don't absorb.
- **Influence ≠ capability**: cut-criticality is structural influence; the
  capability reading is ideal-world `open`. Never name code identifiers
  "capability".
- No materialization/election: weights order/measure, they never pick "the
  real path". actual/counterfactual stays abolished within the cone.
- Joint (product) transitions across independent agency sources are `open`
  (§7.8 note) — out of scope unless explicitly promoted first.
- TDD per superpowers; preserve gotcha headers in seeds.js / magi_fixture.js.

## Sensible first slice

Pure engine, no UI: module `cone.js` with `support(graph, omega)` +
`widthProfile` + `waists` + `criticality`, tested on the red and magi seeds
(hand-computable answers exist: e.g. magi's reveal is a width-1 waist).
Then wire into phi.js ranking, then UI.
