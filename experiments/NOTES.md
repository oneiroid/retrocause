# Continuation generation — running notes

Plan v3, Stage 0. One file per finding is not the convention here; this is a
running log, newest section last. Every config that produced a number is
written down, because a number without its config is not a result.

Gate 0 was graded by hand on 2026-08-31 and passed; see "Gate 0, graded".
Everything after it is one graded batch of 60 samples at one budget on one
story — read the failure taxonomy, not the headline ratio.

---

## Step 0 — the hand pass (2026-08-31)

Entity lists and a `frame` for all 36 seed nodes across all three stories,
hand-authored into `seeds.js` and rendered by `frames.js`. All three stories
render root→leaf and read as stories. `tests/frames.test.js` holds the
authoring rules; `npm test` → 93 pass.

### Vocabulary decisions

**Actor surface forms are possessive where the relation matters.** `red`'s
list is `["Red", "Red's mother", "Red's grandmother", "the wolf", "the
woodcutter"]`, not `["Red", "her mother", …]`. Two reasons: the first
sentence of the story has no antecedent for "her", and `Red's mother` gives
the longest-prefix parser a real test — `Red` is a prefix of `Red's`, and
without the word-boundary rule the sentence "Then Red's mother calls her
back, …" parses **silently** as actor `Red`, action `'s mother calls her
back`. A silent misparse is worse than a rejection, so the parser requires the
character after the matched entity to be a space, and the test suite pins
that case.

**Actors, not participants.** The lists name who can *act*, not everything
mentioned. `the flock` is an `effects` owner in criedWolf but never an actor,
so it is not in the list; putting it there would let the grammar propose the
flock as a subject.

**The closed list is the design's real cost, and it is not small.** Nothing
in a sentence marks where the actor ends and the action begins, so `actor`
has to range over a closed set or `parse` is not invertible. The consequence
is that **no continuation can introduce a character the author did not
pre-declare**. Red's woodcutter arrives from outside the story; a closed enum
can only ever propose him because he was listed in advance. The unconstrained
diagnostic below confirms this is a live constraint, not a theoretical one:
the model proposed "an old hag" unprompted.

**Outcomes are hand-written prose, never rendered from `effects`.** The
automated half of keeping them honest is a test: every `owner` on the left of
an `owner.property=value` assignment must be named in the node's `outcome`,
matched on a word boundary. The other half is reading them, which is what
this pass was. Mechanical outcome text in every history sentence would teach
the model mechanical text, which is the thing under test.

One authoring fix came out of that check: `th_sail`'s outcome was "the Greek
fleet is gone…", which does not contain the owner token `greeks`. It is now
"the Greeks' fleet is gone…".

### Read-aloud observations

- Every line, including the story's first, carries the `Then ` prefix. As the
  opening sentence of a story that reads slightly oddly. **Kept anyway**: a
  uniformly-shaped history is what a base model completes from, and the
  completion cue is `NEXT EVENT:` followed by exactly this shape. Uniformity
  beats the opening line's prosody.
- The template forces `and now` into every sentence, which reads as a tic
  across fourteen consecutive lines. It is doing structural work (it is the
  only delimiter between action and outcome), so it stays, but if Gate 0
  fails on prose quality this is the first thing to vary.

### Deviations from the plan text

1. `action` also forbids `.`, which the plan did not. A period inside the
   action produces two sentences where the format declares one.
2. `parse` requires a word boundary after the actor (above). The plan
   specified longest-prefix only.
3. The sentence arm's few-shot comes from **The Tortoise and the Hare**
   (`prompts/frames.v1.txt`), not from other seed stories as the plan says.
   branch.v2 moved its few-shot out of `seeds.js` specifically so
   contamination stays detectable, and it worked — cross-story entities went
   to zero. Feeding criedWolf to a red probe reopens that channel, and the
   two stories deliberately share the `wolf` entity. It also gives both arms
   the same few-shot story, which an A/B on representation needs.
4. `linearize` is `grower.ancestorPath` — the pinned lexicographically-first
   shortest path — rather than a new story-kind-preferring rule. On seed
   graphs nothing is grown, so the preference is vacuous, and reusing the
   grower's rule means both arms see the identical path.
5. Both arms run the **same** sampling block. The plan pinned the sentence
   arm's sampler and left the JSON arm's unstated; on the grower's greedy
   reference profile the JSON arm would return one completion ten times, and
   the A/B would be measuring sampling, not representation.
6. Only the **first** branch of each JSON sample is graded. branch.v2 returns
   up to three per call, and flattening would give the JSON arm three shots
   per sample against the sentence arm's one. The rest are recorded under
   `extraBranches`.

---

## Infrastructure — what the plan asked for and what the machine has

**The 4B profile was blocked; it is now unblocked.** Both halves of plan
v3's premise were false as first checked, and both were fixable:

- *No 4B GGUF locally, and the repos I guessed all 401.* HF answers 401 —
  not 404 — for unauthenticated requests to repos that do not exist, so
  "gated" and "nonexistent" are indistinguishable from the shell.
  `unsloth/`, `bartowski/` and `Mungert/` Qwen3-4B-Base GGUF repos simply do
  not exist. Real ones do:
  **`mradermacher/Qwen3-4B-Base-GGUF :: Qwen3-4B-Base.Q5_K_M.gguf`**, 2.88 GB,
  fully public (`user_id=public` on the CDN redirect, HTTP 200 anonymous).
  Downloaded 2026-08-31, sha256
  `699936b83664f71a4c1d129a1e10b02c1909e8edfdd32962cea75259f4f92093`, pinned
  in `serve_reference.sh`. Unlike the 1.7B — which Phase 0.5 converted in
  this workspace — this is a **third-party upload**, so the hash is the only
  thing between the profile and a silently different model. The fallback if
  it ever disappears: `Qwen/Qwen3-4B-Base` safetensors are public (8.05 GB,
  3 shards), llama.cpp ships `convert_hf_to_gguf.py` + `llama-quantize`, and
  the `llmfinetune/.venv` already has torch 2.13 / safetensors / gguf.
- *The pinned llama.cpp build had no CUDA backend.* `f5b9bd3`'s `build/`
  ships `libggml-cpu.so` and nothing else, so the Quadro RTX 3000's 6 GB was
  unreachable. Rebuilt the **same commit** with
  `-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=75` (Turing) against the
  CUDA 12.8 toolkit already installed, into **`build-cuda/`** — deliberately
  *not* over `build/`, which is the substrate every recorded run in `runs/`
  depends on. Verified: `libggml-cuda.so` present, server holds 3508 MiB of
  VRAM with `--n-gpu-layers 99`.

`serve_reference.sh` is now profile-selectable: `PROFILE=ref-1.7b-cpu`
(default) or `PROFILE=qwen3-4b-cuda`. **The default deliberately did not
move**, though plan v3 calls the 4B "the new default". Flipping it would
silently reinterpret every manifest that says it ran against "the reference
profile"; that flip is a one-line commit someone makes on purpose.

**Model size is still not isolated, and now for a sharper reason.** Two
variables move between the profiles at once — 1.7B→4B *and* CPU→CUDA — and
GPU kernels reorder floating-point reductions, so the profiles are not
bit-comparable even at temperature 0. A difference between them cannot be
attributed to size. Isolating size needs the 4B on CPU (slow but honest) or
the 1.7B on CUDA.

**Speed, measured.** Same config (red/red_woods, K=4, sentence arm,
constrained): **28.9 s on ref-1.7b-cpu, 10.2 s on qwen3-4b-cuda**, and the
GPU figure includes ~6 s of streaming the 2.9 GB GGUF for the manifest hash.
The CPU profile's cost is structural, not incidental — `cache_prompt: false`
is pinned for replay, so every sample reprocesses the whole ~1000-token
prompt from scratch.

**One probe bug fell out of the bigger model.** `sha256File` used
`fs.readFileSync`, and Node caps a single Buffer at 2 GiB. The 1.7B GGUF
(1.8 GB) slid under it; the 4B (2.9 GB) did not, and the manifest write threw
*after* the sampling was already done. Now a chunked read.

**`llm_client.js` gained three things**, all strictly additive so that a
caller setting none of them sends a byte-identical body to before (the body
is the cache key — an unconditional new field orphans every recorded response
and every manifest that replays against one):

- optional `min_p` / `top_p` / `stop`, emitted only when set;
- a per-request `seed`, because K samples from one prompt need K seeds. On
  the pinned single seed, a temperature>0 client returns the same completion
  K times — silently, and looking like a degenerate model rather than a
  degenerate request;
- a per-request `grammar` (the frame grammar enumerates one story's entities,
  so it cannot be pinned per client), and the partial text now rides on the
  truncation error. For the grower a length-stop is a run failure and the
  content is noise; for the unconstrained batch it *is* the measurement.

**Adding `frame`/`entities` to seeds changes the input graph hash**, the same
way seeds v2 did. Nothing recorded in `runs/` replays against the new seeds.
This does not bite Stage 0 (which writes no graph and touches neither
`grower.js` nor `eval.js`), but it does bite the Gate 1 bridge run, which
re-runs anyway.

---

## Stage 0, unconstrained diagnostic batch (2026-08-31)

Purpose: measure how natural the template is to the model *without* the
grammar. Under the grammar parse rate is 1.0 by construction, so this is the
only run in which the number means anything.

Config: `red`, nodes `red_woods,red_tell,red_flowers`, K=10 distinct, run seed
7, `frames.v1`, qwen3-1.7b-base Q8_0 on the reference server profile,
temperature 1.0 / min_p 0.05 / top_k 0 / n_predict 40 / stop `\n` /
`cache_prompt false`. Output:
`experiments/out/cont_red_red_woods-red_tell-red_flowers_unconstrained.json`.

| node | parse rate | attempts to fill K=10 | truncated | duplicates |
|---|---|---|---|---|
| red_woods | 0.59 | 17 | 1 | 0 |
| red_tell | 0.83 | 12 | 1 | 0 |
| red_flowers | 0.67 | 15 | 1 | 0 |

**Every failure is a format failure, not a semantic one.** The modes, in
order of frequency:

- *wrong entity surface form* — "Then **a** wolf comes and stands on the
  path…" where the list has "the wolf". The model has the right character and
  the wrong determiner.
- *a genuinely new character* — "Then Red finds an old hag who makes her a
  cup of poisoned tea…". This is the closed-enum cost, observed. The grammar
  will make it unproposable rather than fix it.
- *missing the separator comma* — "…calls on his friends to meet him **and
  now** the wolf and his friends are close together". The words are there;
  the comma is not.
- *list numbering leaking in* — a leading `1 ` before `Then`.
- *running on past one sentence* — the model emits a second `Then …` and hits
  the 40-token cap. Exactly one truncation per node.

Read together: **the template is close to natural for this model but not
inside it.** Two thirds of unconstrained draws land the shape unaided, and
the third that miss, miss by a determiner or a comma. That is the case for
the grammar being a formatting aid rather than a straitjacket — it is
correcting punctuation, not inventing structure.

**Zero duplicates at K=10 on all three nodes.** Whatever else is true, this
representation is not collapsing to one continuation the way `dupExprRate`
0.5 on criedWolf did through the JSON boundary. Not a like-for-like
comparison (different sampler, different node set) — flagged so a later
reader does not take it as one.

**The semantic failure is in the outcome slot, and it is worth watching.**
The actions are mostly plausible; the outcomes frequently do not follow from
them, and several invert the causality outright:

    Then Red eats and drinks from the basket, and now Red is hungry and thirsty.
    Then Red falls asleep, and now Red has been asleep for a while and is tired.
    Then Red stops to rest in a clearing, and now Red is walking in the forest.

This is a **prediction for grading**, not a result: if the graders mark these
implausible, the sentence arm's plausibility will be dragged down by the
outcome slot specifically, and the next config to try is a two-slot frame
(actor + action, outcome dropped or model-scored separately) rather than a
different template wording. Do not decide that from these three examples.

---

## Stage 0, the A/B data (2026-08-31) — ready to grade

Config: `red`, nodes `red_woods,red_tell,red_flowers`, K=10 distinct per arm,
run seed 7, **profile `qwen3-4b-cuda`** (qwen3-4b-base Q5_K_M, sha256
`699936b8…`, llama.cpp `b1-f5b9bd3` CUDA), temperature 1.0 / min_p 0.05 /
top_k 0 / `cache_prompt false`. Sentence arm `frames.v1` + grammar
(n_predict 150, derived); JSON arm `branch.v2` + BRANCH_SCHEMA (n_predict
512). Output:
`experiments/out/cont_red_red_woods-red_tell-red_flowers.json`.

| node | arm | attempts | parse | truncated | duplicates |
|---|---|---|---|---|---|
| red_woods | sentence | 10 | 1.00 | 0 | 0 |
| red_woods | json | 10 | 1.00 | 0 | 0 |
| red_tell | sentence | 10 | 1.00 | 0 | 0 |
| red_tell | json | 10 | 1.00 | 0 | 0 |
| red_flowers | sentence | 10 | 1.00 | 0 | 0 |
| red_flowers | json | 10 | 1.00 | 0 | 0 |

60 samples, no waste: every arm filled K on the first pass, so no refill round
fired and no node is saturated. 43 s wall clock.

**These are candidates, not a result.** Gate 0 is a human call on graded
output. Nothing below is a plausibility judgment.

### A confound was found and removed before grading — read this before trusting any earlier number

The FIRST version of this run reported sentence-arm "parse rate" of
0.83 / 0.63 / 0.83 *under the grammar*, which is impossible by construction —
the grammar cannot emit an unparseable sentence. Every one of those failures
was **truncation at `n_predict: 40`**, and two separate mistakes were stacked
in it:

1. **The grammar and the token cap contradicted each other.** The bounds were
   guesses (action ≤ 90 chars, outcome ≤ 140), admitting 246-char sentences
   that 40 tokens cannot emit. The tighter limit silently won. The bounds are
   now sized off the authored corpus — longest authored action is 62 chars,
   longest outcome 86 — at 80 / 110, and the cap is *derived* from the
   grammar (`maxSentenceChars / 3 chars-per-token × 2 safety`) so the grammar
   is what binds. `tests/frames.test.js` pins both directions: the bounds must
   admit every authored frame, and `maxSentenceChars` must bound every
   sentence the grammar can produce.
2. **The truncation was non-random, and the arms had unequal budgets.** The
   samples being discarded were the longest, most elaborate continuations —
   so the surviving sentence-arm set was biased short, and it was being
   compared against a JSON arm with 512 tokens. Grading that would have
   measured the token budget, not the representation.

`parseRate` no longer averages truncation into itself: it is computed over
completions that actually finished, and `truncationRate` is reported
separately. A completion cut off at the cap never got the chance to be
well-formed, and counting it as unparseable blames the representation for the
sampler's budget.

The unconstrained diagnostic numbers earlier in this file (0.59 / 0.83 / 0.67)
carry the same conflation — they were drawn under the same 40-token cap, with
exactly one truncation per node folded into the rate. Their *format* failure
modes stand; the rates are each understated by roughly one sample in twelve.

### 1.7B → 4B, qualitatively

The 1.7B's signature failure was in the outcome slot: the outcome did not
follow from the action, and several inverted causality outright ("Then Red
eats and drinks from the basket, and now Red is hungry and thirsty"). On the
4B that specific failure is not visible in the sampled output. This is an
eyeball observation across two dozen samples on different hardware, not a
measurement — the profiles differ in size *and* backend, so it cannot even be
attributed to size. It is recorded because it is the thing the next grading
pass should check first, not because it is established.

Two things worth a grader's attention, both visible without judging
plausibility:

- The sentence arm produces occasional **non-events** ("Then Red thinks to
  call her grandmother by name") and one **fragment** ("Then Red walks past
  the wolf and says, and now …"). The grammar guarantees shape, not that the
  action is an action.
- The JSON arm produces exprs that **contradict their own state**: at
  `red_tell`, where Red and the wolf have already met, it proposed
  `ignore(red, wolf)` — "The wolf continues down the path without
  encountering Red". This is the §8 contradiction failure, unchanged in form
  on a bigger model.

---

## Gate 0, graded (2026-08-31) — passed, with the margin overstated in one direction and understated in the other

Human grading of the 60 samples above, two y/n per sample, arms interleaved
in a seeded shuffle. `cont_red_red_woods-red_tell-red_flowers.graded.json`.

| node | sentence | json |
|---|---|---|
| red_woods | 8/10 | 6/10 |
| red_tell | 9/10 | 7/10 |
| red_flowers | 8/10 | 8/10 |
| **all** | **25/30** | **21/30** |

**Told-story repeats: 0 of 30 in both arms.** Neither arm passed by
regurgitating the next event it had just been shown. That is a clean result
and it is the one number here with no caveat attached — the saturation
failure mode that question 2 exists to catch did not fire on red at all.

**Gate 0's stated bar is met**: sentence arm 25/30 = 8.3/10, above the 7/10
threshold; the JSON arm did not match or beat it, so the natural-prose
hypothesis is not rejected.

**The 4-sample margin is not the finding, and should not be reported as
one.** 25 vs 21 on n=30 cannot distinguish "frames are better" from noise.
The direction is consistent — the sentence arm is ahead at two nodes and
level at the third, never behind — but that is three data points. Anyone
quoting "83% vs 70%" from this batch is over-reading it.

### The finding is the failure taxonomy, and there the arms separate cleanly

Classifying the 14 implausible samples by hand:

**JSON arm — 9/9 failures are state regression.** Every one proposes an event
that contradicts or undoes what the history already established:

- at `red_woods`, three of "Red returns home" / `stay_at_home(red)` — she has
  already entered the woods, so staying home is not a counterfactual, it is a
  contradiction of the node it is attached to;
- at `red_tell`, `meet(grandmother, red)` puts the grandmother on the path
  when she is established at the house, and `wait(wolf, red)` invents a door
  that does not exist yet;
- at `red_flowers`, `meet(red, wolf)` — "They are face to face and she is not
  afraid" — is a near-verbatim regression to `red_meet`, four nodes back.

This is §8's contradiction failure, unchanged in kind on a 4B model, now with
a rate on it: **30% of first-branch proposals**.

**Sentence arm — 2/5 failures are the same class, and 3/5 are my own grammar
bound.** The state errors are `Red's grandmother` acting at the door while
Red is in the woods (twice; one also a fragment, "and says," with no object,
and one a non-event, "Red thinks to call her grandmother by name" whose
outcome merely restates the action). So the comparable state-contradiction
rate is **2/30 ≈ 7% against the JSON arm's 30%** — a much wider separation
than the plausibility ratio shows, and the one worth chasing.

