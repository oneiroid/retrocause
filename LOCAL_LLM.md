# Local LLM: Reproducible DAG Growth

**Status:** design. No code in this document is implemented.
**Scope:** a Node-side module that grows the story DAG automatically by
calling a small local model through `llama.cpp`, in a way that replays.
**Out of scope:** fine-tuning (Phase 3, §9), prose generation, any model
call from inside `story_builder.html`.

---

## 1. The problem this solves

Retrocause can branch a DAG, but only by hand, one form submission at a
time. That is not a tooling annoyance — it is what blocks the project's
own stated goals. `INTUITIONS.md` §6 (archetypes as parametrized
templates) and open question 8 (template extraction) are both tagged
`open` for the same reason:

> Can recurring subgraph templates be found in a corpus automatically?
> Until they can, claim §6 stays `open`.

A corpus. The repo ships one eight-node story. You cannot find recurring
shapes in a single hand-built path, and you cannot hand-build enough
paths to change that.

### 1.1 This was tried once, and the failure is the design input

Commit `79e0fe4` ("Cleanse") deleted a working automatic brancher —
`autoBranchFromSelected()`, a bounded BFS with depth/width/cap controls,
a stop flag, incremental rendering, and a post-pass that merged
convergent nodes. It is recoverable at
`git show 79e0fe4^:story_builder_app.js` (lines 826–912).

It did not fail because automation was wrong. It failed because every
candidate transition came from a **hand-authored symbolic action theory
per story** — `phi.js` plus a fixture per seed, with typed entries,
preconditions and effects. The guard clause tells the whole story:

```js
if (!phiBindings[state.activeSeed])
  return toast("Auto branching needs a typed seed; Magi or Red are supported.", true);
```

Two stories ever got a fixture. The apparatus cost more per story than
the story was worth, and the cleanse deleted ~90k lines of it while
naming the intended successor explicitly:

> manual branch form kept as the honest interim brancher
> **(future: a real DAG-growing continuation generator)**

A language model is that successor for one specific reason: **it is a
general transition proposer.** It needs no fixture, no action schema, no
per-seed authoring. Point it at any state node in any story and it can
propose what else could have followed. The fixture bottleneck — the
thing that actually killed the last attempt — disappears.

---

## 2. What the project gains, and what it does not

Three arguments, each with the caveat that limits it. The caveats are
part of the argument; this document is not a sales pitch.

### 2.1 Corpus scale becomes reachable

`open` question 8 needs many DAGs, not one. With growth automated, a
seed plus a traversal budget produces a graph in seconds, and a sweep
over seeds and parameters produces hundreds. That is the precondition
for template extraction, and therefore for §6 ever moving off `open`.

**Caveat.** Volume is necessary, not sufficient. Nothing here extracts
templates. This module produces the corpus that a later extractor would
consume; it does not bring §6 to `partial` on its own.

### 2.2 It partially attacks the sand-castle problem

`INTUITIONS.md` §8 states the methodological constraint that most
threatens the project:

> Hand-crafted graphs embed the analyst's assumptions. Finding structure
> in a graph designed to have that structure proves nothing.

A model proposing branches is not this analyst. The graph's shape stops
being a direct readout of one author's intentions.

**Caveat, and it is a serious one.** A language model trained on human
text carries human narrative priors — arguably a *compressed average* of
exactly the assumptions §8 warns about. This **launders** the sand-castle
problem rather than eliminating it. Finding Campbell's monomyth in DAGs
grown by a model trained on a corpus full of Campbell criticism proves
nothing at all.

What it genuinely buys: the assumptions are no longer *this* analyst's,
they are legible (weights are pinned, prompts are versioned, runs
replay), and they are cheap enough to vary deliberately. A defensible
future test would compare shapes grown under deliberately different
prompt regimes, or point the same instrument at non-narrative DAGs from
external sources — §8's actual requirement. This module is a step toward
that test, not the test.

### 2.3 It is a first non-human agency function

`INTUITIONS.md` §7 (`partial`) defines a mind as a thread with a
position, a resolution, and an agency function, and notes:

> The app exercises a fragment: the user *is* the agency function,
> choosing which node to branch and which path to follow. Resolution and
> an explicit agency model are not implemented.

A grower is a second agency function, and an inspectable one. Its
resolution is literally a parameter — `depth` is how far it expands,
`width` is how many alternatives it holds at a branch point. §7's
"narrowness is constitutive" becomes a knob you can turn and observe.

