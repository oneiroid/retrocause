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
   runs reproducible (a secondary goal since 2026-09-24 — see
   "Priorities" below). Phases 0–1 have landed (`ids.js`, the GGUF, the
   reference profile, `llm_client.js`/`grower.js`/`tools/grow.js`); the
   eval harness (Phase 2) landed 2026-08-16 (`tools/eval.js`). **§0 is the
   resume point** — read it before picking the work up.
5. `experiments/NOTES.md` — the running log for the continuation-generation
   work: every config that produced a number, and every place the plan and
   the machine disagree. The frames boundary (a sentence format tested
   against JSON) is recorded there and removed from the code.

**Priorities (human decision, 2026-09-24):** reproducibility is welcome,
not a gate. Growth quality, auto-merge and iteration speed come first.
When keeping a run byte-replayable makes other work more complicated,
drop replayability for that path, label the run non-replayable, and move
on. Existing replay machinery (content ids, canonical JSON, manifests,
the response cache) stays where it is cheap; do not extend it at the
expense of anything else. Models stay **local** — hosted-only models are
out, by the same decision.

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
- **Lab panel** (right side of the page): `./tools/lab.sh` (or `npm run lab`)
  starts both processes below, waits for them, opens the page; Ctrl-C stops
  both. By hand it needs two terminals:
  `PROFILE=qwen3-4b-cuda ./tools/serve_reference.sh` and `npm run grow:serve`.
  If 8080 is taken: `PORT=8090 PROFILE=… ./tools/serve_reference.sh` and
  `LLAMA_URL=http://127.0.0.1:8090 npm run grow:serve` (`LLAMA_URL` is read
  by `llm_client.js` everywhere). The panel runs, from the selected node:
  **Grow** (source `model` / `baseline`, §6 metrics beside a
  matched-count baseline, run recorded in `runs/`), **Continuations** (K
  draws per prompt, branch.v4 vs branch.v5, in grade.js's shuffle with the version hidden, y/n on
  `consistent`/`advances`, saved as a grade.js graded file under
  `experiments/out/ui/` with a running tally across all UI batches; any
  candidate can be added to the graph), and
  **Recorded runs** (load any `runs/<runId>` with its scores), and a
  **Prompts** subpanel: every prompt the page caused the model to see, with its
  grammar and raw completions (a UI grow run persists them as
  `runs/<runId>/trace.json`), a no-model preview for the selected node
  (`POST /prompt`), and the raw templates in `prompts/` (`GET /prompts`). The `baseline`
  source works without the model server. Without the bridge the panel says so
  and the rest of the page is unaffected.

## Module map

