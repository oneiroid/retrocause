// same_judge.js + the grower's confirm-before-merge path. Model-free: the
// judge's client is a stub that answers nextTokenLogprobs.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Engine = require("../story_builder_engine.js");
const Growth = require("../growth.js");
const { growGraph, stepLine } = require("../grower.js");
const { createJudge, renderJudgePrompt, pYesOf, telling, SAME_THRESHOLD } = require("../same_judge.js");
const { createClient } = require("../llm_client.js");
const { seeds } = require("../seeds.js");

const TEMPLATE = fs.readFileSync(path.join(__dirname, "..", "prompts", "same.v2.txt"), "utf8");
const GROW_TEMPLATE = fs.readFileSync(path.join(__dirname, "..", "prompts", "branch.v4.txt"), "utf8");
const FIXTURES = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "branch_responses.json"), "utf8"));

const logprobs = (pYes) => [{ token: " yes", logprob: Math.log(pYes) }, { token: " no", logprob: Math.log(1 - pYes) }];
const stubJudgeClient = (pYes) => ({ nextTokenLogprobs: async () => logprobs(pYes) });

test("pYesOf: sums casing/spacing variants, null when neither answer appears", () => {
  const p = pYesOf([
    { token: " yes", logprob: Math.log(0.3) }, { token: " Yes", logprob: Math.log(0.1) },
    { token: " no", logprob: Math.log(0.4) }, { token: " maybe", logprob: Math.log(0.2) },
  ]);
  assert.ok(Math.abs(p - 0.5) < 1e-9);
  assert.strictEqual(pYesOf([{ token: " The", logprob: -0.1 }]), null);
});

test("the judge prompt is a document: both routes as prose, ends on the open answer", () => {
  const graph = Engine.normalizeGraph(seeds.criedWolf);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const first = ["cw_watch", "cw_cry1"].map((id) => byId.get(id));
  const second = [byId.get("cw_watch"), { label: "The boy shouts for fun", state: "There is no wolf." }];
  const prompt = renderJudgePrompt(TEMPLATE, { title: graph.title, first, second });
  assert.ok(prompt.endsWith("Now: There is no wolf.\nSame situation:"));
  assert.ok(prompt.includes(`First telling: ${telling(first)}`));
  assert.ok(!/answer|json|decide/i.test(prompt));
});

test("the judge asks both orders and averages; an unanswered pair is never 'same'", async () => {
  const graph = Engine.normalizeGraph(seeds.red);
  const seen = [];
  const answers = [0.9, 0.3];
  const client = { nextTokenLogprobs: async (prompt) => { seen.push(prompt); return logprobs(answers[seen.length - 1]); } };
  const verdict = await createJudge({ client, template: TEMPLATE })(graph, "red_warn", "red_start", { label: "x", state: "y" });
  assert.strictEqual(seen.length, 2);
  assert.notStrictEqual(seen[0], seen[1]);
  assert.ok(Math.abs(verdict.pYes - 0.6) < 1e-9);
  assert.strictEqual(verdict.same, 0.6 >= SAME_THRESHOLD);

  const mute = { nextTokenLogprobs: async () => [{ token: " The", logprob: -0.1 }] };
  const silent = await createJudge({ client: mute, template: TEMPLATE })(graph, "red_warn", "red_start", { label: "x", state: "y" });
  assert.deepStrictEqual([silent.pYes, silent.same], [null, false]);
});

test("mergeCandidates lists what an insert would merge into, without touching the graph", () => {
  const graph = Engine.normalizeGraph(seeds.red);
  const before = JSON.stringify(graph);
  const node = { label: "Mother warns her", expr: "warn(mother, red, path)", state: "Red has been told." };
  assert.deepStrictEqual(Growth.mergeCandidates(graph, { from: "red_start", node }), ["red_warn"]);
  assert.strictEqual(JSON.stringify(graph), before);
  // A refused survivor is skipped by the insert itself.
  const result = Growth.insertContinuation(graph, { from: "red_start", node, type: "choice", refuse: new Set(["red_warn"]) });
  assert.strictEqual(result.merged, false);
});

// The told next event, drawn at the root: the surface key would merge it into
// red_warn. The judge decides whether that happens.
function toldNextClient() {
  return createClient({
    fetch: async (url) => (url.endsWith("/props")
      ? { ok: true, json: async () => FIXTURES.props }
      : { ok: true, json: async () => ({ content: stepLine(2, { label: "Mother warns her", expr: "warn(mother, red, path)", state: "Red has been told to stay on the path." }), stop_type: "eos" }) }),
  });
}

for (const [pYes, merged] of [[0.9, true], [0.1, false]]) {
  test(`grower: a judge at P(yes)=${pYes} ${merged ? "confirms" : "refuses"} the merge, and the trace says so`, async () => {
    const { graph, stats, trace } = await growGraph({
      graph: seeds.red, client: toldNextClient(), promptTemplate: GROW_TEMPLATE,
      from: "red_start", depth: 1, width: 1, maxNodes: 4,
      judge: createJudge({ client: stubJudgeClient(pYes), template: TEMPLATE }),
    });
    assert.strictEqual(stats.mergedDuplicates, merged ? 1 : 0);
    assert.strictEqual(stats.created, merged ? 0 : 1);
    assert.strictEqual(stats.mergesRefused, merged ? 0 : 1);
    assert.strictEqual(graph.nodes.filter((n) => n.expr === "warn(mother, red, path)").length, merged ? 1 : 2);
    const [judgement] = trace[0].judgements;
    assert.deepStrictEqual([judgement.survivor, judgement.same], ["red_warn", merged]);
  });
}
