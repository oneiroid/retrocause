"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const R = path.join(__dirname, "..");
const Frames = require(path.join(R, "frames.js"));
const { seeds } = require(path.join(R, "seeds.js"));

const STORIES = Object.keys(seeds);

function framedNodes(story) {
  return story.nodes.filter((n) => n.frame);
}

// The corpus itself is the fixture: every seed node carries a hand-authored
// frame, and the whole point of Step 0 is that those frames are legal and
// invertible. A frame that is not is an authoring bug, caught here.
test("every seed node carries a frame", () => {
  for (const key of STORIES) {
    const story = seeds[key];
    assert.ok(Array.isArray(story.entities) && story.entities.length > 0, `${key} has entities`);
    for (const node of story.nodes) {
      assert.ok(node.frame, `${key}/${node.id} has a frame`);
    }
  }
});

test("seed frames are legal in every slot", () => {
  for (const key of STORIES) {
    const story = seeds[key];
    for (const node of framedNodes(story)) {
      const problems = Frames.validate(node.frame, story.entities);
      assert.deepStrictEqual(problems, [], `${key}/${node.id}: ${problems.join("; ")}`);
    }
  }
});

test("parse(render(frame)) round-trips every seed frame", () => {
  for (const key of STORIES) {
    const story = seeds[key];
    for (const node of framedNodes(story)) {
      const sentence = Frames.render(node.frame);
      const parsed = Frames.parse(sentence, story.entities);
      assert.ok(!parsed.error, `${key}/${node.id}: ${parsed.error} — ${sentence}`);
      assert.deepStrictEqual(parsed, node.frame, `${key}/${node.id}`);
    }
  }
});

test("render(parse(sentence)) round-trips a rendered sentence", () => {
  for (const key of STORIES) {
    const story = seeds[key];
    for (const node of framedNodes(story)) {
      const sentence = Frames.render(node.frame);
      assert.strictEqual(Frames.render(Frames.parse(sentence, story.entities)), sentence);
    }
  }
});

