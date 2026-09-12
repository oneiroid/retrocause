// Story seed data. Shared between the browser UI (story_builder_app.js)
// and node-based tests.
//
// A seed is a visual + structural declaration of a story DAG: nodes
// (story states) joined by edges. Edges are plain narrative relations
// (`causes`, `leads_to`, `choice`, `rejoins`) — there is no privileged
// "canonical" class of edge. Seeds do not ship premade counterfactual
// branches; branches are created in the UI by the user.
//
// ── v2, 2026-08-17: one node = one event, and `state` is not commentary ──
//
// v1 nodes were overloaded in two ways at once, and both showed up as
// grower failures (LOCAL_LLM.md §8, "context starvation"):
//
//   1. Each node bundled several events. `deceive(wolf, red)` was labelled
//      "Wolf learns destination" — expr and label disagreed because the node
//      was really *meet* + *ask* + *tell*. A counterfactual can attach to any
//      one of those, and nothing in the schema let a proposal say which.
//   2. `state` was authorial commentary, not a world state: "The safe
//      endpoint becomes compromised before Red arrives." That is a reading of
//      the node, and it is what the grower puts after `Note:` in the prompt.
//      Asking a 1.7B model to continue a critical gloss returns more gloss —
//      "Red runs to the woods and the wolf is still unseen."
//
// So v2 splits both:
//
//   `state`   — what is true in the story world after this event, in the
//               story's own terms. This is what the model is shown.
//   `reading` — the interpretive gloss, kept because it is the layer
//               CONCEPT.md and INTUITIONS.md actually work in. Optional, and
//               deliberately NOT rendered into any prompt.
//
// `reading` has no default in `normalizeGraph`: absent means absent, so grown
// nodes do not carry an empty one. `canonicalJson` emits it after the
// declared keys, sorted, without needing to know about it.
//
// ── `effects`, 2026-08-17 ────────────────────────────────────────────────
//
// What this event changes in the world, as canonical `owner.property=value`
// assignments. Only what CHANGES: the state at a node is the fold of the
// effects on the way to it, last-write-wins per variable. A set union would
// be wrong — leaving the path and returning to it must fold to the same
// world as never leaving, and only overwriting gives that.
//
// This is deliberately NOT the `delta` field. `delta` on a branch node means
// "what differs from the told story" — counterfactual-relative. `effects`
// means "what this event changed" — time-relative. One field for both would
// be the same mistake `state`/`reading` just fixed.
//
// The vocabulary is the mechanism, not the values: the same fact must be
// written the same way everywhere, or two routes to one situation never
// coincide and the fold cannot detect that they arrived at the same place.
// Hence hand-authored rather than model-extracted — seeds are the ground
// truth that grown graphs are scored against, and a corpus written by the
// model under test measures its self-consistency, not its correctness.
// Extraction at runtime, for grown nodes, is a different question (§8).
//
// Note criedWolf: all three `cry(boy, wolf)` nodes carry the SAME effect,
// `boy.crying_wolf=yes`. Their accumulated states differ only in
// `villagers.trust_boy` (full -> reduced -> none). If the fold cannot tell
// those three apart, accumulated-state-as-contentKey is dead, and that is
// the cheapest place in the corpus to find out.

