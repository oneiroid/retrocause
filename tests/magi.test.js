// Tests for the Magi fixture, exercising §1.7 derivation rules at the
// parallel-branch convergence point that is the formal home of the
// C.4-1 claim (dramatic irony = merge-derivation).

const test = require("node:test");
const assert = require("node:assert/strict");

const Phi = require("../phi.js");
const Magi = require("../magi_fixture.js");

// -------- §C.4 state propagation along each parallel chain --------

test("§C.4 della chain end state: lost hair, has chain, sacrificed flag set", () => {
  const s = Magi.postStateDellaChainEnd();
  assert.equal(s.has("has(della,hair)"), false, "della no longer has hair");
  assert.equal(s.has("has(della,watch_chain)"), true, "della has watch_chain");
  assert.equal(s.has("sacrificed(della,hair)"), true, "della's sacrifice is recorded");
  assert.equal(s.has("has_funds(della)"), false, "della spent her funds on the chain");
  // jim's state untouched by della's chain (parallel independence):
  assert.equal(s.has("has(jim,watch)"), true, "jim still has watch (della's branch did not affect him)");
  assert.equal(s.has("sacrificed(jim,watch)"), false, "jim's sacrifice did not happen in della's branch");
});

test("§C.4 jim chain end state: lost watch, has combs, sacrificed flag set", () => {
  const s = Magi.postStateJimChainEnd();
  assert.equal(s.has("has(jim,watch)"), false, "jim no longer has watch");
  assert.equal(s.has("has(jim,combs)"), true, "jim has combs");
  assert.equal(s.has("sacrificed(jim,watch)"), true, "jim's sacrifice is recorded");
  assert.equal(s.has("has(della,hair)"), true, "della still has hair (jim's branch did not affect her)");
  assert.equal(s.has("sacrificed(della,hair)"), false, "della's sacrifice did not happen in jim's branch");
});

// -------- §1.7.3 useless_pairing derivation rule at merged state --------

test("§1.7.3 merge of parallel chains produces a state containing both end-states", () => {
  const sD = Magi.postStateDellaChainEnd();
  const sJ = Magi.postStateJimChainEnd();
  const merged = Phi.mergeStates(sD, sJ);
  assert.equal(merged.has("sacrificed(della,hair)"), true, "della's sacrifice carried into merge");
  assert.equal(merged.has("sacrificed(jim,watch)"), true, "jim's sacrifice carried into merge");
  assert.equal(merged.has("has(della,watch_chain)"), true, "della's chain carried into merge");
  assert.equal(merged.has("has(jim,combs)"), true, "jim's combs carried into merge");
  // The pairs_with story-level givens survive (they were in initial_state, present in both branches):
  assert.equal(merged.has("pairs_with(watch_chain,watch)"), true);
  assert.equal(merged.has("pairs_with(combs,hair)"), true);
});

test("§1.7.3 derivation_closure at magi_reveal fires useless_pairing symmetrically (C.4-1)", () => {
  const s = Magi.postStateAtMagiReveal();
  assert.equal(
    s.has("useless(watch_chain,sacrificed(jim,watch))"), true,
    "watch_chain is useless because jim sacrificed the watch"
  );
  assert.equal(
    s.has("useless(combs,sacrificed(della,hair))"), true,
    "combs are useless because della sacrificed the hair"
  );
});

test("§1.7.3 useless_pairing does NOT fire spurious self-pairings", () => {
  const s = Magi.postStateAtMagiReveal();
  // Della never had a watch; jim never had hair. Spurious derivations
  // these would represent are guarded against by the refined rule.
  assert.equal(s.has("useless(watch_chain,sacrificed(della,watch))"), false,
               "no spurious self-pairing for della");
  assert.equal(s.has("useless(combs,sacrificed(jim,hair))"), false,
               "no spurious self-pairing for jim");
});

test("§1.7.3 derivation closure is idempotent at fixed point", () => {
  const s1 = Magi.postStateAtMagiReveal();
  const s2 = Phi.derivationClosure(s1, Magi.scope.derivations);
  assert.equal(Phi.statesEqual(s1, s2), true, "re-running closure produces no new facts");
});

// -------- §C.5 frontier at magi_start --------

function frontierAtMagiStart() {
  const state = Magi.postStateAfterMagiStart();
  return Phi.phi({
    lexicon: Magi.lexicon,
    scope: Magi.scope,
    state,
    downstreamExprs: new Set(),
  });
}

const EXPECTED_PRESENT = [
  "sacrifice(della,hair)",      // canonical next for della
  "sacrifice(jim,watch)",       // canonical next for jim (parallel)
  "confess(della,jim,not_has_funds(della))",  // seed's branch
  "realize(jim,not_has_funds(jim))",          // jim's symmetric awareness
];

const EXPECTED_ABSENT = [
  // sacrifice requires has(X, Item) and values(X, Item):
  "sacrifice(della,watch)",                   // della doesn't have watch
  "sacrifice(jim,hair)",                      // jim doesn't have hair
  // buy requires has_funds(X), which neither has at magi_start:
  "buy(della,watch_chain)",
  "buy(jim,combs)",
  // confess requires X to know F; jim doesn't yet know his own lack:
  "confess(jim,della,not_has_funds(jim))",
];

test("§C.5 Phi(magi_start) contains every expected candidate", () => {
  const exprs = new Set(frontierAtMagiStart().map(c => c.expr));
  for (const e of EXPECTED_PRESENT) {
    assert.ok(exprs.has(e), `expected candidate missing: ${e}`);
  }
});

test("§C.5 Phi(magi_start) excludes every precondition-failing candidate", () => {
  const exprs = new Set(frontierAtMagiStart().map(c => c.expr));
  for (const e of EXPECTED_ABSENT) {
    assert.ok(!exprs.has(e), `unexpected candidate present (precondition should have filtered): ${e}`);
  }
});

test("§C.5 Phi(magi_start) confess fires only one-way (della->jim, not jim->della)", () => {
  // This is the dramatic-asymmetry test: at magi_start, only della has
  // realized her lack of funds (per §C.4). Jim has not. So confess
  // about jim's lack of funds cannot fire from jim, because jim doesn't
  // know it yet. The formalism produces this asymmetry without being told.
  const exprs = new Set(frontierAtMagiStart().map(c => c.expr));
  assert.ok(exprs.has("confess(della,jim,not_has_funds(della))"),
            "della->jim confession about della's funds: available");
  assert.ok(!exprs.has("confess(jim,della,not_has_funds(jim))"),
            "jim->della confession about jim's funds: blocked by knows() asymmetry");
});

test("§C.2 buy is limited to story-relevant paired gifts", () => {
  let s = Magi.postStateAfterMagiStart();
  s = Phi.step(s, Magi.entries.sacrifice, { X: "jim", Item: "watch" }, Magi.scope.derivations);
  const candidates = Phi.phi({
    lexicon: Magi.lexicon,
    scope: Magi.scope,
    state: s,
    downstreamExprs: new Set(),
  });
  const exprs = new Set(candidates.map(c => c.expr));
  assert.ok(exprs.has("buy(jim,combs)"), "jim can buy combs because they pair with della's hair");
  assert.ok(!exprs.has("buy(jim,watch)"), "jim should not buy back the sacrificed item");
  assert.ok(!exprs.has("buy(jim,hair)"), "jim should not buy an unpaired arbitrary entity");
});