### A second length artifact, subtler than the first, and it biases against the sentence arm

**7 of 30 sentence samples sit at exactly 110 chars of `outcome` — the
grammar bound — and GBNF does not reject at a bound, it forces the
terminator.** So the sample is cut mid-word and a "." is appended, producing
output that *parses perfectly* while being garbage:

    …and now the wolf has run into the house while Red has stopped to g.
    …and now the wolf has a plan to trick her grandmother into coming to
      the house he will attack while she waits there for.

Three of the five sentence-arm failures are at the bound. This is the same
mistake as the `n_predict` confound one section up, in a worse form: the
token cap at least raised a truncation error that got recorded, whereas the
grammar bound truncates *silently and legally*. **The sentence arm's 25/30 is
therefore a floor, not an estimate** — charitably 2 of the 5 failures are the
bound alone, putting the real figure between 25/30 and 27/30.

The `action` bound never binds (0/30 at 80 chars). Only `outcome` does, 23%
of the time. The asymmetry is informative: authored outcomes max at 86 chars,
and the model routinely wants >110 — not because it needs the room to say the
same thing, but because it pads with conjunctions ("and … and …").

**That diagnosis is not yet earned, though, and the order matters.** While
the bound is cutting mid-word, "the model rambles" and "the model needed more
room" are indistinguishable. Fix the artifact first, re-measure, then decide.

