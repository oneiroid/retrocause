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
// Actor-thread note: canonical story shape is not forced into a single
// linear spine. Main characters normally advance on separate canonical
// paths, can share a node for several steps when they are effectively one
// acting unit, and can split again later. `actors` on nodes means
// agency/thread ownership, not every participant named in `expr`; `actor`
// on outgoing choice edges documents whose agency is being modeled.
//
// Magi note: jim's chain branches from `magi_start` in parallel with
// della's chain and rejoins at `magi_reveal`. The walker uses canonical
// edges to compute pre-state, so actor-thread edges have to be
// semantically faithful.

(function attachSeeds(root) {

  function node(id, label, expr, state, kind, tags, action, actors) {
    return {
      id, label, expr, state,
      kind: kind || "canonical",
      tags: tags || [],
      actors: actors || [],
      createdBy: "seed",
      delta: "",
      invariants: "",
      ...(action ? { action } : {}),
    };
  }

  function edge(from, to, type, label, actor) {
    type = type || "causes";
    return {
      id: `e_${from}_${to}_${type}`,
      from, to, type,
      label: label || "",
      ...(actor ? { actor } : {}),
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
    summary: "Red and Wolf split into interacting paths that converge at recognition and rescue.",
    root: "red_start",
    mainCharacters: ["red", "wolf", "grandmother", "woodcutter"],
    nodes: [
      node("red_start", "Mother gives errand", "send(mother, red, basket)",
        "Red has a mission, a destination, and a warning to stay on the path.",
        "root", ["warning", "quest"],
        { entry: "give", binding: { Giver: "mother", Receiver: "red", Item: "basket" } },
        ["mother", "red", "wolf"]),
      node("red_woods", "Red enters the woods", "enter(red, woods)",
        "Red crosses from domestic safety into a place where strangers can intervene.",
        "canonical", ["threshold"],
        { entry: "move", binding: { X: "red", From: "home", To: "woods" } },
        ["red"]),
      node("red_wolf_woods", "Wolf enters the woods", "enter(wolf, woods)",
        "Wolf's path is already inside the same risky space Red is entering.",
        "canonical", ["predator", "threshold"], null, ["wolf"]),
      node("red_meet_wolf", "Wolf meets Red", "meet(wolf, red)",
        "Red's errand path and Wolf's predator path cross in the woods.",
        "convergence", ["encounter", "deception"], null, ["red", "wolf"]),
      node("red_wolf", "Wolf learns destination", "deceive(wolf, red)",
        "The wolf's thread gains enough information to race ahead and construct a trap.",
        "canonical", ["deception", "predator"],
        { entry: "learn_from", binding: { L: "wolf", S: "red",
                                          F: "destination(red,grandmother_house)",
                                          P: "woods" } },
        ["wolf"]),
      node("red_delay", "Red gathers flowers", "delay(red, flowers)",
        "Red's path slows while the predator's path advances separately.",
        "canonical", ["temptation", "delay"],
        { entry: "delay", binding: { X: "red", Distractor: "flowers" } },
        ["red"]),
      node("red_grandma", "Wolf reaches grandmother", "arrive(wolf, grandmother_house)",
        "Wolf's path reaches the house before Red's delayed path does.",
        "canonical", ["inversion"],
        { entry: "move", binding: { X: "wolf", From: "woods", To: "grandmother_house" } },
        ["wolf"]),
      // red_disguise: impersonate(wolf, grandmother, ...) requires
      // !at(grandmother, P); initial state has at(grandmother, grandmother_house),
      // so the precondition fails. Left without an action annotation per
      // M1 policy (only annotate where the action's `requires` would hold).
      node("red_disguise", "Wolf impersonates grandmother", "impersonate(wolf, grandmother)",
        "A trusted role now hides a threat inside a trusted house.",
        "canonical", ["disguise"], null, ["wolf"]),
      node("red_recognition", "Red recognizes danger too late", "recognize(red, wolf, late)",
        "Red's delayed path and Wolf's house path merge into one trapped encounter.",
        "convergence", ["recognition"], null, ["red", "wolf"]),
      node("red_rescue", "Rescue restores household", "rescue(woodcutter, red, grandmother)",
        "Outside intervention reverses the closed predator-prey path.",
        "canonical", ["rescue", "restoration"], null, ["woodcutter"]),
    ],
    edges: [
      edge("red_start", "red_woods", "causes", "red begins errand", "red"),
      edge("red_woods", "red_wolf_woods", "causes", "wolf's path is active"),
      edge("red_woods", "red_meet_wolf", "causes", "red reaches encounter", "red"),
      edge("red_wolf_woods", "red_meet_wolf", "causes", "wolf reaches encounter", "wolf"),
      edge("red_meet_wolf", "red_wolf", "causes", "wolf questions red", "wolf"),
      edge("red_meet_wolf", "red_delay", "causes", "red chooses delay", "red"),
      edge("red_wolf", "red_grandma", "causes", "wolf chooses speed", "wolf"),
      edge("red_grandma", "red_disguise", "causes", "wolf occupies the house", "wolf"),
      edge("red_delay", "red_recognition", "causes", "red arrives late", "red"),
      edge("red_disguise", "red_recognition", "causes", "wolf's trap is ready", "wolf"),
      edge("red_recognition", "red_rescue", "causes", "crisis draws rescue"),
    ],
  };

  // ---------------------------------------------------------------
  // Gift of the Magi (FORMAL_MODEL.md Appendix C)
  // Jim's chain branches from magi_start in parallel and rejoins at
  // magi_reveal, matching the formal "parallel sacrifices" reading.
  // ---------------------------------------------------------------
  const magi = {
    title: "The Gift of the Magi",
    summary: "Parallel sacrifices and ironic convergence; excellent for invariant-love counterfactuals.",
    root: "magi_start",
    mainCharacters: ["della", "jim"],
    nodes: [
      node("magi_start", "Della lacks gift money", "lack(della, money)",
        "Love is constrained by scarcity; action must convert value into a gift.",
        "root", ["scarcity", "love"],
        { entry: "realize", binding: { X: "della", F: "not_has_funds(della)" } },
        ["della", "jim"]),
      node("magi_sell_hair", "Della sells her hair", "sacrifice(della, hair)",
        "Della turns her prized possession into money while losing what combs would adorn.",
        "canonical", ["sacrifice"],
        { entry: "sacrifice", binding: { X: "della", Item: "hair" } },
        ["della"]),
      node("magi_buy_chain", "Della buys chain", "buy(della, watch_chain)",
        "Her gift assumes Jim still has his watch.",
        "canonical", ["gift", "assumption"],
        { entry: "buy", binding: { X: "della", Item: "watch_chain" } },
        ["della"]),
      node("magi_jim_watch", "Jim sells his watch", "sacrifice(jim, watch)",
        "Jim's offstage sacrifice removes the object Della's gift serves.",
        "canonical", ["parallel", "sacrifice"],
        { entry: "sacrifice", binding: { X: "jim", Item: "watch" } },
        ["jim"]),
      node("magi_jim_combs", "Jim buys combs", "buy(jim, combs)",
        "His gift assumes Della still has her hair.",
        "canonical", ["irony", "gift"],
        { entry: "buy", binding: { X: "jim", Item: "combs" } },
        ["jim"]),
      // magi_reveal is the convergence; no action — pre-state is the
      // union of della-end + jim-end; derivation_closure fires
      // useless_pairing here (the C.4-1 dramatic-irony claim).
      node("magi_reveal", "Gifts cannot be used", "reveal(useless(chain, combs))",
        "The practical value of both gifts cancels at the moment of exchange.",
        "convergence", ["recognition", "irony"], null, ["della", "jim"]),
      node("magi_love", "Love becomes real gift", "recognize(couple, love)",
        "The story's value shifts from objects to mutual sacrifice.",
        "canonical", ["revaluation", "love"], null, ["della", "jim"]),
    ],
    edges: [
      // Della's chain
      edge("magi_start", "magi_sell_hair", "causes", "della starts sacrifice", "della"),
      edge("magi_sell_hair", "magi_buy_chain", "causes", "della spends funds", "della"),
      edge("magi_buy_chain", "magi_reveal", "causes", "della arrives at reveal", "della"),
      // Jim's chain (parallel)
      edge("magi_start", "magi_jim_watch", "causes", "jim starts sacrifice", "jim"),
      edge("magi_jim_watch", "magi_jim_combs", "causes", "jim spends funds", "jim"),
      edge("magi_jim_combs", "magi_reveal", "causes", "jim arrives at reveal", "jim"),
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
    summary: "Hare and Tortoise share the race setup, split into separate tactics, then merge at the finish.",
    root: "tor_start",
    mainCharacters: ["hare", "tortoise"],
    nodes: [
      node("tor_start", "Hare mocks Tortoise", "mock(hare, tortoise)", "Status conflict motivates a measurable contest.", "root", ["pride"], null, ["hare", "tortoise"]),
      node("tor_race", "Race begins", "start(race)", "Both characters enter the same course with different capabilities.", "canonical", ["contest"], null, ["hare", "tortoise"]),
      node("tor_hare_leads", "Hare sprints ahead", "outrun(hare, tortoise)", "Hare's path converts speed into overconfidence.", "canonical", ["advantage"], null, ["hare"]),
      node("tor_hare_sleeps", "Hare naps", "sleep(hare)", "The leading path pauses and becomes vulnerable.", "canonical", ["hubris"], null, ["hare"]),
      node("tor_tortoise_moves", "Tortoise keeps moving", "persist(tortoise)", "Tortoise's separate path converts slow motion into accumulated progress.", "canonical", ["persistence"], null, ["tortoise"]),
      node("tor_finish", "Tortoise wins", "win(tortoise, race)", "Hare's stalled path and Tortoise's persistent path merge at the finish.", "convergence", ["reversal"], null, ["hare", "tortoise"]),
    ],
    edges: [
      edge("tor_start", "tor_race", "causes", "contest accepted", "hare"),
      edge("tor_race", "tor_hare_leads", "causes", "hare chooses speed", "hare"),
      edge("tor_hare_leads", "tor_hare_sleeps", "causes", "hare chooses rest", "hare"),
      edge("tor_race", "tor_tortoise_moves", "causes", "tortoise chooses persistence", "tortoise"),
      edge("tor_hare_sleeps", "tor_finish", "causes", "hare remains delayed", "hare"),
      edge("tor_tortoise_moves", "tor_finish", "causes", "tortoise reaches finish", "tortoise"),
    ],
  };

  const seeds = { red, magi, necklace, tortoise };

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
