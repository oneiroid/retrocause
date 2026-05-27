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

  const seeds = { red, magi, necklace, tortoise };

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
