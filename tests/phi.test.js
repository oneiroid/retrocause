// Tests for the frontier enumerator (phi.js) against the Red Riding
// Hood worked example (FORMAL_MODEL.md Appendix B, sections B.4-B.5).

const test = require("node:test");
const assert = require("node:assert/strict");

const Phi = require("../phi.js");
const Red = require("../red_fixture.js");

// -------- §B.4 state propagation should produce expected post-state --------

test("§B.4 give(mother,red,basket) effects transfer the basket", () => {
  const give = Red.entries.give;
  const s0 = Red.scope.initial_state;
  const s1 = Phi.step(s0, give, { Giver: "mother", Receiver: "red", Item: "basket" }, []);
  assert.equal(s1.has("has(mother,basket)"), false, "mother should no longer have basket");
  assert.equal(s1.has("has(red,basket)"), true, "red should now have basket");
});

test("§B.4 full canonical replay yields red_wolf post-state with key facts", () => {
  const s = Red.postStateAtRedWolf();
  assert.equal(s.has("at(red,woods)"), true, "red is at woods");
  assert.equal(s.has("at(red,home)"), false, "red is no longer at home");
  assert.equal(s.has("has(red,basket)"), true, "red has basket");
  assert.equal(s.has("knows(wolf,destination(red,grandmother_house))"), true,
               "wolf learned red's destination");
});

// -------- §B.5 frontier at red_wolf --------

function frontierAtRedWolf() {
  const state = Red.postStateAtRedWolf();
  // Replicate the §B.5 setup: no downstream filter (we want the full Phi).
  return Phi.phi({
    lexicon: Red.lexicon,
    scope: Red.scope,
    state,
    downstreamExprs: new Set(),
  });
}

function exprsOf(candidates) {
  return new Set(candidates.map(c => c.expr));
}

// The eight "yes / sig-only" rows from §B.5 that must appear.
const EXPECTED_PRESENT = [
  "move(red,woods,grandmother_house)",
  "move(red,woods,home)",
  "move(wolf,woods,grandmother_house)",
  "ask_help(red,woodcutter)",
  "ask_help(red,wolf)",                        // §B.6 OPEN: type-correct, narratively absurd
  "give(red,wolf,basket)",
  "give(red,woodcutter,basket)",
  "delay(red,flowers)",
];

// The three "no" rows from §B.5 that must be filtered out by `requires`.
const EXPECTED_ABSENT = [
  "impersonate(wolf,grandmother,grandmother_house)",       // wolf not at grandmother_house
  "recognize(red,deception(wolf,grandmother),late)",       // present(red, deception) not in state
  "rescue(woodcutter,red,grandmother)",                    // intends(woodcutter,aid(red)) not in state
];

test("§B.5 Phi(red_wolf) contains every expected candidate", () => {
  const exprs = exprsOf(frontierAtRedWolf());
  for (const e of EXPECTED_PRESENT) {
    assert.ok(exprs.has(e), `expected candidate missing: ${e}`);
  }
});

test("§B.5 Phi(red_wolf) excludes every precondition-failing candidate", () => {
  const exprs = exprsOf(frontierAtRedWolf());
  for (const e of EXPECTED_ABSENT) {
    assert.ok(!exprs.has(e), `unexpected candidate present (precondition should have filtered): ${e}`);
  }
});

test("§B.5 Phi(red_wolf) returns a finite, plausibly-bounded candidate set", () => {
  const candidates = frontierAtRedWolf();
  // Sanity: not zero, not absurdly huge. Each entry's binding ranges over
  // typed scope values; the cartesian product is finite.
  assert.ok(candidates.length > EXPECTED_PRESENT.length,
            `expected more than ${EXPECTED_PRESENT.length} candidates (the §B.5 table was a sample), got ${candidates.length}`);
  assert.ok(candidates.length < 1000,
            `frontier too large: ${candidates.length}; type-bounding may be broken`);
});

// -------- §7.9 metrics scaffolding --------

