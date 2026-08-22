#!/usr/bin/env node
// Can the local model answer ONE bounded question? (LOCAL_LLM.md §5.5.4)
//
//   node experiments/same_state.js
//
// The two things the model has already failed at — proposing continuations
// and extracting state — are open-ended GENERATION: choose from a large
// space, invent a vocabulary, fill an array. Their failure modes (37
// variables for 14 nodes, repetition loops, confabulated facts) are all
// failures of choosing. None of them are evidence about bounded
// DISCRIMINATION, where the model is handed two things and emits one bit.
//
// `defaultContentKey` is surface form, so "states that mean the same thing in
// different words stay separate" — the documented weak point of the whole
// merge mechanism, unsolvable symbolically, and exactly one boolean wide.
// `sameInContext` already takes `contentKey` as a swappable parameter.
//
// IMPORTANT — what contentKey is NOT asking. It is not "are these the same
// node in the story"; the incomparability clause in merge_predicate.js
// already settles that structurally. It asks only "is this the same
// content". That is why criedWolf's two `arrive(villagers, flock)` nodes are
// labelled SAME here: their content is the same, and the merge is blocked
// anyway because they are comparable. Whereas the cries differ in content —
// one asserts no wolf, the other asserts a wolf.
//
// Ground truth is hand-authored, for the reason the extraction attempt made
// concrete: a corpus written by the model under test measures its
// self-consistency, not its correctness.

"use strict";

const fs = require("fs");
const path = require("path");
const R = path.join(__dirname, "..");
const { createClient } = require(path.join(R, "llm_client.js"));

const SCHEMA = { type: "object", required: ["same"], properties: { same: { type: "boolean" } } };

// kind: paraphrase | identical | actor | place | opposite | near-miss
// `near-miss` is the hard direction: nearly identical prose that must still
// come back SAME, testing that the model does not over-split on wording.
const PAIRS = [
  // ---- SAME ----------------------------------------------------------------
  ["paraphrase", true,
    ["arrive(red, grandmother_house)", "Red is inside the house, at the bedside."],
    ["reach(red, house)", "Red has got to her grandmother's house and is indoors."]],
  ["paraphrase", true,
    ["swallow(wolf, grandmother)", "The grandmother is inside the wolf."],
    ["eat(wolf, grandmother)", "The wolf has swallowed the grandmother whole."]],
  ["paraphrase", true,
    ["leave(red, path)", "Red is among the trees, off the route her mother named."],
    ["stray(red, path)", "Red has wandered off the marked path."]],
  ["paraphrase", true,
    ["warn(mother, red, path)", "Red has been told to stay on the path."],
    ["instruct(mother, red, path)", "Red has her mother's instruction to keep to the path."]],
  ["paraphrase", true,
    ["destroy(greeks, troy)", "Troy is burning and the war is over."],
    ["burn(greeks, troy)", "Troy has fallen and is in flames."]],
  ["paraphrase", true,
    ["devour(wolf, flock)", "The sheep are dead. The boy is unhurt and alone."],
    ["kill(wolf, sheep)", "The wolf has killed the flock; the boy is untouched."]],
  ["near-miss", true,
    ["arrive(villagers, flock)", "The villagers are at the flock, armed, and there is nothing to fight."],
    ["arrive(villagers, flock)", "The villagers are at the flock again and again find nothing."]],
  ["identical", true,
    ["cry(boy, wolf)", "The boy has raised the alarm. There is no wolf."],
    ["cry(boy, wolf)", "The boy has raised the alarm. There is no wolf."]],
  ["paraphrase", true,
    ["impersonate(wolf, grandmother)", "The wolf is in the grandmother's bed wearing her cap."],
    ["disguise(wolf, grandmother)", "The wolf has taken the grandmother's place in the bed."]],
  // ---- DIFFERENT -----------------------------------------------------------
  ["recurrence", false,
    ["cry(boy, wolf)", "The boy has raised the alarm. There is no wolf."],
    ["cry(boy, wolf)", "The boy has raised the alarm a third time, and this time it is true."]],
  ["actor", false,
    ["arrive(wolf, grandmother_house)", "The wolf is at the grandmother's door."],
    ["arrive(red, grandmother_house)", "Red is at the grandmother's door."]],
  ["actor", false,
    ["swallow(wolf, grandmother)", "The grandmother is inside the wolf."],
    ["swallow(wolf, red)", "Red is inside the wolf."]],
  ["place", false,
    ["enter(red, woods)", "Red is on the path in the woods, carrying the basket."],
    ["arrive(red, grandmother_house)", "Red is inside her grandmother's house."]],
  ["opposite", false,
    ["free(woodcutter, red, grandmother)", "Red and her grandmother are out of the wolf and alive."],
    ["swallow(wolf, red)", "Red is inside the wolf with her grandmother."]],
  ["opposite", false,
    ["recognize(red, wolf)", "Red knows it is the wolf."],
    ["impersonate(wolf, grandmother)", "From the doorway it reads as the grandmother."]],
  ["near-miss", false,
    ["recognize(cassandra, horse)", "Cassandra has said out loud that the horse holds armed men."],
    ["ignore(trojans, cassandra)", "The Trojans have heard the warning and decided against it."]],
  ["place", false,
    ["hide(greeks, horse)", "Soldiers are sealed inside the horse, outside the walls."],
    ["enter(horse, troy)", "The horse is within the walls and the gates are shut behind it."]],
  ["actor", false,
    ["mock(boy, villagers)", "The villagers know they were called out for a joke."],
    ["distrust(villagers, boy)", "The villagers have decided the boy's cry means nothing."]],
];