**Caveat, and this is why the rest of this document exists.** An agency
function you cannot replay is not an instrument, it is a slot machine.
A stochastic brancher would produce a different graph every run, and no
claim about "the shapes the grower finds" would survive re-running it.
Reproducibility is not a nice-to-have here; it is the difference between
§7 being exercised and §7 being decorated.

### 2.4 Why local, and why small

**Local over hosted**, in order of weight:

1. **You can pin weights by SHA-256. You cannot pin a hosted model.**
   A hosted endpoint is silently re-versioned; a manifest that names it
   is a manifest that lies. This alone decides it.
2. Corpus-scale runs are free. Growing hundreds of graphs, then
   re-growing them to verify replay, is a rounding error locally and a
   bill remotely.
3. No API key in a repository with zero dependencies and no backend.

**Small over large.** The task is not prose. It is **structured local
transition proposal**: given one node plus its immediate neighborhood,
emit one to three typed alternatives as JSON. Under grammar-constrained
decoding (§5.3), format compliance is enforced by the sampler rather
than requested from the model, which removes the main reason to want a
large model. Qwen3 1.7B in GGUF is the reference target. Small also
means a depth-4 traversal completes fast enough to run the *same
configuration many times*, which is what stability testing actually
requires.

---

## 3. Reproducibility is lost in the graph layer before it is lost in the model

The instinct is to start with sampler settings. That is the wrong end.
**Retrocause today cannot produce two identical graphs from two identical
runs, and no model configuration would change that.** Three sites:

| Site | What it does |
|---|---|
| `story_builder_engine.js:60` | `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}` |
| `story_builder_app.js:1000` (`uniqueId`) | `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}` |
| `story_builder_engine.js:127`, `story_builder_app.js:871` | `meta.savedAt = new Date().toISOString()` on every export |

Wall-clock and `Math.random()` in every generated id; a timestamp in
every export. Two runs of a perfectly deterministic grower produce JSON
that differs on every single node id. Fix this first or nothing
downstream is measurable.

### 3.1 Content-addressed ids

Derive the id from what the node *is*, not from when it was made:

```
nodeId  = "n_" + shortHash(parentId + "|" + normalizedExpr + "|" + label)
edgeId  = "e_" + from + "_" + to + "_" + type          // extend seeds.js
```

`shortHash` is FNV-1a or a truncated SHA-256 via `node:crypto`, written
in plain JS so the module stays dependency-free and dual-mode. On
collision, append `_2`, `_3` — deterministic, unlike the existing
`do…while` random retry.

Two rules the formula leaves implicit, stated here because both are
load-bearing:

- **`normalizedExpr` must be defined, once.** It feeds the id hash, the
  dedup key (§5.5.4), and two eval metrics (§6). Definition: trim,
  collapse internal whitespace runs to one space, lowercase. Nothing
  smarter — anything semantic belongs to a future equivalence layer, not
  to an id.
- **Multi-parent nodes hash one parent.** `parentId` is the parent the
  node was *created under*. A later `rejoins` edge adds a second parent
  without rehashing — ids are birth certificates, not live summaries of
  topology.

The `edge()` factory in `seeds.js` already uses `e_${from}_${to}_${type}`
— the only content-derived id scheme in the codebase. Extend that idea
rather than inventing a second one. Note its known weakness: it collides
on parallel same-type edges between the same pair, so the grower must
disambiguate (append an index, deterministically ordered).

### 3.2 Canonical serialization

A separate concern from ids, and equally required. Define
`canonicalJson(graph)`:

- nodes and edges sorted by id
- object keys emitted in a fixed declared order
- `meta.savedAt` **omitted entirely** (it moves into the run manifest,
  §5.4, where a timestamp is provenance rather than content)

Reproducibility then has a definition you can assert in a test:
`canonicalJson(runA) === canonicalJson(runB)`, byte for byte. Without
this, "reproducible" is a feeling.

---

## 4. The four layers

Ordered by how much they actually matter. The model is last.

```
Layer 0   graph mutation      content-addressed ids, canonical export   §3
Layer 1   traversal           pinned orderings, no set iteration        §5.5
Layer 2   structure           GBNF / json_schema constrained decoding   §5.3
Layer 3   decoding            sampler + server flags                    §4.1
Layer 4   provenance          run manifest, replay check                §5.4
```