---

## Outcome bound raised to 170 (2026-08-31) — artifact gone, and the model was not padding

`OUTCOME_MAX_CHARS` 110 → 170, sentence arm re-run on the same three red
nodes, everything else held. `experiments/out/cont_red_outcome170.json`.

| | bound 110 | bound 170 |
|---|---|---|
| samples at the bound | 7/30 | **1/30** |
| mean outcome length | — | 91 chars |

**The model was not padding, it needed room.** Mean outcome is 91 chars
against an authored maximum of 86 — barely above what a human needed — and
only one sample of thirty reaches 170. The "rambles with conjunctions" read
from the previous section is **withdrawn**: it was an artifact of measuring
length against a bound the model was pressed up against.

`action` stays at 80. It bound 0/30 at both settings.

**22 of the 30 samples are byte-identical to the graded batch.** The bound
change only moved the samples that were sitting on it, which is the expected
result and also means this file is *not* a fresh batch — see the calibration
note below.

---

## Can Claude do the grading? — unresolved, calibration set up (2026-08-31)

Asked directly, and the answer is "not yet demonstrated", for reasons that
are not modesty:

1. **Contamination on the existing batch.** The failure taxonomy above
   required reading the 14 samples the human marked implausible. Any grading
   of red by Claude now is grading with the answers in hand — and the
   outcome-170 re-run is 22/30 identical to that batch, so it inherits the
   contamination.
2. **Not an independent rater.** Claude authored the frames, entity lists,
   template, few-shot and grammar bounds. The sentence arm looking good is
   not a neutral outcome. Two confounds have already been found in this work
   that both happened to bias *against* the sentence arm; a rater leaning the
   other way would produce the mirror artifacts and they would be just as
   invisible from inside.
3. **The blinding does not blind a machine.** `grade.js` shuffles, but the
   arms have visibly different surface formats. A human might not track the
   format consciously across 60 samples; a machine knows the arm every time.
   The plan already recorded this as a partial limitation for humans — for a
   machine rater it is total.

`experiments/same_state.js` is the local precedent and it cuts both ways: the
model *can* do bounded discrimination, and its labels still needed a human
pass, and one flipped.

**So the rater is being calibrated rather than assumed.** `grade.js` gained
`--labels <file> --rater <name>` (non-interactive, writes
`*.graded.<rater>.json`) and `--compare a b` (agreement over shared samples,
keyed on nodeId+arm+normalized expr — never on shuffle position — and it
prints base rates alongside, because 90% agreement on a set that is 90% "yes"
is chance).

Fresh batch for it: **trojanHorse**, `th_gift,th_lie,th_seer`, K=10 both
arms, run seed 11 — a story with no human labels anywhere, so no leakage.
Claude's labels: `cont_trojan_calib.graded.claude.json`.

| | sentence | json |
|---|---|---|
| th_gift | 7/10 | 5/10 |
| th_lie | 6/10 | 7/10 |
| th_seer | 6/10 | 5/10 |
| **all** | **19/30** | **17/30** |
| told-story repeats | 0 | 3 |

Same direction as the human's red batch, notably lower absolute numbers, and
the JSON arm *ahead* at one node. **These numbers mean nothing until the
agreement check runs** — a 15-sample stratified subset is in
`cont_trojan_calib_subset.json` for the human.

---

## Semantic duplicates: the sentence arm's "0 duplicates" is not diversity (2026-08-31)

The most consequential thing found while grading, and it is not about
plausibility.

On trojanHorse the sentence arm reports **0 duplicates at every node** while
the JSON arm needed 4, 8 and 8 refills. Read naively that says the sentence
arm is more diverse. It is the opposite. At `th_lie`, nine of ten sentence
samples are the same event in different words:

    Then the Trojans carry the horse in, and now …
    Then the Trojans drag the horse up into the city, and now …
    Then the Trojans take the horse inside the walls, and now …
    Then the Trojans lift the horse into the walls, and now …

The dedup key is `normalizedContent(frameExpr)`, and `frameExpr` is free
text. Free text almost never collides, so the key is doing **much less work**
in the sentence arm than `expr` does in the JSON arm, where a compact
`schema(args)` form collides readily. The two arms' duplicate counts are
therefore **not comparable**, and the sentence arm's zero is an artifact of
surface variation.

The likely cause is memorization: the Trojan Horse's next event is famous,
and the model returns it ten ways. Red — a story whose middle is less
canonical — did not do this as hard.

**This lands directly on Stage 1 and changes its plan.** Stage 1 proposes to
cluster "by slot agreement first: normalized `actor` equality + normalized
`action` overlap. Zero dependencies." That will not work here. A crude
mechanical proxy (actor + first verb of action) scores `th_gift` at **9/10
distinct** where a reader sees one event — because the variation is
*lexical* (bring / carry / take / move / drag / lead / lift) while the event
is identical. Slot-agreement clustering measures wording.

Consequences, in order:

1. The sentence-embedding fallback the plan lists as "only if slot clustering
   is demonstrably too coarse" is now demonstrably needed, not optional.
2. Any comparison of duplicate rates between the arms is invalid as it
   stands, including the "dupExprRate 0.5 on criedWolf" contrast this work
   has been carrying since the v1-vs-v2 table.
3. A story-level confound is now visible: how canonical the next event is
   varies by story, and trojanHorse is the extreme. criedWolf's saturation
   and trojanHorse's memorization are two different failures that both look
   like "low diversity".

---

## Temperature sweep: th_lie does not broaden with temperature (2026-09-10) — conclusion later WITHDRAWN

The duplicate finding had two readings and only one was written up. Reading
A: the model collapses and we need embeddings to detect it. Reading B: at
`th_lie` the Trojans bringing the horse in genuinely *is* the next event, the
possibility space is one wide, and a calibrated sampler should return it ten
ways. Under B, clustering would faithfully report one cluster and the
embedding pipeline would have been built to learn what reading ten lines
already said.

Discriminator, no new machinery and no human: raise temperature. Sampler-
limited narrowness broadens; real narrowness does not. `--temp` added to
`continue_probe.js` for this.

| node | temp 1.0 | temp 1.4 | temp 1.8 |
|---|---|---|---|
| th_lie — distinct actors | 2 | 2 | 2 |
| red_tell — distinct actors | 1 | 1 | 1 |