// The error analysis says where the split belongs. The model missed two
// synonym pairs (conservative: that is today's behaviour) and merged
// `arrive(wolf, ...)` with `arrive(red, ...)` — identical frame, swapped
// actor. That last one is the only direction that does damage: a missed merge
// costs nothing, a wrong merge rewires edges and deletes a node.
//
// And entity identity is precisely what code settles EXACTLY. So: symbolic
// guard on the arguments, model on the wording. Two states cannot be the same
// if they are about different things, no matter how the model reads the prose.
//
// The cost is real and worth stating: this also blocks entity SYNONYMY —
// `devour(wolf, flock)` and `kill(wolf, sheep)` can never merge, because
// flock and sheep are different tokens. Within one story's vocabulary that is
// rare (seeds name things consistently); a destructive merge is not
// recoverable. Trade the rare gain for the unrecoverable loss.
//
// Arguments compare IN ORDER (since 2026-08-22). The first guard sorted them,
// and the adversarial set showed what that blindness costs: the model judged
// tell(red, wolf, X) the same as tell(wolf, red, X) — a role swap in the
// destructive direction. Ordered comparison vetoes it symbolically. The price,
// computed from the recorded verdicts before switching: the genuinely
// symmetric meet(wolf, red)/meet(red, wolf) merge is lost, and nothing else
// moves — same trade as the guard itself, a rare true merge for an
// unrecoverable false one.
function extractArguments(expr) {
  const open = expr.indexOf("(");
  if (open < 0) return [];
  return expr.slice(open + 1, expr.lastIndexOf(")")).split(",")
    .map((a) => a.trim().toLowerCase()).filter(Boolean);
}

