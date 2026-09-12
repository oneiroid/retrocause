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
5. `experiments/NOTES.md` — the running log for the continuation-generation
   work (plan v3): the frame representation, every config that produced a
   number, and every place the plan and the machine disagree.

**Conflict resolution:** when the intuitions and the code disagree, the
disagreement is data — flag it in both, don't silently absorb either
side. See `CONCEPT.md` §"What each layer commits to".

## Run

- App: open `story_builder.html` directly in a browser (no bundler; loads
  D3 from CDN, reads `seeds.js` via `window.*`).
- Tests: `npm test` — syntax-checks the source files via `node --check`,
  then runs `node --test tests/*.test.js`. Model-free: nothing in the
  suite talks to a server.
- Model server (only for grower work): `./tools/serve_reference.sh`, or
  `PROFILE=qwen3-4b-cuda ./tools/serve_reference.sh` for the GPU profile.
  The weights and both llama.cpp builds live outside this repo, in the
  sibling `llmfinetune` workspace; the script verifies the GGUF hash before
  serving and pins the whole profile. Nothing in the app or the tests needs
  it.
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
| `seeds.js` | Seed story DAGs (nodes + edges). v2: one node = one event, `state` is world state (the model reads it), `reading` is the authored gloss (nothing renders it into a prompt). Also carries the hand-authored `frame` per node and the closed `entities` actor list per story |
| `frames.js` | The frame representation under test: `{ actor, action, outcome }`, its one sentence template, `render`/`parse`, and the GBNF skeleton. A **model boundary**, not a content key — `ids.js` still owns `normalizedContent` |
| `llm_client.js` | llama-server transport; owns the pinned sampling profile and the response cache. **Node-only** — never loaded by the page |
| `grower.js` | The deterministic traversal: proposes via `llm_client`, inserts via `growth.js`, pins every ordering. Optional `proposer` swaps the candidate source and leaves everything after proposal shared. Node-only |
| `frame_proposer.js` | Frames candidate source for the grower: unconditioned grammar draws + gated actor fill, 3 offered per expansion. Frame-grown nodes carry `frame`, `expr = frameExpr`, `state = outcome`. `rejoinTemplate` (eval: `--frames-rejoin`) adds one enum-constrained draw per candidate naming a rejoin target or NONE; only nodes incomparable with the source are offered, so a seed source on a linear spine has none. Their exprs never collide with seed `deed(args)` exprs, so merge-on-insert does not fire for this source. Node-only |
| `prompts/frames.v*.txt` | Few-shot for the sentence arm, in rendered-frame format. Same versioning rule as `branch.v*`: the sha256 goes in the probe manifest, edits are a new version. `frames.v1` (path only) is the default; `frames.v2` adds the told story and is kept **only** for replay — measured, it makes the model copy seed frames verbatim (16/17 grown nodes) |
| `prompts/rejoin.v*.txt` | The frames source's rejoin question. The grammar's alternatives are the rendered candidate nodes plus `NONE`, so an invalid target is unreachable — `branch.v2`'s free-text `rejoinTargetId` measured rejoinValidity 0, the enum measures 1.0 |
| `prompts/same.v*.txt` | Few-shot for the "same state?" judge. `same.v1` takes `expr — state` pairs (`same_state.js`); `same.v2` takes rendered frames (`frame_merge.js`) |
| `prompts/branch.v*.txt` | Versioned few-shot prompts; the sha256 goes in the run manifest. Edits are a new version, never in-place. `branch.v2` (default) carries the told story + ancestor path; `branch.v1` (one node only) is kept selectable via `--prompt` so its manifests stay replayable |
| `tools/grow.js` | CLI: `npm run grow -- --story red …` emits `runs/<runId>/grown_graph.json` + manifest; `npm run grow:replay -- <manifest>` diffs canonical JSON cache-cold |
| `tools/grow_server.js` | `npm run grow:serve` — loopback bridge (:8081) behind the UI's Auto-grow button; runs the grower Node-side, persists the run, returns the grown graph. UI runs get `input.seed: null` manifests and are not `grow:replay`-able |
| `tools/eval.js` | `npm run eval` — §6 metric table over model runs, recorded run dirs, and the `gen_probe.js` baseline (probe candidate source through the grower's own traversal). `--sources model,frames` adds the frames source; `--frames-prompt` picks its template and `--from <nodeId>` (single story) moves the traversal start. Growing from the root handicaps the frames source specifically — `branch.v2` carries the told story at any depth, `frames.v1` carries only the ancestor path |
| `tools/serve_reference.sh` | Starts `llama-server` on a hash-pinned profile (`LOCAL_LLM.md` §4.1). Every flag in it is part of that profile. Two profiles: `ref-1.7b-cpu` (default, the Phase 0.5 artifact — every run in `runs/` was grown under it) and `PROFILE=qwen3-4b-cuda` (4B Q5_K_M, all layers on GPU). The two are **different substrates**, not fast/slow versions of one |
| `experiments/continue_probe.js` | Stage 0 A/B probe: sentence arm (`frames.v1` + grammar) against JSON arm (`branch.v2` + schema), same node, same model, same sampler. Writes candidates to `experiments/out/`; grows nothing and merges nothing |
| `experiments/grade.js` | Grading CLI over a probe output — four y/n questions per sample (`possible`, `consistent`, `advances`, `toldStory`), arms interleaved in a seeded shuffle. `--resume` carries prior answers so re-scoring costs only the delta; `--labels`/`--rater` records a non-human rater; `--compare` reports per-question Cohen's kappa and flags one-directional disagreement. Each prompt names what it asks relative to. Since 2026-09-10 Claude's grading is the reference rater, by the human's decision |
| `experiments/NOTES.md` | Running log for the continuation work: every config that produced a number, and every deviation from the plan |
| `experiments/gen_probe.js` | Lexicon-recombiner probe; the traversal `grower.js` will lift and the eval baseline it must beat |
| `experiments/frame_merge.js` | Would the frames source converge under a model-judged content key? Enumerates parallel pairs of frame-grown nodes and asks `same.v2`, with an actor guard and a judge control that aborts on failure. **Report-only** — auto-merge stays off (`--apply` previews in memory, writes nothing). Measured 0 merges over 276 pairs: the key was never the blocker |
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
- **`frame` is a representation under test, not a second content key.**
  A node's `frame` is `{ actor, action, outcome }`, rendered as
  `Then {actor} {action}, and now {outcome}.` A grown node's `expr` is
  derived from it (`Frames.frameExpr`) so `ids.nodeId` covers all three
  slots. `actor` ranges over the story's **closed** `entities` list —
  nothing in a sentence marks where the actor ends and the action begins,
  so the list is what makes `parse` invertible. The cost is real: no
  continuation can introduce a character the author did not pre-declare.
  `merge_predicate.js` is untouched by any of this.

  The closed list is also the representation's one **lever**: restricting the
  grammar's actor enum to a single entity enumerates continuations the
  sampler otherwise never proposes. Unconditioned, the model used 2 of
  trojanHorse's 4 actors across 30 samples and never once proposed Cassandra
  — on the node where the told story has her speak. The JSON boundary has no
  equivalent, since `expr` has no actor slot with a closed vocabulary. See
  `experiments/NOTES.md`.

- **One node, one event.** If a node's `label` and `expr` disagree, it is
  usually bundling several events and wants splitting — that mismatch is
  exactly how the v1 seeds' overloading was found.

## Gotchas

- `seeds.js` carries three stories (Red, The Boy Who Cried Wolf, The Trojan
  Horse), chosen to share schemas — and, for criedWolf, the `wolf` entity —
  so their possibility spaces overlap. Branches are not shipped in seeds;
  they are created in the UI by the user.
