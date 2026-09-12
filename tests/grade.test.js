"use strict";

// experiments/grade.js — the resume rule. Model-free and file-free: graded
// files are built inline.

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const Grade = require(path.join(__dirname, "..", "experiments", "grade.js"));

const OLD_ADVANCES = "does it change anything?";

function row(answers) {
  return { nodeId: "n1", arm: "sentence", expr: "Red | walks on | Red is in the woods", ...answers };
}

function carry(graded) {
  return Grade.carryForward(Grade.answersByKey(graded).get(Grade.sampleKey(row())));
}

// The bug this pins: resume carried answers by KEY, so after `advances` was
// reworded the old answers were reused under the new prompt, nothing was
// asked, and the graded file was overwritten claiming the new wording.
test("an answer carries only when it was given to the current wording", () => {
  const { carried, superseded } = carry({
    manifest: {
      questions: Grade.QUESTIONS.map((q) => (q.key === "advances" ? { ...q, prompt: OLD_ADVANCES } : q)),
    },
    grades: [row({ possible: true, consistent: false, advances: true, toldStory: false })],
  });
  assert.deepStrictEqual(carried, { possible: true, consistent: false, toldStory: false });
  assert.deepStrictEqual(superseded, { advances: { value: true, prompt: OLD_ADVANCES } });
});

test("a v1 file carries `plausible` as `possible`, and its toldStory is superseded", () => {
  const { carried, superseded } = carry({ manifest: {}, grades: [row({ plausible: true, toldStory: true })] });
  assert.deepStrictEqual(carried, { possible: true });
  assert.deepStrictEqual(superseded, { toldStory: { value: true, prompt: Grade.V1_PROMPTS.toldStory } });
});

test("a file graded under every current prompt carries everything", () => {
  const { carried, superseded } = carry({
    manifest: { questions: Grade.QUESTIONS },
    grades: [row({ possible: false, consistent: true, advances: false, toldStory: true })],
  });
  assert.deepStrictEqual(carried, { possible: false, consistent: true, advances: false, toldStory: true });
  assert.deepStrictEqual(superseded, {});
});

test("a sample with no prior answers carries nothing", () => {
  assert.deepStrictEqual(Grade.carryForward(undefined), { carried: {}, superseded: {} });
});

// The v1 `plausible` → `possible` rename is legitimate only because the
// wording is identical. If `possible` is ever reworded, this fails, and the
// rename has to go.
test("the legacy rename rests on an unchanged prompt", () => {
  const current = Grade.QUESTIONS.find((q) => q.key === "possible").prompt;
  assert.strictEqual(Grade.V1_PROMPTS.possible, current);
});