function sameArguments(exprA, exprB) {
  const a = extractArguments(exprA);
  const b = extractArguments(exprB);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// ── adversarial set (2026-08-22) ────────────────────────────────────────────
//
// The original 18 were designed AND labelled by the same author (Opus 5),
// which the §8 write-up flags as the reason not to wire contentKey in yet.
// This set was authored by a different model (Fable 5); labels still want
// human review before anything ships on them.
//
// Design rule: every pair PASSES the argument guard. A guard-vetoed pair is a
// foregone conclusion — including it would measure the guard, not the model.
// So every pair here has sorted-equal arguments, and the whole decision falls
// on the model. Kinds:
//
//   role-swap    same args, swapped roles. The guard this set was authored
//                against SORTED arguments, so these reached the model — and
//                one became a false merge, which is why the guard is now
//                ordered and these pairs are vetoed before the model speaks.
//   negation     same event frame, state asserts the opposite.
//   aspect       approaching vs arrived; about-to vs done.
//   extra-fact   one state asserts strictly more about the world.
//   symmetric    role order genuinely does not matter (meet).
//   paraphrase   control: same-args paraphrases, must still come back SAME.
const ADVERSARIAL = [
  // ---- SAME ----------------------------------------------------------------
  ["symmetric", true,
    ["meet(wolf, red)", "The wolf and Red are face to face on the path."],
    ["meet(red, wolf)", "Red and the wolf stand facing each other on the path."]],
  ["paraphrase", true,
    ["recognize(red, wolf)", "Red knows it is the wolf."],
    ["see_through(red, wolf)", "Red has seen through the disguise: it is the wolf."]],
  ["paraphrase", true,
    ["sleep(trojans, troy)", "Troy is asleep. The horse stands unwatched inside the walls."],
    ["rest(trojans, troy)", "The city sleeps; nobody is watching the horse within the walls."]],
  ["paraphrase", true,
    ["swallow(wolf, red)", "Red is inside the wolf with her grandmother."],
    ["capture(red, wolf)", "Red is trapped inside the wolf, where her grandmother already is."]],
  ["paraphrase", true,
    ["ignore(villagers, boy)", "The villagers hear the cry and stay where they are."],
    ["dismiss(villagers, boy)", "The villagers hear the boy cry out and do not move."]],
  // ---- DIFFERENT -----------------------------------------------------------
  ["role-swap", false,
    ["tell(red, wolf, grandmother_house)", "The wolf knows Red's destination."],
    ["tell(wolf, red, grandmother_house)", "Red knows the wolf's destination."]],
  ["role-swap", false,
    ["distrust(villagers, boy)", "The villagers have decided the boy's cry means nothing."],
    ["distrust(boy, villagers)", "The boy has decided the villagers will never come again."]],
  ["negation", false,
    ["leave(red, path)", "Red is among the trees, off the route her mother named."],
    ["return(red, path)", "Red is back on the marked path."]],
  ["negation", false,
    ["sleep(trojans, troy)", "Troy is asleep."],
    ["wake(trojans, troy)", "Troy is awake; the celebration runs late into the night."]],
  ["aspect", false,
    ["arrive(red, grandmother_house)", "Red is at the door of her grandmother's house, still outside."],
    ["arrive(red, grandmother_house)", "Red is inside the house, at the bedside."]],
  ["aspect", false,
    ["swallow(wolf, grandmother)", "The wolf has the grandmother cornered and is about to strike."],
    ["swallow(wolf, grandmother)", "The grandmother is inside the wolf."]],
  ["extra-fact", false,
    ["enter(red, woods)", "Red is on the path in the woods, carrying the basket."],
    ["enter(red, woods)", "Red is on the path in the woods, and the wolf is watching her from the trees."]],
];

async function main() {
  const template = fs.readFileSync(path.join(R, "prompts", "same.v1.txt"), "utf8");
  const client = createClient({ cacheDir: path.join(R, "cache"), sampling: { seed: 7 } });
  const adversarial = process.argv.includes("--adversarial");
  const pairs = adversarial ? ADVERSARIAL : PAIRS;
  if (adversarial) {
    // Assert the AUTHORING rule instead of trusting it: every adversarial pair
    // was designed to pass the guard as it stood at authoring time, which
    // sorted arguments. The live guard is now ordered, so role-swap pairs are
    // deliberately guard-vetoed — that veto is the fix under test, not a
    // defect in the set.
    const sorted = (e) => extractArguments(e).sort().join("|");
    for (const [, , a, b] of pairs) {
      if (sorted(a[0]) !== sorted(b[0])) throw new Error(`pair breaks the authoring rule (sorted-equal args): ${a[0]} / ${b[0]}`);
    }
    console.log(`adversarial set: ${pairs.length} pairs, all sorted-equal by authoring rule\n`);
  }

  const results = [];
  for (const [kind, expected, a, b] of pairs) {
    const prompt = template
      .replaceAll("{{a_expr}}", a[0]).replaceAll("{{a_state}}", a[1])
      .replaceAll("{{b_expr}}", b[0]).replaceAll("{{b_state}}", b[1]);
    let raw = null;
    try {
      const { content } = await client.complete(prompt, SCHEMA, {});
      raw = JSON.parse(content).same;
    } catch (error) {
      console.error(`  !! ${a[0]} / ${b[0]}: ${error.message}`);
    }
    // A null answer is an infrastructure failure, not an opinion. It must
    // never enter the guard: guard(null) -> false happens to MATCH every
    // "different" label, so a dead server would score 7/18 and look like a
    // weak discriminator instead of like a dead server. Count it apart.
    if (raw === null) {
      results.push({ kind, expected, raw, got: null, a, b, ok: false, failed: true });
      continue;
    }
    const guarded = sameArguments(a[0], b[0]) ? raw : false;
    results.push({ kind, expected, raw, got: guarded, a, b,
      ok: guarded === expected, vetoed: raw === true && guarded === false });
  }

  for (const r of results) {
    console.log(`${r.ok ? "  ok  " : "  MISS"} [${r.kind}] expected ${r.expected}, `
      + `model said ${r.raw}${r.vetoed ? " → VETOED by argument guard" : ""}`);
    if (!r.ok) console.log(`         A: ${r.a[0]}\n         B: ${r.b[0]}`);
  }
  const rawCorrect = results.filter((r) => !r.failed && r.raw === r.expected).length;
  console.log(`\n  model alone ${rawCorrect}/${results.filter((r) => !r.failed).length}`);

  const failed = results.filter((r) => r.failed).length;
  if (failed) {
    console.log(`\n  *** ${failed}/${results.length} pairs got NO answer (server down or`);
    console.log("      truncation). Accuracy below is over answered pairs only.");
  }
  const answered = results.filter((r) => !r.failed);
  const n = answered.length;
  const correct = answered.filter((r) => r.ok).length;
  // Both directions matter and they fail differently: saying SAME too often
  // over-merges the graph into mush, saying DIFFERENT too often is just
  // today's surface-form key with extra latency.
  const pos = answered.filter((r) => r.expected);
  const neg = answered.filter((r) => !r.expected);
  console.log(`\n  accuracy    ${correct}/${n}${n ? ` (${(correct / n * 100).toFixed(0)}%)` : ""}`);
  console.log(`  same pairs  ${pos.filter((r) => r.ok).length}/${pos.length} recognised as same`);
  console.log(`  diff pairs  ${neg.filter((r) => r.ok).length}/${neg.length} recognised as different`);
  const falseMerges = neg.filter((r) => r.got === true);
  console.log(`  FALSE MERGES (guarded verdict "same" on a different pair): ${falseMerges.length}`);
  for (const r of falseMerges) console.log(`      ${r.a[0]}  /  ${r.b[0]}`);
  const always = new Set(answered.map((r) => r.got));
  if (always.size === 1) {
    console.log(`  *** the model answered ${[...always][0]} to EVERY pair — it is not`);
    console.log("      discriminating at all, and the accuracy above is just the");
    console.log("      class balance of the test set.");
  }
}

// Behind require.main for the same reason gen_probe.js is (§0): requiring
// this module for PAIRS or sameArguments must not fire 18 model calls.
if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { PAIRS, ADVERSARIAL, sameArguments };
