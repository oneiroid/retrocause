// The model's two checks on what the grower proposes. Node-only: both drive the
// model client.
//
//   same judge — before a merge. Is this candidate the same point in the story
//                as an existing node? Reads both routes as prose, because the
//                difference between two situations is often not in either node
//                but in what happened on the way there.
//   critic     — before an insert. Does each proposed event contradict the
//                story so far, or change nothing?

"use strict";

const Engine = require("./story_builder_engine.js");

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

module.exports = { createJudge, createCritic, parseVerdicts, pairQuestion, telling, SAME_THRESHOLD };
