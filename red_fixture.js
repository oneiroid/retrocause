// Red Riding Hood worked example, encoded from FORMAL_MODEL.md
// Appendix B (sections B.1 scope, B.2 L entries, B.4 state propagation).
// Designed so that phi(red_wolf) reproduces the sample frontier listed
// in §B.5.
//
// Conventions:
// - Facts in the state are canonical strings: "at(red,woods)", with no
//   spaces and arguments in declared order.
// - exists-quantified preconditions iterate the state directly.
// - "flowers" is added to scope.props because the seed uses it in
//   delay(red, flowers); §B.2 lists delay as signature-only and this
//   addition is a faithful expansion.

(function attachRedFixture(root) {

  // -------- helpers for predicate access in JS closures --------
  function hasFact(state, name, ...args) {
    return state.has(`${name}(${args.join(",")})`);
  }
  function existsP(state, e1, e2) {
    // exists P : at(e1, P) and at(e2, P)
    for (const fact of state) {
      const m = fact.match(/^at\(([^,]+),([^)]+)\)$/);
      if (m && m[1] === e1) {
        if (state.has(`at(${e2},${m[2]})`)) return true;
      }
    }
    return false;
  }

  // -------- §B.2 Lexicon L (fully annotated entries) --------

  const give = {
    name: "give",
    params: [
      { name: "Giver", type: "entity" },
      { name: "Receiver", type: "entity" },
      { name: "Item", type: "entity" },
    ],
    gloss: ({Giver, Receiver, Item}) => `${Giver} gives ${Item} to ${Receiver}`,
    requires: ({Giver, Receiver, Item}, state) => {
      if (!hasFact(state, "has", Giver, Item)) return false;
      if (Giver === Receiver) return false;
      return existsP(state, Giver, Receiver);
    },
    effects: ({Giver, Receiver, Item}) => ({
      remove: [`has(${Giver},${Item})`],
      add:    [`has(${Receiver},${Item})`],
    }),
  };

  const move = {
    name: "move",
    params: [
      { name: "X", type: "entity" },
      { name: "From", type: "place" },
      { name: "To", type: "place" },
    ],
    gloss: ({X, From, To}) => `${X} moves from ${From} to ${To}`,
    requires: ({X, From, To}, state) =>
      From !== To
      && hasFact(state, "at", X, From)
      && hasFact(state, "alive", X),
    effects: ({X, From, To}) => ({
      remove: [`at(${X},${From})`],
      add:    [`at(${X},${To})`],
    }),
  };

  const learn_from = {
    name: "learn_from",
    params: [
      { name: "L", type: "entity" },
      { name: "S", type: "entity" },
      { name: "F", type: "completion" },
      { name: "P", type: "place" },
    ],
    gloss: ({L, S, F, P}) => `${L} learns ${F} from ${S} at ${P}`,
    requires: ({L, S, F, P}, state) =>
      L !== S
      && hasFact(state, "at", L, P)
      && hasFact(state, "at", S, P)
      && hasFact(state, "knows", S, F),
    effects: ({L, F}) => ({ add: [`knows(${L},${F})`] }),
  };

  const impersonate = {
    name: "impersonate",
    params: [
      { name: "X", type: "entity" },
      { name: "Y", type: "entity" },
      { name: "P", type: "place" },
    ],
    gloss: ({X, Y, P}) => `${X} impersonates ${Y} at ${P}`,
    requires: ({X, Y, P}, state) =>
      X !== Y
      && hasFact(state, "at", X, P)
      && !hasFact(state, "at", Y, P)
      && hasFact(state, "alive", X),
    // OPEN B.3-1: quantified effect, deferred — modeled as a no-op here.
    effects: () => ({ add: [] }),
  };

  const recognize = {
    name: "recognize",
    params: [
      { name: "X", type: "entity" },
      { name: "Z", type: "completion" },
      { name: "M", type: "mode" },
    ],
    gloss: ({X, Z, M}) => `${X} recognizes ${Z}, in mode ${M}`,
    requires: ({X, Z}, state) => hasFact(state, "present", X, Z),
    effects: ({X, Z}) => ({ add: [`knows(${X},${Z})`] }),
  };

  const ask_help = {
    name: "ask_help",
    params: [
      { name: "Asker", type: "entity" },
      { name: "Helper", type: "entity" },
    ],
    gloss: ({Asker, Helper}) => `${Asker} asks ${Helper} for help`,
    requires: ({Asker, Helper}, state) =>
      Asker !== Helper
      && hasFact(state, "alive", Helper)
      && existsP(state, Asker, Helper),
    effects: ({Asker, Helper}) => ({ add: [`intends(${Helper},aid(${Asker}))`] }),
  };

  const rescue = {
    name: "rescue",
    params: [
      { name: "Rescuer", type: "entity" },
      { name: "Victim", type: "entity" },
      { name: "Bystander", type: "entity" },
    ],
    gloss: ({Rescuer, Victim, Bystander}) => `${Rescuer} rescues ${Victim} and ${Bystander}`,
    requires: ({Rescuer, Victim, Bystander}, state) => {
      if (Rescuer === Victim || Rescuer === Bystander || Victim === Bystander) return false;
      if (!hasFact(state, "intends", Rescuer, `aid(${Victim})`)) return false;
      // exists P : at(Rescuer,P) and at(Victim,P) and at(Bystander,P)
      for (const fact of state) {
        const m = fact.match(/^at\(([^,]+),([^)]+)\)$/);
        if (m && m[1] === Rescuer) {
          const P = m[2];
          if (state.has(`at(${Victim},${P})`) && state.has(`at(${Bystander},${P})`)) return true;
        }
      }
      return false;
    },
    effects: ({Victim, Bystander}) => ({
      add: [`safe(${Victim})`, `safe(${Bystander})`],
    }),
  };

  // -------- §B.2 lightly annotated entries (signature only) --------

  const delay = {
    name: "delay",
    params: [
      { name: "X", type: "entity" },
      { name: "Distractor", type: "entity" },
    ],
    gloss: ({X, Distractor}) => `${X} is delayed by ${Distractor}`,
    // No requires/effects per §B.2 note: temporal predicates not yet in P.
  };

  const warn = {
    name: "warn",
    params: [
      { name: "Sender", type: "entity" },
      { name: "Receiver", type: "entity" },
      { name: "Topic", type: "completion" },
    ],
    gloss: ({Sender, Receiver, Topic}) => `${Sender} warns ${Receiver} about ${Topic}`,
    requires: ({Sender, Receiver}, state) =>
      Sender !== Receiver && existsP(state, Sender, Receiver),
    effects: ({Receiver, Topic}) => ({ add: [`knows(${Receiver},${Topic})`] }),
  };

  const lexicon = [give, move, learn_from, impersonate, recognize, ask_help, rescue, delay, warn];

  // -------- §B.1 scope --------

  const scope = {
    values: {
      entity: ["red", "mother", "wolf", "grandmother", "woodcutter", "basket", "flowers"],
      place:  ["home", "woods", "grandmother_house"],
      completion: [
        "destination(red,grandmother_house)",
        "deception(wolf,grandmother)",
      ],
      mode: ["early", "late"],
    },
    initial_state: new Set([
      "alive(red)", "alive(mother)", "alive(wolf)",
      "alive(grandmother)", "alive(woodcutter)",
      "at(red,home)", "at(mother,home)",
      "at(wolf,woods)", "at(woodcutter,woods)",
      "at(grandmother,grandmother_house)",
      "has(mother,basket)",
      "trusts(red,mother)", "trusts(red,grandmother)",
      "intends(red,deliver_basket)",
      "knows(red,destination(red,grandmother_house))",
    ]),
    derivations: [],  // none for Red; rules exercised by Magi fixture
  };

  // -------- §B.4 canonical path replay: produce post-state at red_wolf --------

  function postStateAtRedWolf() {
    const Phi = root.RetrocausePhi || require("./phi.js");
    let s = scope.initial_state;
    s = Phi.step(s, give,       { Giver: "mother", Receiver: "red", Item: "basket" }, scope.derivations);
    s = Phi.step(s, move,       { X: "red", From: "home", To: "woods" },             scope.derivations);
    s = Phi.step(s, learn_from, { L: "wolf", S: "red",
                                   F: "destination(red,grandmother_house)",
                                   P: "woods" }, scope.derivations);
    return s;
  }

  const api = { lexicon, scope, postStateAtRedWolf,
                entries: { give, move, learn_from, impersonate, recognize,
                           ask_help, rescue, delay, warn } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseRedFixture = api;
})(typeof window !== "undefined" ? window : globalThis);
