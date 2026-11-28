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
   work: every config that produced a number, from 2026-11-02 on. The base-model
   era (code since deleted, in git at `5188d1f`) is in
   `experiments/ARCHIVE_base_models.md`.

**Priorities (human decision, 2026-09-24, restated 2026-11-01):** automatic
branching from a selected node, deeper, wider and faster, comes first; merging and
pruning serve it. Reproducibility is welcome, not a gate: grow runs are labelled
non-replayable, while content ids and canonical JSON stay because they are cheap.
Models stay **local** — hosted-only models are out. Every generation and other slow
step shows progress, and every implemented function is reachable from the UI.

**What a merge means (2026-11-28).** Two nodes are the same state when their
folded worlds (`effects`) are equal, or, a fact or two apart, when a judge says the
same things can happen next. How each was reached does not count: two routes into
one world is the convergence the project exists to find (INTUITIONS §5). The older
route judge refused exactly that and is kept only as merge mode `routes`.

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
  beam, max nodes, temperature, merge mode (same world / same futures / same route / off), prune; nodes land live, with a progress bar,
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
| `facts.js` | The fact layer: `parseEffects` (normalized `owner.property=value`), `fold`, `worldKey`, `worldDiff`, `renderWorld`, `worldsOf` (every node's folded world). Dual-mode; the page shows the selected node's world with it |
| `ids.js` | Content-addressed ids (`nodeId`, `edgeId`) + `canonicalJson`; owns `normalizedContent`, the one content key. Requires nothing — it is the leaf everything else imports |
| `story_builder_engine.js` | Graph ops: add/remove nodes & edges, cycle checks, branch composition |
| `merge_predicate.js` | `sameInContext`: same content + parallel paths ⇒ same state (merge), used by manual inserts. `mergeProposals`: the lookalikes worth asking the model's judge about |
| `growth.js` | Merge-on-insert for manual branches (`insertContinuation`), and the grower's two moves once it has decided: `attach` a new node, `rejoin` to an existing one. Refuses **null transitions** — a continuation matching its source in both `expr` and `state` advances nothing |
| `seeds.js` | Seed story DAGs (nodes + edges). One node = one event; `state` is world state (the model reads it), written as positive facts because models imitate it; `reading` is the authored gloss (no prompt includes it). Each story carries an `entities` character list, shown to the model |
| `llm_client.js` | llama-server transport over `/v1/chat/completions`: streamed `chat`, `yesProbability` from first-token logprobs. Thinking off, prompt cache on. **Node-only** — never loaded by the page |
| `grower.js` | The traversal: a concurrent work queue over the server's slots, one model call per expansion writing `width` alternatives, `parseAlternatives` for its `event \| changes \| end` lines, merge (`facts` / `futures` / `routes` / `off`) and prune decisions, events for the Lab. Node-only |
| `judges.js` | The model's checks. `createFutureJudge`: can the same things happen next? Shared facts plus each side's own, no routes (merge mode `facts`). `createGrownFuturesJudge`: both nodes expanded, could each one's next events follow the other (mode `futures`). `createJudge`: same point in the story? Both routes from where they part (mode `routes`). Both P(yes) ≥ `SAME_THRESHOLD`. `createCritic`: marks alternatives contradictory, static or off-story. Node-only |
| `prompts/branch.chat.txt` | Expansion system prompt (`{{width}}`) |
| `prompts/future.chat.txt` | Future judge system prompt (mode `facts`), with worked examples |
| `prompts/futures.chat.txt` | Grown-futures judge (mode `futures`): could each one's found next events follow the other? |
| `prompts/same.chat.txt` | Route judge system prompt (mode `routes`), with two worked examples |
| `prompts/critic.chat.txt` | Critic system prompt |
| `tools/grow.js` | `runGrow`: one recorded run to `runs/<runId>/` (graph, manifest, trace), shared by the bridge and the CLI |
| `tools/grow_server.js` | `npm run grow:serve` — loopback bridge (:8081) behind the Lab panel. `/grow` and `/propose` stream NDJSON; closing the request stops the run. Also `/health`, `/prompt`, `/prompts`, `/runs`, `/runs/:id` |
| `tools/serve_model.sh` | Starts `llama-server` with the grower's flags (16 slots, shared context) |
| `tools/lab.sh`, `run.sh` | One command for the model server, the bridge and the page |
| `experiments/NOTES.md` | Running log: every config that produced a number. `ARCHIVE_base_models.md` holds the base-model era |
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
- **`effects` is the canonical fact layer.** A node's `effects` are
  `owner.property=value` assignments naming what its event changed. Folded
  last-write-wins along a path (`facts.js`) they give the node's world — a
  *set* of changes would be a log, not a state. On seeds they are
  hand-authored ground truth. On grown nodes the model writes them
  (`createdBy: "grown"`), because merging needs a world for every node; so a
  grown world measures the model's consistency, not the story's truth, and
  any score against the seeds must say which it compares. (Revised
  2026-11-28: the rule was "the model must not write them", which left the
  grower nothing comparable to merge on.) Distinct from `delta`, which is
  counterfactual-relative ("differs from the told story").
- **`state` is world state, `reading` is commentary.** `state` says what
  is true in the story after the event, in the story's own terms. The grower
  shows the model the folded `effects` when a path has them and the last
  `state` only when it has none; a grown node's `state` is its changes. The interpretive layer lives in the optional `reading` field, which has no
  default and is never rendered into a prompt.
- **One node, one event.** If a node's `label` and `expr` disagree, it is
  usually bundling several events and wants splitting — that mismatch is
  exactly how the v1 seeds' overloading was found.

## Gotchas

- `seeds.js` carries three stories (Red, The Boy Who Cried Wolf, The Trojan
  Horse), chosen to share schemas — and, for criedWolf, the `wolf` entity —
  so their possibility spaces overlap. Branches are not shipped in seeds;
  they are created in the UI by the user.
