// frame_proposer.js and the grower's `proposer` hook — stubbed transport, no
// server. The stub answers from the grammar it is sent: a multi-actor grammar
// gets one of a few fixed "the wolf" sentences (so the unconditioned pool is
// deliberately collapsed onto one actor), a single-actor grammar gets a
// sentence for exactly that actor.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const Engine = require("../story_builder_engine.js");
const Frames = require("../frames.js");
const { growGraph } = require("../grower.js");
const {
  createFrameProposer, frameSamplingFor, FRAME_SAMPLING, UNCONDITIONED_PER_EXPANSION,
} = require("../frame_proposer.js");
const { PROBE_SAMPLING } = require("../experiments/continue_probe.js");
const { seeds } = require("../seeds.js");

const TEMPLATE = "STORY: {{title}}\n{{history}}\nNEXT EVENT:\n";

const WOLF_ONLY = [
  "Then the wolf follows her, and now the wolf is behind Red.",
  "Then the wolf hides in the trees, and now the wolf is out of sight.",
  "Then the wolf follows her, and now the wolf is behind Red.",
];

function actorsIn(grammar) {
  const line = grammar.split("\n").find((l) => l.startsWith("actor ::= "));
  return line.slice("actor ::= ".length).split(" | ").map((a) => JSON.parse(a));
}

function stubClient({ truncateUnconditioned = false } = {}) {
  const calls = [];
  async function complete(prompt, schema, { seed, grammar }) {
    calls.push({ prompt, schema, seed, grammar });
    const actors = actorsIn(grammar);
    if (actors.length > 1 && truncateUnconditioned) {
      const error = new Error("truncated");
      error.truncated = true;
      throw error;
    }
    const content = actors.length === 1
      ? `Then ${actors[0]} acts alone, and now ${actors[0]} has acted.`
      : WOLF_ONLY[seed % WOLF_ONLY.length];
    return { content };
  }
  return { complete, calls };
}

const redGraph = () => Engine.normalizeGraph(seeds.red);
const nodeOf = (graph, id) => graph.nodes.find((n) => n.id === id);

test("offers distinct actors first, filling the actors the unconditioned draws missed", async () => {
  const graph = redGraph();
  const propose = createFrameProposer({ client: stubClient(), template: TEMPLATE, runSeed: 7 });
  const branches = await propose(graph, nodeOf(graph, "red_tell"));

  // Unconditioned draws all used "the wolf"; entity-list order decides which
  // missing actors fill the remaining slots.
  assert.deepStrictEqual(branches.map((b) => b.frame.actor), ["the wolf", "Red", "Red's mother"]);
  assert.ok(!branches[0].tags.includes("forced-actor"));
  assert.ok(branches[1].tags.includes("forced-actor"));
  assert.strictEqual(propose.stats.missingActors, 4);
  assert.strictEqual(propose.stats.forced, 4);
});

test("forced draws restrict the grammar's actor enum to exactly one entity", async () => {
  const graph = redGraph();
  const client = stubClient();
  await createFrameProposer({ client, template: TEMPLATE, runSeed: 7 })(graph, nodeOf(graph, "red_tell"));
  const forced = client.calls.filter((c) => actorsIn(c.grammar).length === 1);
  assert.deepStrictEqual(forced.map((c) => actorsIn(c.grammar)[0]),
    ["Red", "Red's mother", "Red's grandmother", "the woodcutter"]);
  assert.strictEqual(client.calls.length - forced.length, UNCONDITIONED_PER_EXPANSION);
  assert.ok(client.calls.every((c) => c.schema === null), "no JSON schema on a frame draw");
});

test("a proposed branch is a frame-grown node's fields", async () => {
  const graph = redGraph();
  const [branch] = await createFrameProposer({ client: stubClient(), template: TEMPLATE, runSeed: 7 })(
    graph, nodeOf(graph, "red_tell"));
  assert.strictEqual(branch.expr, Frames.frameExpr(branch.frame));
  assert.strictEqual(branch.state, branch.frame.outcome);
  assert.strictEqual(branch.label, `${branch.frame.actor} ${branch.frame.action}`);
  assert.strictEqual(branch.delta, "");
  assert.strictEqual(branch.invariants, "");
});

