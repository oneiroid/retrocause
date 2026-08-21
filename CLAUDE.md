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
4. `LOCAL_LLM.md` — the Node-side grower: automatic DAG growth via a
   small local model through `llama.cpp`, and what it takes to make those
   runs reproducible. Phases 0–1 have landed (`ids.js`, the GGUF, the
   reference profile, `llm_client.js`/`grower.js`/`tools/grow.js`); the
   eval harness (Phase 2) is still design. **§0 is the resume point** —
   read it before picking the work up.

**Conflict resolution:** when the intuitions and the code disagree, the
disagreement is data — flag it in both, don't silently absorb either
side. See `CONCEPT.md` §"What each layer commits to".

## Run

- App: open `story_builder.html` directly in a browser (no bundler; loads
  D3 from CDN, reads `seeds.js` via `window.*`).
- Tests: `npm test` — syntax-checks the source files via `node --check`,
  then runs `node --test tests/*.test.js`. Model-free: nothing in the
  suite talks to a server.
- Model server (only for grower work): `./tools/serve_reference.sh`. The
  weights live outside this repo, in the sibling `llmfinetune` workspace;
  the script verifies the GGUF hash before serving and pins the whole
  reference profile. Nothing in the app or the tests needs it.
- UI Auto-grow (LLM assist panel) needs both servers:
  `./tools/serve_reference.sh` and `npm run grow:serve`. Without them the
  button toasts an error and the rest of the page is unaffected.

## Module map

| File | Role |
|------|------|
| `story_builder.html` / `.css` / `story_builder_app.js` | D3 UI shell |
| `ids.js` | Content-addressed ids (`nodeId`, `edgeId`) + `canonicalJson`; owns `normalizedContent`, the one content key. Requires nothing — it is the leaf everything else imports |
| `story_builder_engine.js` | Graph ops: add/remove nodes & edges, cycle checks, branch composition |
| `merge_predicate.js` | `sameInContext`: same content + parallel paths ⇒ same state (merge) |
| `growth.js` | Merge-on-insert: continuations collapse into same-in-context states. Also refuses **null transitions** — a continuation matching its source in both `expr` and `state` advances nothing. That is an edge-validity rule, deliberately not a second definition of "same state" |
| `seeds.js` | Seed story DAGs (nodes + edges). v2: one node = one event, `state` is world state (the model reads it), `reading` is the authored gloss (nothing renders it into a prompt) |
| `llm_client.js` | llama-server transport; owns the pinned sampling profile and the response cache. **Node-only** — never loaded by the page |
| `grower.js` | The deterministic traversal: proposes via `llm_client`, inserts via `growth.js`, pins every ordering. Node-only |
| `prompts/branch.v*.txt` | Versioned few-shot prompts; the sha256 goes in the run manifest. Edits are a new version, never in-place. `branch.v2` (default) carries the told story + ancestor path; `branch.v1` (one node only) is kept selectable via `--prompt` so its manifests stay replayable |
| `tools/grow.js` | CLI: `npm run grow -- --story red …` emits `runs/<runId>/grown_graph.json` + manifest; `npm run grow:replay -- <manifest>` diffs canonical JSON cache-cold |
| `tools/grow_server.js` | `npm run grow:serve` — loopback bridge (:8081) behind the UI's Auto-grow button; runs the grower Node-side, persists the run, returns the grown graph. UI runs get `input.seed: null` manifests and are not `grow:replay`-able |
| `tools/eval.js` | `npm run eval` — §6 metric table over model runs, recorded run dirs, and the `gen_probe.js` baseline (probe candidate source through the grower's own traversal) |
| `tools/serve_reference.sh` | Starts `llama-server` on the reproducible reference profile (`LOCAL_LLM.md` §4.1). Every flag in it is part of that profile |
| `experiments/gen_probe.js` | Lexicon-recombiner probe; the traversal `grower.js` will lift and the eval baseline it must beat |
| `experiments/same_state.js` | Can the local model judge "same state?" — 18 hand-labelled pairs. The one task it does well (bounded discrimination, not generation). Model + argument guard: 6/9 true merges vs the surface key's 2, zero false merges |
| `experiments/history_key.js` | Folds seed `effects` along a path (last-write-wins) and asks whether merges survive knowing the route. Model-free |
| `tools/extract_state.js` | Recorded failure: the local model cannot extract canonical state (22% malformed, 37 variables for 14 nodes). Kept as the record |
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
- **`effects` is the canonical fact layer.** Seed nodes carry
  `owner.property=value` assignments naming what the event changed. Folded
  last-write-wins along a path they give a node's world state — a *set* of
  changes would be a log, not a state. Hand-authored on seeds by design:
  they are the ground truth grown graphs are scored against, so the model
  under test must not write them. Distinct from `delta`, which is
  counterfactual-relative ("differs from the told story").
- **`state` is world state, `reading` is commentary.** `state` says what
  is true in the story after the event, in the story's own terms — it is
  what the grower puts after `Note:` in the prompt, so a gloss there
  teaches the model to produce gloss (`LOCAL_LLM.md` §8). The
  interpretive layer lives in the optional `reading` field, which has no
  default and is never rendered into a prompt.
- **One node, one event.** If a node's `label` and `expr` disagree, it is
  usually bundling several events and wants splitting — that mismatch is
  exactly how the v1 seeds' overloading was found.

## Gotchas

- `seeds.js` carries three stories (Red, The Boy Who Cried Wolf, The Trojan
  Horse), chosen to share schemas — and, for criedWolf, the `wolf` entity —
  so their possibility spaces overlap. Branches are not shipped in seeds;
  they are created in the UI by the user.