**Reading B looked like it held, and it does not. See the correction in the
next section — this table is kept because the measurement is sound and only
the conclusion drawn from it was wrong.** At temp 1.8 `th_lie` is still "the Trojans bring the
horse into the city" in eight or nine samples of ten. What temperature bought
was decoration — *in the midst of a party*, *on their shoulders*, *into the
courtyard* — plus two incoherent samples:

    Then the Trojans lead their animals into the horse to find a dry place to
    water, and now the horses are inside the horse …

A lexical proxy (actor + action content words, motion verbs collapsed) scored
this 7/10 → 9/10 → **10/10 distinct** as temperature rose, and that is the
proxy being fooled by exactly the noise temperature added. **Any automated
diversity measure that does not survive being read is not measuring
diversity.** This is the second time in this work a mechanical proxy has
disagreed with reading the output, and both times the output was right.

### What this changes

1. **Sentence embeddings are shelved, not deferred.** The evidence says they
   would correctly report one cluster at `th_lie`. Building them to discover
   that is the premature-apparatus failure. Revisit only if a node with
   *known* alternatives produces samples that slot-agreement cannot separate.
2. **Node selection needs a criterion, and did not have one.** The default
   nodes were picked as "mid-story" — far enough in to have history, short of
   the ending. That is not the same as "the story admits more than one
   continuation here". `th_lie` is a forced move: Sinon has just sold the lie,
   and the only thing that happens next is the horse going in. Measuring
   "distinct alternatives" there measures nothing.
3. **The trojanHorse calibration batch is compromised as an A/B**, though
   still usable for rater agreement. Two of its three nodes (`th_gift`,
   `th_lie`) are forced moves. Red's mid-story nodes are not — `red_tell`
   gives genuinely different events at temp 1.0 (the wolf invites her, offers
   to carry the basket, announces he will go ahead; Red walks on, offers him a
   seat).
4. **criedWolf saturation, trojanHorse memorization and a forced move are
   three different things that look identical** from the duplicate count.
   Only the third is now distinguished, and only by reading.

---

## CORRECTION: th_lie is not a forced move — the collapse is on the ACTOR slot (2026-09-10)

The "forced move" reading of the previous section is **withdrawn**. It failed
the most obvious check available, which is the corpus itself:

