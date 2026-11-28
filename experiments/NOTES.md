# Continuation generation — running notes

A running log, newest section last. Every config that produced a number is
written down, because a number without its config is not a result.

Everything measured on base models (2026-08-31 to 2026-10-04: frames, grading,
branch.v1–v6, the route judge's calibration on 22 labelled merges) is in
`ARCHIVE_base_models.md`. The code it describes was deleted on 2026-11-02 and is
in git at `5188d1f`. Read it for the failure taxonomy, not for numbers: none of
them were measured on the current model or prompts.

---

## 2026-11-02: base models retired, chat model in (Nemotron 3.5 Bolt E4B)

Everything in `ARCHIVE_base_models.md` was measured on base models (qwen3/smollm2) with document
prompts and is kept as the record. The code it refers to (`continue_probe.js`,
`grade.js`, `gen_probe.js`, `eval.js`, `same_judge.js`, `prompts/branch.v*`,
`experiments/out/`, the response cache) was deleted on this date; it is all in
git at `5188d1f` except `cache/` and `runs/`, which were never tracked.

The model: `NVIDIA-Nemotron-3.5-Bolt-E4B-UD-Q4_K_XL.gguf`, 5.06 GB, Gemma 4 chat
template with a thinking channel, on the existing llama.cpp build (f5b9bd3), all
layers on the 6 GB RTX 3000.

**Throughput, total tok/s by concurrent requests** (real prompt, thinking off):
1 → 21–27, 4 → 43, 8 → 70, 16 → 90–150, 24 → 165, 32 slots do not load. So 16
slots. It varies between runs with temperature; `nvidia-smi` shows the graphics
clock at 600–950 MHz of a 2100 maximum under load, in P2. Not investigated: it is
a machine setting.

**What did not help:** GBNF grammars (slower, 48 vs 66 tok/s at 8, and without an
example in the prompt a forced mid-word start ran away into one 300-char "word"; a
chat model follows a stated format on its own, zero malformed lines in hundreds);
`backend_sampling` and a shorter sampler chain (no change); `--batch-size 1024`
(no change).

**What did:** the cost is prompt evaluation, about 500 tok/s total, and it stalls
every running generation.
- Output format from four labelled fields to `event | state`, dropping the formal
  `verb(args)` nothing downstream reads, and exprs out of the prompt's path.
- Judge asks one order, routes from where they part. AUC on the 22 labelled merges
  of 2026-10-04: whole routes both orders 0.79, one order 0.74, parted routes one
  order **0.90**, at half the tokens; at P ≥ 0.5, 6 true and 0 false.
- Judge calls off the insert path: they were serialized behind a lock and 16 workers
  queued behind it. Optimistic instead (synchronous re-check before insert).
- Merge proposals by event words, not state words; state similarity ≥ 0.2 as a
  second bar dropped a quarter of the calls and none of 23 confirmed merges.

Result: 60 nodes from `red_woods` went 115 s → 35 s.

**The critic (prune) is off by default.** One more call per expansion, and on read
it cut good events ("Red decides to skip the path and follow a stream": contradiction)
and missed static ones ("A bird flies overhead"). Selectable in the Lab.

**Known weaknesses.** States drift: the model reads only the latest state, so a
fact can come back ("Red has abandoned the basket" … "carrying the basket").
Merge precision reads well by eye but the only labels are the 22 base-model cases.

### Runs from `red_woods`, 16 slots (2026-11-02)

| depth / width / beam / cap | merge | nodes | merged | refused | max depth | endings | time | nodes/s |
|---|---|---|---|---|---|---|---|---|
| 12 / 4 / 24 / 400 | off | 400 | 0 | 0 | 7 | 18 | 107 s | 3.73 |
| 12 / 4 / 24 / 400 | on, before limits | 400 | 26 | 373 | 7 | 24 | 306 s | 1.31 |
| 12 / 4 / 24 / 400 | on, tightened | 400 | 21 | 155 | 7 | 25 | 219 s | 1.83 |
| 16 / 3 / 8 / 300 | on, tightened | 300 | 14 | 103 | 16 | 60 | 204 s | 1.47 |

Depth 8 / width 3 / beam 12 / cap 150, before limits: Red 110 s (5 merged, 102
refused), Wolf 117 s (10, 87), Troy 74 s (2, 27).

**The judge is the main cost of merging on.** Judging took 65% of the 400-node run.
Over 674 judged pairs from five runs, merge rate does not rise with label similarity:
7% at ≥ 0.5, 10% at exact label. 163 exact-label pairs were judged and 16 merged, so
the refusals are mostly the same event on a different route, as designed.

Two limits came from those traces: label bar 0.5 → 0.6 (the band held 250 calls and 10
merges; of the 7 listed at exactly 0.5, read by eye, most were false: "The boy thanks
the villagers" into "The boy apologizes to the villagers"), and one judged target per
candidate instead of two (the top proposal held 38 of 45 merges). Result: 399 → 176
calls (56% fewer), 26 → 21 merges, 306 → 219 s. Judging is still about half the run. False merges remain ("The woodcutter binds the
wolf's wound" into "binds the wolf's legs", P 0.99). Merge precision has no labels on
this model.

Width and beam spend the node cap before depth: beam 24 stopped at depth 7 of 12, beam
8 reached 16 of 16. Throughput with merge off is 93 tok/s, the low end of the 90–150
measured on full slots; with merge on, 48.

---

## 2026-11-28: merging on the world, not the route

**What was wrong.** The route judge (`prompts/same.chat.txt`) answers "no when a
main event happened in one telling and not in the other". Two different routes
into one situation, the convergence INTUITIONS §5 is about, are refused by that
rule. The traces agreed: over 674 judged pairs, refusals were "mostly the same
event on a different route, as designed". What merged was paraphrase dedup. The
route judge also cost 50–65% of a run.

**What replaces it (merge mode `facts`, the default).** The expansion line is
`event | changes`, the changes being `owner.property=value` facts, the format the
seeds' `effects` already used (and no code read). The grower folds them along the
path (`facts.js`), and the prompt shows the folded world instead of the last prose
state, so a fact cannot silently drop out between steps (the drift of 2026-11-02).
Then, per candidate:

1. Its world equals its source's: a null transition, refused.
2. Its world equals an indexed node's, off its own route: a `rejoins` edge, no
   model call (`mergedOnFacts`).
3. Its world equals a node on its own route: a return to an earlier world, kept
   as a new node (an edge back would be a cycle), counted as `recurrences`.
4. Its world is 1–2 facts from a node's (`NEAR_FACTS`): one call to the future
   judge (`prompts/future.chat.txt`): can the same things happen next in A and in
   B? It sees the shared facts once and each side's last event and own facts. It
   does not see the routes.

Mode `routes` keeps the old judge for comparison; `off` is a plain tree. New
counters: `mergedOnFacts`, `mergedByJudge`, `judgeCalls`, `recurrences`,
`withoutFacts`, `convergent` (nodes with more than one way in at the end).

**What this predicts, before any run.** Exact world matches will be rare at
first, because the model will drift its vocabulary (`red.scared` vs
`red.afraid`). Showing the folded world in every prompt is the lever against
that; the future judge with `NEAR_FACTS = 2` covers one renamed fact. If
`mergedOnFacts` stays near zero over a 100-node run, the vocabulary is the
problem, and a closed key list per story is the next step. If it is high and
merges read wrong, the facts are too coarse (they leave out what matters), and
the fix is in the prompt, not in a threshold.

**Seed fact layer, first use.** Folding the seeds: every node of Red (19) and
Troy (15) has its own world. In criedWolf, `cw_laugh` and `cw_run2` fold to the
same world (villagers at the flock, trust `reduced`). They are on one route, so
it is a recurrence, not a merge, but it shows the authored facts do not record
how many times the boy has fooled them.

### First runs (2026-11-28, Nemotron 3.5 Bolt E4B, 16 slots)

From `red_woods`, depth 8 / width 3 / beam 12 / cap 150, temperature 0.8.

| mode | run | nodes | merged (on facts / judged) | judge calls | null | malformed | convergent | endings | expansions | time |
|---|---|---|---|---|---|---|---|---|---|---|
| facts | run_056902c6ba4c4bcc | 57 | 12 (4 / 8) | 43 | 9 | 8 | 9 | 14 | 27 of 50 | 50 s |
| routes | run_2f5f21a20c252148 | 150 | 6 (0 / 6) | 33 | 19 | 0 | 6 | 30 | 59 | 72 s |
| off | run_ad887d3a372ceaec | 145 | 0 | 0 | 14 | 0 | 0 | 29 | 53 | 50 s |

Throughput 31–54 tok/s total, under the 90–150 of 2026-11-02; not investigated.

- **The facts run ran out of frontier**, not budget: merged branches stop, and 14
  of 57 nodes were endings. Merging trades breadth for convergence, as it should,
  but at this ending rate it starves the queue.
- **The format holds, the content does not.** Every grown node's effects parse as
  `owner.property=value`, but read against their events many are wrong or empty:
  "The wolf ambushes Red" → `wolf.alive=no`; "The wolf waits outside the house" →
  `wolf.location=deeper_woods`; "Red reaches the house" → only `red.has_basket=yes`.
  23 distinct keys over 57 nodes; `*.action` keys (event names, not states) on 9.
- **Merges, read by eye (Claude, not a human), about half false** of the 10 that
  added an edge: a same-world merge across different events (the facts left the
  difference out), "ignores the wolf's trick" into "offers the wolf the basket",
  knocking into reaching the house. The future judge is bimodal (no ≈ 0.00–0.02,
  yes ≈ 0.75–1.00) and gave one clear false yes across a `has_basket` difference.
  9 of its first 15 questions compared against one node, the told `red_meet`.
- Two same-world merges added no edge: one into the told next node by an edge
  that existed, one into the candidate's own sibling.

Reading: the fold and the merge do what they say; the model's facts are too
sparse and too loose to carry identity. First fix, without a run yet: the prompt
lists the story's authored fact keys (`vocabularyOf`) and asks for what differs
afterwards (place, possession, knowledge, alive/awake/hurt), and `*.action`,
`*.state`, `*.status` keys are dropped at parse.

**Endings were positional.** Every ending in the three runs above sat on the last
line of its expansion (18/18 facts, 37/37 routes, 31/31 off): the prompt's example
put `| end` on its last line, and the model copied the position, so one
alternative in three ended the story, often at depth 1. That capped depth more than
beam or merging did. The example now has no ending, and the rule says any line or
none may end.
