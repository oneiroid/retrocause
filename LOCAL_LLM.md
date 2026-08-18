# Local LLM: Reproducible DAG Growth

**Status:** Phases 0, 0.5 (2026-08-04) and 1 (2026-08-16) implemented.
Phase 2's harness landed 2026-08-16 (`tools/eval.js`); its corpus-scale
sweep and prompt versions are still open. Phase 3 is design.
**Scope:** a Node-side module that grows the story DAG automatically by
calling a small local model through `llama.cpp`, in a way that replays.
**Out of scope:** fine-tuning (Phase 3, §9), prose generation, any model
call from inside `story_builder.html`.

This document was first written against `79e0fe4` and has been revised
against `main`, which since added `merge_predicate.js`, `growth.js`,
two seed stories and `experiments/gen_probe.js`. Where the revision
contradicts the original the change is marked in place rather than
silently absorbed — §5.5.4 is the substantive one.

---

## 0. Where the work stands, and how to resume it

Written for a session starting cold on branch `claude/local-llm-phase0`.
Verified 2026-08-16.

**Done.** Phase 0 (`2e78d78`): `ids.js`, all four id sites, canonical
export, `tests/ids.test.js`. Phase 0.5 (`4088db3`): the GGUF, the
reference profile, the prompting result in §8. Phase 1 (2026-08-16):
`llm_client.js`, `grower.js`, `tools/grow.js`, `prompts/branch.v1.txt`,
fixture-replay tests. `npm test` → 57 pass, model-free.

**Verified end-to-end on the reference profile, 2026-08-16:**
`npm run grow -- --story red --depth 2 --width 2 --max-nodes 8` grew 6
branches (run `run_76f1787d2145280f`), the graph round-trips through
`Engine.importGraph`, and `npm run grow:replay` cache-cold reported
**byte-identical canonical JSON**. One deliberate deviation from §5.3's
letter: the prompt ends after the `Alternatives:` cue with no open
brace, because `json_schema` grammar generates the complete JSON object
itself — an open brace in the prompt would double it.

**Phase 2 harness done, 2026-08-16.** `tools/eval.js` (`npm run eval`)
scores the §6 metric table — contradiction check included — over model
runs, recorded run directories (`score runs/<runId>`, model-free), and
the `gen_probe.js` baseline. The baseline is the probe's own candidate
source (now requirable behind a `require.main` guard) run through
`growGraph` itself as a client-shaped recombiner, so "same seeds,
budgets and merge semantics" holds by construction. First sweep
(3 stories × both sources, depth 2 / width 2 / max 8, `--replay`):
every row replayed byte-identically cache-cold, JSON validity 1.0
throughout, and `rankSpread` near-flat for both sources — expected at
smoke budgets per the pre-registered rule in §6, which only binds at
corpus scale. Early signal: the model's duplicate-`expr` rate hit 0.5
on criedWolf (prompt collapse); the baseline's stayed 0.

**`branch.v2` landed 2026-08-17** — the first prompt version beyond v1,
written against the measured failure in §8 ("context starvation"). v1
showed the model **one node**; v2 also carries the told story with node
ids and the pinned ancestor path (§5.5.7), and moves the few-shot to a
story outside `seeds.js` so contamination stays detectable. v1 is kept
and selectable — `npm run grow -- --prompt branch.v1`, and
`npm run eval -- sweep --prompt branch.v1,branch.v2` scores both at one
budget — because deleting a template makes its recorded manifests
unreplayable. `grow:replay` now takes the version from the manifest, not
from the current default.

**v1-vs-v2 measured the same day**, red, depth 4 / width 3 / max 24, on
the reference profile:

| | baseline | v1 | v2 |
|---|---|---|---|
| grown nodes | 24 | 18 | 15 |
| distinct `delta` / grown | — | 7/18 | **14/15** |
| most-repeated `delta` | — | 39% of nodes | **13%** |
| cross-story entities | — | present (`"the wolf attacks the mother and the boy"`) | **none** |
| merged duplicates | — | 8 | **13** |
| grown → seed edges | — | **0** | **2** (`red_grandma`, `red_rescue`) |
| `dupExprRate` | 0 | 0.278 | 0.267 |
| `contradictionRate` | 0 | 0.111 | **0.133** |
| `rejoinValidity` | — | none attempted | **0** (attempted, invalid id) |
| `maxRankSpread` | **4** | 2 | 2 |

What moved is what context predicts: contamination gone, `delta`
near-fully differentiated, and the model now emits the seed's own exprs
(`arrive(wolf, grandmother_house)`, `rescue(...)`) — which is what let
`sameInContext` collapse grown proposals **into seed nodes** and give
the story spine grown parents for the first time. Convergence back into
the told story needed no new machinery, only exprs that could collide.

What did not move is equally clear and belongs in the record:
`dupExprRate` is flat; `contradictionRate` got slightly worse (the §8
copy failure survives verbatim — `find(grandmother, red)` with
`delta` = `invariants` = "the grandmother is now the predator"); and
role sense is still absent — the model acquired the story's entities and
then slotted them into one template, proposing the woodcutter and the
grandmother as "now the predator". Entities are grounded; roles are not.
That is the case for §8's items 2 and 3, unchanged.

**`maxRankSpread`: baseline 4, both model rows 2.** The baseline leads
on the pre-registered falsification metric (§6). Two things are true and
neither cancels the other: this is still short of the corpus-scale
budget the rule binds at, and the baseline also grew 24 nodes to the
model's 15, so the comparison is not at equal node counts. But this is
the first run where the probe visibly leads, and the honest reading is
that the §6 decision rule is now live rather than hypothetical. Do not
let a later sweep reinterpret it.