test("the prompt's history is the frames along the pinned ancestor path", async () => {
  const graph = redGraph();
  const client = stubClient();
  await createFrameProposer({ client, template: TEMPLATE, runSeed: 7 })(graph, nodeOf(graph, "red_tell"));
  const { prompt } = client.calls[0];
  for (const id of ["red_start", "red_warn", "red_woods", "red_meet", "red_tell"]) {
    assert.ok(prompt.includes(Frames.render(nodeOf(graph, id).frame)), id);
  }
  assert.ok(!prompt.includes(Frames.render(nodeOf(graph, "red_leave").frame)), "nothing past the source");
  assert.ok(prompt.endsWith("NEXT EVENT: "));
});

test("a path node with no frame is an error, not a history with a hole", async () => {
  const graph = redGraph();
  delete nodeOf(graph, "red_woods").frame;
  const propose = createFrameProposer({ client: stubClient(), template: TEMPLATE, runSeed: 7 });
  await assert.rejects(() => propose(graph, nodeOf(graph, "red_tell")), /no frame on path node\(s\) red_woods/);
});

test("truncated draws are counted, and the fill still runs", async () => {
  const graph = redGraph();
  const propose = createFrameProposer({
    client: stubClient({ truncateUnconditioned: true }), template: TEMPLATE, runSeed: 7,
  });
  const branches = await propose(graph, nodeOf(graph, "red_tell"));
  assert.strictEqual(propose.stats.truncated, UNCONDITIONED_PER_EXPANSION);
  assert.strictEqual(propose.stats.missingActors, graph.entities.length);
  assert.strictEqual(branches.length, 3);
});

test("draw seeds are derived: same run seed replays, another source differs", async () => {
  const graph = redGraph();
  const a = stubClient(); const b = stubClient(); const c = stubClient();
  const outA = await createFrameProposer({ client: a, template: TEMPLATE, runSeed: 7 })(graph, nodeOf(graph, "red_tell"));
  const outB = await createFrameProposer({ client: b, template: TEMPLATE, runSeed: 7 })(graph, nodeOf(graph, "red_tell"));
  await createFrameProposer({ client: c, template: TEMPLATE, runSeed: 7 })(graph, nodeOf(graph, "red_woods"));
  assert.deepStrictEqual(outA, outB);
  assert.deepStrictEqual(a.calls.map((x) => x.seed), b.calls.map((x) => x.seed));
  assert.notDeepStrictEqual(a.calls.map((x) => x.seed), c.calls.map((x) => x.seed));
});

// The grower bridge and the Stage 0 probe must sample the same way, or the
// probe's measurements say nothing about what the grower grows.
test("FRAME_SAMPLING is the probe's sampling block, and n_predict is grammar-derived", () => {
  assert.deepStrictEqual(FRAME_SAMPLING, PROBE_SAMPLING);
  const entities = seeds.red.entities;
  assert.strictEqual(frameSamplingFor(entities).n_predict, Frames.tokenBudget(entities));
  assert.strictEqual(Frames.tokenBudget(entities), Math.ceil(Frames.maxSentenceChars(entities) / 3) * 2);
});

// ── the grower's proposer hook ──────────────────────────────────────────────

test("growGraph with a proposer grows frame-carrying nodes, two rounds deep", async () => {
  const propose = createFrameProposer({ client: stubClient(), template: TEMPLATE, runSeed: 7 });
  const { graph, stats } = await growGraph({
    graph: seeds.red, proposer: propose, from: "red_tell", depth: 2, width: 2, maxNodes: 6,
  });
  const grown = graph.nodes.filter((n) => n.createdBy === "grown");
  assert.ok(grown.length > 0);
  // Round two expands grown nodes, whose history line is their own frame; if
  // the grower dropped `frame` the proposer would throw on the path.
  assert.ok(grown.every((n) => n.frame && n.expr === Frames.frameExpr(n.frame)));
  assert.ok(stats.expansions >= 2, "a second round ran");
});

