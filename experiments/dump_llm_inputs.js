// What the model receives, without a model: `node experiments/dump_llm_inputs.js`.
// Runs the real grow wiring (tools/grow.js: sampled client, reference client,
// createRunJudge, growGraph) against a fake server that prints every
// /completion body. Growth call 1 is printed in full; draws are answered with
// one canned line (the told next event) so the code reaches the merge judge,
// whose two calls are printed, then the run is stopped.
const fs = require("fs");
const path = require("path");
const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const { createClient, SAMPLED_SAMPLING } = require(path.join(R, "llm_client.js"));
const { growGraph, formatForPrompt, stepLine, DEFAULT_PROMPT_VERSION } = require(path.join(R, "grower.js"));
const { createRunJudge } = require(path.join(R, "tools", "grow.js"));
const { seeds } = require(path.join(R, "seeds.js"));
const { props } = require(path.join(R, "tests", "fixtures", "branch_responses.json"));

const STORY = "criedWolf", FROM = "cw_cry2", SEED = 7, WIDTH = 3;
const CANNED = { label: "The villagers come running again", expr: "arrive(villagers, flock)",
  state: "The villagers are at the flock a second time, and there is no wolf." };

let growthCalls = 0, judgeCalls = 0;
const show = (title, body) => {
  const { prompt, grammar, ...rest } = body;
  console.log(`\n${"█".repeat(78)}\n${title}\n${"█".repeat(78)}`);
  console.log("── request parameters ──\n" + JSON.stringify(rest, null, 2));
  if (grammar) console.log("── grammar ──\n" + grammar);
  console.log("── prompt (verbatim, between the rules) ──\n" + "─".repeat(78) + "\n" + prompt + "\n" + "─".repeat(78));
};
const fakeFetch = async (url, init) => {
  if (url.endsWith("/props")) return { ok: true, json: async () => props };
  const body = JSON.parse(init.body);
  if (body.n_probs) {                       // the judge: one-token logprob read
    judgeCalls += 1;
    show(`MERGE JUDGE — call ${judgeCalls} of 2 (order ${judgeCalls === 1 ? "told, drawn" : "drawn, told"})`, body);
    if (judgeCalls === 2) { console.log("\n[stopped before the judge's verdict]"); process.exit(0); }
    return { ok: true, json: async () => ({ content: "", stop_type: "limit", completion_probabilities: [{ top_logprobs: [] }] }) };
  }
  growthCalls += 1;
  if (growthCalls === 1) show(`GENERATION — draw 1 of ${WIDTH}`, body);
  else console.log(`\n[generation draw ${growthCalls}: identical prompt and grammar, seed ${body.seed}]`);
  const step = Number(body.grammar.match(/"step\\": (\d+)/)[1]);
  return { ok: true, json: async () => ({ content: stepLine(step, CANNED), stop_type: "eos", stopped_limit: null }) };
};

(async () => {
  const client = createClient({ fetch: fakeFetch, sampling: { ...SAMPLED_SAMPLING, seed: SEED } });
  const refClient = createClient({ fetch: fakeFetch });
  const runJudge = createRunJudge({ makeClient: () => refClient });
  console.log(`story ${STORY}, from ${FROM}, prompt ${DEFAULT_PROMPT_VERSION}, width ${WIDTH}, seed ${SEED}`);
  console.log(`canned draw (every generation call answered with it): ${stepLine(0, CANNED)}`);
  await growGraph({
    graph: Engine.normalizeGraph(seeds[STORY]), client,
    promptTemplate: fs.readFileSync(path.join(R, "prompts", `${DEFAULT_PROMPT_VERSION}.txt`), "utf8"),
    format: formatForPrompt(DEFAULT_PROMPT_VERSION, { formalClient: refClient }),
    from: FROM, depth: 1, width: WIDTH, maxNodes: 12, judge: runJudge.judge,
  });
  console.log("\n[the run finished without reaching the judge]");
})().catch((e) => { console.error(e); process.exit(1); });