// The cheap automated half of keeping prose `outcome` honest to the canonical
// fact layer. Every `owner` on the left of an `owner.property=value`
// assignment must be named in the outcome, matched on a word boundary so
// "red" does not match inside "covered".
test("every effects owner is named in the node's outcome", () => {
  for (const key of STORIES) {
    const story = seeds[key];
    for (const node of framedNodes(story)) {
      if (!node.effects) continue;
      const owners = new Set(
        String(node.effects).split(",").map((a) => a.trim().split(".")[0]).filter(Boolean),
      );
      for (const owner of owners) {
        const pattern = new RegExp(`\\b${owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        assert.ok(
          pattern.test(node.frame.outcome),
          `${key}/${node.id}: effects owner "${owner}" is not named in outcome ${JSON.stringify(node.frame.outcome)}`,
        );
      }
    }
  }
});

// ── parser failure modes ────────────────────────────────────────────────────

const RED = seeds.red.entities;

test("parse rejects a missing prefix, separator or terminator", () => {
  assert.match(Frames.parse("Red walks on, and now Red is gone.", RED).error, /prefix/);
  assert.match(Frames.parse("Then Red walks on and Red is gone.", RED).error, /separator/);
  assert.match(Frames.parse("Then Red walks on, and now Red is gone", RED).error, /terminator/);
  assert.match(Frames.parse("Then Red walks\non, and now Red is gone.", RED).error, /newline/);
});

test("parse rejects an actor outside the entity list", () => {
  const parsed = Frames.parse("Then the hunter fires, and now the wolf is dead.", RED);
  assert.match(parsed.error, /no entity matches/);
});

// The silent-misparse case the word-boundary rule exists for: "Red" is a
// prefix of "Red's", so without the boundary check this parses as actor
// "Red" with action "'s mother calls her back".
test("parse requires a word boundary after the actor", () => {
  const entitiesWithoutMother = ["Red", "the wolf"];
  const sentence = "Then Red's mother calls her back, and now Red is at home.";
  assert.match(Frames.parse(sentence, entitiesWithoutMother).error, /no entity matches/);

  const parsed = Frames.parse(sentence, RED);
  assert.strictEqual(parsed.actor, "Red's mother");
  assert.strictEqual(parsed.action, "calls her back");
});

test("parse prefers the longest matching entity", () => {
  const parsed = Frames.parse(
    "Then Red's grandmother opens the door, and now the door stands open.", RED);
  assert.strictEqual(parsed.actor, "Red's grandmother");
});

test("parse rejects a period inside the action", () => {
  const parsed = Frames.parse("Then Red walks on. She stops, and now Red is still.", RED);
  assert.match(parsed.error, /action contains reserved/);
});

// ── expr derivation ─────────────────────────────────────────────────────────

test("frameExpr distinguishes frames that differ in any one slot", () => {
  const base = { actor: "Red", action: "walks on", outcome: "Red is in the woods" };
  const exprs = new Set([
    Frames.frameExpr(base),
    Frames.frameExpr({ ...base, actor: "the wolf" }),
    Frames.frameExpr({ ...base, action: "stops" }),
    Frames.frameExpr({ ...base, outcome: "Red is at home" }),
  ]);
  assert.strictEqual(exprs.size, 4);
});

// ── grammar ─────────────────────────────────────────────────────────────────

test("grammar enumerates the story's entities longest-first", () => {
  const text = Frames.grammar(RED);
  assert.match(text, /^root ::= "Then " actor " " action ", and now " outcome "\."$/m);
  const actorLine = text.split("\n").find((line) => line.startsWith("actor ::="));
  for (const entity of RED) assert.ok(actorLine.includes(JSON.stringify(entity)), entity);
  assert.ok(
    actorLine.indexOf('"Red\'s grandmother"') < actorLine.indexOf('"Red"'),
    "longer entities come first so a prefix cannot win",
  );
});

test("grammar bounds the free character classes", () => {
  const text = Frames.grammar(RED, { actionMax: 12, outcomeMax: 34 });
  // edge + up to (max - 2) middle characters + edge.
  assert.match(text, /action ::= edge mid\{0,10\} edge/);
  assert.match(text, /outcome ::= edge mid\{0,32\} edge/);
  assert.match(text, /^edge ::= \[a-zA-Z0-9'\]$/m);
  assert.match(text, /^mid ::= edge \| " "$/m);
});

// The grammar must admit everything a human wrote, and must not be able to
// emit anything `validate` rejects. Both halves have been broken before: a
// bound the checker did not know about, and a checker rule the generator was
// free to break (leading/trailing spaces, a second separator, foreign script).
test("the slot character class admits every authored slot", () => {
  const legal = new RegExp(`^${Frames.SLOT_CHAR_CLASS}(?:${Frames.SLOT_CHAR_CLASS}| )*${Frames.SLOT_CHAR_CLASS}$`);
  for (const key of STORIES) {
    for (const node of framedNodes(seeds[key])) {
      assert.ok(legal.test(node.frame.action), `${key}/${node.id} action: ${node.frame.action}`);
      assert.ok(legal.test(node.frame.outcome), `${key}/${node.id} outcome: ${node.frame.outcome}`);
    }
  }
});

test("nothing the grammar can emit is rejected by validate", () => {
  const legal = new RegExp(`^${Frames.SLOT_CHAR_CLASS}(?:${Frames.SLOT_CHAR_CLASS}| )*${Frames.SLOT_CHAR_CLASS}$`);
  // A slot the grammar can produce has no leading/trailing space, no comma
  // and no period — so no SLOT_FORBIDDEN substring and no trim mismatch.
  for (const slot of ["action", "outcome"]) {
    for (const forbidden of Frames.SLOT_FORBIDDEN[slot]) {
      assert.ok(!legal.test(forbidden), `grammar could emit reserved ${JSON.stringify(forbidden)} as a whole slot`);
    }
  }
  const sample = { actor: "Red", action: "walks on", outcome: "Red is in the woods" };
  assert.deepStrictEqual(Frames.validate(sample, RED), []);
  assert.ok(!legal.test(" leading"), "a leading space is not grammar-emittable");
  assert.ok(!legal.test("trailing "), "a trailing space is not grammar-emittable");
  assert.ok(!legal.test("two, and now three"), "a comma is not grammar-emittable");
});

// ── historyPrompt ───────────────────────────────────────────────────────────

test("historyPrompt fills title, history and the optional told-story spine", () => {
  const frames = seeds.red.nodes.slice(0, 2).map((n) => n.frame);
  const spine = seeds.red.nodes.slice(0, 3).map((n) => n.frame);
  const text = Frames.historyPrompt("T={{title}}\nS:\n{{story}}\nH:\n{{history}}\nCUE:\n",
    { title: "Red", frames, spine });
  assert.ok(text.startsWith("T=Red\n"));
  assert.ok(text.includes(`S:\n${spine.map(Frames.render).join("\n")}\n`));
  assert.ok(text.includes(`H:\n${frames.map(Frames.render).join("\n")}\n`));
  // The cue keeps exactly one trailing space, added here rather than left in
  // the file where an editor would strip it.
  assert.ok(text.endsWith("CUE: "));
});

test("a template without {{story}} is unaffected by a spine", () => {
  const frames = seeds.red.nodes.slice(0, 2).map((n) => n.frame);
  const withSpine = Frames.historyPrompt("{{title}}\n{{history}}\nNEXT EVENT:\n",
    { title: "Red", frames, spine: seeds.red.nodes.map((n) => n.frame) });
  const without = Frames.historyPrompt("{{title}}\n{{history}}\nNEXT EVENT:\n", { title: "Red", frames });
  assert.strictEqual(withSpine, without);
});

// ── grammar bounds vs the authored corpus ───────────────────────────────────

// The bounds exist to stop a free character class running to the token cap,
// but they must still admit everything a human actually wrote — a grammar
// that cannot express the seed corpus is not a grammar for this story.
test("grammar bounds admit every authored frame", () => {
  for (const key of STORIES) {
    for (const node of framedNodes(seeds[key])) {
      assert.ok(
        node.frame.action.length <= Frames.ACTION_MAX_CHARS,
        `${key}/${node.id}: action ${node.frame.action.length} > ${Frames.ACTION_MAX_CHARS}`,
      );
      assert.ok(
        node.frame.outcome.length <= Frames.OUTCOME_MAX_CHARS,
        `${key}/${node.id}: outcome ${node.frame.outcome.length} > ${Frames.OUTCOME_MAX_CHARS}`,
      );
    }
  }
});

// maxSentenceChars is what a caller sizes a token budget from. If it
// under-reports, the budget binds before the grammar does and the longest
// samples are silently discarded — which is exactly what happened on the
// first Stage 0 run.
test("maxSentenceChars bounds every sentence the grammar can produce", () => {
  for (const key of STORIES) {
    const story = seeds[key];
    const bound = Frames.maxSentenceChars(story.entities);
    const longestActor = [...story.entities].sort((a, b) => b.length - a.length)[0];
    const worstCase = Frames.render({
      actor: longestActor,
      action: "a".repeat(Frames.ACTION_MAX_CHARS),
      outcome: "b".repeat(Frames.OUTCOME_MAX_CHARS),
    });
    assert.strictEqual(worstCase.length, bound, key);
    for (const node of framedNodes(story)) {
      assert.ok(Frames.render(node.frame).length <= bound, `${key}/${node.id}`);
    }
  }
});
