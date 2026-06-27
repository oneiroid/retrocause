// Master and Margarita — the Torgsin scene (ch. 28), typed lexicon.
//
// Purpose: a fixture to MEASURE meaningful frontier width along a single
// world-path (seeds.js `torgsin`). The frontier census (auto-branch +
// auto-merge at each node) is run by a separate runner; this file is the
// deemed-possible action space.
//
// CONFIRMED MODEL (conversation 2026-06-23):
//  - Ω = the collective self-lie cracking. Two terminal markers:
//    `facade_exposed` (the crack) and `on_fire(store)` (the fire — the
//    "waltz of interesting times", the completed dissolution). The
//    foreigner's unmasking is a SIDE detail, not the attractor.
//  - The speech does not *cause* the eruption. It *suspends the norm* —
//    removes the lid. While `norm_intact` holds, the crowd is inert and
//    the frontier is narrow (only procedural, institution-policing
//    moves). The instant `norm_suspended` holds, the whole latent
//    collective becomes deemed-possible at once: loot, lynch, erupt in
//    truth, or re-seal into order. Frontier width should SPIKE there.
//
// HONESTY NOTE (INTUITIONS §8 / §9): the spike is a consequence of one
// auditable precondition — the four social-eruption entries require
// `norm_suspended`, and `incite` produces it. That precondition is a
// falsifiable claim about this storyworld ("social eruption is possible
// only once the self-policing performance is suspended"), confirmed with
// the reader. It is NOT hand-placed topology. Disagree with the
// precondition → change one `requires` → the width changes. The frontier
// number is real but lexicon-relative: §9 operationalized, not closed.