### 4.1 Decoding: the `llama.cpp` knobs that matter

Ranked by observed impact, not by how obvious they are.

**`cache_prompt: false` — the one people miss.** It defaults to `true`,
and the llama.cpp server README carries the warning itself:

> Because (depending on the backend) the logits are **not** guaranteed to
> be bit-for-bit identical for different batch sizes (prompt processing
> vs. token generation) enabling this option can cause nondeterministic
> results.

A grower makes many requests sharing a long common prefix — precisely
the shape that triggers KV-cache reuse, and so precisely the shape where
this default silently destroys replay.

**`--parallel 1`.** Multi-slot serving is nondeterministic even at
temperature 0. [Issue #7052](https://github.com/ggml-org/llama.cpp/issues/7052)
reports eight slots given the same prompt returning five to eight
distinct completions. A grower has no use for slots; take the single one.

**`--no-cont-batching`.** Continuous batching mixes batch sizes, which
is the same numerical hazard as above by another route.

**Sampler pinning.** `temperature: 0` (equivalently `top_k: 1`), an
explicit integer `seed` rather than the `-1` default, an explicit
`samplers` order, `repeat_penalty` and the `dry_*` family set
explicitly rather than left at defaults that vary across builds,
`n_predict` capped.

**`--n-gpu-layers 0` for the reference profile.** GPU kernels reorder
floating-point reductions; CPU generation with a fixed thread count is
the more stable substrate. Two profiles, named and distinguished in the
manifest:

| Profile | Settings | Use |
|---|---|---|
| `reference` | CPU only, `--parallel 1`, `--no-cont-batching`, `cache_prompt:false`, fixed `--threads`, fixed `--ctx-size` | Anything whose output is claimed to replay |
| `explore` | GPU permitted, caching on | Interactive poking. **Never** cited as reproducible. |

**Fixed `--ctx-size`, never sliding.** If the context window fills and
the server truncates, the prompt the model saw is not the prompt you
recorded. The grower must budget its neighborhood serialization to fit,
and fail loudly rather than silently truncate.

### 4.2 The honest limit

`llama.cpp` offers **no bit-exactness guarantee** across builds,
hardware, thread counts, or backends. Everything in §4.1 raises the
probability of identical output; none of it is a proof. Recent work on
[inference-backend reproducibility](https://arxiv.org/pdf/2605.19537)
treats the backend itself as an unlogged hyperparameter, which is the
right framing.

Therefore this design does not *assume* reproducibility. It **verifies**
it: every run emits a manifest (§5.4), and `npm run grow:replay` re-runs
from that manifest and diffs canonical JSON. A run that does not replay
is a reported failure, not a silent one. That is a weaker claim than
"deterministic" and it is the true one.

**The replay check runs cache-cold.** With the response cache (§5.7)
enabled, every request is served from disk and the "replay" is vacuous —
it exercises Layers 0–2 and never touches the model. `grow:replay`
therefore bypasses the cache by default; a `--cached` flag exists
precisely because the vacuous mode is useful for debugging traversal,
but a cached replay is never reported as a model-replay success.

---

## 5. Architecture

### 5.1 Two surfaces

```
  llama-server (localhost)
        ▲
        │  HTTP, Node only
        │
  tools/grow.js  ──►  growth.js  ──►  StoryDagEngine
        │                                    │
        │                            grown_graph.json
        │                            + growth_manifest.json
        ▼                                    │
   npm run grow                              ▼
                                  story_builder.html  (import)
```

The page never calls a model. It receives a file. The existing import
path already accepts it — see §5.6. This keeps `story_builder.html`
openable from `file://` with no server, no CORS, no key, exactly as
today, while the project as a whole gains a generator. `CONCEPT.md` is
amended to describe this split rather than to deny that a generator
exists.

### 5.2 Modules

| File | Role |
|---|---|
| `ids.js` | `shortHash`, `nodeId`, `edgeId`, `canonicalJson` (§3) |
| `llm_client.js` | llama-server transport; `/completion`, `/props`; owns the determinism profile and the response cache |
| `growth.js` | The deterministic traversal; consumes the engine; returns `{ graph, manifest }` |
| `tools/grow.js` | CLI entry point |
| `prompts/branch.v1.txt` | Versioned prompt template |
| `tests/*.test.js` | Fixture replay, no network |

All follow the repo's dual-mode IIFE convention:

```js
(function attachGrowth(root) {
  /* … */
  const api = { grow, growOnce };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseGrowth = api;
})(typeof window !== "undefined" ? window : globalThis);
```

**`llm_client.js` takes an injectable transport.** Its constructor
accepts `{ fetch }`, defaulting to global `fetch`. Nothing in the
current test setup can stub a bare global, and the entire test strategy
(§7) depends on being able to.

### 5.3 Structure: constrained decoding

The branch payload is enforced by grammar, not requested by prose. Post
a `json_schema` on `/completion` matching the contract the app already
implements (`story_builder_app.js:778-801`):

```json
{ "type": "object",
  "required": ["branches"],
  "properties": {
    "branches": { "type": "array", "minItems": 1, "maxItems": 3,
      "items": { "type": "object",
        "required": ["label", "expr", "state", "delta", "invariants"],
        "properties": {
          "label":      { "type": "string" },
          "expr":       { "type": "string" },
          "state":      { "type": "string" },
          "delta":      { "type": "string" },
          "invariants": { "type": "string" },
          "tags":       { "type": "array", "items": { "type": "string" } },
          "rejoinTargetId": { "type": "string" }
        } } } } }
```

This is a larger reproducibility win than seeding, because it converts
"did the output parse" from a probabilistic question into a structural
guarantee. Malformed JSON stops being a failure mode.

Three documented gotchas, all load-bearing:

- **Grammar does not survive truncation.** The grammar constrains which
  token comes next; `n_predict` still cuts generation off mid-structure,
  and a length-stopped completion is invalid JSON with the grammar
  working perfectly. The client must check the response's stop reason
  and treat `length` as a hard failure, counted in the manifest — not
  retried with a bigger cap mid-run, which would make the run
  irreproducible.

- **The schema is not injected into the prompt.** llama.cpp uses it only
  to constrain sampling. The prompt template must *also* describe the
  shape, or the model fills a valid structure with confused content.
- **Grammar enforcement has been reported broken when thinking is
  enabled** ([issue #20345](https://github.com/ggml-org/llama.cpp/issues/20345)).
  For Qwen3, disable it — `/no_think`, or `enable_thinking: false`.
  Thinking tokens are also a determinism liability in their own right:
  more sampled tokens, more chances to diverge.

`rejoinTargetId` cannot be constrained to existing node ids by JSON
Schema. It is validated after the fact (§5.5) and dropped when invalid —
a hand-written GBNF enumerating the legal ids is possible but couples
the grammar to the graph, and is not worth it.

### 5.4 Provenance: the run manifest

Every run emits `growth_manifest.json` alongside the graph:

```json
{
  "runId": "<hash of the configuration fields only — see below>",
  "createdAt": "2026-08-01T00:00:00Z",
  "profile": "reference",
  "model":  { "file": "Qwen3-1.7B-Q8_0.gguf", "sha256": "…" },
  "server": { "build_info": "…", "system_fingerprint": "…" },
  "sampling": { "temperature": 0, "seed": 7, "top_k": 1,
                "cache_prompt": false, "n_predict": 512, "samplers": [] },
  "prompt": { "template": "branch.v1", "sha256": "…" },
  "traversal": { "from": "red_start", "depth": 3, "width": 2, "maxNodes": 24 },
  "input": { "seed": "red", "graphSha256": "…" },
  "result": { "created": 19, "rejectedCycles": 1, "mergedDuplicates": 3 }
}
```

`runId` hashes `profile`, `model`, `server`, `sampling`, `prompt`,
`traversal`, and `input` — **not** `createdAt` and not `result`. A
timestamp in the hash would give two byte-identical runs different
runIds, contradicting this document's own definition of replay; `result`
is an outcome, and an outcome inside the id of the configuration that
produced it is circular.

`build_info` and `system_fingerprint` come from llama-server's `/props`
endpoint, which exists for exactly this purpose. Record them; §4.2 is
why.

Node-level provenance reuses the existing `createdBy` field, already
typed `seed | human | human-edited | assist` in
`RESEARCH_AND_DESIGN.md:47`. Add `"grown"`, plus a `runId` on each grown
node so a graph carrying nodes from several runs stays legible.

### 5.5 Traversal: pinning every ordering

The BFS shape is recovered from the deleted `autoBranchFromSelected`.
What changes is that **every ordering decision is pinned**, because an
unordered iteration is as fatal to replay as a random seed.

1. **Queue order.** Sort expansion points by `topoRanks(graph)` then by
   id lexicographically. Never rely on `Set` or `Map` iteration order to
   carry meaning.
2. **Prompt serialization.** Build the request object with keys in a
   fixed declared order and serialize with a canonical stringifier —
   `JSON.stringify` preserves insertion order, so the object must be
   *constructed* deterministically. The prompt is a cache key (§5.7); a
   reordered prompt is a cache miss and a different run.
3. **Candidate ordering.** Sort returned branches by a deterministic key
   (`normalizedExpr`, then `label`) before applying the `width` cap.
   Never trust the model's output order to be stable.
4. **Deduplication.** Two candidates collapse when their content hashes
   match. This is the honest replacement for the deleted approach, and
   it is **weaker**: the old grower compared computed post-states via
   `state_walker.js` and merged genuinely convergent timelines. Without a
   fixture there are no post-states, so equivalence is defined on
   normalized `expr` — surface identity, not semantic identity. Two
   nodes that mean the same thing in different words will not merge.
   Stated plainly so no one mistakes this for parity with the old
   `mergeEquivalentStates`.
5. **Acyclicity.** Every insertion goes through `StoryDagEngine.addEdge`,
   which already refuses cycle-creating edges
   (`story_builder_engine.js:47`). Rejections are counted in the
   manifest, never silently swallowed.
6. **`rejoinTargetId` validation.** Drop the rejoin when the id does not
   exist, or when the edge would cycle. The branch node is still
   created — an open branch is a legitimate outcome that
   `validateGraph` already warns about rather than rejects.

### 5.6 Output lands on an existing contract

`importFromTextArea()` (`story_builder_app.js:817-850`) already detects
`data.branches` and routes each entry through `fillBranchForm()` →
`addBranchFromForm()`, tagging the result `createdBy = "assist"`. The
grower's per-node payload targets this same shape, and a whole grown
graph imports through `importGraph()`.

**No UI change is required to consume grown output.** That is a
deliberate constraint on this design, not a coincidence.

One asterisk on "existing contract": the branches path assigns ids via
`uniqueId()` (`story_builder_app.js:623`) — one of the three
nondeterminism sites §3 exists to remove. Until Phase 0 replaces the
app's `uniqueId` with the content-addressed scheme, a grown payload
imported through the form path gets fresh random ids and the round trip
is not reproducible. Whole-graph import (`importGraph()`) preserves ids
and is safe either way. This is why Phase 0's scope includes the app's
id sites, not just the engine's.

### 5.7 The response cache is the practical mechanism

An on-disk cache keyed by `hash(prompt + sampling params + model
fingerprint)`:

```
cache/<hash>.json   →   { request, response, recordedAt }
```

Three payoffs, the third being the real one:

1. Re-running a configuration is instant.
2. Re-runs are trivially identical, which decouples "does my traversal
   replay" from "does the model replay" — you can debug Layers 0–2
   without Layer 3 in the way.
3. **The test suite runs the entire grower against recorded fixtures,
   with no llama.cpp installed, no network, and no new dependencies.**
   A handful of checked-in cache entries make the growth loop as
   testable as `topoRanks`. Given that this repo's whole test story is
   `node --test` over dependency-free modules, this is what keeps the
   new module inside the house style instead of outside it.

`cache/` is gitignored except a small `tests/fixtures/` set.

---

## 6. Prompt and grammar tuning

The tuning surface in scope is prompts, grammars, and sampling — not
weights.

**Versioned templates.** `prompts/branch.v1.txt`, with the version and
its hash in the manifest. A prompt edit is a new version, never an
in-place change, because in-place edits make old manifests lie.

**Eval harness** (`tools/eval.js`, a script, not a `node --test` case):
sweep N seeds × M configurations and score each run on

| Metric | Why |
|---|---|
| JSON validity | Should be 100% under §5.3. Anything less means the grammar is not applied or `n_predict` is truncating (check the stop reason) — a bug or a budget error, not a quality signal. |
| Acyclicity acceptance rate | How often proposals are structurally usable |
| Duplicate-`expr` rate | Prompt collapse into one idea |
| `rejoinTargetId` validity | Whether the model can actually reference real nodes |
| Branch diversity | Distinct normalized `expr` per expansion point |
| Replay rate | Fraction of runs whose canonical JSON matches on re-run |

Replay rate is the metric the rest of this document exists to make
meaningful. Scoring is deterministic and its output is a table.

---

## 7. Testing

- `tests/ids.test.js` — hash stability, collision suffixing, canonical
  JSON key ordering, `savedAt` absence.
- `tests/llm_client.test.js` — stubbed transport; asserts the request
  body carries `cache_prompt: false`, `temperature: 0`, an explicit
  `seed`, and the `json_schema`; asserts cache hit/miss keying.
- `tests/growth.test.js` — full grower against checked-in fixtures:
  same input twice yields byte-identical canonical JSON; cycle-creating
  proposals are rejected and counted; invalid `rejoinTargetId` is
  dropped without losing the node; the `width` cap is respected.

No test touches the network. `package.json:6` hardcodes both the
`node --check` list and a single test path — it needs a `--check` entry
per new module and a glob (`node --test tests/`) for the test paths.

---

## 8. Known risks

**The app does not use the engine.** `story_builder.html` loads
`story_builder_engine.js`, but `story_builder_app.js` is a closed IIFE
that privately re-implements `normalizeGraph` (`:149`), `addEdge`
(`:685`), `validateGraph` (`:716`), `topoRanks` (`:743`), and `reachable`
(`:957`). `StoryDagEngine` is never referenced. **The two
`normalizeGraph`s differ** — the engine defaults edge `label` to
`edge.type || "edge"`, the app defaults it to `""` — and the engine
clones while the app mutates in place.

A Node grower validating against the engine can therefore emit a graph
the page normalizes differently on import. Either unify the two as a
prerequisite (preferred; the app's copies are the accidental fork), or
have the grower assert its output through both code paths. This is the
largest correctness risk in the design and it predates it.

**`validateGraph` is O(E²·V).** For each edge it removes that edge and
runs a full reachability search (`story_builder_engine.js:92-95`).
Fine for eight nodes, not fine for the graphs this module exists to
produce. Validate once at the end of a run rather than per insertion,
and expect to replace the cycle check with a single topological sort
before corpus-scale sweeps.

**Small-model quality is unmeasured here.** Grammar guarantees the
shape, not the sense. Whether Qwen3 1.7B proposes causally interesting
alternatives or bland restatements is an empirical question the eval
harness (§6) is built to answer, and the answer may be "use 4B". The
architecture is model-size agnostic; only the manifest changes.

**Growth is not understanding.** A grown DAG is a hypothesis about what
could have followed, generated by a system with no model of the story
world — the thing the deleted `phi.js` did have. This design trades
semantic grounding for generality, deliberately. §5.5's weakened
convergence detection is where that trade is visible, and it is the
first place to revisit if grown graphs turn out to be shallow.

---

## 9. Phasing

| Phase | Contents |
|---|---|
| **0** | §3 only — content-addressed ids, canonical export, tests. No model. Independently valuable; unblocks everything else. |
| **1** | `llm_client.js` + `growth.js` + `tools/grow.js`, reference profile, fixture-replay tests. |
| **2** | Eval harness, prompt versions, corpus sweep. |
| **3** | *Deferred.* LoRA via `llama-finetune`, GGUF adapters, `--lora` hot-swap on the server, trained on accepted branches. Determinism gets harder — the adapter joins the manifest as a hashed artifact. Not designed here. |

Phase 0 is worth doing whether or not any model is ever wired up.

---

## 10. What this does not change

The page stays a direct-manipulation editor: open `story_builder.html`
from disk, no server, no key, no model call. `CONCEPT.md`'s commitment
to manipulability is unchanged and its claim about the *page* is
unchanged. What is amended is the claim about the *project* — Retrocause
now has a generator, and it lives beside the app rather than inside it.

It still does not write stories. It proposes structure.

---

## Sources

- [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
  — `cache_prompt` nondeterminism warning, `--parallel`,
  `--cont-batching`, `seed`, `json_schema`, `/props`
- [Issue #7052 — nondeterministic output with multiple slots](https://github.com/ggml-org/llama.cpp/issues/7052)
- [GBNF grammars README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)
- [Issue #20345 — grammar not enforced when thinking is enabled](https://github.com/ggml-org/llama.cpp/issues/20345)
- [Qwen3-1.7B-GGUF](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF)
- [The Silent Hyperparameter: inference backends and LLM reproducibility](https://arxiv.org/pdf/2605.19537)