test("§7.9 specificity is 1.0 for atomic candidates (all slots bound)", () => {
  const cands = frontierAtRedWolf();
  for (const c of cands) {
    assert.equal(Phi.specificity(c), 1.0, `expected specificity 1.0 for ${c.expr}`);
  }
});

test("§7.9 contrast counts differing parameter positions vs canonical", () => {
  const cands = frontierAtRedWolf();
  const canonical = cands.find(c => c.expr === "move(red,woods,grandmother_house)");
  const turnBack  = cands.find(c => c.expr === "move(red,woods,home)");
  assert.ok(canonical, "canonical candidate exists");
  assert.ok(turnBack, "turn-back candidate exists");
  assert.equal(Phi.contrastVsCanonical(turnBack, canonical), 1,
               "turn-back differs only in To param");
  assert.equal(Phi.contrastVsCanonical(canonical, canonical), 0,
               "canonical vs itself = 0");
});

// -------- §1.7 derivation closure smoke test (Red has no rules, but closure must no-op) --------

test("§1.7 derivation_closure with empty rule set returns input unchanged", () => {
  const s = Red.postStateAtRedWolf();
  const s2 = Phi.derivationClosure(s, []);
  assert.equal(Phi.statesEqual(s, s2), true);
});

test("§1.7 derivation_closure terminates on a stratified rule", () => {
  // Toy stratified rule: if has(red,basket) then derive carrying(red).
  const rule = {
    name: "carrying_implies_has",
    fire: (state) => {
      if (state.has("has(red,basket)") && !state.has("carrying(red)")) {
        return { add: ["carrying(red)"] };
      }
      return null;
    },
  };
  const s = Red.postStateAtRedWolf();
  const s2 = Phi.derivationClosure(s, [rule]);
  assert.equal(s2.has("carrying(red)"), true, "derived fact should be present");
  // Re-running closure on s2 must reach the same fixed point.
  const s3 = Phi.derivationClosure(s2, [rule]);
  assert.equal(Phi.statesEqual(s2, s3), true, "closure is idempotent at fixed point");
});

test("auto-candidate evaluation rejects entries that produce no state delta", () => {
  const candidate = {
    entry: {
      name: "observe",
      params: [{ name: "X", type: "entity" }],
      effects: () => ({ add: [] }),
    },
    binding: { X: "red" },
    expr: "observe(red)",
  };
  const result = Phi.evaluateCandidate(candidate, {
    state: new Set(["at(red,woods)"]),
  });
  assert.equal(result.admissible, false);
  assert.ok(result.reasons.includes("no state delta"));
});

test("auto-candidate evaluation rejects post-states already seen in the run", () => {
  const before = new Set(["at(red,woods)"]);
  const candidate = {
    entry: {
      name: "learn",
      params: [{ name: "X", type: "entity" }],
      effects: () => ({ add: ["knows(red,path)"] }),
    },
    binding: { X: "red" },
    expr: "learn(red)",
  };
  const post = Phi.step(before, candidate.entry, candidate.binding, []);
  const result = Phi.evaluateCandidate(candidate, {
    state: before,
    seenStateKeys: new Set([Phi.stateKey(post)]),
  });
  assert.equal(result.admissible, false);
  assert.ok(result.reasons.includes("state already seen on this run"));
});

test("rankMeaningfulCandidates prefers richer state deltas on the Pareto frontier", () => {
  const state = new Set(["has(red,basket)", "at(red,woods)"]);
  const weak = {
    entry: {
      name: "notice",
      params: [{ name: "X", type: "entity" }],
      effects: () => ({ add: ["knows(red,wolf)"] }),
    },
    binding: { X: "red" },
    expr: "notice(red)",
  };
  const strong = {
    entry: {
      name: "give",
      params: [{ name: "X", type: "entity" }],
      effects: () => ({ add: ["has(wolf,basket)"], remove: ["has(red,basket)"] }),
    },
    binding: { X: "red" },
    expr: "give(red)",
  };

  const ranked = Phi.rankMeaningfulCandidates([weak, strong], { state });
  assert.equal(ranked[0].candidate.expr, "give(red)");
});
