// Gift of the Magi worked example, encoded from FORMAL_MODEL.md
// Appendix C (sections C.1 scope, C.2 lexicon, C.4 state propagation)
// and §1.7.3 (useless_pairing derivation rule).
//
// Design notes:
// - The "couple" group entity (§C.1 OPEN C.1-1) is desugared per
//   route (b): couple-subject actions are not modeled directly; tests
//   exercise the per-member equivalents.
// - The useless_pairing rule in §1.7.3 is encoded in a refined form:
//   it uses a positive sacrificed(Y, RequiredA) fact (added by
//   sacrifice's effects) instead of the closed-world `not has(Y, RequiredA)`
//   clause. Execution-empirical reason: the literal §1.7.3 form fires
//   spuriously (e.g. useless(watch_chain, sacrificed(della, watch)),
//   since della doesn't have a watch she never had). The refined form
//   is faithful to the narrative reading and is the natural cleanup
//   suggested by trying to run the rule. Whether to back-port this
//   refinement to §1.7.3 is a spec decision deferred until n>=3 worked
//   rules have been written.

(function attachMagiFixture(root) {

  function hasFact(state, name, ...args) {
    return state.has(`${name}(${args.join(",")})`);
  }
  function existsP(state, e1, e2) {
    for (const fact of state) {
      const m = fact.match(/^at\(([^,]+),([^)]+)\)$/);
      if (m && m[1] === e1) {
        if (state.has(`at(${e2},${m[2]})`)) return true;
      }
    }
    return false;
  }

  // -------- §C.2 Lexicon L --------

  const realize = {
    name: "realize",
    params: [
      { name: "X", type: "entity" },
      { name: "F", type: "state_atom" },
    ],
    gloss: ({X, F}) => `${X} realizes that ${F}`,
    requires: ({F}, state) => state.has(F),  // F must actually hold
    effects: ({X, F}) => ({ add: [`knows(${X},${F})`] }),
  };

  const sacrifice = {
    name: "sacrifice",
    params: [
      { name: "X", type: "entity" },
      { name: "Item", type: "entity" },
    ],
    gloss: ({X, Item}) => `${X} sacrifices ${Item}`,
    requires: ({X, Item}, state) =>
      hasFact(state, "has", X, Item) && hasFact(state, "values", X, Item),
    // Refined effects: add sacrificed(X, Item) positive fact so derivation
    // rules can reference it without closed-world `not has` heuristics.
    effects: ({X, Item}) => ({
      remove: [`has(${X},${Item})`],
      add:    [`has_funds(${X})`, `sacrificed(${X},${Item})`],
    }),
  };

  const buy = {
    name: "buy",
    params: [
      { name: "X", type: "entity" },
      { name: "Item", type: "entity" },
    ],
    gloss: ({X, Item}) => `${X} buys ${Item}`,
    requires: ({X, Item}, state) =>
      hasFact(state, "has_funds", X)
      && !hasFact(state, "has", X, Item)
      && !hasFact(state, "sacrificed", X, Item)
      && Array.from(state).some((fact) => {
        const paired = fact.match(/^pairs_with\(([^,]+),([^)]+)\)$/);
        if (!paired || paired[1] !== Item) return false;
        return Array.from(state).some((owned) => {
          const held = owned.match(/^has\(([^,]+),([^)]+)\)$/);
          return held && held[1] !== X && held[2] === paired[2];
        });
      }),
    effects: ({X, Item}) => ({
      add:    [`has(${X},${Item})`],
      remove: [`has_funds(${X})`],
    }),
  };

  const confess = {
    name: "confess",
    params: [
      { name: "X", type: "entity" },
      { name: "Y", type: "entity" },
      { name: "F", type: "state_atom" },
    ],
    gloss: ({X, Y, F}) => `${X} confesses ${F} to ${Y}`,
    requires: ({X, Y, F}, state) =>
      X !== Y
      && state.has(`knows(${X},${F})`)
      && !state.has(`knows(${Y},${F})`)
      && existsP(state, X, Y),
    effects: ({Y, F}) => ({ add: [`knows(${Y},${F})`] }),
  };

  const choose = {
    name: "choose",
    params: [
      { name: "X", type: "entity" },
      { name: "Plan", type: "completion" },
    ],
    gloss: ({X, Plan}) => `${X} chooses ${Plan}`,
    requires: ({X}, state) => hasFact(state, "alive", X),
    effects: ({X, Plan}) => ({ add: [`intends(${X},${Plan})`] }),
  };

  const recognize = {
    name: "recognize",
    params: [
      { name: "X", type: "entity" },
      { name: "Z", type: "completion" },
      { name: "M", type: "mode" },
    ],
    gloss: ({X, Z, M}) => `${X} recognizes ${Z}, in mode ${M}`,
    requires: ({X, Z}, state) =>
      state.has(`present(${X},${Z})`) || state.has(`knows(${X},${Z})`),
    effects: ({X, Z}) => ({ add: [`knows(${X},${Z})`] }),
  };

  // reveal: signature-only here. The quantified per-entity effect from
  // §C.2 is the same shape as Red's impersonate OPEN (B.3-1 / C.2-1)
  // and is deferred until P supports `forall X in S: <delta>`.
  const reveal = {
    name: "reveal",
    params: [{ name: "F", type: "completion" }],
    gloss: ({F}) => `${F} is revealed`,
    requires: ({F}, state) => state.has(F),
  };

  const lexicon = [realize, sacrifice, buy, confess, choose, recognize, reveal];

  // -------- §1.7.3 useless_pairing derivation rule (refined form) --------

  const useless_pairing = {
    name: "useless_pairing",
    fire: (state) => {
      const entities = ["della", "jim"];  // narrowed to gift-givers
      const newFacts = [];
      for (const fact of state) {
        const m = fact.match(/^pairs_with\(([^,]+),([^)]+)\)$/);
        if (!m) continue;
        const GiftA = m[1], RequiredA = m[2];
        for (const X of entities) {
          if (!state.has(`has(${X},${GiftA})`)) continue;
          for (const Y of entities) {
            if (Y === X) continue;
            if (!state.has(`sacrificed(${Y},${RequiredA})`)) continue;
            const derived = `useless(${GiftA},sacrificed(${Y},${RequiredA}))`;
            if (!state.has(derived)) newFacts.push(derived);
          }
        }
      }
      return newFacts.length ? { add: newFacts } : null;
    },
  };

  // -------- §C.1 scope --------

  const scope = {
    values: {
      entity: ["della", "jim", "hair", "watch", "watch_chain", "combs"],
      place: ["home", "shop"],
      completion: ["shared_meal", "love(della,jim)", "mutual_sacrifice(della,jim)"],
      state_atom: [
        "not_has_funds(della)",   // canonical names for state-level
        "not_has_funds(jim)",     // facts referenced by realize/confess
      ],
      mode: ["early", "late", "profound"],
    },
    initial_state: new Set([
      "alive(della)", "alive(jim)",
      "married(della,jim)",
      "at(della,home)", "at(jim,home)",
      "has(della,hair)", "has(jim,watch)",
      "values(della,hair)", "values(jim,watch)",
      "intends(della,gift_for(jim))",
      "intends(jim,gift_for(della))",
      "not_has_funds(della)",
      "not_has_funds(jim)",
      // story-level givens enabling the useless_pairing rule:
      "pairs_with(watch_chain,watch)",
      "pairs_with(combs,hair)",
    ]),
    derivations: [useless_pairing],
  };

  // -------- §C.4 actor-thread replay --------

  function postStateAfterMagiStart() {
    const Phi = root.RetrocausePhi || require("./phi.js");
    return Phi.step(scope.initial_state, realize,
                    { X: "della", F: "not_has_funds(della)" },
                    scope.derivations);
  }

  function postStateDellaChainEnd() {
    const Phi = root.RetrocausePhi || require("./phi.js");
    let s = postStateAfterMagiStart();
    s = Phi.step(s, sacrifice, { X: "della", Item: "hair" }, scope.derivations);
    s = Phi.step(s, buy,       { X: "della", Item: "watch_chain" }, scope.derivations);
    return s;
  }

  function postStateJimChainEnd() {
    const Phi = root.RetrocausePhi || require("./phi.js");
    // jim's chain is a separate actor thread. The seed also branches
    // it from magi_start; this fixture-level helper keeps the older
    // isolated baseline used by unit tests.
    let s = scope.initial_state;
    s = Phi.step(s, sacrifice, { X: "jim", Item: "watch" }, scope.derivations);
    s = Phi.step(s, buy,       { X: "jim", Item: "combs" }, scope.derivations);
    return s;
  }

  function postStateAtMagiReveal() {
    const Phi = root.RetrocausePhi || require("./phi.js");
    const merged = Phi.mergeStates(postStateDellaChainEnd(), postStateJimChainEnd());
    return Phi.derivationClosure(merged, scope.derivations);
  }

  const api = {
    lexicon, scope,
    entries: { realize, sacrifice, buy, confess, choose, recognize, reveal },
    rules: { useless_pairing },
    postStateAfterMagiStart,
    postStateDellaChainEnd,
    postStateJimChainEnd,
    postStateAtMagiReveal,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseMagiFixture = api;
})(typeof window !== "undefined" ? window : globalThis);
