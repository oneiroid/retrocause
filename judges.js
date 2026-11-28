// The model's two checks on what the grower proposes. Node-only: both drive the
// model client.
//
//   same judge — before a merge. Is this candidate the same point in the story
//                as an existing node? Reads both routes as prose, because the
//                difference between two situations is often not in either node
//                but in what happened on the way there.
//   future judge — before a merge in "facts" mode, for a candidate whose world
//                differs from a node's in a fact or two. Can the same things
//                happen next from both? How each was reached is left out: two
//                routes into one situation are the merge the project is after.
//   critic     — before an insert. Does each proposed event contradict the
//                story so far, or change nothing?

"use strict";

const Engine = require("./story_builder_engine.js");
const Facts = require("./facts.js");

// P(yes) at or above this confirms a merge. On the 22 labelled merges from
// 2026-10-04 (11 true, base-model nodes), 0.5 keeps 6 true and lets no false one
// through. A refused true merge costs one duplicate node, an accepted false one
// loses a state, so the stricter side.
const SAME_THRESHOLD = 0.5;
// One line per alternative: "1: bad contradiction" is about eight tokens.
const CRITIC_TOKENS_PER_LINE = 10;

function telling(nodes) {
  return nodes
    .map((n) => String(n.label || n.expr || "").trim())
    .filter(Boolean)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .join(" ");
}

function routeOf(graph, id) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return Engine.ancestorPath(graph, id).map((nodeId) => byId.get(nodeId)).filter(Boolean);
}

// Only the routes from where they part: the shared opening costs prompt tokens
// and tells the judge nothing. On the labelled cases this form scores AUC 0.90
// against 0.79 for whole routes asked in both orders, at half the tokens.
function pairQuestion(drawn, survivor) {
  let shared = 0;
  while (shared < drawn.length && shared < survivor.length && drawn[shared].id === survivor[shared].id) shared += 1;
  const keep = Math.max(0, shared - 1);
  return `Telling A: ${telling(drawn.slice(keep))}\nWorld after A: ${(drawn.at(-1) || {}).state || ""}\n\n`
    + `Telling B: ${telling(survivor.slice(keep))}\nWorld after B: ${(survivor.at(-1) || {}).state || ""}\n\n`
    + "Have A and B reached the same point in the story?";
}

// judge(graph, survivorId, fromId, candidate) → { pYes, same, question }.
// `candidate` is the not-yet-inserted node drawn from `fromId`.
function createJudge({ client, system, threshold = SAME_THRESHOLD, signal }) {
  return async function judge(graph, survivorId, fromId, candidate) {
    const question = pairQuestion([...routeOf(graph, fromId), candidate], routeOf(graph, survivorId));
    const pYes = await client.yesProbability({ system, user: question, signal });
    // An unanswered judgement refuses the merge: the safe direction.
    return { pYes, same: pYes !== null && pYes >= threshold, question };
  };
}

// The two situations as the future judge reads them: the facts they share once,
// then each one's last event and the facts only it holds.
//
// Each difference is named on both sides, "not stated" included: asked as "only
// in A / only in B", the judge read a fact missing on one side as agreement, and
// merged across wolf.knows_destination, the fact the tale turns on.
function futureQuestion({ title, a, b, diff }) {
  const differing = new Set(diff.map((d) => d.key));
  const shared = new Map([...a.world].filter(([k]) => !differing.has(k)));
  const side = (value) => (value === undefined ? "not stated" : value);
  return [
    ...(title ? [`Story: ${title}`] : []),
    "True in both:",
    Facts.renderWorld(shared) || "(nothing)",
    "",
    `A, just after: ${a.label}`,
    `B, just after: ${b.label}`,
    "",
    diff.length
      ? ["Differences:", ...diff.map((d) => `- ${d.key}: A ${side(d.a)}, B ${side(d.b)}`)].join("\n")
      : "Differences: none in the facts. Compare the two events.",
    "",
    "Can the same things happen next in A and in B?",
  ].join("\n");
}