**`seeds.js` v2 landed 2026-08-17** — the second of §8's three
follow-ons. One node = one event, `state` is world state, and the
authorial gloss moved to a new optional `reading` field that no prompt
renders. Red 8 → 14 nodes, criedWolf 7 → 11, Trojan 7 → 11; details and
the two gotchas in §8. **This invalidates every recorded run**: the
input graph hash changed, so pre-v2 manifests replay against a graph
that no longer exists. Re-baseline before comparing anything to the
numbers in the v1-vs-v2 table above.

**Not started.** The rest of Phase 2: the corpus-scale sweep that the
§6 decision rule actually binds on (needs the topological-sort cycle
check from §8 first — `validateGraph`'s O(E²·V) is the blocker), and
the last of §8's follow-ons — the closed vocabulary as a grammar enum,
which must go in alone and be scored against `maxRankSpread` because it
moves the grower toward the probe it is supposed to beat. First
qualitative read of the
Phase 1 run confirms §8's open finding: exprs are story-shaped
(`stay(red, path)`, `run(red, grandmother)`) but `delta`/`invariants`
are weakly consistent — `delta` often names something that did *not*
change. The eval's `contradictionRate` catches only the copy failure;
the delta-names-a-non-change failure still needs eyes (`--show`).

**The model is not in this repo.** It is an artifact in the sibling
`llmfinetune` workspace, and the server is not running between sessions:

```bash
./tools/serve_reference.sh          # verifies the GGUF hash, then serves §4.1
```

Smoke-check it — this is the whole stack Phase 1 builds on, and it
passed on 2026-08-16 (`{ "expr": "walk(red, redberry field)" }`, stopped
at `eos`, byte-identical across two requests):

```bash
curl -s http://127.0.0.1:8080/props | head -c 400
```

**Phase 1 was built in this order** (kept as the map of what exists —
each numbered item below is now a real module):

1. `llm_client.js` — one `complete(prompt, schema, sampling)` over
   `/completion`. Pins every sampler field in §5.4's `sampling` block,
   `cache_prompt: false` included. Reads `/props` once per run for the
   manifest. Node-only; never loaded by the page.
2. The versioned prompt — few-shot completion, because zero-shot
   instruction prompting *echoes* on this base model (§8). The examples
   are part of the prompt and therefore part of its hash.
3. `grower.js` — BFS per §5.5, lifting the traversal from
   `experiments/gen_probe.js` and swapping only the candidate source.
   Emits through `Engine.addBranch`/`addEdge` (§5.6) and lets
   `growth.js`'s merge-on-insert handle convergence; it does **no** dedup
   of its own (§5.5.4).
4. `tools/grow.js` + `npm run grow` / `grow:replay` — manifest out,
   replay diffs canonical JSON cache-cold (§4.2).
5. Fixture-replay tests (§7) with recorded responses, so `npm test`
   stays model-free.

**Four traps already paid for, worth not re-discovering.**

- `growth.js` is **taken** by merge-on-insert. The traversal module is
  `grower.js`.
- `ids.js` **requires nothing**, deliberately — importing the content key
  from `merge_predicate.js` closes a require cycle that, because every
  module here reassigns `module.exports`, hands `merge_predicate` an
  empty `Engine`.
- The engine/app fork in §8 is real and live in the browser; read it
  before touching `story_builder_app.js`.
- `validateGraph` is O(E²·V) (§8). Validate once per run, not per insert.

**The open finding Phase 2's eval must catch:** the model proposes
plausible transitions but does not keep one branch's fields consistent
with each other — it copies `delta` into `invariants`, and produced a
branch whose `state` said the child was eaten while `invariants` said the
child was alive. Nothing downstream reads `invariants` today. Add the
per-branch contradiction check (§6) before anything does.

---

## 1. The problem this solves

Retrocause can branch a DAG, but only by hand, one form submission at a
time. That is not a tooling annoyance — it is what blocks the project's
own stated goals. `INTUITIONS.md` §6 (archetypes as parametrized
templates) and open question 8 (template extraction) are both tagged
`open` for the same reason:

> Can recurring subgraph templates be found in a corpus automatically?
> Until they can, claim §6 stays `open`.

A corpus. The repo ships three seed stories (Red, The Boy Who Cried
Wolf, The Trojan Horse), deliberately chosen to share schemas so their
possibility spaces overlap. Three is enough to ask whether a generator
produces the same shape twice; it is not a corpus. You cannot
hand-build enough paths to change that.

### 1.1 This was tried twice, and both failures are the design input

#### Attempt 1 — the symbolic fixture (deleted)

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
thing that actually killed the first attempt — disappears.

#### Attempt 2 — the induced grammar (`experiments/gen_probe.js`, kept)

The successor was in fact built, without a model, and it is on `main`.
`gen_probe.js` grows the DAG by recombining the seeds' **own** lexicon
under constraints that are *induced from the seeds*, never authored:
argument continuity, a schema-bigram grammar read off seed edges, and
positional role typing (`experiments/roles.json`). Every insert goes
through the real merge-on-insert semantics.

Its three-pole result (2026-07-13) is the sharpest design input this
document has, and it is not a corpus-scale complaint:

| Constraints | Outcome |
|---|---|
| continuity only | statistical noise — Poisson in-degree, word-salad states |
| + bigram grammar | structure, still salad |
| + role typing | **readable** states, but in-degree layer-uniform: no gradient |

Read that last row carefully. Adding constraints bought *structure* and
then *readability*, and never bought **meaning** — the closure of an
induced grammar is too symmetric to have interesting shape. The probe
exhausted what can be induced from three stories' surface form.

This relocates the model's job. It is not primarily a volume machine.
**It is the only available source of the semantics the induced grammar
cannot reach** — which of the grammatically-legal continuations
actually follow from the state. §6's eval harness therefore has a
baseline it must beat, and `gen_probe.js` is that baseline: same seeds,
same budgets, same merge semantics, no model. A grower that scores like
the probe has bought nothing but latency.

---

## 2. What the project gains, and what it does not

Three arguments, each with the caveat that limits it. The caveats are
part of the argument; this document is not a sales pitch.

### 2.1 Corpus scale becomes reachable

`open` question 8 needs many DAGs, not one. With growth automated, a
seed plus a traversal budget produces a graph in seconds, and a sweep
over seeds and parameters produces hundreds. That is the precondition
for template extraction, and therefore for §6 ever moving off `open`.

**Caveat.** Volume is necessary, not sufficient — and `gen_probe.js`
(§1.1) already proves the sufficiency half is the hard one. It can
already emit graphs at volume; what it emits has layer-uniform
in-degree, i.e. no template to extract. Nothing here extracts
templates either. This module produces the corpus that a later
extractor would consume; it does not bring §6 to `partial` on its own,
and volume alone would not even be new.

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
large model. Small also means a depth-4 traversal completes fast enough
to run the *same configuration many times*, which is what stability
testing actually requires.

**The reference target is what is actually on this machine:**
`Qwen/Qwen3-1.7B-Base`, already downloaded in the sibling
`llmfinetune` workspace, exported to GGUF by its `export_gguf.py` and
served by its CPU-only `llama.cpp` build (`f5b9bd3`). Two consequences
the rest of this document must respect:

- **It is a *base* model, not an instruct model.** No chat template, no
  instruction tuning, no thinking mode. Prompting is few-shot
  completion (§5.3), and grammar is not merely convenient — it is doing
  *all* of the format work, because there is no instruction-following
  to fall back on.
- **The GGUF exists as of Phase 0.5** (2026-08-04):
  `llmfinetune/models/qwen3-1.7b-base-Q8_0.gguf`, 1.83 GB, sha256
  `8a0dbbf6…5b7cba`. It is an artifact on disk outside this repo, so
  Phase 1 verifies its hash rather than assuming its presence (§5.4).

---

## 3. Reproducibility is lost in the graph layer before it is lost in the model

The instinct is to start with sampler settings. That is the wrong end.
**Retrocause today cannot produce two identical graphs from two identical
runs, and no model configuration would change that.** Four sites:

| Site | What it does |
|---|---|
| `growth.js:28` (`newId`) | `grow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}` |
| `story_builder_engine.js:61` (`addBranch`) | `branch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}` |
| `story_builder_app.js:1043` (`uniqueId`) | `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}` |
| `story_builder_engine.js:128`, `story_builder_app.js:914` | `meta.savedAt = new Date().toISOString()` on every export |

Wall-clock and `Math.random()` in every generated id; a timestamp in
every export. Two runs of a perfectly deterministic grower produce JSON
that differs on every single node id. Fix this first or nothing
downstream is measurable.

`growth.js:28` heads the list on purpose: it is the id minted on *every
continuation the grower inserts*, so it is the one that fires most and
the one this design depends on most directly.

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

- **`normalizedExpr` must be defined once.** Trim, collapse internal
  whitespace runs to one space, lowercase — character-for-character what
  `MergePredicate.defaultContentKey` was already doing. The same string
  feeds the id hash and the merge decision, and two copies that drift
  apart would mean nodes that merge but hash differently.

  **Built with the dependency inverted from what this section first
  proposed.** The draft had `ids.js` import the key from
  `merge_predicate.js`; that closes a require cycle, because
  `merge_predicate` → `engine` and `engine` needs `ids` to mint branch
  ids. CommonJS resolves a cycle by handing the second module the
  first's *partial* `module.exports`, and every module here **reassigns**
  `module.exports = api` at the end rather than mutating it — so
  `merge_predicate` would have captured a permanently empty object and
  `Engine.reachable` would be `undefined` at call time. `ids.js` is
  therefore a **leaf that requires nothing**, it owns
  `normalizedContent`, and `merge_predicate.js` re-exports it as
  `defaultContentKey` (preserving the name `gen_probe.js` already uses).
  One definition either way; only the arrow changed.

  Nothing smarter belongs here — anything semantic is the `contentKey`
  parameter `sameInContext` already accepts, not an id.
- **Multi-parent nodes hash one parent.** `parentId` is the parent the
  node was *created under*. A later `rejoins` edge adds a second parent
  without rehashing — ids are birth certificates, not live summaries of
  topology.
- **A merged node keeps the survivor's id, so ids are order-dependent
  by design.** `collapseIfSame` deletes the victim and rewires to the
  survivor (`growth.js:38`), so which of two equal-content parallel
  states keeps its id depends on which was inserted first. This is
  deterministic — insertion order is pinned by §5.5 — but it does mean
  a node's id is not a pure function of its own content. It is a
  function of content *and* the traversal that found it, which is the
  honest description of what a birth certificate is.

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

**`--parallel 1`, and it must be stated explicitly.** Multi-slot serving
is nondeterministic even at temperature 0.
[Issue #7052](https://github.com/ggml-org/llama.cpp/issues/7052)
reports eight slots given the same prompt returning five to eight
distinct completions. A grower has no use for slots; take the single
one. On the build in `llmfinetune/vendor/llama.cpp` (`f5b9bd3`) the
flag's default is **`-1` (auto)**, not `1` — so the slot count is
chosen by the server from the machine it is on, which is precisely a
hidden hyperparameter. Never rely on the default.

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

Convenient here: the `llama.cpp` in `llmfinetune` is a **CPU-only
build** (no `nvcc` on this machine), so the reference profile is the
only profile available and `--n-gpu-layers` is moot. `explore` becomes
reachable only after a CUDA rebuild — at which point it must be
recorded as a distinct `server.build_info` in the manifest, because it
is a different backend, not a flag.

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
  tools/grow.js ──► grower.js ──► growth.js ──► StoryDagEngine
        │           (traversal)   (merge-on-      │
        │                          insert)        │
        │                                 grown_graph.json
        │                               + growth_manifest.json
        ▼                                         │
   npm run grow                                   ▼
                                  story_builder.html  (import)
```

The page never calls a model. It receives a file. The existing import
path already accepts it — see §5.6. This keeps `story_builder.html`
openable from `file://` with no server, no CORS, no key, exactly as
today, while the project as a whole gains a generator. `CONCEPT.md` is
amended to describe this split rather than to deny that a generator
exists.

**Amendment (2026-08-16): the page can now *trigger* the grower.**
`tools/grow_server.js` (`npm run grow:serve`, loopback :8081) accepts
`POST /grow { graph, from, depth, width }`, runs `growGraph` Node-side
against llama-server, persists a run directory through the same
`buildConfig`/manifest machinery as the CLI (plus `input_graph.json`,
because a UI graph has no seed name — such manifests carry
`input.seed: null` and cannot be replayed via `grow:replay`), and
returns the grown graph. The page's Auto-grow button POSTs the current
graph and imports the reply through the ordinary import path. The
claim that survives unchanged: the page never calls the *model*, and
without either server it is exactly the file-import editor above — the
button just fails with a toast. What is genuinely weaker: "it receives
a file" became "it receives the same artifact, over loopback fetch,
on the user's click". UI runs are capped at 64 created nodes
(`MAX_UI_NODES`) so a click cannot fan out into a corpus sweep.

### 5.2 Modules

| File | Role |
|---|---|
| `ids.js` | `shortHash`, `nodeId`, `edgeId`, `canonicalJson` (§3) |
| `llm_client.js` | llama-server transport; `/completion`, `/props`; owns the determinism profile and the response cache |
| `grower.js` | The deterministic traversal; proposes via `llm_client`, inserts via `growth.js`; returns `{ graph, manifest }` |
| `tools/grow.js` | CLI entry point; exports the config/manifest machinery the grow server reuses |
| `tools/grow_server.js` | Loopback bridge: the page POSTs "grow from this node", the model call stays Node-side (§5.1 amendment) |
| `prompts/branch.v1.txt` | Versioned prompt template |
| `tests/*.test.js` | Fixture replay, no network |

**The traversal module is `grower.js`, not `growth.js`.** `growth.js` is
taken: it is the merge-on-insert layer that landed after this document
was first drafted, it is loaded in the browser
(`story_builder.html:136`), and the app calls it
(`story_builder_app.js:645`). The two are a stack, not alternatives —
`grower.js` decides *what to propose and in what order*, `growth.js`
decides *whether the proposal is a new state or an existing one*.
`grower.js` is Node-only (it does HTTP), so it is the first module in
the repo that legitimately breaks the dual-mode convention; it still
exports via `module.exports` and is simply never added to the page.

The remaining new modules that *are* dual-mode (`ids.js`) follow the
repo convention:

```js
(function attachIds(root) {
  /* … */
  const api = { shortHash, nodeId, edgeId, canonicalJson };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagIds = api;
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
  and treat truncation as a hard failure, counted in the manifest — not
  retried with a bigger cap mid-run, which would make the run
  irreproducible. **Read `stop_type`, not `stopped_limit`:** on this
  build a completion that ends at EOS reports
  `"stop_type": "eos", "stopped_limit": null` — the boolean-looking
  field is null rather than false, so a client testing it for `=== false`
  gets the wrong answer. `stop_type === "limit"` is the truncation signal.

- **The schema is not injected into the prompt.** llama.cpp uses it only
  to constrain sampling. The prompt template must *also* describe the
  shape, or the model fills a valid structure with confused content.
- **Grammar enforcement has been reported broken when thinking is
  enabled** ([issue #20345](https://github.com/ggml-org/llama.cpp/issues/20345)).
  This one **does not apply to the reference target** and the reason
  matters: `Qwen3-1.7B-Base` has no thinking mode and no chat template
  to carry `/no_think` or `enable_thinking: false`. The gotcha returns
  the moment anyone swaps in an instruct checkpoint, so it stays
  recorded here rather than deleted. Thinking tokens are a determinism
  liability in their own right: more sampled tokens, more chances to
  diverge.
- **A base model needs a few-shot completion prompt, not an
  instruction.** `branch.v1.txt` is therefore not "You are a helpful
  assistant…" — it is *k* worked examples of `state → JSON` drawn from
  the seeds, ending in the target state and an open brace. The examples
  are part of the versioned prompt and part of its hash; changing which
  seeds they come from is a new prompt version, because it changes what
  the model is imitating.

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

`build_info` comes from llama-server's `/props`. **`system_fingerprint`
does not exist on this build** (`f5b9bd3`) — `/props` returns
`build_info`, `model_path`, `model_alias`, `model_ftype`, `total_slots`,
`chat_template`, `bos_token`/`eos_token` and
`default_generation_settings`, and nothing named `system_fingerprint`.
**`n_ctx` is not top-level either** (re-verified 2026-08-16): it sits at
`default_generation_settings.n_ctx`. Record what is actually there:

```json
"server": { "build_info": "b1-f5b9bd3", "model_ftype": "Q8_0",
            "total_slots": 1, "n_ctx": 4096 }
```

`default_generation_settings` is worth capturing wholesale, because it
is the record of every sampler default the request did *not* override —
which is exactly the class of hidden hyperparameter §4.2 is about. The
samplers live one level down, in `default_generation_settings.params`,
and on this build they include `temperature: 0.8`, `top_k: 40`,
`seed: 4294967295`, `repeat_penalty: 1.0`, `n_predict: -1` and a nine-
stage `samplers` order — so a request that forgets to pin one is not
neutral, it is at a sampling temperature of 0.8. The list also carries
`backend_sampling` and an `adaptive_*` family absent from the design's
original reading, which is the argument for capturing the block whole
rather than enumerating fields.

**`cache_prompt` is not in `/props` at all.** It is request-only, so the
one flag §4.1 ranks as most dangerous cannot be audited from the server.
The manifest must record it from the request the client actually sent.

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
4. **Convergence is not the grower's job.** Every candidate is inserted
   through `Growth.insertContinuation`, which applies
   `MergePredicate.sameInContext` and collapses the node when it turns
   out to be an existing state. `grower.js` does **no** deduplication
   of its own; a second dedup pass with a different key would be a
   silent second definition of "same state".

   *This supersedes an earlier draft of this section*, which proposed
   content-hash dedup and apologised for it as "weaker than the deleted
   `mergeEquivalentStates`". That apology is now wrong twice over.
   `sameInContext` is **stronger** than content-hash dedup: it requires
   same content **and** mutual unreachability, so it distinguishes a
   genuine convergence (two parallel paths arriving at one state) from
   a recurrence (a later look-alike in a changed world) — a distinction
   content hashing cannot make at all. And the draft's premise, that
   post-states are unavailable without a fixture, was answered on `main`
   by a rejection, not a workaround: consulting the future was probed on
   a real grown DAG and rejected (`7c1ce9c`), because at merge time the
   candidate is a childless leaf and because a merge whose futures
   diverge is exactly the bottleneck the app exists to expose. Do not
   re-open it here.

   What remains genuinely weak is the **content key**, not the
   predicate. `defaultContentKey` is surface form, so two states that
   mean the same thing in different words still will not merge. The
   fix, if grown graphs turn out shallow, is a richer `contentKey`
   passed into `sameInContext` — the parameter exists for this — never
   a change to the predicate's incomparability clause.
5. **Acyclicity comes free with the merge.** Every insertion goes
   through `StoryDagEngine.addEdge`, which refuses cycle-creating edges
   (`story_builder_engine.js:48`). Rejections are counted in the
   manifest, never silently swallowed. Note that the rewire on merge
   needs no separate cycle guard: it could only cycle if the survivor
   already reached the source, which is the very condition that makes
   the two nodes comparable and blocks the merge (`growth.js:9-13`).
6. **`rejoinTargetId` validation.** Drop the rejoin when the id does not
   exist, or when the edge would cycle. The branch node is still
   created — an open branch is a legitimate outcome that
   `validateGraph` already warns about rather than rejects.
7. **Prompt context ordering** (added 2026-08-17 with `branch.v2`). The
   context the prompt carries about the graph is derived in
   `grower.js:promptContext` and every ordering in it is pinned, for the
   same reason as (1)–(3): the rendered prompt *is* the cache key.
   - *The told story* — every node with `createdBy !== "grown"`, sorted
     by topological rank then id, each line `[id] expr — state`. Ids
     are exposed deliberately: `rejoinTargetId` is unusable without
     them, which is why v1 produced zero `rejoins` edges despite the
     schema accepting them (§8, "context starvation").
   - *The ancestor path* — the **lexicographically-first shortest** path
     from `graph.root` to the expansion point. A DAG node is usually
     reachable several ways, and "whichever path the search found" is
     not a pinned choice; reverse-BFS for distances, then walk forward
     always taking the smallest-id successor that still decreases
     distance. Ties break by id, the same rule as (1), so the codebase
     has one notion of "smallest id" rather than two.

   The context is computed at expansion time — a pinned point in a
   pinned order. The spine is constant across a run (grown nodes are
   filtered out); the path reflects the graph as the traversal has left
   it, which is deterministic given (1)–(5).
8. **Null transitions are refused, not merged** (added 2026-08-17). A
   continuation whose `expr` **and** `state` both match the state it
   continues from advances nothing. `insertContinuation` rejects it
   before an id is minted and returns `reason: "null_transition"`; the
   grower counts it as `rejectedNullTransitions`, kept apart from
   `rejectedCycles` so a run's failures stay distinguishable.

   This sits beside (5), not inside (4): it is a validity rule about one
   edge, not an identity rule about two states, and it never asks whether
   two *distinct* nodes are the same. Both fields must be non-empty on
   the source before it claims anything — same expr with no state at all
   is not evidence that nothing changed, only that nothing was said, and
   a wrongly refused recurrence is far more expensive than a missed
   restatement. See §8 for the measurement and for what the proxy misses.

   **Budget note.** v2 costs ~1000 prompt tokens on an 8-node seed
   against `--ctx-size 4096` (§4.1). This is fine at seed scale and is a
   real ceiling at corpus scale: a 40-node story will not fit, and the
   spine will need truncation — which is itself an ordering decision to
   pin, not a convenience. Overflow surfaces as a server error that
   stops the run, not as silent truncation.

**Most of this exists.** `experiments/gen_probe.js` already implements a
pinned frontier traversal with a seeded RNG, `K`/`D` budgets,
merge-on-insert semantics, and a `contentKey` index for speed — plus a
startup assertion that its fast path is equivalent to real
`Growth.grow` on a small config. `grower.js` should lift that traversal
and replace only the candidate source: the probe's lexicon recombiner
becomes an `llm_client` call. Keeping the two swappable behind one
interface is what makes the probe usable as the eval baseline (§6)
rather than a fork.

### 5.6 Output lands on an existing contract

`importFromTextArea()` (`story_builder_app.js:817-850`) already detects
`data.branches` and routes each entry through `fillBranchForm()` →
`addBranchFromForm()`, tagging the result `createdBy = "assist"`. The
grower's per-node payload targets this same shape, and a whole grown
graph imports through `importGraph()`.

**No UI change is required to consume grown output.** That is a
deliberate constraint on this design, not a coincidence.

One asterisk on "existing contract": the branches path assigns ids via
`uniqueId()` (`story_builder_app.js:656`) — one of the four
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
| Null-transition rate | Proposals that restated the state they continued from (§5.5.8). The grower's degenerate mode made countable. Shares one denominator with the rates above and below — total insert attempts — so a rejection cannot quietly inflate the others |
| Duplicate-`expr` rate | Prompt collapse into one idea |
| `rejoinTargetId` validity | Whether the model can actually reference real nodes |
| Branch diversity | Distinct normalized `expr` per expansion point |
| In-degree distribution | The probe's failure mode: layer-uniform in-degree means no convergence gradient, i.e. no template to find |
| Replay rate | Fraction of runs whose canonical JSON matches on re-run |

Replay rate is the metric the rest of this document exists to make
meaningful. Scoring is deterministic and its output is a table.

**Every metric is reported against a baseline, and the baseline is
`gen_probe.js`.** Run the same seeds, budgets and merge semantics with
the lexicon recombiner instead of the model. The probe's known scores
(§1.1) set the bar: readable states, in-degree flat across layers. An
LLM grower that also produces flat in-degree has demonstrated that the
bottleneck was never the candidate source, and the design should be
reconsidered rather than tuned. This is the one comparison that can
falsify this document's premise, which is why it is a required column
and not an appendix.

**Pre-registered decision rule (recorded 2026-08-16, before the first
model sweep).** The falsification signal is made countable as
`maxRankSpread`: the maximum over topological ranks of (max − min)
in-degree within the rank. The probe's failure mode — layer-uniform
in-degree, no convergence gradient — is `maxRankSpread` staying at the
baseline's level as budgets grow. If model rows do not beat baseline
rows on this number at equal budgets, the bet that a 1.7B model supplies
the missing semantics is lost, and the response is to question
single-node lookahead itself — not to tune prompts or try a bigger
model. (Small budgets are expected to show spread ≈ 0 for both sources:
a depth-2 growth of a chain-shaped seed is nearly a tree. The rule
binds at corpus-scale budgets, not smoke tests.)

**Per-branch contradiction check** (added from the §8 finding before
anything reads `invariants`): a grown branch whose non-empty normalized
`delta` equals its normalized `invariants` claims the same sentence
changed and stayed the same — the observed copy failure. Reported as
`contradictionRate`; `--show` lists the offending branches. This is the
raw mechanism only — deeper semantic contradiction (state says eaten,
invariants say alive) needs machinery the repo has deliberately not
built — the same restraint that deleted `phi.js` (§1.1); look at the
flagged branches before naming any richer measurement.

---

## 7. Testing

- `tests/ids.test.js` — hash stability, collision suffixing, canonical
  JSON key ordering, `savedAt` absence.
- `tests/llm_client.test.js` — stubbed transport; asserts the request
  body carries `cache_prompt: false`, `temperature: 0`, an explicit
  `seed`, and the `json_schema`; asserts cache hit/miss keying.
- `tests/grower.test.js` — full grower against checked-in fixtures:
  same input twice yields byte-identical canonical JSON; cycle-creating
  proposals are rejected and counted; invalid `rejoinTargetId` is
  dropped without losing the node; the `width` cap is respected.
  (`tests/growth.test.js` is taken — it covers merge-on-insert.)

No test touches the network. `package.json:6` hardcodes both the
`node --check` list and every test path — it needs a `--check` entry
per new module and a glob (`node --test tests/`) for the test paths.

---

## 8. Known risks

**The app forks the engine, and the fork has widened.**
`story_builder.html` loads `story_builder_engine.js`, but
`story_builder_app.js` is a closed IIFE that privately re-implements
`normalizeGraph` (`:152`), `addEdge`, `validateGraph`, `topoRanks` and
`reachable`. `StoryDagEngine` is still never referenced *by name*.

The two `normalizeGraph`s now differ in **two** places, not one:

| Field | Engine | App |
|---|---|---|
| edge `label` | `edge.type \|\| "edge"` | `""` |
| node `label` | `node.label \|\| node.id \|\| "unnamed"` | *no default* |
| graph | clones | mutates in place |

The node-`label` divergence is new and it is a direct hit on this
design. Commit `9b49a4f` added the default **to the engine only**,
and its message names how it was found: *"Found importing a generated
139-node graph: `nodeWidth` reads `label.length`."* A generated graph
is precisely what this module emits. A grower that validates against
the engine and hands the file to the page can therefore ship nodes the
page crashes on.

**And the fork is already live at runtime.** The app reaches the engine
*indirectly*: `tryAutoMerge` (`story_builder_app.js:644`) calls
`window.StoryDagGrowth.collapseIfSame`, which calls
`Engine.addEdge`. So in the browser today, edges created by a merge are
built by the engine's rules while every other edge is built by the
app's. This is no longer a risk the grower would introduce; it is a
defect the grower would amplify.

Either unify the two as a prerequisite (preferred; the app's copies are
the accidental fork), or have the grower assert its output through both
code paths. This is the largest correctness risk in the design, it
predates the design, and it has grown since the design was written.

**`validateGraph` is O(E²·V).** For each edge it removes that edge and
runs a full reachability search (`story_builder_engine.js:92-95`).
Fine for eight nodes, not fine for the graphs this module exists to
produce. Validate once at the end of a run rather than per insertion,
and expect to replace the cycle check with a single topological sort
before corpus-scale sweeps.

**Small-model quality — first measurement, 2026-08-04.** Grammar
guarantees the shape, not the sense. Phase 0.5 probed the sense directly
against `qwen3-1.7b-base-Q8_0.gguf` on the reference profile:

| Prompt | Result |
|---|---|
| zero-shot instruction ("What else could have followed? Answer as JSON") | valid JSON, **echoes the input state three times** — no continuation at all |
| few-shot completion, two worked seed examples then the target state | plausible story-shaped continuations with correct `expr` syntax: `arrive(wolf, red)`, `spot(wolf, red)` |

Both replayed byte-identically across repeated requests (3/3 and 2/2),
so Layer 3 is doing its job. The gap between the two rows is the whole
base-model story: the same weights are useless zero-shot and usable
few-shot, which is why §5.3 makes the few-shot examples part of the
versioned prompt.

The quality that *is* there is uneven, and the failure is worth naming
because the eval harness must catch it: the model filled `invariants`
with copies of `delta`, and produced a branch whose `state` says the
child is eaten while its `invariants` says the child is still alive. It
proposes plausible *transitions* and does not maintain *consistency
across the fields of one branch*. Whether that matters depends on
whether anything downstream reads `invariants` — today nothing does.
Add a per-branch field-contradiction check to §6 before anything starts
to.

The architecture is model-size agnostic; only the manifest changes.

**Context starvation — measured 2026-08-17, and the cause of `branch.v2`.**
A UI auto-grow of Red at depth 4 / width 3 (22 grown nodes) failed in a
way that first read as the model losing the story, and was not:

| Symptom | Count | Cause |
|---|---|---|
| `delta` collapsed to one string | 16 / 22 = "the wolf is still unseen" | — |
| `invariants` = "Red is still on the path to grandmother's house" | 14 / 22 | **copied verbatim from `branch.v1.txt:6`** |
| entities from another story (`attack(wolf, boy)`, "the alarm is still raised") | 3 nodes | **copied from `branch.v1.txt:8-11`**, the criedWolf few-shot |
| grown → seed edges, `rejoins` edges | 0, 0 | no node id ever appeared in the prompt |
| grown nodes with in-degree > 1 | 3 / 22 | free-form exprs never collide with seed exprs |

The whole cluster traces to one fact: `renderPrompt` substituted only
`label`/`expr`/`state` of a **single node**. With no story to condition
on, the strongest signal in the window is the demonstration, so by depth
3 the model completes the demonstration instead of the story. This is
contamination, not drift, and it is diagnosable rather than mysterious —
the junk strings are `grep`-able in the template.

Three consequences, fixed or scheduled separately so the eval can
attribute each:

1. **Context** (done — §5.5.7, `branch.v2.txt`): the told story with ids
   plus the pinned ancestor path. The few-shot moved to a story that is
   *not* in `seeds.js` (the Tortoise and the Hare), so future
   contamination stays detectable by entity name rather than blending in.
2. **Seed atomicity** (done 2026-08-17 — `seeds.js` v2). Two defects,
   both visible in v1's own data. `state` was authorial commentary —
   "The safe endpoint becomes compromised before Red arrives" — and that
   string is what the grower puts after `Note:`, so the model was being
   asked to continue a critical gloss and returned more gloss. And nodes
   bundled several events: `deceive(wolf, red)` was labelled "Wolf learns
   destination" because it was really *meet* + *ask* + *tell*, so a
   counterfactual had no way to say which of the three it attached to.
   A label that disagrees with its expr is the tell for a bundled node.

   v2 splits both. `state` is now what is true in the story world after
   the event, in the story's own terms; the gloss moved to a new
   optional `reading` field which nothing renders into a prompt. Red
   went 8 → 14 nodes, criedWolf 7 → 11, Trojan 7 → 11. `reading` has no
   default in `normalizeGraph` — absent means absent, so grown nodes do
   not carry an empty one, and `canonicalJson` emits it from the
   declared key order without any other module needing to know it exists.

   Two consequences worth recording. Prompt cost rose to ~1440 tokens
   for red against `--ctx-size 4096`, which is fine and is half the
   budget already (see §5.5.7's ceiling note). And the re-cut made
   `arrive(red, grandmother_house)` a real seed node, which silently
   converted `tests/grower.test.js`'s grown-to-grown merge case into a
   grown-to-seed one — the test still passed its headline assertion
   while no longer testing its subject. The fixture now uses
   `shelter(red, cottage)` for grown-to-grown and keeps
   `arrive(red, grandmother_house)` for a dedicated merge-into-the-spine
   test. **Recorded runs from before this commit are not comparable**:
   the input graph hash changed, so v1-seed manifests replay against a
   graph that no longer exists.

   **Spot check only** (red, depth 2 / width 2 / max 8 — three
   expansions, deliberately cheap; no re-baseline sweep has been run).
   Two things transferred and one did not:

   - *Register transferred.* Grown `state` came back as world-state prose
     rather than gloss — "Red has left the basket behind", not "the
     predator's route becomes causally prior to hers". The model copies
     the register of what it is shown, which is the whole reason the
     gloss was the wrong thing to show it.
   - *Vocabulary transferred.* Proposals reuse seed predicates
     (`leave(...)`, from `leave(red, path)`), and one merged into the
     spine at `warn(mother, red, path)`.
   - *Sense did not.* `leave(red, woods)` was proposed as a continuation
     of `send(mother, red, basket)` — Red leaves woods she has not
     entered — with the state "Red has left the woods and is now in the
     house". And `leave(red, basket)` carries the self-contradiction
     "has left the basket behind and is carrying it alone". Better
     predicates, no better world model. Nothing here argues against
     follow-on 3; it is the same gap.

   **A separate defect this made legible — now fixed (§5.5.8).** One edge
   came back as `leave(red, basket) → leave(red, basket)`: the model
   proposed the state it was given as its own continuation. The same
   shape produced `watch(red, woods)` four times in the run that started
   this work — **8 of 34 edges**, a quarter of that graph.

   The first reading here was that a guard belonged in the grower and
   was forbidden by §5.5.4 as a second definition of "same state". That
   reasoning was too coarse. There are two questions, and they were
   collapsed:

   - *Are these two nodes the same state?* — identity. `sameInContext`
     owns it, and its answer for a chain is **recurrence, do not merge**.
     That must stay: it is what keeps criedWolf's three `cry(boy, wolf)`
     distinct.
   - *Does this edge advance anything?* — validity. Nobody owned it. It
     never compares two *distinct* states, so it cannot contradict the
     predicate.

   And it cannot be solved by merging: source and candidate are
   comparable, so the incomparability clause blocks the collapse, and
   lifting that clause would reintroduce the cycles the merge rewire
   relies on being impossible (`growth.js:9-13`). A null transition has
   to be refused at creation, which is what `insertContinuation` now
   does — counted as `rejectedNullTransitions`, apart from cycles.

   **What it does not catch, and why that is stated rather than fixed.**
   The rule is a syntactic proxy: same `expr` *and* same `state`. It
   fires on the observed cases only because the model restated the state
   text too. The deeper defect is that the second `leave(red, basket)` is
   *impossible* — Red has one basket, and the first event consumed it. A
   model that wrote a different sentence for that same impossible event
   would pass the check untouched. Preconditions and consumption are a
   world model — the machinery deleted in §1.1 and declined twice since.
   This catches laziness, not incoherence, and the gap is the honest size
   of the difference.

   Measured on the authored seeds before shipping: **0 rejections across
   33 seed edges** in all three stories, criedWolf included; **8 of 34**
   on the degenerate run.
3. **Closed vocabulary** (open, and it must come last): a lexicon of
   allowed predicates and arguments, enforced as an `enum` in the
   grammar rather than requested in prose. Note the tension — this is
   the `gen_probe.js` grammar pole, which §6 makes the baseline the
   model must *beat*, so it must be introduced alone and scored. Its
   real payoff is structural, not cosmetic: `sameInContext` keys on
   `normalizedContent(expr)`, so free-form exprs (`run(red, house)` vs
   `arrive(wolf, grandmother_house)`) can never collide, and without
   collisions `maxRankSpread` has nothing to measure. The claim at
   `grower.js:30` that `rejoinTargetId` "cannot be constrained to
   existing ids by JSON Schema" is false once the enum is built per-call
   from the live graph; correct it there when that lands.

**Growth is not understanding.** A grown DAG is a hypothesis about what
could have followed, generated by a system with no model of the story
world — the thing the deleted `phi.js` did have. This design trades
semantic grounding for generality, deliberately. The visible edge of
that trade is `defaultContentKey`: convergence is decided on surface
form, so states that mean the same thing in different words stay
separate. That is the first thing to revisit if grown graphs turn out
shallow — a richer `contentKey`, not a different predicate (§5.5.4).

**The probe already ruled out one hypothesis, and it may rule out
this one.** `gen_probe.js` showed that adding constraints to a
lexicon recombiner buys structure and readability but not meaning.
The bet here is that the missing ingredient is semantics and that a
1.7B base model has enough of it. If the eval (§6) shows LLM-grown
graphs with the same layer-uniform in-degree, the bet is lost and the
right response is to question whether *any* single-node-lookahead
proposer can produce shape — not to try a bigger model. Record that
before running it, so the result cannot be reinterpreted afterwards.

---

## 9. Phasing

| Phase | Contents |
|---|---|
| **0** | ✅ **done 2026-08-04** (`2e78d78`). §3 only — `ids.js`, content-addressed ids at all four sites, canonical export, tests. No model. Independently valuable; unblocks everything else. |
| **0.5** | ✅ **done 2026-08-04.** `qwen3-1.7b-base-Q8_0.gguf` (1.83 GB, sha256 `8a0dbbf6…5b7cba`) exported from the HF cache via `llmfinetune/export_gguf.py`; `llama-server` stands up on the reference profile; `/props`, `json_schema` and byte-identical repeat requests all confirmed. Findings folded into §4.1, §5.3, §5.4, §8. |
| **1** | ✅ **done 2026-08-16.** `llm_client.js` + `grower.js` + `tools/grow.js` + `prompts/branch.v1.txt`, reference profile, fixture-replay tests. First real run replayed byte-identically cache-cold (§0). |
| **2** | ⏳ **harness done 2026-08-16** — `tools/eval.js` scores the §6 table against the `gen_probe.js` baseline; first 3-story sweep replayed byte-identically. Open: prompt versions, the corpus-scale sweep (blocked on the §8 topological-sort cycle check). |
| **3** | *Deferred.* LoRA via the sibling `llmfinetune` workspace, GGUF adapters, `--lora` hot-swap on the server, trained on accepted branches. Determinism gets harder — the adapter joins the manifest as a hashed artifact. Not designed here. |

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
