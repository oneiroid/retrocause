# Retrocause — Branching Narrative DAG Builder

Browser-only D3 lab for editing a story DAG and branching any state node
into counterfactual alternatives.

**Doc stack (philosophy-first ordering — read in this order):**

1. `CONCEPT.md` — the core idea (myths as the longest-trained human
   representation, few base stories), the thesis (narrative-as-substrate) and the
   dependency between layers: intuitions → code.
2. `INTUITIONS.md` — the philosophical core. Each claim tagged
   `operational` / `partial` / `open` by how far the app actually
   exercises it.
3. `RESEARCH_AND_DESIGN.md` — product spec and the interactive-narrative
   research it draws on.
4. `LOCAL_LLM.md` — the Node-side grower: automatic DAG growth with a local
   chat model through `llama.cpp`. How one run works, the knobs, the server.
5. `experiments/NOTES.md` — the running log for the continuation-generation
   work: every config that produced a number. Everything before 2026-11-02 was
   measured on base models with code since deleted (it is in git at `5188d1f`).

**Priorities (human decision, 2026-09-24, restated 2026-11-01):** automatic
branching from a selected node, deeper, wider and faster, comes first; merging and
pruning serve it. Reproducibility is welcome, not a gate: grow runs are labelled
non-replayable, while content ids and canonical JSON stay because they are cheap.
Models stay **local** — hosted-only models are out. Every generation and other slow
step shows progress, and every implemented function is reachable from the UI.

**Conflict resolution:** when the intuitions and the code disagree, the
disagreement is data — flag it in both, don't silently absorb either
side. See `CONCEPT.md` §"What each layer commits to".

## Run

- App: open `story_builder.html` directly in a browser (no bundler; loads
  D3 from CDN, reads `seeds.js` via `window.*`).
- Tests: `npm test` — syntax-checks the source files via `node --check`,
  then runs `node --test tests/*.test.js`. Model-free: nothing in the
  suite talks to a server.
- Everything: `./run.sh` (= `./tools/lab.sh` = `npm run lab`) starts the model server
  and the bridge, waits for them, opens the page; Ctrl-C stops both. Logs in
  `/tmp/retrocause-lab/`. `./run.sh --no-model` skips the model (recorded runs only).
  If 8080 is taken: `LLAMA_PORT=8090 ./run.sh`. By hand it is two terminals:
  `./tools/serve_model.sh` and `npm run grow:serve`. `LLAMA_URL` is read by
  `llm_client.js` everywhere.
- The weights and llama.cpp builds live outside this repo, in the sibling
  `llmfinetune` workspace.
- **Lab panel** (right side of the page), from the selected node: **Grow** (depth, width,
  beam, max nodes, temperature, merge, prune; nodes land live, with a progress bar,
  what each slot is writing, Stop, Undo), **Propose only** (one expansion listed, add
  the ones you want), **Recorded runs**, and **Prompts** (every prompt and completion,
  a no-model preview, the templates). The toolbar's **Layered** view turns on by itself
  when a grow starts. Without the bridge the panel says so and the rest of the page is
  unaffected.
- CLI, same code path: `npm run grow -- --story red --from red_woods --depth 6 --beam 12`.

## Module map

| File | Role |
|------|------|
| `story_builder.html` / `.css` / `story_builder_app.js` | D3 UI shell |
| `ids.js` | Content-addressed ids (`nodeId`, `edgeId`) + `canonicalJson`; owns `normalizedContent`, the one content key. Requires nothing — it is the leaf everything else imports |
| `story_builder_engine.js` | Graph ops: add/remove nodes & edges, cycle checks, branch composition |
| `merge_predicate.js` | `sameInContext`: same content + parallel paths ⇒ same state (merge), used by manual inserts. `mergeProposals`: the lookalikes worth asking the model's judge about |
| `growth.js` | Merge-on-insert for manual branches (`insertContinuation`), and the grower's two moves once it has decided: `attach` a new node, `rejoin` to an existing one. Refuses **null transitions** — a continuation matching its source in both `expr` and `state` advances nothing |
| `seeds.js` | Seed story DAGs (nodes + edges). One node = one event; `state` is world state (the model reads it), written as positive facts because models imitate it; `reading` is the authored gloss (no prompt includes it). Each story carries an `entities` character list, shown to the model |
| `llm_client.js` | llama-server transport over `/v1/chat/completions`: streamed `chat`, `yesProbability` from first-token logprobs. Thinking off, prompt cache on. **Node-only** — never loaded by the page |
| `grower.js` | The traversal: a concurrent work queue over the server's slots, one model call per expansion writing `width` alternatives, `parseAlternatives` for its `event \| state \| end` lines, merge and prune decisions, events for the Lab. Node-only |
| `judges.js` | The model's checks. `createJudge`: same point in the story? Both routes from where they part, P(yes) ≥ `SAME_THRESHOLD`. `createCritic`: marks alternatives contradictory, static or off-story. Node-only |
| `prompts/branch.chat.txt` | Expansion system prompt (`{{width}}`) |
| `prompts/same.chat.txt` | Judge system prompt, with two worked examples |
| `prompts/critic.chat.txt` | Critic system prompt |
| `tools/grow.js` | `runGrow`: one recorded run to `runs/<runId>/` (graph, manifest, trace), shared by the bridge and the CLI |
| `tools/grow_server.js` | `npm run grow:serve` — loopback bridge (:8081) behind the Lab panel. `/grow` and `/propose` stream NDJSON; closing the request stops the run. Also `/health`, `/prompt`, `/prompts`, `/runs`, `/runs/:id` |
| `tools/serve_model.sh` | Starts `llama-server` with the grower's flags (16 slots, shared context) |
| `tools/lab.sh`, `run.sh` | One command for the model server, the bridge and the page |
| `experiments/NOTES.md` | Running log: every config that produced a number |
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
  cheap and stable (same content → same id helps merging and diffing).
- **Nodes.** A node has an `id`, `label`, a free-form `expr`, a prose
  `state` note, `kind` (`root` / `story` / `branch` / `note`), `tags`, and
  optional branch metadata (`delta`, `invariants`). "Bottleneck" is **not**
  a kind — it is derived from topology each render (in-degree > 2 and the
  flow re-widens at or below the node). A grown node's `expr` is a slug of its
  label; a grown ending carries the tag `ending` and is not expanded.
- **`effects` is the canonical fact layer.** Seed nodes carry
  `owner.property=value` assignments naming what the event changed. Folded
  last-write-wins along a path they give a node's world state — a *set* of
  changes would be a log, not a state. Hand-authored on seeds by design:
  they are the ground truth grown graphs are scored against, so the model
  under test must not write them. Distinct from `delta`, which is
  counterfactual-relative ("differs from the told story").
- **`state` is world state, `reading` is commentary.** `state` says what
  is true in the story after the event, in the story's own terms — it is
  what the grower shows the model, so a gloss there teaches the model to
  produce gloss. The interpretive layer lives in the optional `reading` field, which has no
  default and is never rendered into a prompt.
- **One node, one event.** If a node's `label` and `expr` disagree, it is
  usually bundling several events and wants splitting — that mismatch is
  exactly how the v1 seeds' overloading was found.

## Gotchas

- `seeds.js` carries three stories (Red, The Boy Who Cried Wolf, The Trojan
  Horse), chosen to share schemas — and, for criedWolf, the `wolf` entity —
  so their possibility spaces overlap. Branches are not shipped in seeds;
  they are created in the UI by the user.