(function attachTorgsinFixture(root) {
  const has = (state, atom) => state.has(atom);

  // -------- Lexicon L (fixed-agent entries; params:[] → one candidate each) --------
  // Each entry: requires(binding, state) gates membership in the frontier;
  // effects(binding, state) → {add, remove} gives the post-state.

  // Provocation — Behemoth's open theft. Effectful once (sets the visible
  // transgression); re-eating adds nothing, so it leaves the frontier.
  const gorge = {
    name: "gorge", agent: "behemoth", params: [],
    gloss: () => "Behemoth devours the goods in plain sight",
    requires: (_b, s) => has(s, "present(behemoth)") && !has(s, "transgressing(behemoth)") && !has(s, "on_fire(store)"),
    effects: () => ({ add: ["transgressing(behemoth)"] }),
  };

  // Institution asserts its rule.
  const demand = {
    name: "demand", agent: "saleswoman", params: [],
    gloss: () => "The saleswoman demands currency / a receipt",
    requires: (_b, s) => has(s, "transgressing(behemoth)") && !has(s, "alarm_raised") && has(s, "norm_intact"),
    effects: () => ({ add: ["alarm_raised"] }),
  };

  // Koroviev's charming evasion — a stall, not compliance.
  const placate = {
    name: "placate", agent: "koroviev", params: [],
    gloss: () => "Koroviev's soothing patter deflects the rule",
    requires: (_b, s) => has(s, "alarm_raised") && has(s, "norm_intact") && !has(s, "manager_engaged") && !has(s, "placated"),
    effects: () => ({ add: ["placated"] }),
  };

  // Authority is called in.
  const summon = {
    name: "summon", agent: "saleswoman", params: [],
    gloss: () => "'Palosich!' — the manager is summoned",
    requires: (_b, s) => has(s, "alarm_raised") && !has(s, "manager_engaged"),
    effects: () => ({ add: ["manager_engaged"] }),
  };

  // The trap closes: the manager calls the apparatus of order; the crowd encircles.
  const command_whistle = {
    name: "command_whistle", agent: "pavel", params: [],
    gloss: () => "Pavel commands 'Whistle!'; the doorman whistles, the crowd encircles",
    requires: (_b, s) => has(s, "manager_engaged") && !has(s, "encircled(thieves)") && has(s, "norm_intact"),
    effects: () => ({ add: ["encircled(thieves)"] }),
  };

  // THE FRONTIER-OPENER. Removes the lid. Does not select an outcome.
  const incite = {
    name: "incite", agent: "koroviev", params: [],
    gloss: () => "Koroviev's demagogic speech suspends the self-policing norm",
    requires: (_b, s) => has(s, "encircled(thieves)") && has(s, "norm_intact"),
    effects: () => ({
      remove: ["norm_intact"],
      add: ["norm_suspended", "incited(crowd)", "sympathy(crowd,thieves)"],
    }),
  };

  // ----- The latent collective: all require norm_suspended (the lid off) -----

  // REALIZED edge: the meek old man's single act of truth.
  const erupt_truth = {
    name: "erupt_truth", agent: "old_man", params: [],
    gloss: () => "The meek old man erupts — 'Pravda!' — and strikes the 'foreigner'",
    requires: (_b, s) => has(s, "norm_suspended") && has(s, "present(old_man)") && has(s, "present(foreigner)") && !has(s, "struck(foreigner)"),
    effects: () => ({ add: ["struck(foreigner)", "facade_exposed"] }),
  };

  // The mob plunders.
  const loot = {
    name: "loot", agent: "crowd", params: [],
    gloss: () => "The crowd wrecks the store and seizes the goods",
    requires: (_b, s) => has(s, "norm_suspended") && has(s, "present(crowd)") && !has(s, "looted(store)"),
    effects: () => ({ add: ["looted(store)", "facade_exposed"] }),
  };

  // The mob scapegoats.
  const lynch = {
    name: "lynch", agent: "crowd", params: [],
    gloss: () => "The crowd turns on the 'foreigner'",
    requires: (_b, s) => has(s, "norm_suspended") && has(s, "present(crowd)") && has(s, "present(foreigner)") && !has(s, "harmed(foreigner)"),
    effects: () => ({ add: ["harmed(foreigner)", "facade_exposed"] }),
  };

  // The authoritarian reflex re-seals the lie.
  const restore_order = {
    name: "restore_order", agent: "pavel", params: [],
    gloss: () => "Pavel reasserts order; the lid goes back on",
    requires: (_b, s) => has(s, "norm_suspended") && has(s, "manager_engaged") && !has(s, "order_restored"),
    effects: () => ({ remove: ["norm_suspended"], add: ["norm_intact", "order_restored"] }),
  };

  // The fire — the completed dissolution (Ω marker 2).
  const ignite = {
    name: "ignite", agent: "behemoth", params: [],
    gloss: () => "Behemoth douses the counter with benzine; the store burns",
    requires: (_b, s) => has(s, "norm_suspended") && has(s, "encircled(thieves)") && !has(s, "on_fire(store)"),
    effects: () => ({ add: ["on_fire(store)", "facade_exposed"] }),
  };

  // Order's last approach.
  const arrive_police = {
    name: "arrive_police", agent: "police", params: [],
    gloss: () => "Police helmets approach through the crowd",
    requires: (_b, s) => has(s, "encircled(thieves)") && !has(s, "police_present"),
    effects: () => ({ add: ["police_present"] }),
  };

  // The agents exit their own revelation.
  const vanish = {
    name: "vanish", agent: "koroviev", params: [],
    gloss: () => "Koroviev and Behemoth vanish",
    requires: (_b, s) => has(s, "on_fire(store)") && !has(s, "gone(thieves)"),
    effects: () => ({ add: ["gone(thieves)"] }),
  };

  const lexicon = [
    gorge, demand, placate, summon, command_whistle, incite,
    erupt_truth, loot, lynch, restore_order, ignite, arrive_police, vanish,
  ];

  // -------- Derivation rule: the fraud reveal (dramatic irony, §1.7) --------
  // A struck "foreigner" reverts to accentless Russian under shock — the
  // closure makes `exposed(foreigner)` true though no one "learned" it.
  // A side consequence of the eruption, not the attractor.
  const fraud_reveal = {
    name: "fraud_reveal",
    fire: (state) => {
      if (state.has("struck(foreigner)") && !state.has("exposed(foreigner)")) {
        return { add: ["speaks_russian(foreigner)", "exposed(foreigner)"] };
      }
      return null;
    },
  };

  // -------- Scope --------
  const scope = {
    values: {}, // all entries are fixed-agent (params:[]) — no binding domains needed yet
    initial_state: new Set([
      "present(koroviev)", "present(behemoth)", "present(saleswoman)",
      "present(foreigner)", "present(old_man)", "present(crowd)",
      "norm_intact",
      "pretends_foreign(foreigner)", "privileged(foreigner)",
    ]),
    derivations: [fraud_reveal],
  };

  // The realized world-path as a sequence of entry names (the thread the
  // novel actually takes through the deemed-possible space).
  const realizedPath = [
    "gorge", "demand", "placate", "summon", "command_whistle",
    "incite", "erupt_truth", "ignite", "vanish",
  ];

  const api = {
    lexicon, scope,
    entries: Object.fromEntries(lexicon.map((e) => [e.name, e])),
    rules: { fraud_reveal },
    realizedPath,
    omegaMarkers: ["facade_exposed", "on_fire(store)"],
    // Where the sim stops expanding a world: the scene complete (thieves
    // gone after the fire). Distinct from omegaMarkers (the Ω *attractor*);
    // expanding to here lets the full breathing cone form before cone.js
    // takes the terminal worlds as Ω. See FRONTIER_SIM.md.
    terminalMarker: "gone(thieves)",
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseTorgsinFixture = api;
})(typeof window !== "undefined" ? window : globalThis);
