# Self-less cone metrics: branching capacity, locality gap, structural alignment

**Date:** 2026-06-18
**Branch:** `philostruct` (PR base `dagger`).
**Status:** design, approved. Everything it adds stays `partial`/`open`; nothing
is promoted to `operational`.
**Backs / revises:** FORMAL_MODEL §8.3.5 (and a new §8.3.6), INTUITIONS claim 9
/ Open-Q 9.
**Supersedes within this thread:** the agent-centric `capability.js` sketch
(empowerment "of agent g", per-agent η). That sketch was retired mid-brainstorm
— see §1.

---

## 0. Origin: why the agent-centric design was abandoned

The session began operationalizing the §8.3.5 capability↔influence gap by
making `accuracy`, `empowerment`, and η **agent properties** (empowerment *of
agent g*, choice points *g owns*, η *across agents*). Three signals said this
fights the project's grain:

- The hand-off: *"no 'decision', no ontological 'author', no per-node/edge
  actor structure — attribution is metadata only."*
- Project memory: actor-thread work was **rolled back twice** (philostruct reset
  to `08e0083`; actor work exiled to `actor-threads-backup`).
- `cone.js` already does it self-lessly: the primary object is
  `criticality(edge)` — a property of a *transition*. `agentInfluence` is a thin
  aggregation of edge-vitality by attribution. The edge quantity is real; the
  agent is a `groupBy`.

The agent-centric sketch inverted that — it made the agent primary. The user
chose to **drop agents and recast onto structural loci, measure-free**, with
agents re-entering only as an optional metadata aggregation.

### Reconciliation with INTUITIONS (not a conflict — a base case)

INTUITIONS claim 9 already names the self-less case as the floor of a gradient.
The **simulation gradient** (INTUITIONS:278): *"non-agent is the degenerate
case — bare variational path-selection (least-action) with no explicit model.
An agent carries a model of futures; 'more agentic' = richer model."* So the
self-less structural machine is the zero-model base the intuitions say agency
sits on; this recast builds that base layer.

**Data-flag (per CLAUDE.md conflict rule — recorded in both docs, not silently
absorbed):** INTUITIONS:183–256 currently phrases capability/η *agent-first*
("an agent's weight = cut-criticality…", "capable agents on critical
transitions", η as a selection gradient *over agents*). This recast makes
**structural loci primary, agents an optional overlay** — same content, inverted
primacy. The inversion is logged in FORMAL_MODEL §8.3.5 and INTUITIONS claim 9 /
Open-Q 9, not papered over.

---

## 1. Scope and honesty

- Build the **base layer of the simulation gradient**: self-less, measure-free
  structural metrics on the possibility cone.
- Stays `partial`/`open`. The §8.3.5 holes that remain `open`: capability ≠
  alignment (you cannot read meritocracy off structure — it needs a self), and
  reverse causation. Hole (iii) "no independent DAG-internal measure" moves to
  `partial`: self-less proxies are now computable.
- **No identifier named `capability`** — that was an agent word, and the drift
  guard forbids attaching agent-capability language to structural quantities.
  These are *cone metrics*. Influence (vitality) stays in `cone.js`.
- Agents survive **only** as an optional `groupByAgent` overlay — the
  `agentInfluence` pattern, generalized. Metadata, never structure.
- **Measure-free throughout.** No probability measure over paths — that would
  drag back the reparametrization sensitivity §8.3.4 retracted Ω-derivation
  over. All quantities are combinatorial (counts, set fractions, Menger
  vitality) in the spirit of the existing cone code.

## 2. Module

New module **`cone_metrics.js`** — dual-mode IIFE
(`(function attachConeMetrics(root){…})(…)`), depends on `cone.js`, cites
§8.3.5/§8.3.6 in headers. Keeps `cone.js` focused on cone *structure*; these are
derived *metrics on* that structure. Refactor: factor the agent-attribution
helper out of `cone.js`'s `agentInfluence` into a shared exported function (e.g.
`edgeAgent(graph, lexicon, edge)`), so `agentInfluence` and the new
`groupByAgent` share one definition of "which transition belongs to which
agent." `agentInfluence` behavior must not change (existing tests stay green).

## 3. Branching capacity `B(v)` — self-less empowerment

Per node, off-Ω (task-independent, exactly Klyubin's reading minus the agent):

```
B(v) = log2( |{ reachableSinks(s) : s ∈ forward-successors(v) over R }| )
```

- `forward-successors(v)` = heads of `v`'s outgoing **transition** edges
  (`cone.TRANSITION_EDGE_TYPES`).
- `reachableSinks(s)` = the set of sink nodes (out-degree 0 over transition
  edges) forward-reachable from `s` in the raw graph R — **Ω is ignored**. This
  is what decouples B from influence (which is Ω-gated): an agent/locus at a
  width-1 Ω-waist can have B = 0.
- The set is the partition of distinct downstream sink-sets across `v`'s
  successors; `B(v) = log2(count)`. Deterministic-channel capacity with uniform
  input.
- Out-degree ≤ 1, or all successors reach the same sinks → `B(v) = 0`.
- Degeneracy: bare linear seeds → `B = 0` everywhere (correct — a determined
  chain affords no control).

## 4. Locality gap `G(v)` — self-less accuracy / non-locality of next-event constraint

Per node, reusing `cone.support` / `cone.rim`. "How much does knowing Ω prune
the *next event* at `v`, beyond what is locally visible?"

```
G(v) = |out-edges(v) → rim| / |out-edges(v) → (support ∪ rim)|
```

- Numerator: `v`'s transition edges whose head is in the **rim** (forward-
  reachable but cannot reach Ω) — locally possible next events that Ω forbids.
