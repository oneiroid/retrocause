// Story seed data. Shared between the browser UI (story_builder_app.js)
// and node-based tests (tests/state_walker.test.js).
//
// Seeds are *visual + structural* declarations of canonical story DAGs.
// Canonical nodes may carry an `action: {entry, binding}` field that
// names a lexicon entry from the matching fixture; state_walker.js uses
// these annotations to replay post-states. Nodes without an action have
// post-state = pre-state (state pass-through). Branch/convergence nodes
// without typed fixtures (Tortoise, Necklace) have no actions yet. Seeds
// intentionally do not include premade counterfactual branches; branches
// are created in the UI by users, Phi materialization, or auto-branching.
//
// Omega note: each seed designates `omega` — the attractor Ω of
// FORMAL_MODEL.md §8.3.1, a non-empty list of terminal node ids. It is
// the ONE author input the cone derivation needs; cone.js derives
// support / waists / criticality from it. Deriving Ω automatically is
// `open` (§8.3.4) — these values are deliberate per-story choices.
//
// Magi note: jim's chain branches from `magi_start` in parallel with
// della's chain and rejoins at `magi_reveal`. The earlier sequential
// pathEdges shape was a layout convenience that contradicted the
// formalism (FORMAL_MODEL.md §C.4). The walker uses canonical edges
// to compute pre-state, so the edges have to be semantically faithful.