test("growGraph with a proposer is byte-identical across runs", async () => {
  const run = async () => (await growGraph({
    graph: seeds.red,
    proposer: createFrameProposer({ client: stubClient(), template: TEMPLATE, runSeed: 7 }),
    from: "red_tell", depth: 2, width: 2, maxNodes: 6,
  })).graph;
  const Ids = require("../ids.js");
  assert.strictEqual(Ids.canonicalJson(await run()), Ids.canonicalJson(await run()));
});

// ── rejoin: the closed-enum alternative to branch.v2's free-text id ─────────

const REJOIN_TEMPLATE = "STORY:\n{{story}}\nEVENT: {{event}}\nLEADS BACK INTO:\n";

// Answers the rejoin question by echoing whichever alternative the grammar
// offers second (the first is NONE), which is enough to prove the enum is
// what constrains the answer.
function stubRejoinClient(pick = 1) {
  const base = stubClient();
  const calls = base.calls;
  async function complete(prompt, schema, opts) {
    if (!/^root ::= /m.test(opts.grammar) || !opts.grammar.includes('"NONE"')) {
      return base.complete(prompt, schema, opts);
    }
    calls.push({ prompt, schema, ...opts, rejoin: true });
    const alts = opts.grammar.split("\n")[0].slice("root ::= ".length).split(" | ").map((a) => JSON.parse(a));
    return { content: alts[Math.min(pick, alts.length - 1)] };
  }
  return { complete, calls };
}

test("rejoin is not asked unless a template is supplied", async () => {
  const graph = redGraph();
  const branches = await createFrameProposer({ client: stubClient(), template: TEMPLATE, runSeed: 7 })(
    graph, nodeOf(graph, "red_tell"));
  assert.ok(branches.every((b) => b.rejoinTargetId === undefined));
});

// A seed node on a linear spine has NO legal rejoin target: every other node
// is its ancestor or its descendant, and both are comparable. Rejoin only
// becomes available from a grown node, which hangs off the spine and so is
// incomparable with the told story past its parent.
test("a seed source on a linear spine is offered no rejoin target", async () => {
  const graph = redGraph();
  const propose = createFrameProposer({
    client: stubRejoinClient(), template: TEMPLATE, runSeed: 7, rejoinTemplate: REJOIN_TEMPLATE,
  });
  const branches = await propose(graph, nodeOf(graph, "red_tell"));
  assert.ok(branches.every((b) => b.rejoinTargetId === undefined));
  assert.strictEqual(propose.stats.rejoinAsked, 0);
});

test("a rejoin target is always an existing node, and the edge is legal", async () => {
  const propose = createFrameProposer({
    client: stubRejoinClient(), template: TEMPLATE, runSeed: 7, rejoinTemplate: REJOIN_TEMPLATE,
  });
  const { graph, stats } = await growGraph({
    graph: seeds.red, proposer: propose, from: "red_tell", depth: 2, width: 2, maxNodes: 6,
  });
  assert.ok(propose.stats.rejoinAsked > 0, "round two asks from grown nodes");
  assert.ok(propose.stats.rejoinNamed > 0, "the stub names a target");
  const rejoins = graph.edges.filter((e) => e.type === "rejoins");
  assert.ok(rejoins.length > 0, "rejoin edges land");
  // branch.v2 measured rejoinValidity 0 — every attempt named a node that did
  // not exist. An enum over rendered nodes cannot do that.
  assert.strictEqual(stats.droppedRejoins, 0);
  for (const edge of rejoins) assert.ok(nodeOf(graph, edge.to), `${edge.to} exists`);
  assert.deepStrictEqual(Engine.validateGraph(graph).cycles || [], []);
});

test("NONE is a legal answer and yields no rejoin", async () => {
  const propose = createFrameProposer({
    client: stubRejoinClient(0), template: TEMPLATE, runSeed: 7, rejoinTemplate: REJOIN_TEMPLATE,
  });
  const { graph } = await growGraph({
    graph: seeds.red, proposer: propose, from: "red_tell", depth: 2, width: 2, maxNodes: 6,
  });
  assert.ok(propose.stats.rejoinAsked > 0);
  assert.strictEqual(propose.stats.rejoinNamed, 0);
  assert.strictEqual(propose.stats.rejoinNone, propose.stats.rejoinAsked);
  assert.strictEqual(graph.edges.filter((e) => e.type === "rejoins").length, 0);
});