- Denominator: `v`'s transition edges whose head is forward-reachable at all
  (support ∪ rim).
- `G(v) ∈ [0,1]`. Defined for `v ∈ support` with ≥1 forward out-edge; nodes with
  no forward out-edge are omitted (no next event to constrain).
- This is the **1-step next-event grain** — deliberately, matching the brief
  ("constraining the possible next event"). A horizon-`r` generalization is
  noted as future work, not built now.
- Interpretation: `G(v)` is the **local slope of the simulation gradient** —
  where `G = 0`, bare least-action suffices (a model buys nothing); where `G` is
  high, the constraint is non-local and carrying a model would pay off. Self-
  less, yet it explains where agency emerges.
- Degeneracy: linear seeds have no rim → `G = 0` everywhere.

## 5. Structural alignment — self-less η

Across support nodes (the self-less shadow of η; η proper — the agentic
selection gradient — is the overlay reading, §6):

```
V(v)           = Σ criticality(e) over v's out-edges          (node vitality, from cone.edgeCriticalities)
align_branch   = corr_v( B(v), V(v) )
align_locality = corr_v( G(v), V(v) )
per-node gap   = z(B(v)) − z(V(v))   and   z(G(v)) − z(V(v))   (standardized; the diagnostic)
```

- `corr` = Pearson correlation across nodes (a standardized covariance ∈
  [−1,1]). **Node set:** `align_branch` runs over support nodes where both
  `B(v)` and `V(v)` are defined; `align_locality` over support nodes where both
  `G(v)` and `V(v)` are defined (i.e. excluding sinks/Ω that have no forward
  out-edge, hence no `G`). The two correlations may therefore run over slightly
  different node sets — acceptable, and noted in output.
- Asks whether forking loci (high B) and non-local-constraint loci (high G)
  coincide with load-bearing loci (high V). Note B/V may *anti*-correlate by
  construction (width-1 waists are forced: low B, high V; wide-region forks are
  slack: high B, low V) — that anti-correlation is a structural signature, not a
  bug.
- **Guards:** fewer than 2 nodes, or zero variance in either series → return
  `null` (undefined), **not** 0. Documented.
- **Small-n caveat** (in code + docs): at seed scale the node count is tiny;
  alignment is *illustrative, not statistical*.

## 6. Agent overlay (optional, metadata only)

```
groupByAgent(perNodeOrEdgeValues, graph, lexicon) -> { agent: aggregate }
```

Reuses the attribution helper factored from `agentInfluence` (§2). Recovers
per-agent sums of B / G / V, and — if explicitly requested — the institutional η
(corr of per-agent capability vs per-agent influence). This is the **only** place
agents appear, and it is labelled metadata. The institutional / meritocracy
("failed states") reading lives here and **only** here; self-lessly it is
unavailable, because "the capable were denied power" needs a self to be capable.

## 7. Tests (TDD)

`tests/cone_metrics.test.js`:

1. **Synthetic fixture** (built inline in the test, *not* committed to
   `seeds.js`): a small transition-DAG with a real fork (a node with ≥2
   successors reaching distinct sink-sets), rim nodes (forward-reachable, not
   Ω-reaching), and ≥2 sinks. Assert:
   - `B(fork) = log2(k)` for the known `k`; `B = 0` at out-degree-1 nodes.
   - `G(v) > 0` exactly where a rim-bound out-edge exists; `G = 0` otherwise.
   - `align_branch` / `align_locality` are finite numbers with the expected
     sign; per-node gap computed.
   - `groupByAgent` reproduces sensible per-agent aggregates.
2. **Degeneracy on bare seeds** (Red, Magi): assert `B = 0` for all nodes,
   `G = 0` for all nodes, and alignment `null` — asserted as *correct behavior*,
   the determined-chain / parallel-chain case.
3. **Guard behavior**: alignment `null` on zero-variance / <2-node inputs.
4. **Regression**: `agentInfluence` output unchanged after the attribution
   refactor (existing `cone.test.js` stays green).

Run with `npm test` (`node --check` syntax pass + `node --test`).

## 8. Docs to update

- **FORMAL_MODEL §8.3.5** — record the primacy inversion (structural loci
  primary; agents overlay). Move hole (iii) to `partial`. Keep "influence ≠
  capability" and the two remaining `open` holes.
- **FORMAL_MODEL new §8.3.6 "Self-less reformulation"** — define B (self-less
  empowerment), G (locality slope of the simulation gradient), alignment (self-
  less η); state measure-freeness and why (dodges §8.3.4's reparametrization
  trap); state agents = metadata overlay; note `cone_metrics.js` implements it,
  tested on a synthetic fixture, degenerate on the bare seeds.
- **INTUITIONS claim 9 / Open-Q 9** — the self-less case is the simulation-
  gradient base; the agent-first phrasing is the overlay reading; log the
  primacy inversion as data.
- Preserve all existing gotcha headers in `seeds.js` / `magi_fixture.js`.

## 9. What this explicitly does NOT do

- Does not close §8.3.5 (capability ≠ alignment, reverse causation stay `open`).
- Does not add a probability measure over paths (no excess-entropy / ε-machine
  treatment — that flavor was considered and rejected for reparametrization
  sensitivity; recorded as a possible future direction only).
- Does not modify `seeds.js` graph shapes (no authored branches added).
- Does not derive Ω (still a boundary condition, §8.3.4).
- Does not implement a horizon-`r` generalization of G (1-step next-event only).
```