**The told story's own next event at `th_lie` is Cassandra warning.** So at
least two continuations exist at that node by construction, and a reader can
list more (Laocoön's spear, an inspection, burning it). A node whose ground
truth branches away from the model's mode is not a node with one continuation.
Temperature failing to broaden it is equally consistent with a memorized mode
holding nearly all the probability mass, and that is what it was.

Actor counts across all 30 th_lie samples, temperatures 1.0 / 1.4 / 1.8:

    the Trojans 24    Sinon 6    Cassandra 0    the Greeks 0

**Cassandra never once**, on the node where the told story has her speak.

### The closed entity list is the lever, not just the cost

Restricting the grammar's actor enum to one entity at a time — every other
part of the grammar unchanged — recovers coherent alternatives for all four:

    Then Cassandra tells them the horse is a trick, and now the Trojans
      understand the horse is dangerous to take in.          ← the told next event
    Then Cassandra says Sinon is a spy, and now …
    Then Sinon asks for the chance to talk with the king, and now the Trojans
      agree to let Sinon speak to their leader the king Priam.
    Then the Greeks leave the horse and lead the Trojans into the plain, and
      now the Greeks have led the Trojans into a trap …

Step 0 wrote the closed list up as "the design's real cost, and it is not
small". It is also the only handle in either representation that lets you
enumerate the space the sampler collapses. **The JSON arm cannot do this**:
`expr` is free text with no designated actor slot and no closed vocabulary to
condition on. That is a property of the representation, which is what this
whole experiment is about.

Consequence for reporting: a `--per-actor` sentence arm is **not** a
like-for-like comparison against the JSON arm and must never be tabled as
one. It is the representation used the way it affords — a different question,
and worth its own answer.

### `--per-actor` measured, and round-robin is too blunt

`--per-actor` distributes K round-robin across the entity list (round-robin,
not K/|actors| each, so the total stays K and the mode cannot win on volume).
Actor spread at every node becomes uniform by construction. What that buys
and costs, read off `cont_red_peractor.json` at `red_woods`:

**Recovered** — alternatives unconditioned sampling never proposed:

    [the wolf]        Then the wolf lies in wait, and now the wolf is hiding
                      and has not yet moved into sight.
    [the woodcutter]  Then the woodcutter sees a figure approaching with a
                      basket, and now the woodcutter is watching Red …

**Cost** — actors forced into scenes they cannot be in:

    [Red's grandmother] Then Red's grandmother takes her in the woods and
                        tells her to run away …        ← she is at her house
    [Red's mother]      Then Red's mother is on the road back from visiting
                        her grandmother, and now Red is on the road back …

Round-robin spends 2 draws of 10 on an actor who cannot act at that node, and
the model complies by inventing a contradiction rather than refusing. So the
mode is right and its *schedule* is wrong.

**What the schedule wants is per-node actor availability, and the fact layer
already has it.** `effects` tracks `owner.location` — `red.location=woods`,
`grandmother.location=grandmother_house` — and `experiments/history_key.js`
already folds effects along a path last-write-wins. Co-location with the
scene is derivable, not new machinery. Left undone deliberately: it is a
design decision about what "available to act" means (co-located? aware?
alive?), and that is the human's call, not a default to pick quietly.

### Two smaller things found on the way

- **`action` can contain a bare "and now".** `SLOT_FORBIDDEN.action` blocks
  the separator `", and now "` but not the comma-less form, so
  `Then Red sees the wolf at the crossroads and now Red has seen a wolf …`
  parses with a two-clause action. **Deliberately not fixed**: GBNF cannot
  express "no such substring", so adding it to the forbidden list would make
  the grammar emit samples that `parse` then rejects — the exact
  grammar-versus-checker contradiction the `n_predict` and outcome-bound
  confounds already cost this work twice.
- One parse failure in 33 draws at `red_woods` (`action has leading or
  trailing space`). Parse rate 0.91 at that node, 1.00 at the other two.

---

## `--per-actor` graded (2026-09-10) — VERDICT RETRACTED, see the calibration result below

**The conclusion in this section is withdrawn.** It rested on comparing a
Claude-rated 14/30 against a human-rated 25/30, with the explicit claim that
"an 11-sample gap is far outside any plausible rater disagreement". The
agreement check run afterwards measured exactly that disagreement and it is
larger than the gap. Rescaled, 14/30 becomes ~23/30 against 25/30 — two
samples, inside noise. **`--per-actor` on red is unresolved, not negative.**
The section is kept because the measurement is on record and the reasoning
error is the point.

Claude-rated (uncalibrated — see the calibration section), 30 red samples,
`cont_red_peractor.graded.claude.json`:

| node | plausible | distinct actors among the plausible ones |
|---|---|---|
| red_woods | 3/10 | 2 |
| red_tell | 4/10 | 3 |
| red_flowers | 7/10 | 4 |
| **all** | **14/30** | — |

Against 25/30 for unconditioned red (human-rated, so the two figures are not
strictly comparable — but an 11-sample gap is far outside any plausible
rater disagreement, and the direction is not in doubt).

**On red, `--per-actor` is a net loss.** It costs eleven plausible samples
and buys roughly one extra actor: unconditioned red already spread over two
or three actors by itself (`red_woods` Red 6 / wolf 2 / grandmother 2). There
was little collapse to fix, so forcing mostly manufactured contradictions —
the grandmother acting from a house she cannot leave, the mother calling
across the woods, the woodcutter turning the path into a stream.

**On trojanHorse it was a clear win.** There the collapse was severe — 24 of
30 samples on "the Trojans", Cassandra never — and forcing recovered the told
story's own next event that unconditioned sampling missed 30 times.

The difference is the severity of the collapse, and that is measurable
*before* spending the samples: actor spread in an unconditioned batch. Red's
was 3 actors at 6/2/2; trojanHorse's was 2 actors at 9/1.

### What this cancels

**The per-node actor-availability filter is not needed and should not be
built.** The previous section proposed deriving "who can act here" from
folded `effects`, and left the definition of availability to the human. That
was refining a mode which, on the story where it was measured against a
graded baseline, should not have been running at all. Two further reasons it
was the wrong build:

- `effects` does not cover all actors anyway. `Red's mother` maps to no
  `owner` in the fact layer at all, so the worst per-actor sample at
  `red_woods` — the mother calling across the woods — would have survived the
  filter. Availability would first have required extending the seeds, which
  is hand-authoring on the ground-truth layer to serve a sampling mode.
- It would have been the third piece of apparatus in this work built ahead of
  the evidence for it, after the slot-clustering plan and the mechanical
  diversity proxy. All three were dissolved by grading or reading the output
  instead.

### What replaces it

Gate the mode on measured collapse rather than filtering its output: sample
unconditioned first, count actor spread, and re-sample per-actor **only for
the actors the unconditioned batch never proposed**. That spends the extra
draws exactly where the mass is missing, and on red it would spend almost
none. Not implemented — it is one clear step and it should be taken against a
calibrated rater, not this one.

---

## Rater agreement measured: Claude is NOT calibrated (2026-09-10)

Human graded the 15-sample stratified subset of the trojanHorse batch;
`grade.js --compare` against Claude's labels for the same samples.

    n = 15   observed agreement 67%   chance 52%   kappa 0.30
    human says plausible 87%    claude says plausible 53%
    disagreements  human=y / claude=n: 5     human=n / claude=y: 0

**Every disagreement runs one direction.** That is not rater noise, it is a
threshold difference, and it means the two raters were answering different
questions. The five Claude rejected and the human accepted:

    disregard(trojans, horse) — The Trojans are still standing around the
      abandoned horse, waiting for a decision to be made.
        → rejected as a NULL TRANSITION (nothing advances)
    ignore(trojans, sinon) — The Trojans have heard the warning but do not
      take any action, leaving the horse in the city.
        → rejected as CONTRADICTING STATE (no warning given yet at th_lie,
          horse not yet inside)
    Then the Trojans take the horse inside the walls, and now … the men are
      inside the horse ready to attack the Greeks when they return …
        → rejected as ROLE INVERSION (the men inside are Greeks)

The human answered the question as written — *could this happen next in this
story?* — and narratively, each could. Claude answered a stricter unwritten
question: *is this a well-formed, consistent, advancing next event?*

**The instrument is under-specified, and that matters more than the kappa.**
Both readings are defensible. The consequence is that Gate 0's passing
25/30 was scored under the loose reading while the failure taxonomy built
from the same file was written under the strict one — two different criteria
applied to one batch, in one document, without either being named.

### Everything Claude rated is now provisional

| figure | as rated | naive rescale at ratio 0.62 |
|---|---|---|
| red per-actor | 14/30 | ~23/30 |
| trojan unconditioned, sentence | 19/30 | ~31/30 |
| trojan unconditioned, json | 17/30 | ~28/30 |

Two of the three rescale to **above 30**, which is the linear patch failing.
It is a crude correction on 15 points, not a recalibration. **Do not use
either column as data.** The right fix is not a scale factor; it is to say
what the question means and re-ask it.

### What survives, because it is rater-independent

- Actor spread in unconditioned batches: trojanHorse 24/30 on "the Trojans",
  Cassandra 0/30 at the node where the told story has her speak; red 6/2/2.
- Actor-forcing recovers Cassandra's warning — mechanically the told story's
  own next event, no judgment involved.
- The `n_predict` cap confound, the outcome-bound truncation confound, and
  the free-text-vs-`schema(args)` dedup asymmetry. All mechanical.

### Next, and it is small

Split the plausibility question in two, since the disagreement shows both are
being asked at once:

1. *Could this happen next in this story?* (narrative possibility — the loose
   reading, the one the plan wrote)
2. *Is it consistent with what the history already established?* (state
   consistency — the strict reading Claude was applying)

That is one extra y/n per sample and it separates two failures the current
instrument sums together. Re-ask both raters on the same 15; if agreement on
each sharpened question is high, the earlier batches can be re-scored without
regenerating anything.

---

## The instrument, split and measured per question (2026-09-10)

`grade.js` now asks four questions instead of one conflated one, `--resume`
carries prior answers so re-scoring costs only the delta, and `--compare`
reports Cohen's kappa per question and flags one-directional disagreement
automatically. v1 graded files still read: `plausible` and `possible` are the
identical prompt string, so it is a rename, not a reinterpretation.

Human against Claude, same 15 samples:

| question | agreement | kappa |
|---|---|---|
| `consistent` — consistent with what the history established | 14/15 (93%) | **0.84** |
| `possible` — could this happen next | 10/15 (67%) | 0.30 |
| `toldStory` — the told story's own next event | 11/15 (73%) | −0.00 |
| `advances` — does it change anything | 5/15 (33%) | **−0.15** |

**`consistent` works.** One disagreement in fifteen, kappa 0.84. That question
is a usable instrument and it carries the state-contradiction signal — the
thing the failure taxonomy was actually about.

**`advances` scored worse than chance because the question was badly
written**, not because the raters disagree about stories. "Does it change
anything?" is ambiguous between *does the world state change* and *does this
deviate from the told story*. The human took the second reading and answered
"no change" to six samples of the Trojans bringing the horse in — while
marking those same samples `toldStory = yes`. Under that reading `advances`
and `toldStory` are the same question, which is exactly how agreement goes
negative.

**`toldStory` failed identically.** After `th_gift` the told next event is
Sinon selling the lie, not the horse entering, yet horse-entering samples were
marked yes — so it was read as "happens in the told story at some point"
rather than "is the immediate next node".

### The lesson, which has now cost three rounds

A grading question that does not say **what it is asking relative to** gets
answered against whatever referent the reader supplies, and two readers supply
different ones. Three times now:

1. `plausible` — possibility vs. well-formedness. Cost: a wrong `--per-actor`
   verdict, retracted.
2. `advances` — world state vs. deviation from the told story. Cost: kappa
   −0.15.
3. `toldStory` — immediate next node vs. anywhere in the told story. Cost:
   kappa 0.00 and four false "repeats".

Both prompts now name their referent in the text:

    does the WORLD change - is anything true after it that was not true before?
    is this the story's VERY NEXT event (not something it does later)?

**This also puts a caveat on Gate 0's told-story-repeat count.** Red's clean
`0/30 repeats` was scored under the ambiguous wording. If the human was
reading it as "anywhere in the told story", the true immediate-next-node count
is 0 or lower — harmless. If the reverse, some repeats were missed. It cannot
be recovered without re-asking, and it is cheap to re-ask with `--resume`.

### `advances` may not need a human at all

Its purpose is to catch null transitions, and `growth.js` already refuses
those mechanically — a continuation matching its source in both `expr` and
`state` advances nothing, as an edge-validity rule. If the reworded question
still disagrees, the answer is to derive it rather than ask it, and drop the
question. Do not keep asking a human for something the engine computes.

---

## `--resume` bug: answers carried across a rewording, and a graded file corrupted (2026-09-10)

After `advances` and `toldStory` were reworded, the human ran the resume
command and it asked nothing. Cause: resume matched prior answers by question
**key**, not by the prompt they answered. The file already held answers for
all four keys, so all four carried — and because the output path *is* the
resume path, the run overwrote its own source and stamped the manifest with
the new wording. The file then claimed its `advances`/`toldStory` answers were
given to prompts they had never been asked under. The mistake the
`plausible`→`possible` rename was carefully built to avoid, made one layer
down.

**Repair.** `cont_trojan_calib_subset.graded.json`'s `manifest.questions` was
restored to the wording its answers were actually given under (`advances`:
"does it change anything?", `toldStory`: "is this the told story's own next
event?"), with a `manifest.repair` note. Evidence the answers are the old
ones: `resumedFrom` is the file itself, and the yes-rates (advances 5/15,
toldStory 4/15) are exactly the ones the kappa −0.15 report was computed from.
Pre-repair copy at `/tmp/cont_trojan_calib_subset.graded.before-repair.json`.

**Fix.** `answersByKey` now returns each answer together with the prompt it
answered (from `manifest.questions`, or `V1_PROMPTS` for v1 files, which never
recorded theirs). `carryForward` reuses an answer only if its prompt equals
today's; otherwise the answer is kept on the row under `superseded` — history,
never reused — and the question is asked again. `--compare` refuses to score
agreement between answers to different wordings. And in `--labels` mode, a
`null` placeholder that fails to carry now throws instead of becoming `false`
through `Boolean(null)` — the same class of silent miscoding, found while
fixing it. `tests/grade.test.js` pins the carry rule; `npm test` → 100 pass.

Claude re-graded `advances` and `toldStory` on the 15 under the new wording
**before** the human's re-answers exist, labels in
`labels_trojan_subset_v3.claude.json`.

---

## Rewording measured: three of four questions now agree (2026-09-10)

Human re-answered `advances` and `toldStory` on the 15 under the reworded
prompts (`--resume`, 30 answers); Claude had re-graded them blind beforehand.

| question | before rewording | after |
|---|---|---|
| `consistent` | 93%, kappa 0.84 | unchanged |
| `advances` | 33%, kappa −0.15 | **87%, kappa 0.58** |
| `toldStory` | 73%, kappa 0.00 | **93% raw** (kappa degenerate, below) |
| `possible` | 67%, kappa 0.30, one-directional | unchanged |

**`advances` was fixed by naming the referent.** The two remaining
disagreements run in *opposite* directions — no threshold bias — and both are
JSON samples whose expr and state say different things:

    ignore(trojans, sinon) — … do not take any action, leaving the horse in the city.
    decide(trojans, against) — The Trojans continue to doubt and let the horse remain outside.

An inaction expr with a state asserting a change, and a decision expr with a
state describing the status quo. The rater has to choose which half to read.
That is the JSON arm's known expr/state inconsistency (§8), surfacing through
the instrument rather than a defect in it.

**`toldStory`'s kappa of 0.00 is a statistics artefact, not disagreement.**
Both raters say "no" to nearly everything (human 1/15, Claude 0/15), so chance
agreement is 93% and kappa has nothing to work with. Raw agreement, 14/15, is
the reading. The one disagreement — "the Trojans take the horse into the
city" at `th_seer`, where the told next event is the warning being set aside —
is defensible either way: taking the horse in *is* setting the warning aside.

**`possible` is the only question still split one way**, and it is the plan's
original question. It is also the least informative one: the human says yes
to 13 of 15. The separation between the arms lives in `consistent` and
`advances`, not in the question Gate 0 was written against.

### First human-rated `usable` figures (tiny n — a hypothesis, not a result)

| rater | sentence usable | json usable |
|---|---|---|
| human | **7/8** | **0/7** |
| Claude | 6/8 | 2/7 |

Both raters put the arms in the same order, the human more starkly. Eight and
seven samples on one story, two of whose three nodes are memorization-heavy,
is nowhere near enough to call. But this is the first time the A/B has been
read through the column that approximates what `growth.js` would actually
accept, and the gap is wider there than in any plausibility figure so far.

### Rater status

Claude agrees with the human on `consistent` (kappa 0.84) and moderately on
`advances` (0.58), on n=15. That supports using Claude as a **pre-screen** on
those two questions with human spot-checks, not as a replacement, and not on
`possible` at all. Fifteen samples is thin; the next batch should re-check it.

---

## Rater decision (2026-09-10)

The human reviewed the calibration results and determined the disagreements
came from their own misreading of the questions, not from Claude's grading.
**Claude's grading is the reference rater from this date.** Claude-rated
figures earlier in this file (trojanHorse 19/30 and 17/30, red per-actor
14/30) stand as rated; the "naive rescale" column is void.

The one retraction that survives the decision is the `--per-actor` verdict,
and for a different reason than the one given at the time: it compared a
Claude rating against a human rating, two raters on two sides. It is
re-established below with one rater on both sides.

---

## `--per-actor` re-established with one rater (2026-09-10)

Both batches Claude-rated, four questions, red, same three nodes.
`usable` = possible ∧ consistent ∧ advances.

| | usable | red_woods | red_tell | red_flowers |
|---|---|---|---|---|
| unconditioned (`cont_red_outcome170`) | **15/30** | 7 · {Red, wolf} | 4 · {wolf} | 4 · {Red, wolf} |
| per-actor round-robin (`cont_red_peractor`) | **14/30** | 3 · {Red, wolf} | 4 · {woodcutter, Red, grandmother} | 7 · {woodcutter, Red, mother, wolf} |

(cells: usable count · distinct actors among the usable samples)

**Same yield, broader coverage.** One sample fewer, and the actors behind the
usable continuations go from 2/1/2 to 2/3/4 per node. On trojanHorse the
coverage gain was larger and included the told story's own next event. So
actor-forcing is non-negative on every node measured; the "net loss" verdict
stays retracted and is now replaced by this.

Other columns, for the record: consistent 22 vs 16 — forcing costs
consistency, as expected when absent actors are made to act — and advances
25 vs 29, since forced actors rarely produce the "Red thinks about her
grandmother" non-events unconditioned sampling does.

**Where the waste is.** Forced `Red's grandmother` and `Red's mother` draws
were nearly all unusable (the grandmother acting from a house she cannot
leave, the mother calling across the woods). Forced `the woodcutter` was the
most productive actor in the batch. Round-robin spends equally on all of
them. Hence the gated mode below: sample unconditioned first, force only the
actors the unconditioned batch never produced.

---

## `--fill-actors` measured: the gate recovers the told next event where sampling collapses (2026-09-10)

Draw K=10 unconditioned; for each entity that never appeared as actor, draw
2 forced samples. Run seed 11, both stories, Claude-rated, four questions.
`cont_red_fill.json`, `cont_trojan_fill.json`, graded `.graded.claude.json`.

| | unconditioned | fill | actors behind usable samples, per node |
|---|---|---|---|
| trojanHorse | 19/30 usable, 30 draws | **+5 usable, 10 draws** | 1→3 · 1→2 · 2→3 |
| red | 22/30 usable, 30 draws | +5 usable, 17 draws | 2→2 · 1→3 · 2→3 |

**The told story's own next event.** Unconditioned sampling missed it at
`th_gift` (Sinon selling the lie) and `th_lie` (Cassandra's warning); the
fill recovered both. Cassandra was absent from the unconditioned batch at
all three trojanHorse nodes. On red the unconditioned batch already
contained the told next event at two of three nodes, and the fill only
widened coverage.

Per draw the fill is less productive than unconditioned sampling (red 0.29
vs 0.73, trojanHorse 0.50 vs 0.63). That is the expected shape: it spends
draws on what the sampler finds improbable, and it is judged by what it adds
that unconditioned sampling does not produce at any volume — coverage and
the told next event — not by yield.

### Where the waste is, now measured

Usable / forced, per actor, both stories pooled:

    Red's mother 0/4   Red's grandmother 0/4   the Greeks 0/2      → 0/10
    the woodcutter 4/6   Cassandra 3/6   Sinon 2/2   Red 1/2       → 10/16

Every zero-yield actor is one the history places somewhere else: the mother
at home, the grandmother at her house, the Greeks sealed inside the horse.
Every productive one is either in the scene or not yet placed anywhere (the
woodcutter, Cassandra, Sinon). This is the actor-availability signal the
earlier section proposed and then cancelled — cancelled correctly at the time,
because it was speculation; it is now a measured 0/10 against 10/16.

The fact layer covers only one of the three cases: `greeks.location=
inside_horse` is in `effects` at `th_hide`, but nothing records where Red's
mother or grandmother are before events move them. An exclusion rule would
need that authored, and it would save about 10 draws across these six nodes.
Worth doing if the fill goes into the grower; not worth doing for the probe.

---

## Stage 1 bridge: frames through the grower (2026-09-10)

Built: `grower.growGraph` takes an optional `proposer` (the client + template
path is the default and unchanged — the JSON source's canonical JSON does not
move); `frame_proposer.js` is the frames candidate source (6 unconditioned
draws + 1 forced draw per missing actor, 3 offered, distinct actors first);
`tools/eval.js sweep --sources model,frames` runs it through the same
traversal. `npm test` covers the proposer and the hook with a stubbed
transport.

Sweep: all three stories, depth 2 / width 2 / max 8, seed 7, `--replay`,
profile `qwen3-4b-cuda`.

```
┌─────────┬──────────────┬─────────────┬───────────────┬───────┬───────────┬─────────┬────────┬─────────┬───────┬────────┬───────────┬──────────────────┬────────────┬────────┐

│ (index) │ source       │ prompt      │ story         │ grown │ jsonValid │ acyclic │ nullTx │ dupExpr │ merge │ rejoin │ diversity │ rankSpread       │ contradict │ replay │

├─────────┼──────────────┼─────────────┼───────────────┼───────┼───────────┼─────────┼────────┼─────────┼───────┼────────┼───────────┼──────────────────┼────────────┼────────┤

│ 0       │ 'baseline'   │ '—'         │ 'red'         │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 1       │ 'baseline'   │ '—'         │ 'criedWolf'   │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 2       │ 'baseline'   │ '—'         │ 'trojanHorse' │ 4     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=3)' │ 0          │ 'OK'   │

│ 3       │ 'model'      │ 'branch.v2' │ 'red'         │ 5     │ 1         │ 1       │ 0      │ 0.2     │ 0.167 │ '—'    │ 1         │ '1 (n=3, max=3)' │ 0          │ 'OK'   │

│ 4       │ 'baseline@5' │ '—'         │ 'red'         │ 5     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=4)' │ 0          │ 'OK'   │

│ 5       │ 'model'      │ 'branch.v2' │ 'criedWolf'   │ 5     │ 1         │ 1       │ 0      │ 0       │ 0.167 │ '—'    │ 1         │ '1 (n=3, max=3)' │ 0          │ 'OK'   │

│ 6       │ 'baseline@5' │ '—'         │ 'criedWolf'   │ 5     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=4)' │ 0          │ 'OK'   │

│ 7       │ 'model'      │ 'branch.v2' │ 'trojanHorse' │ 4     │ 1         │ 1       │ 0      │ 0       │ 0.333 │ '—'    │ 1         │ '1 (n=3, max=3)' │ 0          │ 'OK'   │

│ 8       │ 'baseline@4' │ '—'         │ 'trojanHorse' │ 4     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=3)' │ 0          │ 'OK'   │

│ 9       │ 'frames'     │ 'frames.v1' │ 'red'         │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 10      │ 'baseline@6' │ '—'         │ 'red'         │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 11      │ 'frames'     │ 'frames.v1' │ 'criedWolf'   │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 12      │ 'baseline@6' │ '—'         │ 'criedWolf'   │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 13      │ 'frames'     │ 'frames.v1' │ 'trojanHorse' │ 6     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=5)' │ 0          │ 'OK'   │

│ 14      │ 'baseline@6' │ '—'         │ 'trojanHorse' │ 4     │ 1         │ 1       │ 0      │ 0       │ 0     │ '—'    │ 1         │ '0 (n=2, max=3)' │ 0          │ 'OK'   │

└─────────┴──────────────┴─────────────┴───────────────┴───────┴───────────┴─────────┴────────┴─────────┴───────┴────────┴───────────┴──────────────────┴────────────┴────────┘

```

**Replay: OK on every row, frames included.** Temperature 1.0 on CUDA with a
derived seed per draw replays byte-identically cache-cold. The substrate
caveat in `serve_reference.sh` stands (not bit-comparable to the CPU
profile), but within the CUDA profile growth is reproducible.

**On the table the frames rows have the baseline's shape**: merge 0, rank
spread 0, layer-uniform in-degree. That is **by construction, not a finding
about narrative**. Frame-grown exprs are free text and seed exprs are
`deed(args)`, so nothing a frame source grows can collide with anything, and
merge-on-insert never fires. The pre-registered falsification metric reads
convergence, and this source cannot converge under the current content key.
The JSON model rows get rank spread 1 exactly because they emit seed-format
exprs that collide.

### Read, not scored: grown frames are worse than probed frames

The 18 frame-grown nodes, read against the Stage 0 probe:

| | probe (bound 170) | grower round 1 | grower round 2 |
|---|---|---|---|
| mean outcome length | 91 chars | 132 | 124 |
| outcome at the 170 bound | 1/30 | 1/6 | 3/12 |
| history lines in the prompt | 3–7 | 1 | 2 |

Samples at the bound are cut mid-word with a legal "." — "…and she knows
that she cannot a.", "…which is,." Plus one foreign-script leak in 18
("…the boy is lying on the hillside and the村民们" — Chinese for "the villagers";
the grammar's `[^,.\n]` class admits any Unicode) and one verbatim
regurgitation of a seed frame (criedWolf's root sentence, grown two levels
down).

**It is not a feedback loop.** That was the first hypothesis — verbose grown
outcomes becoming the next expansion's history — and the numbers refute it:
round 2, whose parents average 132-char outcomes, is no longer than round 1,
whose parent is an authored 78-char outcome. The verbosity is present before
any grown text enters the history.

**It is context.** `frames.v1` shows only the ancestor path; `branch.v2`
shows the whole told story *and* the path. At the root the frame source sees
one line while the JSON source sees the full story. The probe ran at
mid-story nodes with 3–7 authored lines, where the asymmetry was masked. The
eval sweep grows from the root for every source, which puts the frame source
at its weakest point — and makes the table a comparison of context as much as
representation.

### Parse failures under the grammar: the grammar/validator gap, a fourth time

10 of 74 draws unparseable under the grammar, and every reason is a slot the
grammar permits and `Frames.validate` forbids:

- `outcome has leading or trailing space` (4) — the outcome hit the bound
  mid-word after a space, and the grammar forced "." onto it: `…when she gets .`
- `outcome contains reserved ", and now "` (3) — a second event chained into
  the outcome; the outcome class only excludes "." and newline.
- `action has leading or trailing space` (3) — `…the villagers are on , and now`.

These are refusals rather than silent garbage, which is the safe direction —
but they are the same class of defect as the `n_predict` cap and the outcome
bound: a rule the checker enforces that the generator is not constrained by.

---

## frames.v2 and the tightened grammar, measured apart (2026-09-12)

Two changes were made together because both move every cache key, and they
turned out to do entirely separate things. The 2x2, all Claude-measured,
depth 2 / width 2 / max 8, seed 7, all three stories:

| | unparseable draws | mean outcome | at the 170 bound | verbatim seed frames |
|---|---|---|---|---|
| frames.v1 + loose grammar | 10/74 | 128 | 4/18 | 1/18 |
| **frames.v1 + tight grammar** | **0/72** | 127 | 5/18 | 1/18 |
| frames.v2 + tight grammar | 0/80 | 60 | 0 | **16/17** |

### The grammar fix works and is kept

The slot class is now `[a-zA-Z0-9']`, with a slot's first and last character
required to be a non-space (`edge mid{0,N-2} edge`). Every one of the four
parse-failure classes the bridge produced is now unreachable rather than
checked-for: foreign script, leading/trailing space, a second `", and now "`
inside `outcome` (which cannot occur because `outcome` cannot contain a
comma), and the stray space a bound-hit used to leave before the terminator.
Authored slots are unaffected — across 36 hand-written frames the only
non-alphanumeric characters used are the space and the apostrophe, and no
authored outcome contains a comma. `tests/frames.test.js` pins both
directions: the class admits every authored slot, and nothing the grammar can
emit is something `validate` rejects.

This is the first time in this work that a generator/checker mismatch has
been closed at the generator rather than absorbed as a measured failure rate.

### frames.v2 is rejected: the told story turns the generator into a copier

v2 gave the frame source the context `branch.v2` has always given the JSON
source — the told story's frames plus the path. **16 of 17 grown nodes came
back as verbatim copies of seed frames.** The apparent gains are artifacts of
exactly that: mean outcome 60 chars because it is reciting authored prose,
zero bound hits for the same reason.

Worse, it moved the eval table for a degenerate reason. Under v2 the frames
rows finally showed merges (0.167–0.333) and rank spread 1 — the JSON model
rows' signature — because the same copied seed sentence was proposed at two
expansion points and collided with itself. Those copies still cannot merge
*into* the seed nodes (`deed(args)` vs frameExpr), so they are duplicate
shadows of the told story hanging off branch points: they inflate the
convergence metrics while adding nothing to the graph.

`frames.v1` is the default again. v2 is kept, never deleted, per the prompt
versioning rule.

### What this does and does not settle

It settles that the frames rows' flat, baseline-shaped eval numbers are not
fixable by giving the source more context.

It does **not** settle the verbosity finding. The bridge's grown outcomes
average 127 chars against the probe's 91, and the standing hypothesis was
that the probe ran at mid-story nodes (3–7 history lines) while the grower
expands from the root (1–2). v2 was not a test of that: it supplied more
context and got copying, so the mid-story question is still open. Testing it
needs the grower started from a mid-story node, which the eval harness does
not currently expose (`evalRun` always uses `seeds[story].root`).

---

## The grower/probe quality gap was the START NODE (2026-09-12)

`--from` exposed on the eval sweep (single `--stories` only — a node id
belongs to one story). Frames source, tight grammar, frames.v1, depth 2 /
width 2 / max 8, seed 7, all three stories; mid-story starts are the probe's
own middle nodes (`red_tell`, `cw_laugh`, `th_lie`).

| start | n | mean outcome | at the 170 bound | history lines |
|---|---|---|---|---|
| root (every recorded sweep) | 18 | 127 | 5/18 | 1–2 |
| **mid-story** | 18 | **83** | **0** | 4–6 |
| probe, for reference | 30 | 91 | 1/30 | 3–7 |

**Confirmed, and it was neither the representation nor a feedback loop.**
With four or more history lines the frame source writes in the authored
register and stops running into the length bound entirely. The bridge looked
worse than the probe because the eval harness starts every source at the
root, where the frames prompt has one sentence to imitate.

**This is a harness asymmetry, not a fair default.** `branch.v2` renders the
whole told story regardless of where the traversal starts, so the JSON source
is insensitive to start depth; `frames.v1` renders only the ancestor path, so
it is maximally handicapped at the root. The default is left at the root
anyway — every recorded run used it, and flipping it would silently
reinterpret them — but no frames-vs-model comparison grown from the root
should be read as a comparison of representations.

### What mid-story growth actually looks like

Format fixed, semantics not. Reading the 18 nodes: the register is right and
nothing hits the bound, but state contradictions are as common as before —

    Then Red's mother calls for help …            ← she is at home, not in the woods
    Then the Greeks drag the horse inside the walls …  ← the Greeks are inside the horse
    Then Sinon tells them he will stay with the horse until the following
    morning, and now the Trojans have brought the horse inside the walls and
    Sinon waits with it outside the gates at night.    ← inside and outside at once

That is the `consistent` failure the graded batches already measured, and it
is untouched by any of the last three changes. It is a property of the model,
not of the boundary.

Metrics unchanged and still uninformative for this source: dupExpr 0,
merge 0, spread 0 at every mid-story node. Free-text exprs do not collide, so
there is nothing for merge-on-insert to find.

---

## Convergence: the key was never the blocker (2026-09-12)

`experiments/frame_merge.js` + `prompts/same.v2.txt`. The frames source cannot
converge under `defaultContentKey` — seed exprs are `deed(args)`, frame exprs
are free text, nothing collides — so this asks whether a model-judged content
key would find merges that the string key cannot. `sameInContext` already
takes `contentKey` as a parameter and its header names this exact case, so
this is the sanctioned extension point, not a new mechanism.

**Report-only, and deliberately not wired into `growth.js`.** Plan v3:
"Unattended auto-merge stays off (the false-merge finding stands)." The judge
proposes; a human disposes. `--apply` previews what the merges would do to a
graph in memory and writes nothing.

**The judge has a startup control that ABORTS on failure.** A judge that has
gone degenerate — "different" to everything — is indistinguishable from a
graph with nothing to merge, and the second is the result this tool exists to
report. Four pairs, both directions (identical, paraphrase, actor swap, extra
fact): **4/4**, so it discriminates.

The frame analogue of `same_state.js`'s argument guard is the actor: two
events with different actors are not the same event. It can only turn "same"
into "different", so it cannot invent a merge.

### Result: zero merges, and the zero is real

| budget | grown | parallel pairs | grown-seed among them | proposed merges |
|---|---|---|---|---|
| depth 2 / width 2 / max 8, red | 6 | 65 | 54 | 0 |
| depth 2 / width 2 / max 8, criedWolf | 6 | 53 | 42 | 0 |
| depth 2 / width 2 / max 8, trojanHorse | 6 | 47 | 36 | 0 |
| depth 3 / width 3 / max 24, red (grown-grown only) | 24 | 243 | — | 0 |

**The grown-seed pairs were added after a first pass measured only
grown-grown, and that first pass answered a narrower question than the one
that matters**: the JSON boundary earned its convergence as grown->SEED
edges, by emitting a seed's own expr. A grown node and a seed further down the
told story are incomparable — the grown node has no edge back to the spine —
so the predicate would accept them if the key said yes. With 132 grown-seed
pairs included the answer is unchanged: zero.

Not one pair of 408 judged the same. Not judge strictness: ranking the eight
most lexically similar parallel pairs and reading them, **the judge is right
on all eight** — they are different events that share vocabulary.

**So the richer content key is not what the frames source was missing.** It
does not converge because it never proposes the same event twice, not because
the key cannot see that it did. Each expansion dedupes its own pool and
prefers distinct actors, and different branch points carry different
histories, so the grown object is a tree that never rejoins.

That reframes the open item. Convergence for this source has to be INDUCED
structurally, not detected in content — and the JSON boundary already has the
mechanism: `branch.v2` carries `rejoinTargetId`, validated and dropped when
invalid, which is how the JSON source got its first grown→seed edges. The
frames boundary has no rejoin mechanism at all. That is the gap, and it is a
representation gap, not a key gap.

### A feedback effect does exist, starting at two grown history lines

The earlier "it is not a feedback loop" was measured at depth 2, where a
history can hold at most one grown line. At depth 3 it can hold two:

| grown lines in history | n | mean outcome | at the bound | repeated-bigram fraction |
|---|---|---|---|---|
| 0 | 3 | 87 | 0 | 0.00 |
| 1 | 9 | 84 | 0 | 0.00 |
| 2 | 12 | 103 | 1 | **0.06** |

Authored corpus: 0.00. The failure is visible in the prose before it is
visible in the mean —

    …and now the wolf is outside the door and Red is inside it and the wolf is
    outside the door and Red is inside it and Red is in the house and the wolf
    is not and Red is in the room.

The model imitates its own repetition once enough of its own text is in the
window. n = 12 and the effect is small, so this is a signal to watch at depth
4+, not an established curve — but the earlier claim was scoped to depth 2 and
should not be carried past it.

---

## Rejoin by closed enum: validity solved, correctness not (2026-09-12)

`prompts/rejoin.v1.txt` + `--frames-rejoin`. After a candidate frame is
chosen, one extra constrained draw asks which told event the alternative
leads back into, or NONE. **The alternatives in the grammar ARE the rendered
nodes**, so an invalid target is unreachable rather than validated-and-dropped
— the same closed-enum lever the actor slot already demonstrated.

Motivated by two measurements, not by design taste: the frames source never
converges by content (408 parallel pairs, zero same), and `branch.v2`'s
free-text `rejoinTargetId` measured **rejoinValidity 0** — every rejoin it
ever attempted named a node that did not exist.

| | branch.v2 (free-text id) | frames + rejoin.v1 (enum) |
|---|---|---|
| rejoinValidity | 0 | **1.0** |
| dropped rejoins | all attempted | 0 |

Three stories, mid-story starts, depth 2: 18 candidates, 18 asked, 10 named a
target, 8 NONE. The in-degree histogram gains 2s and 3s — the grown object is
no longer a tree.

**Correctness is a different question, and it is not solved.** Reading all 10:
3 are right, 2 are marginal, 5 are wrong. The good ones are genuinely good —

    FROM Then Red says that the wolf is the quickest runner she has ever seen …
    INTO [red_grandma] Then the wolf runs ahead and reaches the house first …

and the wrong ones fail in the way everything else in this work fails, on
**state consistency**, not on structure:

    FROM … and now Red has arrived and the wolf is waiting behind the door …
    INTO [red_leave] Then Red steps off the path into the trees …

`red_leave` is topologically legal — it is ahead of the branch point in the
told story — but Red has already arrived in the alternative, so the world the
rejoin lands in contradicts the world the branch left. The enum fixes *which
ids are nameable*; it cannot fix *which world the model thinks it is in*.

Two things to decide before this goes further:

- **3 of 10 rejoins targeted GROWN nodes, not seeds.** Every framed node the
  source cannot reach is offered. A branch rejoining another branch is a
  legitimate convergence, but it widens the enum with model-written text and
  makes the target set depend on traversal order. Restricting targets to seed
  nodes is a one-line change and a real design choice.
- **A seed source on a linear spine has no legal target at all** — every other
  node is its ancestor or descendant. Rejoin is therefore only ever available
  from grown nodes. That is correct behaviour and worth knowing before anyone
  reads a zero at depth 1.

---

## Next config, and why this one

0. **Re-score red's Gate 0 batch on the full instrument** — the only batch
   with n=60 and both arms. `--resume` from the human's v1 file carries
   `possible` only (its `toldStory` was asked under the old wording), so it is
   180 answers. Claude cannot take `consistent`/`advances` for this batch: its
   failure taxonomy was a consistency classification of these exact samples,
   so its labels there are contaminated.
1. **Run the agreement check.** Human grades the 15-sample subset
   (`cont_trojan_calib_subset.json`), then
   `node experiments/grade.js --compare cont_trojan_calib_subset.graded.json cont_trojan_calib.graded.claude.json`.
   Until that number exists, every Claude-rated figure in this file is
   provisional. If agreement is high the rating cost of every later batch
   drops to near zero, which is what unblocks corpus-scale work; if it is
   low, that is the finding and it cost 15 answers.
2. **Fix the duplicate key before any Stage 1 clustering** — one arm dedups
   free text, the other `schema(args)`, so cross-arm duplicate rates are not
   comparable. Note this is now a *smaller* problem than it looked: at a
   forced-move node there is nothing for a better key to find.
3. **Re-grade red at bound 170** — only 8 of 30 samples are new, so this is
   cheap, and it converts the "25/30 is a floor" caveat into a number.
4. **Do not read the trojanHorse plausibility figures as a story comparison.**
   Its next event is famous enough that the model returns it ten ways;
   whatever that batch measures, it is not the same thing red measured.

---

## Open, in the order it blocks things

1. **Claude is measured and NOT calibrated** (kappa 0.30, one-directional).
   Every Claude-rated figure is provisional, including the retracted
   `--per-actor` verdict. Blocks unsupervised grading until the question is
   split and re-asked.
2. **The duplicate key is not comparable across arms** — free-text
   `frameExpr` vs compact `expr`. Blocks Stage 1 clustering and invalidates
   every cross-arm duplicate-rate comparison so far.
3. **Model size is not isolated.** The 4B profile exists and works, but it
   moves size and backend together. Isolating size needs the 4B on CPU or the
   1.7B on CUDA — the second is cheap now that `build-cuda/` exists.
4. **Stage 2's logprob distance has an unresolved implementation risk.**
   llama-server does not return prompt-token logprobs in one call; verify the
   endpoint before budgeting N×K scoring calls. Untouched here.
