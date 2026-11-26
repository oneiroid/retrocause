// grower.js over a scripted client: parsing, traversal, merges, pruning, stops.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { growGraph, parseAlternatives, storySoFar, plannedExpansions, exprOf } = require("../grower.js");
const { parseVerdicts, pairQuestion } = require("../judges.js");
const { ancestorPath, validateGraph } = require("../story_builder_engine.js");

const TEMPLATES = { branch: "Write {{width}}.", same: "same?", critic: "bad?" };

const seed = () => ({
  title: "T",
  entities: ["a", "b"],
  root: "r",
  nodes: [
    { id: "r", label: "Start", expr: "start(a)", state: "A is home.", kind: "root" },
    { id: "m", label: "Middle", expr: "middle(a)", state: "A is out.", kind: "story" },
  ],
  edges: [{ id: "e1", from: "r", to: "m", type: "causes" }],
});

// A client whose `chat` calls `write(system, user)`. Every distinct call gets
// distinct events, unless the script says otherwise.
function scripted({ write, pYes = () => 0 } = {}) {
  let call = 0;
  const calls = { chat: 0, judge: 0, concurrent: 0, peak: 0 };
  return {
    calls,
    async chat({ system, user, onToken, signal }) {
      calls.chat += 1;
      calls.concurrent += 1;
      calls.peak = Math.max(calls.peak, calls.concurrent);
      await new Promise((resolve) => setTimeout(resolve, 1));
      calls.concurrent -= 1;
      if (signal && signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      call += 1;
      const content = write
        ? write(system, user, call)
        : [1, 2, 3].map((i) => `Event ${call}x${i} happens | World ${call}x${i} holds.`).join("\n");
      if (onToken) onToken(content, content);
      return { content, tokens: 1, finishReason: "stop", promptTokens: 1, cachedTokens: 0 };
    },
    async yesProbability({ user }) {
      calls.judge += 1;
      return pYes(user);
    },
  };
}

const run = (options) => growGraph({
  graph: seed(), from: "m", templates: TEMPLATES, merge: false, prune: false, concurrency: 4, ...options,
});

test("parseAlternatives reads event | state, and the end mark", () => {
  const { alternatives, malformed } = parseAlternatives(
    "The wolf runs. | The wolf is gone.\n2. RED SHOUTS | Red is loud. | end\n\nno separator here\n- Red waits | end\n",
  );
  assert.deepStrictEqual(alternatives.map((a) => [a.label, a.state, a.ending]), [
    ["The wolf runs.", "The wolf is gone.", false],
    ["Red shouts", "Red is loud.", true],
  ]);
  assert.strictEqual(alternatives[0].expr, "the_wolf_runs");
  assert.strictEqual(malformed, 2);
});

test("exprOf is a stable slug of the event", () => {
  assert.strictEqual(exprOf("The wolf's eyes, again!"), "the_wolf_s_eyes_again");
});

test("storySoFar shows the path and the current state, and elides a very long path", () => {
  const text = storySoFar(seed(), "m");
  assert.match(text, /Story: T/);
  assert.match(text, /Characters: a, b/);
  assert.match(text, /1\. Start\n2\. Middle/);
  assert.match(text, /World state now: A is out\./);

  const long = { title: "L", root: "n0", nodes: [], edges: [] };
  for (let i = 0; i < 60; i += 1) {
    long.nodes.push({ id: `n${i}`, label: `Event ${i}`, state: "s" });
    if (i) long.edges.push({ id: `e${i}`, from: `n${i - 1}`, to: `n${i}` });
  }
  const elided = storySoFar(long, "n59");
  assert.match(elided, /5\. Event 4\n\.\.\.\n26\. Event 25/);
  assert.match(elided, /60\. Event 59/);
});

test("plannedExpansions counts the tree, capped by beam and node budget", () => {
  assert.strictEqual(plannedExpansions({ depth: 3, width: 3, beam: 100, maxNodes: 1000 }), 1 + 3 + 9);
  assert.strictEqual(plannedExpansions({ depth: 4, width: 3, beam: 2, maxNodes: 1000 }), 1 + 2 + 2 + 2);
  assert.strictEqual(plannedExpansions({ depth: 9, width: 3, beam: 9, maxNodes: 12 }), 4);
});

test("grows depth × width, valid, marked as grown, without touching its input", async () => {
  const input = seed();
  const { graph, stats, validation, error } = await run({ graph: input, client: scripted(), depth: 2, width: 3, beam: 100, maxNodes: 100, runId: "run_x" });
  assert.strictEqual(error, null);
  assert.strictEqual(input.nodes.length, 2);
  assert.strictEqual(stats.expansions, 1 + 3);
  assert.strictEqual(stats.created, 3 + 9);
  assert.strictEqual(stats.maxDepth, 2);
  assert.strictEqual(graph.nodes.length, 2 + 12);
  assert.ok(validation.ok);
  const grown = graph.nodes.filter((n) => n.createdBy === "grown");
  assert.ok(grown.every((n) => n.runId === "run_x" && n.kind === "branch" && n.state));
  assert.ok(grown.every((n) => ancestorPath(graph, n.id).includes("m")));
});

test("runs expansions concurrently", async () => {
  const client = scripted();
  await run({ client, depth: 2, width: 3, beam: 100, maxNodes: 100, concurrency: 3 });
  assert.strictEqual(client.calls.peak, 3);
});

test("the beam caps expansions per depth and buys depth", async () => {
  const { stats } = await run({ client: scripted(), depth: 6, width: 3, beam: 2, maxNodes: 100 });
  assert.strictEqual(stats.maxDepth, 6);
  assert.strictEqual(stats.expansions, 1 + 2 + 2 + 2 + 2 + 2);
  assert.ok(stats.beamDropped > 0);
});

test("maxNodes is never exceeded", async () => {
  const { stats } = await run({ client: scripted(), depth: 9, width: 3, beam: 100, maxNodes: 7 });
  assert.ok(stats.created <= 7);
  assert.ok(stats.created >= 6);
});

test("an ending is not expanded", async () => {
  const write = () => "The end comes | All is over. | end\nA path opens | A is on a path.";
  const { graph, stats } = await run({ client: scripted({ write: (s, u, n) => (n === 1 ? write() : `Next ${n} | S${n}.`) }), depth: 2, width: 2, beam: 100, maxNodes: 100 });
  assert.strictEqual(stats.endings, 1);
  assert.strictEqual(stats.expansions, 2);
  const ending = graph.nodes.find((n) => n.label === "The end comes");
  assert.ok(ending.tags.includes("ending"));
  assert.ok(!graph.edges.some((e) => e.from === ending.id));
});

test("a null transition is refused and counted", async () => {
  const write = () => "Middle | A is out.\nOther | B.";
  const graph = seed();
  graph.nodes[1].expr = exprOf("Middle");
  const { stats } = await run({ graph, client: scripted({ write }), depth: 1, width: 2 });
  assert.strictEqual(stats.nullTransitions, 1);
  assert.strictEqual(stats.created, 1);
});

test("a confirmed judge merges: an edge to the survivor, no new node", async () => {
  const graph = seed();
  graph.nodes.push({ id: "p", label: "The wolf bites Red", expr: "bite(wolf, red)", state: "Red is hurt by the wolf.", kind: "story" });
  graph.edges.push({ id: "e2", from: "r", to: "p", type: "causes" });
  const write = () => "The wolf bites Red hard | Red is hurt by the wolf.";
  const events = [];
  const client = scripted({ write, pYes: () => 0.9 });
  const result = await run({ graph, client, merge: true, depth: 1, width: 1, onEvent: (e) => events.push(e) });
  assert.strictEqual(result.stats.merged, 1);
  assert.strictEqual(result.stats.created, 0);
  assert.strictEqual(result.graph.nodes.length, 3);
  const edge = result.graph.edges.find((e) => e.from === "m" && e.to === "p");
  assert.strictEqual(edge.type, "rejoins");
  assert.ok(events.some((e) => e.type === "merge" && e.into === "p"));
  assert.strictEqual(result.trace[0].judgements[0].survivor, "p");
});

test("a refused judge keeps the candidate as a new node", async () => {
  const graph = seed();
  graph.nodes.push({ id: "p", label: "The wolf bites Red", expr: "bite(wolf, red)", state: "Red is hurt by the wolf.", kind: "story" });
  graph.edges.push({ id: "e2", from: "r", to: "p", type: "causes" });
  const write = () => "The wolf bites Red hard | Red is hurt by the wolf.";
  const { stats } = await run({ graph, client: scripted({ write, pYes: () => 0.1 }), merge: true, depth: 1, width: 1 });
  assert.strictEqual(stats.mergesRefused, 1);
  assert.strictEqual(stats.created, 1);
});

test("parallel expansions cannot both add the same state unasked", async () => {
  // Round 1 gives two parents; round 2 expands both at once, and both write the
  // same event. Whichever lands second must be asked about the first.
  const write = (system, user, call) => (call === 1
    ? "Alder rises high | Kettles boil over.\nGrandfather sleeps soundly | Lanterns dim slowly."
    : "The wolf bites Red | Red is hurt by the wolf.");
  const client = scripted({ write, pYes: () => 0.9 });
  const { graph, stats } = await run({ client, merge: true, depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 2 });
  assert.strictEqual(stats.merged, 1);
  const bites = graph.nodes.filter((n) => n.label === "The wolf bites Red");
  assert.strictEqual(bites.length, 1);
  assert.strictEqual(graph.edges.filter((e) => e.to === bites[0].id).length, 2);
  assert.ok(validateGraph(graph).ok);
});

test("the critic drops what it marks bad, and a silent critic keeps everything", async () => {
  const write = (system) => (system === TEMPLATES.critic
    ? "1: ok\n2: bad contradiction\n3: ok"
    : "One happens | S one.\nTwo happens | S two.\nThree happens | S three.");
  const events = [];
  const { stats, graph } = await run({ client: scripted({ write }), prune: true, depth: 1, width: 3, onEvent: (e) => events.push(e) });
  assert.strictEqual(stats.pruned, 1);
  assert.strictEqual(stats.created, 2);
  assert.ok(!graph.nodes.some((n) => n.label === "Two happens"));
  assert.ok(events.some((e) => e.type === "pruned" && e.reason === "contradiction"));
});

test("parseVerdicts reads reasons and keeps what it cannot read", () => {
  assert.deepStrictEqual(parseVerdicts("1: bad static\nnonsense\n3. BAD", 3), [{ bad: "static" }, { bad: null }, { bad: "bad" }]);
  assert.deepStrictEqual(parseVerdicts("", 2), [{ bad: null }, { bad: null }]);
});

test("pairQuestion tells both routes from where they part", () => {
  const a = { id: "a", label: "Shared start" };
  const b = { id: "b", label: "Shared turn", state: "x" };
  const q = pairQuestion(
    [a, b, { id: "c", label: "One way", state: "S1" }],
    [a, b, { id: "d", label: "Other way" }, { id: "e", label: "Further", state: "S2" }],
  );
  assert.match(q, /Telling A: Shared turn\. One way\.\nWorld after A: S1/);
  assert.match(q, /Telling B: Shared turn\. Other way\. Further\.\nWorld after B: S2/);
  assert.doesNotMatch(q, /Shared start/);
});

test("stopping keeps what grew, and reports stopped", async () => {
  const controller = new AbortController();
  const events = [];
  const result = await run({
    client: scripted(), depth: 9, width: 3, beam: 100, maxNodes: 1000, signal: controller.signal,
    onEvent: (e) => {
      events.push(e);
      if (e.type === "node" && events.filter((x) => x.type === "node").length === 3) controller.abort();
    },
  });
  assert.strictEqual(result.stats.stopped, true);
  assert.strictEqual(result.error, null);
  assert.ok(result.stats.created >= 3);
  assert.ok(result.stats.created < 40);
});

test("a model failure ends the run with what grew and names the error", async () => {
  const client = scripted();
  const chat = client.chat;
  client.chat = async (args) => {
    if (client.calls.chat >= 2) throw new Error("boom");
    return chat(args);
  };
  const result = await run({ client, depth: 5, width: 3, beam: 100, maxNodes: 100, concurrency: 1 });
  assert.strictEqual(result.error.message, "boom");
  assert.strictEqual(result.stats.created, 6);
  assert.ok(validateGraph(result.graph).ok);
});

test("progress events carry the counters the Lab shows", async () => {
  const progress = [];
  await run({ client: scripted(), depth: 1, width: 3, onEvent: (e) => { if (e.type === "progress") progress.push(e); } });
  const last = progress.at(-1);
  assert.strictEqual(last.planned, 1);
  assert.strictEqual(last.stats.expansions, 1);
  assert.strictEqual(last.stats.created, 3);
  assert.deepStrictEqual(last.active, []);
});
