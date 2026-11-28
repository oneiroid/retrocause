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

test("routes mode: a confirmed judge merges, an edge to the survivor, no new node", async () => {
  const graph = seed();
  graph.nodes.push({ id: "p", label: "The wolf bites Red", expr: "bite(wolf, red)", state: "Red is hurt by the wolf.", kind: "story" });
  graph.edges.push({ id: "e2", from: "r", to: "p", type: "causes" });
  const write = () => "The wolf bites Red hard | Red is hurt by the wolf.";
  const events = [];
  const client = scripted({ write, pYes: () => 0.9 });
  const result = await run({ graph, client, merge: "routes", depth: 1, width: 1, onEvent: (e) => events.push(e) });
  assert.strictEqual(result.stats.merged, 1);
  assert.strictEqual(result.stats.created, 0);
  assert.strictEqual(result.graph.nodes.length, 3);
  const edge = result.graph.edges.find((e) => e.from === "m" && e.to === "p");
  assert.strictEqual(edge.type, "rejoins");
  assert.ok(events.some((e) => e.type === "merge" && e.into === "p"));
  assert.strictEqual(result.trace[0].judgements[0].survivor, "p");
});

test("routes mode: a refused judge keeps the candidate as a new node", async () => {
  const graph = seed();
  graph.nodes.push({ id: "p", label: "The wolf bites Red", expr: "bite(wolf, red)", state: "Red is hurt by the wolf.", kind: "story" });
  graph.edges.push({ id: "e2", from: "r", to: "p", type: "causes" });
  const write = () => "The wolf bites Red hard | Red is hurt by the wolf.";
  const { stats } = await run({ graph, client: scripted({ write, pYes: () => 0.1 }), merge: "routes", depth: 1, width: 1 });
  assert.strictEqual(stats.mergesRefused, 1);
  assert.strictEqual(stats.created, 1);
});

