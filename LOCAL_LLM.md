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
   `event | state`, or `event | state | end`. The prompt is the story's events so far
   plus the current world state. Paths over 40 events keep the opening and the
   recent 35. Thinking is off.
3. **Prune (optional).** One more call marks alternatives bad (contradiction, static,
   off-story). Off by default: see `experiments/NOTES.md`.
4. **Merge (optional, on by default).** Each candidate's lookalikes are found without
   the model (`mergeProposals`: shared event words, plus a low bar on shared state
   words, never an ancestor). The most similar two go to the judge, which reads both
   routes from where they part and answers yes or no; P(yes) comes from the first
   token's logprobs. At P ≥ 0.5 the candidate becomes a `rejoins` edge to that node and
   the branch ends there. Otherwise it is a new node.
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
| Merge same situations | The judge, above. Off is faster and gives a plain tree |
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
judge's call count sets the speed more than generation does.