// futureJudge({ graph, a: { node, world }, b: { node, world }, diff }) → { pYes, same, question }.
function createFutureJudge({ client, system, threshold = SAME_THRESHOLD, signal }) {
  return async function futureJudge({ graph, a, b, diff }) {
    const title = graph.title || (graph.meta && graph.meta.title) || "";
    const question = futureQuestion({
      title, a: { label: a.node.label, world: a.world }, b: { label: b.node.label, world: b.world }, diff,
    });
    const pYes = await client.yesProbability({ system, user: question, signal });
    return { pYes, same: pYes !== null && pYes >= threshold, question };
  };
}

// Identity by grown futures: both nodes have been expanded, and the judge reads
// what the run found could happen next after each, as sentences. On 2026-11-28
// the judge's verdicts followed the event sentences and barely the facts, so
// this question gives it sentences to compare.
//
// Each side's recent past is shown too: without it the judge cannot see that one
// side's future repeats the other's past ("Red meets the wolf" after a route on
// which she already had), which was the commonest false fold on 2026-11-28.
function grownFuturesQuestion({ title, a, b, diff }) {
  const list = (labels) => labels.map((l, i) => `  ${i + 1}. ${l}`).join("\n");
  const side = (value) => (value === undefined ? "not stated" : value);
  const before = (s) => (s.before && s.before.length ? [`Before that: ${telling(s.before.map((label) => ({ label })))}`] : []);
  return [
    ...(title ? [`Story: ${title}`] : []),
    ...before(a),
    `A, just after: ${a.label}`,
    "Found to happen next after A:",
    list(a.next),
    "",
    ...before(b),
    `B, just after: ${b.label}`,
    "Found to happen next after B:",
    list(b.next),
    ...(diff.length ? ["", "Facts that differ:", ...diff.map((d) => `- ${d.key}: A ${side(d.a)}, B ${side(d.b)}`)] : []),
    "",
    "Could every event found after A also happen right after B, and every event found after B also happen right after A?",
  ].join("\n");
}

// A fold rewires a subtree, so it asks for more than a merge does: on
// 2026-11-28 folds were refused near 0 and accepted at 0.85–1.00, with one
// coin-flip at 0.52 that was false.
const FUTURES_THRESHOLD = 0.8;

// grownFuturesJudge({ graph, a: { label, next, before }, b: { … }, diff }) → { pYes, same, question }.
function createGrownFuturesJudge({ client, system, threshold = FUTURES_THRESHOLD, signal }) {
  return async function grownFuturesJudge({ graph, a, b, diff }) {
    const title = graph.title || (graph.meta && graph.meta.title) || "";
    const question = grownFuturesQuestion({ title, a, b, diff });
    const pYes = await client.yesProbability({ system, user: question, signal });
    return { pYes, same: pYes !== null && pYes >= threshold, question };
  };
}

// Verdicts by alternative, in order: { bad: reason | null }. A line the critic
// did not write keeps the alternative: a missed bad one costs one node, and the
// user can see and delete it.
function parseVerdicts(content, count) {
  const verdicts = Array.from({ length: count }, () => ({ bad: null }));
  for (const line of String(content).split("\n")) {
    const match = line.match(/^\s*(\d+)\s*[:.]\s*bad\b\s*(\w*)/i);
    if (match && +match[1] >= 1 && +match[1] <= count) verdicts[+match[1] - 1].bad = (match[2] || "bad").toLowerCase();
  }
  return verdicts;
}

function alternativesList(candidates) {
  return candidates.map((c, i) => `${i + 1}. ${c.label} State after: ${c.state}`).join("\n");
}

// critic(story, candidates) → { verdicts, user, content, tokens }. `story` is the
// grower's rendering of the events so far.
function createCritic({ client, system, signal }) {
  return async function critic(story, candidates) {
    const user = `${story}\n\nProposed next events:\n${alternativesList(candidates)}`;
    const { content, tokens } = await client.chat({
      system, user, temperature: 0, maxTokens: candidates.length * CRITIC_TOKENS_PER_LINE, signal,
    });
    return { verdicts: parseVerdicts(content, candidates.length), user, content, tokens };
  };
}

module.exports = {
  createJudge, createFutureJudge, createGrownFuturesJudge, createCritic,
  parseVerdicts, pairQuestion, futureQuestion, grownFuturesQuestion, telling, SAME_THRESHOLD, FUTURES_THRESHOLD,
};