test("routes mode: parallel expansions cannot both add the same state unasked", async () => {
  // Round 1 gives two parents; round 2 expands both at once, and both write the
  // same event. Whichever lands second must be asked about the first.
  const write = (system, user, call) => (call === 1
    ? "Alder rises high | Kettles boil over.\nGrandfather sleeps soundly | Lanterns dim slowly."
    : "The wolf bites Red | Red is hurt by the wolf.");
  const client = scripted({ write, pYes: () => 0.9 });
  const { graph, stats } = await run({ client, merge: "routes", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 2 });
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

// ── facts mode ──────────────────────────────────────────────────────────────

const factSeed = () => ({
  title: "T",
  entities: ["a", "b"],
  root: "r",
  nodes: [
    { id: "r", label: "Start", expr: "start(a)", state: "A is home.", kind: "root", effects: "a.location=home, b.location=hill" },
    { id: "m", label: "Middle", expr: "middle(a)", state: "A is out.", kind: "story", effects: "a.location=road" },
  ],
  edges: [{ id: "e1", from: "r", to: "m", type: "causes" }],
});

test("parseAlternatives reads facts into effects, and keeps a prose state without them", () => {
  const { alternatives } = parseAlternatives("A runs to the hill | A.location = the hill, b.scared=yes\nA waits | A is still.");
  assert.strictEqual(alternatives[0].effects, "a.location=hill, b.scared=yes");
  assert.strictEqual(alternatives[0].state, "a.location=hill, b.scared=yes");
  assert.deepStrictEqual(alternatives[1].changes, []);
  assert.strictEqual(alternatives[1].state, "A is still.");
});

test("storySoFar shows the folded world when the path has facts", () => {
  const text = storySoFar(factSeed(), "m");
  assert.match(text, /World now:\na: location=road\nb: location=hill\n\nFact keys in this story: a.location \(home, road\), b.location \(hill\)/);
});

test("facts mode: two routes into one world merge with no model call", async () => {
  // Round 1: two different events from m. Round 2: each child writes an event
  // that lands in the same world, so the second becomes a rejoin into the first.
  const write = (system, user, call) => {
    if (call === 1) return "A meets b | a.location=hill\nB comes down | b.location=road";
    if (/a: location=hill/.test(user)) return "B greets a | a.greeted=yes, a.location=hill";
    return "A walks up with b | a.location=hill, b.location=hill, a.greeted=yes";
  };
  const events = [];
  const client = scripted({ write, pYes: () => 1 });
  const { graph, stats } = await run({
    graph: factSeed(), client, merge: "facts", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 1,
    onEvent: (e) => events.push(e),
  });
  assert.strictEqual(stats.mergedOnFacts, 1);
  assert.strictEqual(stats.judgeCalls, 0);
  assert.strictEqual(client.calls.judge, 0);
  assert.strictEqual(stats.convergent, 1);
  const merge = events.find((e) => e.type === "merge");
  assert.strictEqual(merge.how, "same world");
  assert.strictEqual(graph.edges.filter((e) => e.to === merge.into).length, 2);
  assert.ok(validateGraph(graph).ok);
});

test("facts mode: an event that changes no fact is a null transition", async () => {
  const write = () => "A stands still | a.location=road\nA leaves | a.location=town";
  const { stats } = await run({ graph: factSeed(), client: scripted({ write }), merge: "facts", depth: 1, width: 2 });
  assert.strictEqual(stats.nullTransitions, 1);
  assert.strictEqual(stats.created, 1);
});

test("facts mode: a return to a world on its own route is kept as a new node", async () => {
  const write = () => "A goes home | a.location=home";
  const { stats, graph } = await run({ graph: factSeed(), client: scripted({ write }), merge: "facts", depth: 1, width: 1 });
  assert.strictEqual(stats.created, 1);
  assert.strictEqual(stats.recurrences, 1);
  assert.ok(validateGraph(graph).ok);
});

test("facts mode: a world one fact away goes to the future judge, which decides", async () => {
  const graph = factSeed();
  graph.nodes.push({ id: "p", label: "A is chased home", expr: "chase(b, a)", state: "", kind: "story", effects: "a.location=home, a.scared=yes" });
  graph.edges.push({ id: "e2", from: "r", to: "p", type: "causes" });
  const write = () => "A runs home in fear | a.location=home, a.afraid=yes";
  const templates = { ...TEMPLATES, future: "future?" };
  let asked = "";
  const yes = await run({
    graph: structuredClone(graph), templates, client: scripted({ write, pYes: (user) => { asked = user; return 0.8; } }),
    merge: "facts", depth: 1, width: 1,
  });
  assert.strictEqual(yes.stats.mergedByJudge, 1);
  assert.strictEqual(yes.stats.judgeCalls, 1);
  assert.match(asked, /- a\.afraid: A yes, B not stated/);
  assert.match(asked, /- a\.scared: A not stated, B yes/);
  assert.ok(yes.graph.edges.some((e) => e.from === "m" && e.to === "p" && e.type === "rejoins"));

  const no = await run({ graph: structuredClone(graph), templates, client: scripted({ write, pYes: () => 0.2 }), merge: "facts", depth: 1, width: 1 });
  assert.strictEqual(no.stats.mergesRefused, 1);
  assert.strictEqual(no.stats.created, 1);
});

test("merge off grows a plain tree even when worlds coincide", async () => {
  const write = (system, user, call) => (call === 1 ? "A meets b | a.location=hill\nB comes down | b.location=road"
    : /a: location=hill/.test(user) ? "X | a.greeted=yes" : "Y | a.location=hill, b.location=hill, a.greeted=yes");
  const { stats } = await run({ graph: factSeed(), client: scripted({ write }), merge: "off", depth: 2, width: 2, beam: 100, maxNodes: 100 });
  assert.strictEqual(stats.merged, 0);
  assert.strictEqual(stats.created, 4);
  assert.strictEqual(stats.convergent, 0);
});

test("facts mode: with a future judge loaded, an equal world is asked too, and a no keeps the node", async () => {
  const write = (system, user, call) => {
    if (call === 1) return "A meets b | a.location=hill\nB comes down | b.location=road";
    if (/a: location=hill/.test(user)) return "B greets a | a.greeted=yes, a.location=hill";
    return "A walks up with b | a.location=hill, b.location=hill, a.greeted=yes";
  };
  const templates = { ...TEMPLATES, future: "future?" };
  const asked = [];
  const { stats } = await run({
    graph: factSeed(), templates, client: scripted({ write, pYes: (user) => { asked.push(user); return 0.1; } }),
    merge: "facts", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 1,
  });
  assert.strictEqual(stats.merged, 0);
  assert.strictEqual(stats.mergesRefused, stats.judgeCalls);
  assert.ok(asked.some((q) => /Differences: none in the facts/.test(q) && /A walks up with b/.test(q)));
});

test("parseAlternatives repairs a missing pipe, on one line or across two", () => {
  const { alternatives, malformed } = parseAlternatives(
    "wolf flees wolf.location=path, wolf.knows_destination=false\ngrandmother opens the door\ngrandmother.door=open\nRed waits",
  );
  assert.deepStrictEqual(alternatives.map((a) => [a.label, a.effects]), [
    ["Wolf flees", "wolf.location=path, wolf.knows_destination=no"],
    ["Grandmother opens the door", "grandmother.door=open"],
  ]);
  assert.strictEqual(malformed, 1);
});

// ── futures mode ────────────────────────────────────────────────────────────

test("futures mode: an expanded node is folded into a lookalike when the judge says their futures fit", async () => {
  const write = (system, user, call) => {
    if (call === 1) return "A meets b | a.location=hill\nB comes down | b.location=road";
    return `Next ${call} one | a.mood_${call}=yes\nNext ${call} two | a.tired_${call}=yes`;
  };
  const templates = { ...TEMPLATES, futures: "futures?" };
  const asked = [];
  const events = [];
  const { graph, stats } = await run({
    graph: factSeed(), templates, client: scripted({ write, pYes: (user) => { asked.push(user); return 0.9; } }),
    merge: "futures", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 1, onEvent: (e) => events.push(e),
  });
  assert.strictEqual(stats.mergedByFutures, 1);
  assert.strictEqual(stats.judgeCalls, 1);
  assert.match(asked[0], /Found to happen next after A:\n  1\. Next 3 one/);
  assert.match(asked[0], /Found to happen next after B:\n  1\. Next 2 one/);
  const collapse = events.find((e) => e.type === "collapse");
  assert.ok(!graph.nodes.some((n) => n.id === collapse.victim));
  // Siblings: the one edge in stays one, and the survivor takes all four children.
  assert.strictEqual(graph.edges.filter((e) => e.to === collapse.into).length, 1);
  assert.strictEqual(graph.edges.filter((e) => e.from === collapse.into).length, 4);
  assert.ok(validateGraph(graph).ok);
});

test("futures mode: a refusal keeps both, and nothing merges on insert", async () => {
  const write = (system, user, call) => (call === 1
    ? "A meets b | a.location=hill\nA meets b | a.location=hill"
    : `Next ${call} | a.mood_${call}=yes\nOther ${call} | a.tired_${call}=yes`);
  const templates = { ...TEMPLATES, futures: "futures?" };
  const { stats, graph } = await run({
    graph: factSeed(), templates, client: scripted({ write, pYes: () => 0.1 }),
    merge: "futures", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 1,
  });
  assert.strictEqual(stats.merged, 0);
  assert.strictEqual(stats.mergesRefused, 1);
  assert.strictEqual(graph.nodes.filter((n) => n.label === "A meets b").length, 2);
});

test("futures mode: a side with one next event is no evidence, and the judge sees each side's past", async () => {
  const write = (system, user, call) => {
    if (call === 1) return "A meets b | a.location=hill\nB comes down | b.location=road";
    return call === 2 ? "Only one | a.x=yes" : "Two one | a.y=yes\nTwo two | a.z=yes";
  };
  const templates = { ...TEMPLATES, futures: "futures?" };
  const thin = await run({
    graph: factSeed(), templates, client: scripted({ write, pYes: () => 1 }),
    merge: "futures", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 1,
  });
  assert.strictEqual(thin.stats.judgeCalls, 0);

  const asked = [];
  const both = (system, user, call) => (call === 1 ? write(system, user, 1) : `N${call}a | a.p${call}=yes\nN${call}b | a.q${call}=yes`);
  await run({
    graph: factSeed(), templates, client: scripted({ write: both, pYes: (u) => { asked.push(u); return 1; } }),
    merge: "futures", depth: 2, width: 2, beam: 100, maxNodes: 100, concurrency: 1,
  });
  assert.match(asked[0], /Before that: Start\. Middle\.\nA, just after:/);
});
