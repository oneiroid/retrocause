// The "same situation?" judge — confirm-before-merge for the grower.
//
// The surface key (normalized `expr`, merge_predicate.js) proposes a merge;
// this judge may only REFUSE it. It never creates a merge the key did not
// propose, so it can only move the grower in the safe direction: a refused
// true merge costs one duplicate node, an accepted false merge rewires edges
// and deletes a state, unrecoverably.
//
// Why it is needed since branch.v4: the model now writes genuine
// continuations, so its actions collide with told-story actions all the time
// — and an action is not a situation. `ignore(villagers, boy)` drawn at
// criedWolf step 6 (no wolf anywhere) matched `cw_dismiss` at step 10 (a
// wolf at the flock), and the surface key merged them (experiments/NOTES.md,
// "First v4 grow in the Lab"). The difference is not in either node: it is in
// the ROUTE. So the judge reads both routes, as prose, plus each end state.
//
// The prompt (prompts/same.v2.txt) is a few-shot DOCUMENT for a base model,
// not an instruction: pairs of tellings, each followed by "Same situation:
// yes|no". The verdict is read off the next-token logprobs — P(yes) over
// P(yes)+P(no) — so no sampler decides it. Each pair is asked in both orders
// and averaged, because a few-shot list invites a position bias.
//
// Node-only, like grower.js: it drives the model client.

"use strict";

const { ancestorPath } = require("./grower.js");

// P(yes) at or above this confirms the merge. Calibrated 2026-10-04 on the 22
// merges the surface key proposed across nine mid-story grows
// (experiments/judge_calibration.js, labels in experiments/out/judge_cal.json):
// 11 of the 22 were false. At 0.45 the judge lets 1 false merge through and
// keeps 6 of the 11 true ones; 0.4 keeps 7 but lets 2 through. A refused true
// merge costs a duplicate node, an accepted false one is unrecoverable, so the
// stricter side. n=22 and AUC 0.79: a starting point, not a measurement to quote.
const SAME_THRESHOLD = 0.45;
const ANSWER_YES = "yes";
const ANSWER_NO = "no";

// A path as prose: each node's label as a sentence. Labels are short event
// sentences on seeds and on v4-grown nodes alike; a missing one falls back to
// the expr rather than vanishing from the route.
function telling(nodes) {
  return nodes
    .map((n) => String(n.label || n.expr || "").trim())
    .filter(Boolean)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .join(" ");
}

function renderJudgePrompt(template, { title, first, second }) {
  return renderTellings(template, {
    title,
    first: telling(first), firstState: (first.at(-1) || {}).state,
    second: telling(second), secondState: (second.at(-1) || {}).state,
  });
}

// The same document from routes already told as prose — what
// experiments/judge_calibration.js stores, so a new judge prompt can be
// re-scored against the labelled cases without regrowing them.
function renderTellings(template, { title, first, firstState, second, secondState }) {
  return String(template)
    .replaceAll("{{title}}", title || "")
    .replaceAll("{{first}}", first)
    .replaceAll("{{first_state}}", firstState || "")
    .replaceAll("{{second}}", second)
    .replaceAll("{{second_state}}", secondState || "");
}

// P(yes | yes or no), summing casing/spacing variants of each answer.
// null when neither answer is among the returned alternatives — the model
// did not take the question, which is a failure to count, not a "no".
function pYesOf(logprobs) {
  let yes = 0;
  let no = 0;
  for (const { token, logprob } of logprobs) {
    const word = String(token).trim().toLowerCase();
    if (word === ANSWER_YES) yes += Math.exp(logprob);
    else if (word === ANSWER_NO) no += Math.exp(logprob);
  }
  return yes + no > 0 ? yes / (yes + no) : null;
}

// `client` must expose nextTokenLogprobs (llm_client.js). Returns
// judge(graph, survivorId, fromId, candidate) → { pYes, same, orders }, where
// `candidate` is the not-yet-inserted node drawn from `fromId`.
function createJudge({ client, template, threshold = SAME_THRESHOLD }) {
  async function ask(title, first, second) {
    const prompt = renderJudgePrompt(template, { title, first, second });
    return { prompt, pYes: pYesOf(await client.nextTokenLogprobs(prompt)) };
  }

  return async function judge(graph, survivorId, fromId, candidate) {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const title = graph.title || (graph.meta && graph.meta.title) || "";
    const survivorPath = ancestorPath(graph, survivorId).map((id) => byId.get(id)).filter(Boolean);
    const candidatePath = [...ancestorPath(graph, fromId).map((id) => byId.get(id)).filter(Boolean), candidate];

    const orders = [
      await ask(title, survivorPath, candidatePath),
      await ask(title, candidatePath, survivorPath),
    ];
    const answered = orders.filter((o) => o.pYes !== null);
    const pYes = answered.length ? answered.reduce((sum, o) => sum + o.pYes, 0) / answered.length : null;
    // An unanswered judgement refuses the merge: the safe direction.
    return { pYes, same: pYes !== null && pYes >= threshold, orders };
  };
}

// The judge's template, by version.
const JUDGE_PROMPT = "same.v2";

module.exports = { createJudge, renderJudgePrompt, renderTellings, telling, pYesOf, SAME_THRESHOLD, JUDGE_PROMPT };