(function attachSeeds(root) {

  function node(id, label, expr, state, kind, tags, action) {
    return {
      id, label, expr, state,
      kind: kind || "canonical",
      tags: tags || [],
      createdBy: "seed",
      delta: "",
      invariants: "",
      ...(action ? { action } : {}),
    };
  }

  function edge(from, to, type, label) {
    type = type || "causes";
    return {
      id: `e_${from}_${to}_${type}`,
      from, to, type,
      label: label || "",
      canonical: type === "causes",
    };
  }

  function pathEdges(ids, label) {
    return ids.slice(0, -1).map((from, i) =>
      edge(from, ids[i + 1], "causes", label || "canonical next"));
  }

  // ---------------------------------------------------------------
  // Red Riding Hood (FORMAL_MODEL.md Appendix B)
  // ---------------------------------------------------------------
  const red = {
    title: "Little Red Riding Hood",
    summary: "Clean warning → temptation → disguise → rescue structure; good for early-detection branches.",
    root: "red_start",
    omega: ["red_rescue"],
    nodes: [
      node("red_start", "Mother gives errand", "send(mother, red, basket)",
        "Red has a mission, a destination, and a warning to stay on the path.",
        "root", ["warning", "quest"],
        { entry: "give", binding: { Giver: "mother", Receiver: "red", Item: "basket" } }),
      node("red_woods", "Red enters the woods", "enter(red, woods)",
        "Red crosses from domestic safety into a place where strangers can intervene.",
        "canonical", ["threshold"],
        { entry: "move", binding: { X: "red", From: "home", To: "woods" } }),
      node("red_wolf", "Wolf learns destination", "deceive(wolf, red)",
        "The wolf gains enough information to race ahead and construct a trap.",
        "canonical", ["deception", "predator"],
        { entry: "learn_from", binding: { L: "wolf", S: "red",
                                          F: "destination(red,grandmother_house)",
                                          P: "woods" } }),
      node("red_delay", "Red gathers flowers", "delay(red, flowers)",
        "Red loses time; the predator's route becomes causally prior to hers.",
        "canonical", ["temptation", "delay"],
        { entry: "delay", binding: { X: "red", Distractor: "flowers" } }),
      node("red_grandma", "Wolf reaches grandmother", "arrive(wolf, grandmother_house)",
        "The safe endpoint becomes compromised before Red arrives.",
        "canonical", ["inversion"],
        { entry: "move", binding: { X: "wolf", From: "woods", To: "grandmother_house" } }),
      // red_disguise: impersonate(wolf, grandmother, ...) requires
      // !at(grandmother, P); initial state has at(grandmother, grandmother_house),
      // so the precondition fails. Left without an action annotation per
      // M1 policy (only annotate where the action's `requires` would hold).
      node("red_disguise", "Wolf impersonates grandmother", "impersonate(wolf, grandmother)",
        "A trusted role now hides a threat inside a trusted house.",
        "canonical", ["disguise"]),
      node("red_recognition", "Red recognizes danger too late", "recognize(red, wolf, late)",
        "The deception collapses after Red has entered the trap.",
        "convergence", ["recognition"]),
      node("red_rescue", "Rescue restores household", "rescue(woodcutter, red, grandmother)",
        "Outside intervention reverses the closed predator-prey path.",
        "canonical", ["rescue", "restoration"]),
    ],
    edges: [
      ...pathEdges(["red_start", "red_woods", "red_wolf", "red_delay",
                    "red_grandma", "red_disguise", "red_recognition", "red_rescue"]),
    ],
  };

  // ---------------------------------------------------------------
  // Gift of the Magi (FORMAL_MODEL.md Appendix C)
  // Restructured for M1: jim's chain branches from magi_start in
  // parallel and rejoins at magi_reveal. The old linear pathEdges
  // chain placed jim's sacrifice after della's buy, which contradicts
  // the formal "parallel sacrifices" reading.
  // ---------------------------------------------------------------
  const magi = {
    title: "The Gift of the Magi",
    summary: "Parallel sacrifices and ironic convergence; excellent for invariant-love counterfactuals.",
    root: "magi_start",
    omega: ["magi_love"],
    nodes: [
      node("magi_start", "Della lacks gift money", "lack(della, money)",
        "Love is constrained by scarcity; action must convert value into a gift.",
        "root", ["scarcity", "love"],
        { entry: "realize", binding: { X: "della", F: "not_has_funds(della)" } }),
      node("magi_sell_hair", "Della sells her hair", "sacrifice(della, hair)",
        "Della turns her prized possession into money while losing what combs would adorn.",
        "canonical", ["sacrifice"],
        { entry: "sacrifice", binding: { X: "della", Item: "hair" } }),
      node("magi_buy_chain", "Della buys chain", "buy(della, watch_chain)",
        "Her gift assumes Jim still has his watch.",
        "canonical", ["gift", "assumption"],
        { entry: "buy", binding: { X: "della", Item: "watch_chain" } }),
      node("magi_jim_watch", "Jim sells his watch", "sacrifice(jim, watch)",
        "Jim's offstage sacrifice removes the object Della's gift serves.",
        "canonical", ["parallel", "sacrifice"],
        { entry: "sacrifice", binding: { X: "jim", Item: "watch" } }),
      node("magi_jim_combs", "Jim buys combs", "buy(jim, combs)",
        "His gift assumes Della still has her hair.",
        "canonical", ["irony", "gift"],
        { entry: "buy", binding: { X: "jim", Item: "combs" } }),
      // magi_reveal is the convergence; no action — pre-state is the
      // union of della-end + jim-end; derivation_closure fires
      // useless_pairing here (the C.4-1 dramatic-irony claim).
      node("magi_reveal", "Gifts cannot be used", "reveal(useless(chain, combs))",
        "The practical value of both gifts cancels at the moment of exchange.",
        "convergence", ["recognition", "irony"]),
      node("magi_love", "Love becomes real gift", "recognize(couple, love)",
        "The story's value shifts from objects to mutual sacrifice.",
        "canonical", ["revaluation", "love"]),
    ],
    edges: [
      // Della's chain
      edge("magi_start", "magi_sell_hair", "causes", "della starts sacrifice"),
      edge("magi_sell_hair", "magi_buy_chain", "causes", "della spends funds"),
      edge("magi_buy_chain", "magi_reveal", "causes", "della arrives at reveal"),
      // Jim's chain (parallel)
      edge("magi_start", "magi_jim_watch", "causes", "jim starts sacrifice"),
      edge("magi_jim_watch", "magi_jim_combs", "causes", "jim spends funds"),
      edge("magi_jim_combs", "magi_reveal", "causes", "jim arrives at reveal"),
      // Convergence onwards
      edge("magi_reveal", "magi_love", "causes", "love recognized"),
      // Semantic annotation (non-canonical) — keeps the parallel pairing visible.
      edge("magi_sell_hair", "magi_jim_watch", "parallels", "symmetrical sacrifice"),
    ],
  };

  // ---------------------------------------------------------------
  // Necklace + Tortoise: untyped (no fixture, no action annotations).
  // Walker reports "no typed fixture" via story_builder_app's
  // phiBindings dispatch.
  // ---------------------------------------------------------------
  const necklace = {
    title: "The Necklace",
    summary: "A tiny concealment choice creates years of cost; ideal for confession/rejoin analysis.",
    root: "neck_start",
    omega: ["neck_fake"],
    nodes: [
      node("neck_start", "Mathilde borrows necklace", "borrow(mathilde, necklace)", "Status desire is externalized into a borrowed object.", "root", ["status", "borrowed-value"]),
      node("neck_ball", "She performs wealth at the ball", "attend(mathilde, ball)", "The desired identity is briefly achieved through display.", "canonical", ["mask", "aspiration"]),
      node("neck_loss", "The necklace is lost", "lose(mathilde, necklace)", "A missing object creates a fork: confess now or hide the loss.", "convergence", ["loss", "choice-point"]),
      node("neck_replace", "They replace it secretly", "replace(couple, necklace)", "Concealment turns a social problem into a financial catastrophe.", "canonical", ["secrecy", "debt"]),
      node("neck_labor", "Years of labor repay debt", "labor(couple, years)", "The replacement choice reshapes their class, bodies, and marriage.", "canonical", ["consequence", "duration"]),
      node("neck_fake", "The original was fake", "reveal(friend, fake_necklace)", "The entire causal chain is reinterpreted as avoidable tragedy.", "convergence", ["reversal", "recognition"]),
    ],
    edges: [
      ...pathEdges(["neck_start", "neck_ball", "neck_loss", "neck_replace", "neck_labor", "neck_fake"]),
      edge("neck_replace", "neck_fake", "foreshadows", "hidden premise"),
    ],
  };

  const tortoise = {
    title: "The Tortoise and the Hare",
    summary: "Compact pride/persistence reversal with clear branch points around feedback and attention.",
    root: "tor_start",
    omega: ["tor_finish"],
    nodes: [
      node("tor_start", "Hare mocks Tortoise", "mock(hare, tortoise)", "Status conflict motivates a measurable contest.", "root", ["pride"]),
      node("tor_race", "Race begins", "start(race)", "Both characters enter the same course with different capabilities.", "canonical", ["contest"]),
      node("tor_hare_leads", "Hare sprints ahead", "outrun(hare, tortoise)", "Natural advantage creates overconfidence.", "canonical", ["advantage"]),
      node("tor_hare_sleeps", "Hare naps", "sleep(hare)", "The leading path pauses and becomes vulnerable.", "canonical", ["hubris"]),
      node("tor_tortoise_moves", "Tortoise keeps moving", "persist(tortoise)", "Slow consistent action accumulates enough progress to reverse the race.", "convergence", ["persistence"]),
      node("tor_finish", "Tortoise wins", "win(tortoise, race)", "Persistence beats unused speed.", "canonical", ["reversal"]),
    ],
    edges: [
      ...pathEdges(["tor_start", "tor_race", "tor_hare_leads", "tor_hare_sleeps", "tor_tortoise_moves", "tor_finish"]),
    ],
  };

  // ---------------------------------------------------------------
  // Master and Margarita — the ending (ch. 29–32): Yeshua's verdict
  // through the eternal refuge. Untyped (no fixture yet); built as a
  // cone test-subject, NOT a state-walker subject.
  //
  // METHODOLOGY (INTUITIONS §8 sand-castle problem): the structure is
  // encoded from the novel's causal order, then cone.js is run on it.
  // The graph is NOT tuned to produce a particular waist.
  //
  // ONE modeling decision, declared: the ending is encoded as TWO arms
  // converging at `mm_release` — the FRAME thread (the Master &
  // Margarita's death-and-flight, mm_dispatch…mm_reveal) and the
  // PILATE/novel thread (mm_pilate_waits). This mirrors the book's
  // novel-within-a-novel architecture. The single edge
  // mm_pilate_waits → mm_release is Pilate's inert ~2000-year wait: one
  // long span with no intermediate events, exactly as written.
  //
  // Ω = mm_refuge (the Master's peace). Note mm_ascend (Pilate → Yeshua)
  // deliberately does NOT reach Ω: Pilate's destination is not the
  // Master's, so the cone places it on the rim — a faithful consequence,
  // not a stipulation.
  // ---------------------------------------------------------------
  const mm = {
    title: "Master and Margarita — the ending",
    summary: "Two-arm convergence (frame + Pilate/novel) onto the release; funnel to the eternal refuge. Cone test-subject.",
    root: "mm_levi",
    omega: ["mm_refuge"],
    nodes: [
      node("mm_levi", "Matthew Levi brings the verdict", "petition(levi, woland, peace)",
        "Yeshua's judgment: the Master has earned peace, not light. The destination is fixed here.",
        "root", ["verdict", "boundary"]),
      // Frame arm: the Master & Margarita's death and flight.
      node("mm_dispatch", "Woland sends Azazello", "dispatch(woland, azazello)",
        "The verdict is handed to an agent who will arrange the crossing.",
        "canonical", ["errand"]),
      node("mm_wine", "Azazello brings the poisoned wine", "poison(azazello, wine)",
        "The instrument of the crossing arrives at the basement.",
        "canonical", ["threshold", "poison"]),
      node("mm_death", "Master and Margarita die in the world", "die(master, margarita)",
        "The real-world deaths: the gate every path of their liberation must pass.",
        "canonical", ["death", "gate"]),
      node("mm_liberation", "Freed as spirits", "free(azazello, master, margarita)",
        "Death on one side becomes release on the other.",
        "canonical", ["liberation"]),
      node("mm_burn", "The basement is burned", "burn(azazello, basement)",
        "The last material tie to Moscow is severed.",
        "canonical", ["severance"]),
      node("mm_flight", "Farewell to Moscow from Sparrow Hills", "depart(retinue, moscow)",
        "The city is taken leave of; the ride out of the world begins.",
        "canonical", ["farewell"]),
      node("mm_transfigure", "The retinue resumes true forms", "transfigure(retinue)",
        "Koroviev, Behemoth, Azazello, Woland drop their Moscow masks.",
        "canonical", ["unmasking"]),
      node("mm_cliff", "They reach the rocky place", "arrive(retinue, rocky_place)",
        "The threshold where the two threads of the book are about to meet.",
        "canonical", ["threshold"]),
      node("mm_reveal", "Woland reveals Pilate's punishment", "reveal(woland, pilate_sentence)",
        "Pilate is shown: sleepless, longing to finish the interrupted conversation.",
        "canonical", ["recognition"]),
      // Pilate/novel arm: one inert span of ~2000 years.
      node("mm_pilate_waits", "Pilate waits in the stone chair", "await(pilate, release)",
        "Two thousand years of remorse, holding a single unfinished sentence open.",
        "canonical", ["pilate", "persistence", "boundary"]),
      // Convergence: the frame and the novel join here.
      node("mm_release", "The Master frees Pilate with the novel's last line", "finish_novel(master, free(pilate))",
        "'Free!' — the author's final sentence terminates a 2000-year sentence. The book's two arms meet.",
        "convergence", ["convergence", "retrocause", "freedom"]),
      node("mm_ascend", "Pilate ascends the moonbeam to Yeshua", "ascend(pilate, yeshua)",
        "The interrupted conversation resumes — Pilate's destination, not the Master's.",
        "canonical", ["resolution"]),
      node("mm_refuge", "Master and Margarita pass to the eternal refuge", "rest(master, margarita, peace)",
        "The house, the garden, the candles, Schubert — peace, the attractor the whole arc fell toward.",
        "canonical", ["peace", "attractor"]),
    ],
    edges: [
      // Frame arm spine.
      ...pathEdges(["mm_levi", "mm_dispatch", "mm_wine", "mm_death", "mm_liberation",
                    "mm_burn", "mm_flight", "mm_transfigure", "mm_cliff", "mm_reveal", "mm_release"]),
      // Pilate/novel arm — the long 2000-year span into the convergence.
      edge("mm_levi", "mm_pilate_waits", "causes", "the Pilate thread comes due"),
      edge("mm_pilate_waits", "mm_release", "causes", "2000-year wait ends at the last sentence"),
      // After the convergence: Pilate exits (off-Ω), the Master goes to peace.
      edge("mm_release", "mm_ascend", "causes", "Pilate goes to Yeshua"),
      edge("mm_release", "mm_refuge", "causes", "the Master is let go to peace"),
    ],
  };

  // ---------------------------------------------------------------
  // Master and Margarita — the Torgsin (currency-store) scene, ch. 28:
  // Koroviev & Behemoth's hooliganism, ending in the fire and their
  // vanishing. A deliberately SINGLE world-path (one thread, no
  // parallel plots) — chosen to test what the apparatus says about a
  // realized world-line per se, with no branching to manufacture.
  //
  // Untyped (cone needs no actions). Ω = tg_escape: the vanishing the
  // whole escalation bends toward.
  // ---------------------------------------------------------------
  const torgsin = {
    title: "Master and Margarita — the Torgsin scene",
    summary: "Single world-path: Koroviev & Behemoth's escalation to fire and escape. Tests the apparatus on a non-branching thread.",
    root: "tg_invite",
    omega: ["tg_escape"],
    nodes: [
      // Actions name torgsin_fixture entries (all fixed-agent, binding {}).
      // Effect-only beats (herring, whistle, sympathy, exposed) carry NO
      // action: the walker passes their pre-state through + runs closure, so
      // tg_exposed surfaces the fraud_reveal derivation without an entry.
      node("tg_invite", "Koroviev: 'Eat, Behemoth'", "invite(koroviev, behemoth, eat)",
        "The provocation is licensed; the scene is set in motion.", "root", ["provocation"]),
      node("tg_devour", "Behemoth devours the fruit and chocolate", "consume(behemoth, goods)",
        "Open theft of display goods — the norm is broken in plain sight.", "canonical", ["transgression"],
        { entry: "gorge", binding: {} }),
      node("tg_demand", "The saleswoman demands a receipt", "demand(saleswoman, payment)",
        "The institution asserts its rule: pay in currency or stop.", "canonical", ["rule", "alarm"],
        { entry: "demand", binding: {} }),
      node("tg_smooth", "Koroviev's soothing patter", "placate(koroviev, saleswoman)",
        "The rule is met not with compliance but with charming evasion.", "canonical", ["evasion"],
        { entry: "placate", binding: {} }),
      node("tg_call", "'Palosich!' — the staff raise the alarm", "summon(saleswoman, manager)",
        "Escalation past the counter: authority is called in.", "canonical", ["alarm"],
        { entry: "summon", binding: {} }),
      node("tg_herring", "Behemoth eats the Kerch herring", "consume(behemoth, herring)",
        "The transgression continues, unhurried, while the alarm spreads.", "canonical", ["transgression"]),
      node("tg_pavel", "Pavel Iosifovich commands 'Whistle!'", "command(pavel, whistle)",
        "The competent manager reads the scene and calls the apparatus of order.", "canonical", ["authority"],
        { entry: "command_whistle", binding: {} }),
      node("tg_whistle", "The doorman whistles; the crowd encircles", "signal(doorman, alarm)",
        "The mechanism of capture engages; the public closes in.", "canonical", ["encirclement"]),
      node("tg_speech", "Koroviev's demagogic speech", "incite(koroviev, crowd)",
        "He redirects the crowd: the hungry primus-mender against the currency-swollen foreigner.", "canonical", ["demagogy", "inversion"],
        { entry: "incite", binding: {} }),
      node("tg_sympathy", "The crowd's sympathy turns", "shift(crowd, sympathy)",
        "Against expectation, the mob's feeling swings toward the thieves.", "canonical", ["reversal"]),
      node("tg_oldman", "The meek old man's 'miracle'", "strike(old_man, foreigner)",
        "A timid stranger is transfigured by the speech and assaults the foreigner — 'Pravda!'", "convergence", ["miracle", "eruption"],
        { entry: "erupt_truth", binding: {} }),
      node("tg_exposed", "The foreigner screams in pure Russian", "expose(foreigner, fraud)",
        "The accent vanishes under shock: the 'foreigner' was a fraud all along.", "canonical", ["recognition", "irony"]),
      node("tg_police", "Police helmets approach", "arrive(police)",
        "Order nearly closes on the scene.", "canonical", ["capture"],
        { entry: "arrive_police", binding: {} }),
      node("tg_fire", "Behemoth ignites the counter with benzine", "ignite(behemoth, store)",
        "The escape hatch: chaos manufactured to dissolve the trap.", "canonical", ["fire", "dissolution"],
        { entry: "ignite", binding: {} }),
      node("tg_escape", "Koroviev and Behemoth vanish", "vanish(koroviev, behemoth)",
        "The scene's attractor: the two slip the closing net and are gone.", "canonical", ["escape", "attractor"],
        { entry: "vanish", binding: {} }),
    ],
    edges: [
      ...pathEdges(["tg_invite", "tg_devour", "tg_demand", "tg_smooth", "tg_call",
                    "tg_herring", "tg_pavel", "tg_whistle", "tg_speech", "tg_sympathy",
                    "tg_oldman", "tg_exposed", "tg_police", "tg_fire", "tg_escape"]),
    ],
  };

  const seeds = { red, magi, necklace, tortoise, mm, torgsin };

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
