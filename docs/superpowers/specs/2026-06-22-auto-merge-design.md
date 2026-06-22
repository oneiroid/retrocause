# Auto-merge for auto-branching — design

**Date:** 2026-06-22
**Status:** approved (design); pre-implementation
**Branch:** philostruct

## Problem

Auto-branching ([`autoBranchFromSelected`](../../../story_builder_app.js))
does a bounded BFS from the selected node, materialising Φ candidates as
new nodes. It is **divergence-only**: when a candidate reaches a
world-state that was already seen during the run, the candidate is
*skipped* (`autoSeenStateKeys`, `chooseAutoCandidates`). Convergent
timelines — two distinct histories that arrive at the same world — are
thrown away, so the result is always a tree, never a reconvergent DAG.

We want an option that instead **collapses** such convergences: when two
distinct nodes (from distinct parents) represent the *same* world-state,
they become a single node with multiple incoming canonical edges.

## Why this is safe (pinned merged-state)

`state_walker` supports a node with multiple canonical parents by
*set-union* of predecessor post-states: `pre = Phi.mergeStates(...predStates)`
([`state_walker.js:91-93`](../../../state_walker.js#L91), `mergeStates` =
union, [`phi.js:59`](../../../phi.js#L59)).

**A naive collapse is NOT state-preserving.** Two children can reach the
*same* post-state from *different* parent states via *different* actions
(e.g. `{a}` --remove a,+common--> `{common}` and `{b}` --remove b,+common-->
`{common}`). If we merge them and let the walker recompute the survivor as
`apply(survivorAction, union(parents))`, the survivor's single action only
undoes one parent's path: `apply(-a,+common, {a,b}) = {b, common}` ≠
`{common}`. The downstream state silently shifts, and `validateGraph` does
not catch it. This is exactly the §1.6 **convergence-conflict** OPEN in
`FORMAL_MODEL.md`: when branches feed a convergence node, plain union is
ill-defined.

**Resolution: the merged node declares its committed post-state.** Because
all members of a merge group share an identical post-state by R1, the
collapse pins that agreed state onto the survivor as an explicit
`mergedState`, and the walker uses it verbatim — skipping the
union+action recomputation for that node. This *realizes* the resolution
the formal model anticipated for §1.6 ("the convergence node [declares]
which branch's facts it commits to"). With pinning, the merge is
**state-preserving by construction**: the survivor's post-state equals the
shared pre-merge post-state, so every downstream node is unchanged. A test
asserts this on a distinct-parent / distinct-action graph (the case a
naive collapse breaks).

## Merge rules

| # | Rule |
|---|------|
| R1 | **Equivalence = identical post-state Set.** Two nodes are mergeable iff their `state_walker` post-states are equal as closed-world sets (same elements). `expr` / `label` / `tags` do not affect mergeability. |
| R2 | **Eligibility.** Only nodes created by the current auto-branch run (`createdBy: "phi-auto"`) participate. Hand-authored / canonical nodes are never deleted or rewired by default. |
| R3 | **Survivor selection.** Within an equal-state group, the survivor is the node **closest to a root** — the smallest canonical depth, where depth = fewest canonical edges from any root (a node with no canonical parents). Ties are broken deterministically by position in `graph.nodes`. All others are victims merged into it. |
| R4 | **Cycle safety.** A victim `V` is not merged into survivor `S` if `S` is a canonical ancestor of `V` or `V` is a canonical ancestor of `S` (merging would create a cycle). Such pairs are left intact and reported. |
| R5 | **Edge rewiring.** For each victim `V` merged into `S`: repoint every edge with `from === V` to `from = S` and every edge with `to === V` to `to = S`; drop resulting self-loops (`from === to`); dedup parallel edges sharing `(from, to, type)`, preferring to keep a canonical edge over a non-canonical one. Then remove `V` from `graph.nodes`. |
| R6 | **Provenance & selection.** The survivor gains a `"merged"` tag and a `mergedFrom: [victimIds...]` field. If the currently selected node was a victim, selection moves to the survivor. |
| R7 | **Pinned merged-state (convergence-conflict resolution, §1.6).** The survivor is stamped with `mergedState: string[]` = the sorted atoms of the group's shared post-state. `state_walker` treats any node with a `mergedState` as a **state source**: its post-state is `new Set(node.mergedState)` verbatim, bypassing the predecessor-union + action recompute. This makes the collapse state-preserving by construction. The engine stamps `mergedState` from a per-group `state` payload supplied by the caller (opaque to the engine — it does not compute or interpret states). |

## Architecture

### Engine (testable core)

New pure function in [`story_builder_engine.js`](../../../story_builder_engine.js):

```
mergeEquivalentStates(graph, opts) -> { ok, merged, skipped, survivors }
```

- `opts.groups` — array of group entries. Each entry is either a bare
  `string[]` of state-equivalent node ids (R1) **or** an object
  `{ ids: string[], state?: string[] }` where `state` is the group's
  shared post-state as sorted atoms. The engine does **not** compute
  states (states need the fixture + Phi, which live in the app layer); the
  caller supplies the equivalence groups and, for pinning, the opaque
  `state` payload. This keeps the engine free of fixture coupling and
  matches the existing seeds-vs-fixtures separation.
- `opts.eligibleIds` — `Set` limiting which ids may be victims/survivors
  (R2). Ids outside the set are filtered out of every group.
- The engine enforces R3 (survivor = smallest canonical depth, ties by
  `graph.nodes` position; depth via a BFS over canonical edges from the
  roots — pure topology, no fixture needed), R4 (uses `reachable` for the
  ancestor check), R5 (rewire + dedup + delete), R6's `mergedFrom`/tag
  bookkeeping, and R7 (stamps `survivor.mergedState = state.slice()` when
  the group entry carries a `state`, treating it as opaque data).
- Returns counts: `merged` (victims absorbed), `skipped` (pairs left for
  cycle-safety), and the survivor ids (so the app can fix selection).

### Walker (state source for merged nodes)

In [`state_walker.js`](../../../state_walker.js) `computeAllPostStates`,
before computing pre-state/applying an action, check for a pinned state:
if `Array.isArray(node.mergedState)`, set `post = new Set(node.mergedState)`
and continue. This is R7's read side — a merged node is a declared state
source, the §1.6 convergence-conflict resolution. A walker test asserts a
node with `mergedState` returns it verbatim regardless of parents/action.

`reachable` and the edge-canonical predicate already exist in the engine;
`mergeEquivalentStates` reuses them.

### App (orchestration)

In [`story_builder_app.js`](../../../story_builder_app.js):

1. **Read the toggle.** `mergeEnabled = el.autoMergeToggle?.checked`.
2. **Disable the skip when merging.** When `mergeEnabled`, the per-run
   `autoSeenStateKeys` convergence-skip is bypassed in
   `chooseAutoCandidates` so convergent nodes are actually created. The
   per-parent `outgoingExprs` filter (no two identical children of one
   parent) stays — it is not about convergence. The `maxNodes` cap still
   bounds the run.
3. **Post-pass.** After the BFS loop finishes (in the `finally` or just
   before it), when `mergeEnabled`:
   - compute post-states for all auto-created nodes via
     `RetrocauseStateWalker.computeAllPostStates` (the app already has the
     fixture for the active seed),
   - bucket auto-created node ids by post-state key (the same canonical
     key form already used for `autoPostStateKey`),
   - keep buckets with ≥2 ids → `groups`, each as
     `{ ids, state: Array.from(sharedPostState).sort() }` so the engine can
     pin `mergedState` (R7),
   - call `mergeEquivalentStates(state.graph, { groups, eligibleIds })`,
   - derive victim→survivor from the engine's returned `survivors` (not by
     re-deriving from node presence),
   - `renderAll()` and fold the merge counts into the status/toast text.
4. **Selection.** If `state.selectedId` (or `lastMadeId`) was merged away,
   set it to the reported survivor.

### UI

In [`story_builder.html`](../../../story_builder.html) `auto-branch-row`,
add one checkbox:

```html
<label class="inline-label">
  <input id="autoMergeToggle" type="checkbox">
  <span>Auto-merge convergent states</span>
</label>
```

- **Default off** — preserves today's exact behavior.
- Status line gains `merged N convergent node(s)` and, if any,
  `M pair(s) skipped (would cycle)`.

Deferred as YAGNI (engine function makes them cheap to add later):
"also merge into hand-authored nodes" sub-toggle, and a standalone
whole-graph "Merge convergent states" button.

## Testing

`tests/automerge.test.js` (`node --test`), exercising the engine
function directly plus one walker round-trip:

1. **Basic collapse.** Two nodes with the same state, distinct parents →
   one survivor with two incoming canonical edges; victim removed;
   `mergedFrom` records the absorbed id.
2. **Cycle guard.** Survivor is an ancestor of victim → pair skipped,
   both nodes remain, `skipped === 1`.
3. **Edge dedup + self-loop.** Rewiring that produces a duplicate
   `(from,to,type)` keeps one (canonical preferred); a rewire that would
   make `from === to` drops the edge.
4. **Eligibility.** Ids outside `eligibleIds` are never merged.
5. **Survivor by root distance.** A 3-node equal-state group at differing
   canonical depths collapses onto the shallowest; an equal-depth tie
   falls back to `graph.nodes` order.
6. **State preservation.** Build a small typed graph (Red or Magi
   fixture), run `computeAllPostStates` before and after a merge of two
   genuinely equal-state nodes; assert every surviving node's post-state
   is unchanged.

## Out of scope

- Merging across separate auto-branch runs / hand-authored subgraphs
  (default eligibility is this-run-only).
- Approximate / subsumption equivalence (subset states). R1 is exact
  equality only.
- Animated step-by-step merge; the post-pass renders once at the end.