(function attachSeeds(root) {

  function node(id, label, expr, state, reading, kind, tags, effects) {
    return {
      id, label, expr, state,
      kind: kind || "story",
      tags: tags || [],
      createdBy: "seed",
      delta: "",
      invariants: "",
      ...(reading ? { reading } : {}),
      ...(effects ? { effects } : {}),
    };
  }

  function edge(from, to, type, label) {
    type = type || "causes";
    return {
      id: `e_${from}_${to}_${type}`,
      from, to, type,
      label: label || "",
    };
  }

  function pathEdges(ids, label) {
    return ids.slice(0, -1).map((from, i) =>
      edge(from, ids[i + 1], "causes", label || ""));
  }

  // ---------------------------------------------------------------
  // Little Red Riding Hood
  // ---------------------------------------------------------------
  // `red_start` and `red_woods` keep their v1 ids: the app selects
  // `red_start` on load and tests/fixtures/branch_responses.json keys on
  // both. Everything else is re-cut.
  const red = {
    title: "Little Red Riding Hood",
    summary: "Clean warning → temptation → disguise → rescue structure; good for early-detection branches.",
    root: "red_start",
    nodes: [
      node("red_start", "Mother gives the basket", "send(mother, red, basket)",
        "Red has a basket to carry to her grandmother's house, on the other side of the woods.",
        "The errand is the engine: it puts a child on a route with a fixed destination.",
        "root", ["quest"],
        "red.has_basket=yes, red.location=home"),
      node("red_warn", "Mother warns her to keep to the path", "warn(mother, red, path)",
        "Red has been told to stay on the path. She is still at home and has not agreed or refused.",
        "The rule arrives before the temptation, which is what makes the later delay a choice rather than an accident.",
        "story", ["warning"],
        "red.warned=yes"),
      node("red_woods", "Red enters the woods", "enter(red, woods)",
        "Red is on the path in the woods, alone, carrying the basket.",
        "Red crosses from domestic safety into a place where strangers can intervene.",
        "story", ["threshold"],
        "red.location=woods, red.on_path=yes"),
      node("red_meet", "The wolf stops her on the path", "meet(wolf, red)",
        "The wolf and Red are face to face on the path. He has not threatened her and she is not afraid.",
        "The predator's first move is conversation, not violence — the danger is legible only in hindsight.",
        "story", ["predator"],
        "wolf.location=woods"),
      node("red_tell", "Red says where she is going", "tell(red, wolf, grandmother_house)",
        "The wolf knows Red's destination, that her grandmother is alone there, and that she is expected.",
        "The wolf gains enough information to race ahead and construct a trap.",
        "story", ["deception"],
        "wolf.knows_destination=yes"),
      node("red_leave", "Red steps off the path", "leave(red, path)",
        "Red is among the trees, off the route her mother named. Nobody is between the wolf and the house.",
        "The warning is spent here, one node before the delay it was meant to prevent.",
        "story", ["disobedience"],
        "red.on_path=no"),
      node("red_flowers", "Red stops to gather flowers", "gather(red, flowers)",
        "Red is standing still and picking. Time passes and she gets no closer to the house.",
        "Red loses time; the predator's route becomes causally prior to hers.",
        "story", ["temptation", "delay"],
        "red.delayed=yes"),
      node("red_grandma", "The wolf reaches the house first", "arrive(wolf, grandmother_house)",
        "The wolf is at the grandmother's door. Red is still in the woods.",
        "The safe endpoint is reached by the wrong party — the trap is now ahead of the victim.",
        "story", ["inversion"],
        "wolf.location=grandmother_house"),
      node("red_eat_grandmother", "The wolf swallows the grandmother", "swallow(wolf, grandmother)",
        "The grandmother is inside the wolf. Nobody in the house can warn Red.",
        "The one adult who could break the deception is removed before the deception starts.",
        "story", ["predation"],
        "grandmother.location=inside_wolf"),
      node("red_disguise", "The wolf takes her place in the bed", "impersonate(wolf, grandmother)",
        "The wolf is in the grandmother's bed wearing her cap. From the doorway it reads as the grandmother.",
        "A trusted role now hides a threat inside a trusted house.",
        "story", ["disguise"],
        "wolf.disguised=yes"),
      node("red_arrive", "Red reaches the house", "arrive(red, grandmother_house)",
        "Red is inside the house, at the bedside, and believes she is with her grandmother.",
        "The destination she was sent to is the trap she was warned about, and the warning named the wrong hazard.",
        "story", ["threshold"],
        "red.location=grandmother_house"),
      node("red_recognition", "Red sees it is the wolf", "recognize(red, wolf)",
        "Red knows it is the wolf. She is inside the house and within its reach.",
        "The deception collapses after Red has entered the trap — recognition without escape.",
        "story", ["recognition"],
        "red.knows_wolf=yes, wolf.disguised=no"),
      node("red_eat_red", "The wolf swallows Red", "swallow(wolf, red)",
        "Red is inside the wolf with her grandmother. The house is quiet and nobody outside knows.",
        "The predator-prey path closes; from inside the story there is no remaining move.",
        "story", ["predation"],
        "red.location=inside_wolf"),
      node("red_rescue", "A woodcutter cuts them free", "free(woodcutter, red, grandmother)",
        "Red and her grandmother are out of the wolf and alive. The wolf is dead.",
        "Outside intervention reverses the closed predator-prey path.",
        "story", ["rescue", "restoration"],
        "red.location=grandmother_house, grandmother.location=grandmother_house, wolf.alive=no"),
    ],
    edges: [
      ...pathEdges(["red_start", "red_warn", "red_woods", "red_meet", "red_tell",
                    "red_leave", "red_flowers", "red_grandma", "red_eat_grandmother",
                    "red_disguise", "red_arrive", "red_recognition", "red_eat_red",
                    "red_rescue"]),
    ],
  };

  // ---------------------------------------------------------------
  // The Boy Who Cried Wolf
  // ---------------------------------------------------------------
  // Shares the `wolf` entity with Red, so the two possibility spaces braid.
  // Carries a real in-story recurrence: `cry(boy, wolf)` appears three times
  // on one chain — the same state content in a changed world (trust already
  // spent). `sameInContext` must refuse to merge those, since each reaches
  // the next; that refusal is the predicate's whole point (merge_predicate.js
  // :12-17), and the eval's dupExpr metric counts grown nodes only, so a
  // deliberate seed recurrence does not pollute it.
  const criedWolf = {
    title: "The Boy Who Cried Wolf",
    summary: "Deception by the protagonist; rescue arrives mid-story and trust erodes until recognition fails.",
    root: "cw_watch",
    nodes: [
      node("cw_watch", "The boy is set to watch the flock", "send(villagers, boy, flock)",
        "The boy is alone on the hillside with the sheep. The village is within earshot.",
        "The village delegates its vigilance to a single bored watcher.",
        "root", ["duty", "trust"],
        "boy.location=hillside, flock.guarded=yes, villagers.trust_boy=full, villagers.location=village"),
      node("cw_cry1", "The boy cries wolf for fun", "cry(boy, wolf)",
        "The boy has raised the alarm. There is no wolf.",
        "The alarm channel is spent on a joke; trust takes its first debit.",
        "story", ["deception"],
        "boy.crying_wolf=yes"),
      node("cw_run1", "The villagers come running", "arrive(villagers, flock)",
        "The villagers are at the flock, armed, and there is nothing to fight.",
        "The system works exactly as designed — for a false signal.",
        "story", ["rescue", "false-alarm"],
        "villagers.location=flock"),
      node("cw_laugh", "The boy laughs at them", "mock(boy, villagers)",
        "The villagers know they were called out for a joke. The sheep are unharmed.",
        "The cost is made explicit to the people who paid it, which is what converts an error into a grudge.",
        "story", ["derision"],
        "boy.crying_wolf=no, villagers.trust_boy=reduced, villagers.location=village"),
      node("cw_cry2", "The boy cries wolf again", "cry(boy, wolf)",
        "The boy has raised the alarm a second time. There is still no wolf.",
        "The same act in a changed world: this time belief is thinner.",
        "story", ["deception", "recurrence"],
        "boy.crying_wolf=yes"),
      node("cw_run2", "They come a second time", "arrive(villagers, flock)",
        "The villagers are at the flock again and again find nothing.",
        "The channel still carries — but it is now being read as noise, not signal.",
        "story", ["false-alarm", "recurrence"],
        "villagers.location=flock"),
      node("cw_doubt", "The villagers stop believing him", "distrust(villagers, boy)",
        "The villagers have decided the boy's cry means nothing. The boy does not know this.",
        "The alarm is disconnected at the receiving end, silently, while the sender assumes it still works.",
        "story", ["erosion"],
        "boy.crying_wolf=no, villagers.trust_boy=none, villagers.location=village"),
      node("cw_wolf", "A real wolf comes", "arrive(wolf, flock)",
        "A wolf is at the flock. The boy is alone with it.",
        "The threat the alarm was built for finally appears.",
        "story", ["threat"],
        "wolf.location=flock"),
      node("cw_cry3", "The boy cries wolf truthfully", "cry(boy, wolf)",
        "The boy has raised the alarm a third time, and this time it is true.",
        "The same words, now accurate, and the accuracy makes no difference — content was never what was being read.",
        "story", ["recurrence", "inversion"],
        "boy.crying_wolf=yes"),
      node("cw_dismiss", "Nobody comes", "ignore(villagers, boy)",
        "The villagers hear the cry and stay where they are.",
        "The villagers correctly recognize the boy — as a liar — and are wrong about the wolf.",
        "story", ["recognition", "inversion"],
        "villagers.location=village"),
      node("cw_loss", "The flock is lost", "devour(wolf, flock)",
        "The sheep are dead. The boy is unhurt and alone.",
        "The cost of the spent alarm channel is paid all at once.",
        "story", ["loss"],
        "flock.alive=no, flock.guarded=no"),
    ],
    edges: [
      ...pathEdges(["cw_watch", "cw_cry1", "cw_run1", "cw_laugh", "cw_cry2",
                    "cw_run2", "cw_doubt", "cw_wolf", "cw_cry3", "cw_dismiss",
                    "cw_loss"]),
    ],
  };

  // ---------------------------------------------------------------
  // The Trojan Horse
  // ---------------------------------------------------------------
  // Early recognition that gets ignored: in Red, recognition leads to rescue;
  // here it leads to nothing, and the ending is destruction, not restoration.
  const trojanHorse = {
    title: "The Trojan Horse",
    summary: "Deception through a gift; recognition comes early, is ignored, and the city falls.",
    root: "th_build",
    nodes: [
      node("th_build", "The Greeks build a wooden horse", "build(greeks, horse)",
        "A hollow wooden horse stands on the plain outside Troy.",
        "A weapon is disguised as an offering.",
        "root", ["deception", "artifact"],
        "horse.location=plain, horse.occupied=no, troy.standing=yes, troy.gates=shut"),
      node("th_hide", "Armed men climb inside it", "hide(greeks, horse)",
        "Soldiers are sealed inside the horse. From outside it is a wooden statue.",
        "The threat is made invisible by being placed inside the object everyone is looking at.",
        "story", ["concealment"],
        "horse.occupied=yes, greeks.location=inside_horse"),
      node("th_sail", "The fleet sails out of sight", "depart(greeks, troy)",
        "The Greek ships are gone from the shore. The siege appears to be over.",
        "The absence of the enemy is the strongest part of the lie.",
        "story", ["feint"],
        "greeks.fleet=away"),
      node("th_gift", "The Trojans find the horse", "find(trojans, horse)",
        "The Trojans are outside their walls, around an abandoned horse, deciding what to do with it.",
        "The trap is delivered by the enemy's own curiosity.",
        "story", ["gift", "trap"],
        "trojans.know_horse=yes"),
      node("th_lie", "Sinon sells the lie", "deceive(sinon, trojans)",
        "The Trojans have been told the horse is an offering, and that taking it in will protect the city.",
        "A planted defector supplies the story the trap needs.",
        "story", ["deception"],
        "trojans.believe_horse_safe=yes"),
      node("th_seer", "Cassandra names it a trap", "recognize(cassandra, horse)",
        "Cassandra has said out loud, in front of the city, that the horse holds armed men.",
        "The deception is correctly identified — before it can do harm.",
        "story", ["recognition", "warning"],
        "warning.given=yes"),
      node("th_ignore", "Her warning is set aside", "ignore(trojans, cassandra)",
        "The Trojans have heard the warning and decided against it. Nothing about the horse has changed.",
        "Recognition without authority changes nothing.",
        "story", ["dismissal"],
        "warning.heeded=no"),
      node("th_enter", "The horse is brought inside", "enter(horse, troy)",
        "The horse is within the walls and the gates are shut behind it.",
        "The city carries the threat across its own threshold.",
        "story", ["threshold", "inversion"],
        "horse.location=inside_troy"),
      node("th_night", "The city celebrates and sleeps", "sleep(trojans, troy)",
        "Troy is asleep. The horse stands unwatched inside the walls.",
        "The defence is stood down by the same belief that carried the horse in.",
        "story", ["complacency"],
        "trojans.awake=no"),
      node("th_open", "The gates are opened from inside", "open(greeks, gates)",
        "The men are out of the horse and the gates of Troy stand open.",
        "The closed system is opened from within.",
        "story", ["betrayal"],
        "troy.gates=open, horse.occupied=no, greeks.location=inside_troy"),
      node("th_fall", "Troy falls in the night", "destroy(greeks, troy)",
        "Troy is burning and the war is over.",
        "Recognition happened, in time, to the right object, and the city fell anyway.",
        "story", ["catastrophe"],
        "troy.standing=no"),
    ],
    edges: [
      ...pathEdges(["th_build", "th_hide", "th_sail", "th_gift", "th_lie",
                    "th_seer", "th_ignore", "th_enter", "th_night", "th_open",
                    "th_fall"]),
    ],
  };

  const seeds = { red, criedWolf, trojanHorse };

  // ── frames (2026-08-31, continuation-generation plan v3, Step 0) ─────────
  //
  // A hand-authored `frame` per seed node: { actor, action, outcome }, which
  // `frames.js` renders as
  //
  //     Then {actor} {action}, and now {outcome}.
  //
  // This is the model boundary the sentence arm of the Stage 0 A/B probe
  // uses, against the JSON boundary of `prompts/branch.v2.txt`. It is a
  // representation under test, not a replacement for anything: `expr`,
  // `state`, `reading` and `effects` are untouched.
  //
  // `entities` is the CLOSED per-story actor list. It is closed because it is
  // what makes `parse` invertible — nothing else in the sentence marks where
  // the actor stops and the action starts. The cost is real and is the
  // design's main limitation: no continuation can introduce a character the
  // author did not list. Red's woodcutter arrives from outside the story; a
  // closed enum can only ever propose him because he was pre-declared.
  //
  // Authoring rules, all enforced by tests/frames.test.js:
  //   - `actor` is verbatim one of the story's `entities`.
  //   - no reserved substring (", and now ", newline) in any slot; no comma
  //     or period in `action`; no period in `outcome`.
  //   - every `effects` OWNER of the node is named in `outcome`. This is the
  //     cheap automated half of keeping the prose outcome honest to the
  //     canonical fact layer; the other half is reading it, which is what
  //     Step 0 is. `outcome` is deliberately NOT rendered from `effects` —
  //     mechanical outcome text in every history sentence would teach the
  //     model mechanical text, which is the hypothesis being tested.
  //
  // Grown nodes get a `frame` too, but no `effects`: scoring a grown outcome
  // against the folded seed `effects` is a separate question, out of scope.

  function withFrames(story, entities, frames) {
    story.entities = entities;
    story.nodes.forEach((n) => {
      const f = frames[n.id];
      if (f) n.frame = { actor: f[0], action: f[1], outcome: f[2] };
    });
    return story;
  }

  withFrames(red,
    ["Red", "Red's mother", "Red's grandmother", "the wolf", "the woodcutter"], {
    red_start: ["Red's mother", "gives Red a basket to carry to her grandmother's house",
      "Red is at home holding the basket with the woods between her and the house"],
    red_warn: ["Red's mother", "tells her to keep to the path and not stray",
      "Red has been told to stay on the path and has neither agreed nor refused"],
    red_woods: ["Red", "walks into the woods with the basket",
      "Red is alone on the path among the trees"],
    red_meet: ["the wolf", "steps into the path in front of her",
      "the wolf and Red stand face to face and nothing has been threatened yet"],
    red_tell: ["Red", "tells him where her grandmother lives and that she is alone",
      "the wolf knows the house Red is walking to and who is waiting in it"],
    red_leave: ["Red", "steps off the path into the trees",
      "Red is off the route her mother named and nobody stands between the wolf and the house"],
    red_flowers: ["Red", "stops to gather flowers",
      "Red is standing still while the time she has runs out"],
    red_grandma: ["the wolf", "runs ahead and reaches the house first",
      "the wolf is at the grandmother's door while Red is still in the woods"],
    red_eat_grandmother: ["the wolf", "swallows the grandmother whole",
      "the grandmother is inside the wolf and nobody in the house can warn Red"],
    red_disguise: ["the wolf", "puts on her cap and lies down in her bed",
      "from the doorway the wolf reads as the grandmother"],
    red_arrive: ["Red", "reaches the house and comes to the bedside",
      "Red is inside the house believing she is with her grandmother"],
    red_recognition: ["Red", "looks closely and sees the wolf under the cap",
      "Red knows it is the wolf and she is already within its reach"],
    red_eat_red: ["the wolf", "swallows Red as well",
      "Red is inside the wolf with her grandmother and the house is quiet"],
    red_rescue: ["the woodcutter", "cuts the wolf open and lifts them out",
      "Red and her grandmother are alive in the house and the wolf is dead"],
  });

  withFrames(criedWolf,
    ["the boy", "the villagers", "the wolf"], {
    cw_watch: ["the villagers", "send the boy up the hillside to watch the flock",
      "the boy is alone with the flock on the hillside and the villagers are in earshot below"],
    cw_cry1: ["the boy", "shouts that a wolf is at the flock for the fun of it",
      "the boy has raised the alarm and there is no wolf"],
    cw_run1: ["the villagers", "drop their work and run up the hill",
      "the villagers are at the flock with nothing to fight"],
    cw_laugh: ["the boy", "laughs at them for coming",
      "the villagers go back down knowing the boy called them for a joke"],
    cw_cry2: ["the boy", "shouts wolf a second time",
      "the boy has raised the alarm again and there is still no wolf"],
    cw_run2: ["the villagers", "climb the hill once more",
      "the villagers stand at the flock and again find nothing"],
    cw_doubt: ["the villagers", "agree among themselves that his cry means nothing",
      "the villagers will not come again and the boy does not know it"],
    cw_wolf: ["the wolf", "comes out of the trees to the flock",
      "a wolf is among the sheep and the boy is alone with it"],
    cw_cry3: ["the boy", "shouts wolf a third time and means it",
      "the boy has raised the alarm truthfully"],
    cw_dismiss: ["the villagers", "hear the cry and stay where they are",
      "the villagers remain in the village and nobody climbs the hill"],
    cw_loss: ["the wolf", "kills the sheep one after another",
      "the flock is dead and the boy stands unhurt among them"],
  });

  withFrames(trojanHorse,
    ["the Greeks", "the Trojans", "Sinon", "Cassandra"], {
    th_build: ["the Greeks", "build a hollow wooden horse on the plain",
      "a wooden horse stands empty outside Troy and the gates of the city are shut"],
    th_hide: ["the Greeks", "seal armed men inside the horse",
      "the Greeks are hidden in the horse and from outside it is a wooden statue"],
    th_sail: ["the Greeks", "sail their ships out of sight",
      "the Greeks' fleet is gone from the shore and the siege looks over"],
    th_gift: ["the Trojans", "come out of the walls and gather around the abandoned horse",
      "the Trojans stand around the horse arguing what to do with it"],
    th_lie: ["Sinon", "tells them the horse is an offering that will protect the city",
      "the Trojans believe the horse is safe to take in"],
    th_seer: ["Cassandra", "says aloud that the horse is full of armed men",
      "the warning has been given in front of the whole city"],
    th_ignore: ["the Trojans", "set her warning aside",
      "the warning is refused and nothing about the horse has changed"],
    th_enter: ["the Trojans", "haul the horse through the gates",
      "the horse stands inside Troy and the gates are shut behind it"],
    th_night: ["the Trojans", "feast late and go to sleep",
      "the Trojans are asleep and the horse stands unwatched inside the walls"],
    th_open: ["the Greeks", "climb out of the horse and open the gates from inside",
      "the Greeks are loose in Troy and the horse is empty and the gates stand open"],
    th_fall: ["the Greeks", "burn the city through the night",
      "Troy is burning and the war is over"],
  });

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