| File | Role |
|------|------|
| `story_builder.html` / `.css` / `story_builder_app.js` | D3 UI shell |
| `ids.js` | Content-addressed ids (`nodeId`, `edgeId`) + `canonicalJson`; owns `normalizedContent`, the one content key. Requires nothing — it is the leaf everything else imports |
| `story_builder_engine.js` | Graph ops: add/remove nodes & edges, cycle checks, branch composition |
| `merge_predicate.js` | `sameInContext`: same content + parallel paths ⇒ same state (merge) |
| `growth.js` | Merge-on-insert: continuations collapse into same-in-context states. `mergeCandidates` lists the survivors an insert would collapse into (asked of the predicate on a scratch copy); `insertContinuation({ refuse })` skips survivors a caller ruled out. Also refuses **null transitions** — a continuation matching its source in both `expr` and `state` advances nothing. That is an edge-validity rule, deliberately not a second definition of "same state" |
| `seeds.js` | Seed story DAGs (nodes + edges). v2: one node = one event, `state` is world state (the model reads it), `reading` is the authored gloss (nothing renders it into a prompt). v3 (2026-10-04): states are positive facts — no "has not …" sentences, no strategy — because the base model imitates them; remaining bundles split, skipped causes added (Red 19 nodes, criedWolf 13, Trojan 15, Trojan order kept simplified by decision); every root initialises what later effects overwrite, and no effect re-asserts a current value. Each story carries an `entities` character list, rendered into branch.v4's file header as `characters` |
| `llm_client.js` | llama-server transport; owns the pinned sampling profile and the response cache. **Node-only** — never loaded by the page |
| `grower.js` | The deterministic traversal: proposes via `llm_client`, inserts via `growth.js`, pins every ordering. `formatForPrompt(v)` gives a version's request constraint (`nextStepGrammar`: GBNF, built per expansion), completion parser, and draws per expansion (`width` for v4/v5, each with a `drawSeed`). `toldMatch` tags each draw as reproducing the told next event, a later told event, or neither (surface form; counted as `toldNext`/`toldLater`/`draws`). Grow/eval/the bridge run it under `llm_client.SAMPLED_SAMPLING` (temperature 1.0 / min_p 0.05, the probe's profile); greedy would make every draw one line. Node-only |
| `same_judge.js` | Confirm-before-merge: before any merge the surface key proposes, the grower asks whether the two nodes are the same situation. Both ROUTES are rendered as prose (`same.v2`), P(yes) read off next-token logprobs (`llm_client.nextTokenLogprobs`), both orders averaged, `SAME_THRESHOLD` 0.45. It can only refuse merges, never add them. On by default for model runs (bridge and `npm run grow`; `--no-judge` turns it off); the baseline has none. Node-only |
| `prompts/same.v2.txt` | The judge's few-shot document (no instructions): pairs of tellings + `Same situation: yes/no`, including the failure it exists for — same final event, world changed earlier on the route |
| `prompts/same.v1.txt` | Older "same state?" few-shot (`same_state.js`), over `expr — state` pairs; an instruction prompt, kept for that experiment's record |
| `experiments/judge_calibration.js` | Grows mid-story nodes with the judge in record mode and writes every proposed merge to `experiments/out/judge_cal.json`; `--labels` sweeps thresholds over hand labels. First run: 11 of 22 surface-key merges false |
| `prompts/branch.v5.txt` | Growth prompt, prose: the story itself — title, "The characters are …", one paragraph per path node (label sentence + `state`), nothing else. Grammar (`PROSE_GRAMMAR`): capitalized event sentence, ". ", state capped at three sentences (uncapped, 39/40 draws ran to n_predict), newline. `expr` comes from a second greedy call, `prompts/formal.v1.txt` (`createFormalizer`): the story's told nodes as `label => expr` lines, then the new event, under a `verb(args)` grammar — so `formatForPrompt("branch.v5", { formalClient })` needs the reference client. Selectable in the Lab; v4 is the default there and in the CLI — graded blind 2026-10-04, v5 usable 48/82 against v4's 75/86 (experiments/NOTES.md) |
| `prompts/branch.v4.txt` | Growth prompt, JSON Lines (CLI default); its sha256 goes in the run manifest, and edits are a new version, never in-place. Not an instruction: a `head`-style dump of JSON Lines story files — one complete example story, then the current story's header (`title`, `characters`) and one `{"step", "event", "action", "state"}` line per path node. The base model writes the next line; a GBNF grammar pins its shape (step literal, quote-free text, `verb(args)` action). The told future is not shown, so there is no `rejoin`/`delta`/`invariants`/`actor`. v1–v3 (instruction prompts asking for alternatives) were deleted 2026-09-29; runs recorded under them are no longer replayable |
| `tools/grow.js` | CLI: `npm run grow -- --story red …` emits `runs/<runId>/grown_graph.json` + manifest + `trace.json`; `npm run grow:replay -- <manifest>` diffs canonical JSON cache-cold |
| `tools/grow_server.js` | `npm run grow:serve` — loopback bridge (:8081) behind the Lab panel. `/grow` (source `model`/`baseline`; returns `scoreGrowth` + a matched-count baseline + the prompt `trace`, persisted as `trace.json`), `/continue` (NDJSON-streamed `continue_probe.probeNode`, writes `experiments/out/ui/cont_ui_<hash>.json`), `/grades` (writes the grade.js graded file, rater `human`), `/runs`, `/prompt` (no-model preview), `/prompts` (templates). UI runs get `input.seed: null` manifests and are not `grow:replay`-able; the baseline source adds a `source` block to the config; model runs add a `judge` block (prompt, sha256, threshold) |
| `tools/eval.js` | `npm run eval` — §6 metric table over model runs, recorded run dirs, and the `gen_probe.js` baseline (probe candidate source through the grower's own traversal). `--prompt a,b` scores versions side by side; `--from <nodeId>` (single story) moves the traversal start |
| `tools/serve_reference.sh` | Starts `llama-server` on a hash-pinned profile (`LOCAL_LLM.md` §4.1). Every flag in it is part of that profile. Two profiles: `ref-1.7b-cpu` (default, the Phase 0.5 artifact — every run in `runs/` was grown under it) and `PROFILE=qwen3-4b-cuda` (4B Q5_K_M, all layers on GPU). The two are **different substrates**, not fast/slow versions of one |
| `experiments/continue_probe.js` | Continuation probe: K distinct draws per prompt version (default `branch.v4,branch.v5`; arm stats include the told-next share) at one node, same model, same sampler (temperature 1.0 / min_p 0.05). Every arm renders `expr — state`, so a multi-arm A/B grades blind. `probeNode` is shared by the CLI and the grow server. Grows nothing and merges nothing |
| `experiments/grade.js` | Grading CLI over a probe output — four y/n questions defined (`possible`, `consistent`, `advances`, `toldStory`), arms interleaved in a seeded shuffle. Only the two that discriminate on the calibration data — `consistent` and `advances` — are asked per sample (`ask` in `QUESTIONS`); `possible`/`toldStory` measured as noise and are demoted to spot-checks (`--labels` or re-enabling `ask` still records them). `--resume` carries prior answers so re-scoring costs only the delta; `--labels`/`--rater` records a non-human rater; `--compare` reports per-question Cohen's kappa and flags one-directional disagreement. Each prompt names what it asks relative to. Since 2026-09-10 Claude's grading is the reference rater, by the human's decision; since 2026-09-24 the human grades are erased (misunderstood questions) and Claude's are the only grading data — the calibration that demoted `possible`/`toldStory` rested on them, so that demotion stands on cost, not on measurement |
| `experiments/NOTES.md` | Running log for the continuation work: every config that produced a number, and every deviation from the plan |
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
  `Date.now()` or `Math.random()`. The ids are kept because they are
  cheap and stable (same content → same id helps merging and diffing);
  byte-identical replay via `ids.canonicalJson` is a welcome by-product,
  not a requirement (see "Priorities"). See `LOCAL_LLM.md` §3.
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
- **No closed `actor` since v4.** branch.v3 closed an `actor` field over
  `entities`; v4 has no actor slot (seed nodes carry none, so the file has
  no such key to continue). The measured lever it held — restricting the
  actor recovers continuations the sampler never proposes (Cassandra at
  `th_lie`, experiments/NOTES.md) — is not reachable from v4 as built.

- **One node, one event.** If a node's `label` and `expr` disagree, it is
  usually bundling several events and wants splitting — that mismatch is
  exactly how the v1 seeds' overloading was found.

## Gotchas

- `seeds.js` carries three stories (Red, The Boy Who Cried Wolf, The Trojan
  Horse), chosen to share schemas — and, for criedWolf, the `wolf` entity —
  so their possibility spaces overlap. Branches are not shipped in seeds;
  they are created in the UI by the user.
