# Retrocause — Branching Narrative DAG Builder

Browser-only D3 lab for editing a story DAG and branching any state node
into counterfactual alternatives.

**Doc stack (philosophy-first ordering — read in this order):**

1. `CONCEPT.md` — the project's thesis (narrative-as-substrate) and the
   dependency between layers: intuitions → code.
2. `INTUITIONS.md` — the philosophical core. Each claim tagged
   `operational` / `partial` / `open` by how far the app actually
   exercises it.
3. `RESEARCH_AND_DESIGN.md` — product spec and the interactive-narrative
   research it draws on.
4. `LOCAL_LLM.md` — design (not yet implemented) for the Node-side
   grower: automatic DAG growth via a small local model through
   `llama.cpp`, and what it takes to make those runs reproducible.

**Conflict resolution:** when the intuitions and the code disagree, the
disagreement is data — flag it in both, don't silently absorb either
side. See `CONCEPT.md` §"What each layer commits to".

## Run

- App: open `story_builder.html` directly in a browser (no bundler; loads
  D3 from CDN, reads `seeds.js` via `window.*`).
- Tests: `npm test` — syntax-checks the source files via `node --check`,
  then runs `node --test tests/*.test.js`.

## Module map

| File | Role |
|------|------|
| `story_builder.html` / `.css` / `story_builder_app.js` | D3 UI shell |
| `ids.js` | Content-addressed ids (`nodeId`, `edgeId`) + `canonicalJson`; owns `normalizedContent`, the one content key. Requires nothing — it is the leaf everything else imports |
| `story_builder_engine.js` | Graph ops: add/remove nodes & edges, cycle checks, branch composition |
| `merge_predicate.js` | `sameInContext`: same content + parallel paths ⇒ same state (merge) |
| `growth.js` | Merge-on-insert: continuations collapse into same-in-context states |
| `seeds.js` | Seed story DAGs (nodes + edges) |
| `tests/*.test.js` | `node --test` unit tests |

## Conventions

- **Dual-mode modules.** Every source file is an IIFE
  `(function attachX(root){ … })(typeof window !== "undefined" ? window : global)`
  so the same file loads via `<script>` in the browser and `require()` in
  Node tests. New modules must follow this pattern.
- **Edges are plain narrative relations.** Edge `type` is one of
  `causes`, `leads_to`, `choice`, `rejoins`. There is no privileged
  "canonical" class of edge — they are all the same kind of object,
  distinguished only by type and color.
- **Ids are content-addressed, never wall-clock.** `ids.nodeId` hashes
  `parentId | normalizedContent(expr) | normalizedContent(label)`;
  collisions get a deterministic `_2` suffix. Never mint an id from
  `Date.now()` or `Math.random()` — two identical sessions must produce
  byte-identical graphs, which is what `ids.canonicalJson` (sorted, fixed
  key order, no `savedAt`) exists to let you assert. See `LOCAL_LLM.md` §3.
- **Nodes.** A node has an `id`, `label`, a free-form `expr`, a prose
  `state` note, `kind` (`root` / `story` / `branch` / `note`), `tags`, and
  optional branch metadata (`delta`, `invariants`). "Bottleneck" is **not**
  a kind — it is derived from topology each render (in-degree > 2 and the
  flow re-widens at or below the node).

## Gotchas

- `seeds.js` carries three stories (Red, The Boy Who Cried Wolf, The Trojan
  Horse), chosen to share schemas — and, for criedWolf, the `wolf` entity —
  so their possibility spaces overlap. Branches are not shipped in seeds;
  they are created in the UI by the user.
