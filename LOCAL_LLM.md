# Local LLM: automatic DAG growth

A Node-side grower that expands a story DAG from any node with a local chat model
through `llama.cpp`, driven from the page's Lab panel. Models stay local.

The earlier form of this document (reproducible growth on base models, 1765 lines)
is in git at `5188d1f`. Its measurements are the record in `experiments/NOTES.md`.

## The pieces

```
page (Lab panel) ── NDJSON ──> tools/grow_server.js ──> grower.js ──> llm_client.js ──> llama-server
                                     │                      ├─ growth.js  merge_predicate.js
                                     └─ tools/grow.js       └─ judges.js
                                        runs/<runId>/
```

The page never calls the model. It POSTs the graph to the bridge and adds each node
to its own graph as the event arrives. `./run.sh` starts everything.

## One run

1. **Work queue.** Starts with the selected node. Shallowest first, first-listed
   sibling first. One worker per server slot, less two kept free for judge calls.
2. **Expansion.** One model call writes `width` alternatives, one line each:
   `event | changes`, or `event | changes | end`, the changes being
   `owner.property=value` facts. The prompt is the story's events so far plus the
   world folded from every fact on the path (`facts.js`), so the model updates the
   keys it sees instead of re-describing the world. Paths over 40 events keep the
   opening and the recent 35. Thinking is off.
3. **Prune (optional).** One more call marks alternatives bad (contradiction, static,
   off-story). Off by default: see `experiments/NOTES.md`.
4. **Merge, mode `facts` (the default).** A candidate whose folded world equals its
   source's changed nothing and is refused. One whose world equals a node off its own
   route becomes a `rejoins` edge to it, with no model call. One whose world is one or
   two facts from a node's goes to the future judge: shared facts once, then each
   side's last event and own facts, and "can the same things happen next in A and in
   B?"; P(yes) from the first token's logprobs, merge at ≥ 0.5. Routes are not shown:
   two routes into one world is the merge wanted. A return to a world on its own route
   is kept as a new node (an edge back would be a cycle).

   Mode `futures` merges nothing on insert. After a node is expanded, it is put to
   the judge with one expanded lookalike (fewest differing facts, then most shared
   event words, never on its route or below it) as two lists of what was found to
   happen next, and "could each event after A happen right after B, and the other
   way round?". On yes the node is folded into the lookalike: its way in becomes a
   `rejoins` edge, its children move over. Identity by futures (INTUITIONS §5),
   read in sentences, which is what the 4B judge reads well (NOTES, 2026-11-28).

   Mode `routes` is the earlier judge: lookalikes by shared event words, then "have A
   and B reached the same point?" over both routes. It refuses different routes into
   one situation by design, and is kept for comparison. Mode `off` grows a tree.
5. **Insert.** The step from "nothing left to ask" to the insert runs without an
   await, so two racing expansions cannot both add one state unasked.
6. **Next.** A new node joins the queue unless it is an ending or at the depth limit.
   `beam` caps expansions per depth, and what it drops is counted. The run stops at
   `maxNodes`, at the user's Stop, or on a model error, keeping what grew.

## The knobs

| Lab field | Effect |
|---|---|
| Depth | Levels below the selected node |
| Width | Alternatives per expansion |
| Beam | Most expansions at each depth. Lower reaches deeper for the same cost: depth 10 at width 3 is 70 calls at beam 8, 29524 without one |
| Max nodes | Run budget, up to 1000 |
| Temp | Sampling temperature for expansions |
| Merge | `facts` (same world, then the future judge), `futures` (judged on grown children), `routes` (the route judge), `off` |
| Prune bad branches | The critic, above |

## Serving

`tools/serve_model.sh`: `NVIDIA-Nemotron-3.5-Bolt-E4B-UD-Q4_K_XL.gguf` from the
sibling `llmfinetune` workspace, 16 slots, one shared 32768-token context
(`--kv-unified`), all layers on the GPU, `--cache-ram 0`. `MODEL`, `SLOTS`, `PORT`,
`CTX_PER_SLOT` override. Another chat model needs a template that honours
`enable_thinking` and returns token logprobs. Nothing else in the code names this one.

## Records

A run writes `runs/<runId>/`: `grown_graph.json`, `input_graph.json`,
`growth_manifest.json` (model, parameters, prompt hashes, counters),
`trace.json` (every request and completion, critic and judge included). The Lab's
Recorded runs and Prompts subpanels read them.

Runs do not replay: slots race and prompt caching is on, so `replayable: false` in the
manifest. Node ids stay content-addressed (`ids.js`), so the same event under the same
parent gets the same id.

## What it costs

See `experiments/NOTES.md` for the measurements. In short, prompt evaluation is what
to watch. It runs near 500 tok/s total and stalls every running generation, so the
judge's call count sets the speed more than generation does. That is the second
reason for mode `facts`: an exact world match costs no call, and the run reports
`judgeCalls`, `mergedOnFacts`, `mergedByJudge` and `convergent` so the trade is
visible.
