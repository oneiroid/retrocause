# Growth loop — merge-on-insert mechanism (v0)

**Date:** 2026-06-29
**Status:** design approved, pending implementation

## Purpose

Build the smallest honest piece of the DAG growth loop: a mechanism that
inserts a candidate continuation into the story DAG and **collapses it into an
existing node when the two are the same state in context** (per
`merge_predicate.js`'s `sameInContext`). This is the part that makes a growing
graph *converge* instead of exploding into a tree.

This build deliberately stops at the mechanism. It does **not** include a
continuation generator — candidates are hand-fed by tests and (later) the
manual branch form. We grow the Red DAG by hand and *look* at the convergence
that forms before naming or building anything further. See
`[[feedback-avoid-premature-apparatus]]` and
`[[project-continuation-generator-direction]]`.

## Scope

**In scope**
- New dual-mode module `growth.js`.
- `tests/growth.test.js` (node `--test`).
- A throwaway script to grow the Red DAG and export the result for inspection.

**Out of scope (later builds)**
- Any continuation *generator* (combinatorial, LLM, or otherwise).
- UI wiring / live auto-merge in the D3 view.
- The `forward-consistency` question (parked skipped test in
  `merge_predicate.test.js`) — revisit only after looking at real output.

## Interface

`growth.js`, IIFE following the project's dual-mode convention, depending on
`MergePredicate.sameInContext` and `StoryDagEngine` (`addEdge`, `reachable`).

```
insertContinuation(graph, { from, node, type?, label? })
  → { merged: true,  into: <existingId>, edge }      // collapsed into existing state
  | { merged: false, node, edge }                    // genuinely new state
  | { ok: false, message }                           // bad input (e.g. missing `from`)

grow(graph, continuations[]) → results[]             // insertContinuation in order
```

A *continuation* is "a new state `node` reached from an existing node `from`."
`insertContinuation` mutates `graph` and reports whether the candidate became a
new node or merged into an existing one. `type`/`label` default the same way
`addEdge` defaults them (`causes` / type-as-label).

## Algorithm

1. Verify `from` exists in `graph`. If not → `{ ok:false, message }`.
2. Ensure `node.id` (generate one if absent, mirroring `addBranch`).
3. Tentatively add `node`, then add edge `from → node` via `Engine.addEdge`
   (which already rejects cycles and missing endpoints).
4. Scan existing nodes for the first `B` (B ≠ the new node) where
   `sameInContext(graph, node.id, B.id)` is true.
5. **Match →** remove the tentative node and its edge, then
   `addEdge(from → B)`. Return `{ merged:true, into:B.id, edge }`.
6. **No match →** keep node and edge. Return `{ merged:false, node, edge }`.

### Why the merge is always safe

The rewire on merge is `from → B`. That edge can create a cycle only if `B`
already reaches `from`. But if `B` reaches `from`, then `B` reaches the
candidate (whose only path in is through `from`), making them *comparable* —
which makes `sameInContext` return false and blocks the merge. So **merge and
acyclicity are the same condition**; no cycle guard is needed beyond the
predicate itself.

### Decisions

- **First-match merge.** If a candidate matches multiple existing nodes (should
  not happen in an already-converged graph), merge into the first found. Keep
  v0 simple; revisit only if real output shows it.
- **Convergence stays derived.** No "convergence"/"merged" flag is written on
  nodes or edges. The convergence node is simply the survivor `B` with a higher
  in-degree, computed at render time — consistent with `CLAUDE.md`.
- **Batch order is significant.** In `grow([...])`, a later candidate can merge
  into a node added earlier in the same call. This is intended and documented.
- **No carry-over.** A merged candidate's own metadata (delta/state) is
  discarded; only its incoming edge is rewired to the survivor. Keep raw.

## Tests (`tests/growth.test.js`)

Built on the same tiny graph builder used by `merge_predicate.test.js`, plus
the real Red seed where useful.

1. **Convergence forms.** From `red_woods`, feed two parallel continuations both
   with content `arrive(red, grandmother_house)`. Second merges into the first;
   survivor in-degree == 2.
2. **Recurrence stays split.** A continuation whose content matches an
   *ancestor* on its own path → `merged:false` (a later look-alike, not the
   same state).
3. **Different content → no merge.** Two parallel continuations, different
   `expr` → both kept.
4. **Batch order.** A later candidate in one `grow()` call merges into a node
   added earlier in the same call.
5. **Acyclicity invariant.** After any `grow`, `Engine.validateGraph(graph).ok`
   is true.
6. **Missing source.** `from` not in graph → `{ ok:false }`, graph unchanged.

## Observation step

After the tests pass, grow the Red DAG with a few hand-fed parallel
continuations in a throwaway script, export the JSON, and look at the
convergence structure that forms. No new metrics or vocabulary until that look
shows something worth naming.
