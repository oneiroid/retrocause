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
// Note criedWolf: all three `cry(boy, wolf)` nodes carry the SAME effects,
// `boy.crying_wolf=yes, alarm.heeded=pending` (each cry is a fresh alarm;
// the villagers' arrival or `cw_dismiss` settles it). Their accumulated states differ in
// `villagers.trust_boy` (full -> reduced -> none), and the third also in the
// wolf's presence. If the fold cannot tell those three apart,
// accumulated-state-as-contentKey is dead, and that is the cheapest place in
// the corpus to find out.
//
// ── v3, 2026-10-04: states the model can safely imitate ─────────────────
//
// The base model continues the seeds' style, so a seed state is also a
// style sample. v2 states taught two bad habits the graded probes show in
// bulk: sentences about what has NOT happened ("has not agreed or refused",
// "has not threatened her") — copied as runs of "She has not moved to …" —
// and strategy in place of world ("Nobody is between the wolf and the
// house"). v3 states say what IS true after the event, positively, in the
// story's own terms, with no negations at all — v3.1 removed the last ones
// that were facts in themselves: "There is no wolf" became "The alarm is a
// lie", "Nobody comes" became "The villagers stay in the village".
//
// v3 also re-cuts the remaining bundles (the villagers' walk home was folded
// into `cw_laugh`/`cw_doubt`; the Trojans' feast and sleep, the men leaving
// the horse and opening the gates) and adds the causes v2 skipped: the wolf
// tempting Red off the path, the wolf talking his way past the door, the
// snoring that brings the woodcutter, Sinon's capture, the fleet's return.
// Every root now initialises the variables later effects overwrite, and no
// effect re-asserts a value already true (`cw_dismiss` was a null
// transition in the fact layer). Ids of unchanged events are kept, so
// recorded probes still name the right nodes; `red_recognition` became
// `red_question`, since the told story has no recognition there.

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
  // both. Grimm's telling, with a woodcutter for the huntsman: the wolf
  // tempts Red off the path, talks his way past the grandmother's door, and
  // is heard snoring afterwards — each a cause the v2 cut skipped.
  const red = {
    title: "Little Red Riding Hood",
    summary: "Clean warning → temptation → disguise → rescue structure; good for early-detection branches.",
    root: "red_start",
    nodes: [
      node("red_start", "Mother sends Red to her grandmother with a basket", "send(mother, red, basket)",
        "Red has a basket of cake and wine for her grandmother, who lives alone on the other side of the woods.",
        "The errand is the engine: it puts a child on a route with a fixed destination.",
        "root", ["quest"],
        "red.has_basket=yes, red.location=home, grandmother.location=grandmother_house, wolf.alive=yes"),
      node("red_warn", "Mother warns her to keep to the path", "warn(mother, red, path)",
        "Red knows she must keep to the path through the woods.",
        "The rule arrives before the temptation, which is what makes the later delay a choice rather than an accident.",
        "story", ["warning"],
        "red.warned=yes"),
      node("red_woods", "Red enters the woods", "enter(red, woods)",
        "Red is on the path in the woods, alone, carrying the basket.",
        "Red crosses from domestic safety into a place where strangers can intervene.",
        "story", ["threshold"],
        "red.location=woods, red.on_path=yes"),
      node("red_meet", "The wolf stops her on the path", "meet(wolf, red)",
        "The wolf and Red are face to face on the path. He speaks to her kindly and she talks to him freely.",
        "The predator's first move is conversation, not violence — the danger is legible only in hindsight.",
        "story", ["predator"],
        "wolf.location=woods"),
      node("red_tell", "Red tells the wolf where she is going", "tell(red, wolf, grandmother_house)",
        "The wolf knows where the grandmother's house is and that Red is on her way there.",
        "The wolf gains enough information to race ahead and construct a trap.",
        "story", ["deception"],
        "wolf.knows_destination=yes"),
      node("red_tempt", "The wolf points out the flowers", "tempt(wolf, red, flowers)",
        "Red is looking at the flowers growing among the trees beside the path.",
        "The warning named the path; the wolf never asks her to break it, only shows her what lies off it.",
        "story", ["temptation"],
        "red.tempted=yes"),
      node("red_leave", "Red steps off the path", "leave(red, path)",
        "Red is among the trees, off the path her mother told her to keep to.",
        "The warning is spent here, one node before the delay it was meant to prevent.",
        "story", ["disobedience"],
        "red.on_path=no"),
      node("red_flowers", "Red stops to gather flowers", "gather(red, flowers)",
        "Red is picking flowers, going deeper among the trees, and the afternoon is passing.",
        "Red loses time; the predator's route becomes causally prior to hers.",
        "story", ["temptation", "delay"],
        "red.delayed=yes"),
      node("red_grandma", "The wolf reaches the house first", "arrive(wolf, grandmother_house)",
        "The wolf is at the grandmother's door. Red is still picking flowers in the woods.",
        "The safe endpoint is reached by the wrong party — the trap is now ahead of the victim.",
        "story", ["inversion"],
        "wolf.location=grandmother_house"),
      node("red_knock", "The wolf pretends to be Red at the door", "impersonate(wolf, red)",
        "The grandmother, too weak to get up, has called to her visitor to lift the latch and come in.",
        "The first disguise is a voice: the house is opened by the name of the child it is waiting for.",
        "story", ["deception"],
        "grandmother.door=open"),
      node("red_eat_grandmother", "The wolf swallows the grandmother", "swallow(wolf, grandmother)",
        "The grandmother is inside the wolf, and the wolf is alone in her house.",
        "The one adult who could break the deception is removed before the deception starts.",
        "story", ["predation"],
        "grandmother.location=inside_wolf"),
      node("red_disguise", "The wolf takes her place in the bed", "impersonate(wolf, grandmother)",
        "The wolf lies in the grandmother's bed wearing her cap, with the curtains drawn.",
        "A trusted role now hides a threat inside a trusted house.",
        "story", ["disguise"],
        "wolf.disguised=yes"),
      node("red_arrive", "Red reaches the house", "arrive(red, grandmother_house)",
        "Red is inside the house, at the bedside, and believes she is with her grandmother.",
        "The destination she was sent to is the trap she was warned about, and the warning named the wrong hazard.",
        "story", ["threshold"],
        "red.location=grandmother_house"),
      // Grimm and Perrault both keep Red short of recognition: she questions
      // the strangeness and is eaten mid-question. Recognising the wolf is a
      // branch, not the told story — the v2 seed had it the other way round.
      node("red_question", "Red asks about her grandmother's big ears, eyes and hands", "question(red, wolf)",
        "Red is puzzled by her grandmother's big ears, eyes and hands, and stands beside the bed asking about them.",
        "The deception is failing in plain sight, one feature at a time, and she reads it as strangeness rather than danger.",
        "story", ["recognition"],
        "red.suspicious=yes"),
      node("red_eat_red", "The wolf springs out of bed and swallows Red", "swallow(wolf, red)",
        "Red and her grandmother are both inside the wolf, in the grandmother's house.",
        "The predator-prey path closes; from inside the story there is no remaining move.",
        "story", ["predation"],
        "red.location=inside_wolf"),
      node("red_sleep", "The wolf falls asleep and snores", "sleep(wolf)",
        "The wolf is asleep in the grandmother's bed, snoring loudly enough to be heard from the road.",
        "The predator's satisfaction is what gives him away.",
        "story", ["complacency"],
        "wolf.awake=no"),
      node("red_woodcutter", "A woodcutter hears the snoring and goes in", "enter(woodcutter, grandmother_house)",
        "A woodcutter is in the house, standing over the wolf asleep in the grandmother's bed.",
        "Rescue comes from outside the story's cast of victims, drawn by a sound out of place.",
        "story", ["rescue"],
        "woodcutter.location=grandmother_house"),
      node("red_rescue", "The woodcutter cuts them free", "free(woodcutter, red, grandmother)",
        "Red and her grandmother are out of the wolf and alive. The wolf is still asleep.",
        "Outside intervention reverses the closed predator-prey path.",
        "story", ["rescue", "restoration"],
        "red.location=grandmother_house, grandmother.location=grandmother_house"),
      node("red_kill", "The woodcutter kills the wolf", "kill(woodcutter, wolf)",
        "The wolf is dead. Red, her grandmother and the woodcutter are together in the house.",
        "The threat is ended, not just escaped.",
        "story", ["restoration"],
        "wolf.alive=no"),
    ],
    edges: [
      ...pathEdges(["red_start", "red_warn", "red_woods", "red_meet", "red_tell",
                    "red_tempt", "red_leave", "red_flowers", "red_grandma", "red_knock",
                    "red_eat_grandmother", "red_disguise", "red_arrive", "red_question",
                    "red_eat_red", "red_sleep", "red_woodcutter", "red_rescue", "red_kill"]),
    ],
  };

  // ---------------------------------------------------------------
  // The Boy Who Cried Wolf
  // ---------------------------------------------------------------
  // Shares the `wolf` entity with Red, so the two possibility spaces braid.
  // Carries a real in-story recurrence: `cry(boy, wolf)` appears three times
  // on one chain — the same state content in a changed world (trust already
  // spent) — and so does `return(villagers, village)`, twice. `sameInContext`
  // must refuse to merge those, since each reaches the next; that refusal is
  // the predicate's whole point (merge_predicate.js :12-17), and the eval's
  // dupExpr metric counts grown nodes only, so a deliberate seed recurrence
  // does not pollute it.
  const criedWolf = {
    title: "The Boy Who Cried Wolf",
    summary: "Deception by the protagonist; rescue arrives mid-story and trust erodes until recognition fails.",
    root: "cw_watch",
    nodes: [
      node("cw_watch", "The boy is set to watch the flock", "send(villagers, boy, flock)",
        "The boy is alone on the hillside with the sheep, within earshot of the village.",
        "The village delegates its vigilance to a single bored watcher.",
        "root", ["duty", "trust"],
        "boy.location=hillside, boy.crying_wolf=no, flock.guarded=yes, flock.alive=yes, villagers.trust_boy=full, villagers.location=village"),
      node("cw_cry1", "The boy cries wolf for fun", "cry(boy, wolf)",
        "The boy is shouting that a wolf is at the sheep. The alarm is a lie.",
        "The alarm channel is spent on a joke; trust takes its first debit.",
        "story", ["deception"],
        "boy.crying_wolf=yes, alarm.heeded=pending"),
      node("cw_run1", "The villagers come running", "arrive(villagers, flock)",
        "The villagers are at the flock, armed, and the sheep are grazing quietly.",
        "The system works exactly as designed — for a false signal.",
        "story", ["rescue", "false-alarm"],
        "villagers.location=flock, alarm.heeded=yes, boy.crying_wolf=no"),
      node("cw_laugh", "The boy laughs at them", "mock(boy, villagers)",
        "The villagers know the alarm was a joke and are angry with the boy.",
        "The cost is made explicit to the people who paid it, which is what converts an error into a grudge.",
        "story", ["derision"],
        "villagers.trust_boy=reduced"),
      node("cw_home1", "The villagers go back to the village", "return(villagers, village)",
        "The villagers are back at their work in the village. The boy is alone with the sheep again.",
        "The watcher is left exactly where he was, minus some credit.",
        "story", ["recurrence"],
        "villagers.location=village"),
      node("cw_cry2", "The boy cries wolf again", "cry(boy, wolf)",
        "The boy is shouting about a wolf a second time. The alarm is a lie again.",
        "The same act in a changed world: this time belief is thinner.",
        "story", ["deception", "recurrence"],
        "boy.crying_wolf=yes, alarm.heeded=pending"),
      node("cw_run2", "They come a second time", "arrive(villagers, flock)",
        "The villagers are at the flock again, and again the sheep are grazing quietly.",
        "The channel still carries — but it is now being read as noise, not signal.",
        "story", ["false-alarm", "recurrence"],
        "villagers.location=flock, alarm.heeded=yes, boy.crying_wolf=no"),
      node("cw_doubt", "The villagers stop believing him", "distrust(villagers, boy)",
        "The villagers have decided to treat every cry from the boy as a lie.",
        "The alarm is disconnected at the receiving end, silently, while the sender assumes it still works.",
        "story", ["erosion"],
        "villagers.trust_boy=none"),
      node("cw_home2", "The villagers go home again", "return(villagers, village)",
        "The villagers are back in the village. The boy is alone with the sheep.",
        "Same walk home, different villagers: they will not make it a third time.",
        "story", ["recurrence"],
        "villagers.location=village"),
      node("cw_wolf", "A real wolf comes", "arrive(wolf, flock)",
        "A wolf is among the sheep. The boy is alone with it.",
        "The threat the alarm was built for finally appears.",
        "story", ["threat"],
        "wolf.location=flock"),
      node("cw_cry3", "The boy cries wolf truthfully", "cry(boy, wolf)",
        "The boy is shouting about the wolf a third time, and this time the wolf is real.",
        "The same words, now accurate, and the accuracy makes no difference — content was never what was being read.",
        "story", ["recurrence", "inversion"],
        "boy.crying_wolf=yes, alarm.heeded=pending"),
      node("cw_dismiss", "The villagers stay in the village", "ignore(villagers, boy)",
        "The villagers hear the cry and stay at their work in the village.",
        "The villagers correctly recognize the boy — as a liar — and are wrong about the wolf.",
        "story", ["recognition", "inversion"],
        "alarm.heeded=no"),
      node("cw_loss", "The wolf kills the sheep", "devour(wolf, flock)",
        "The sheep are dead. The boy is safe and alone on the hillside.",
        "The cost of the spent alarm channel is paid all at once.",
        "story", ["loss"],
        "flock.alive=no, flock.guarded=no, boy.crying_wolf=no"),
    ],
    edges: [
      ...pathEdges(["cw_watch", "cw_cry1", "cw_run1", "cw_laugh", "cw_home1", "cw_cry2",
                    "cw_run2", "cw_doubt", "cw_home2", "cw_wolf", "cw_cry3", "cw_dismiss",
                    "cw_loss"]),
    ],
  };

  // ---------------------------------------------------------------
  // The Trojan Horse
  // ---------------------------------------------------------------
  // Early recognition that gets ignored: in Red, recognition leads to rescue;
  // here it leads to nothing, and the ending is destruction, not restoration.
  //
  // The order is simplified, deliberately (human decision, 2026-10-04): in the
  // Aeneid Laocoön warns before Sinon is brought in, and Cassandra speaks as
  // the horse enters. Here Cassandra stands for both warnings, after the lie.
  // The model knows Virgil's order, which is one reason it skips Cassandra at
  // `th_lie` (experiments/NOTES.md).
  const trojanHorse = {
    title: "The Trojan Horse",
    summary: "Deception through a gift; recognition comes early, is ignored, and the city falls.",
    root: "th_build",
    nodes: [
      node("th_build", "The Greeks build a wooden horse", "build(greeks, horse)",
        "A huge hollow wooden horse stands on the plain outside Troy.",
        "A weapon is disguised as an offering.",
        "root", ["deception", "artifact"],
        "horse.location=plain, horse.occupied=no, troy.standing=yes, troy.gates=shut, greeks.fleet=shore, trojans.awake=yes"),
      node("th_hide", "Armed men climb inside it", "hide(greeks, horse)",
        "Armed Greeks are sealed inside the horse. From outside it looks like a wooden statue.",
        "The threat is made invisible by being placed inside the object everyone is looking at.",
        "story", ["concealment"],
        "horse.occupied=yes, greeks.location=inside_horse"),
      node("th_sail", "The fleet sails out of sight", "depart(greeks, troy)",
        "The Greek ships are gone from the shore, hidden behind a nearby island. To the Trojans the siege looks over.",
        "The absence of the enemy is the strongest part of the lie.",
        "story", ["feint"],
        "greeks.fleet=hidden"),
      node("th_gift", "The Trojans find the horse", "find(trojans, horse)",
        "The Trojans have come out of the city and stand around the horse, arguing about what to do with it.",
        "The trap is delivered by the enemy's own curiosity.",
        "story", ["gift", "trap"],
        "trojans.know_horse=yes"),
      node("th_capture", "Shepherds bring in a captured Greek", "capture(trojans, sinon)",
        "A Greek named Sinon stands bound among the Trojans as their prisoner.",
        "The planted defector arrives as a prisoner, so that nothing he says looks offered.",
        "story", ["deception"],
        "sinon.captive=yes"),
      node("th_lie", "Sinon sells the lie", "deceive(sinon, trojans)",
        "The Trojans believe the horse is an offering to Athena, and that bringing it into the city will protect Troy.",
        "A planted defector supplies the story the trap needs.",
        "story", ["deception"],
        "trojans.believe_horse_safe=yes"),
      node("th_seer", "Cassandra names it a trap", "warn(cassandra, trojans)",
        "Cassandra has told the city, out loud, that the horse holds armed men.",
        "The deception is correctly identified — before it can do harm.",
        "story", ["recognition", "warning"],
        "warning.given=yes"),
      node("th_ignore", "Her warning is set aside", "ignore(trojans, cassandra)",
        "The Trojans have heard Cassandra and decided to bring the horse in anyway.",
        "Recognition without authority changes nothing.",
        "story", ["dismissal"],
        "warning.heeded=no"),
      node("th_enter", "The Trojans drag the horse into the city", "bring(trojans, horse, troy)",
        "The horse stands inside the walls of Troy, and the gates are shut behind it.",
        "The city carries the threat across its own threshold.",
        "story", ["threshold", "inversion"],
        "horse.location=inside_troy"),
      node("th_feast", "The city celebrates", "celebrate(trojans)",
        "Troy is feasting, with garlands on the temples. The guards have joined the feast and the horse stands alone in the square.",
        "The defence is stood down by the same belief that carried the horse in.",
        "story", ["complacency"],
        "troy.guarded=no"),
      node("th_night", "The city sleeps", "sleep(trojans)",
        "Troy is asleep after the feast. The horse stands alone in the dark streets.",
        "The last witness to the horse goes to bed.",
        "story", ["complacency"],
        "trojans.awake=no"),
      node("th_return", "The fleet sails back in the dark", "return(greeks, troy)",
        "The Greek ships are back at the shore, and their army is marching on the city in the dark.",
        "The feint is reversed while the only people who could see it are asleep.",
        "story", ["feint"],
        "greeks.fleet=shore, greeks.army=outside_troy"),
      node("th_out", "The men climb out of the horse", "exit(greeks, horse)",
        "The Greek soldiers are out of the horse and standing in the sleeping city.",
        "The thing everyone looked at gives up what nobody saw.",
        "story", ["betrayal"],
        "horse.occupied=no, greeks.location=inside_troy"),
      node("th_open", "The gates are opened from inside", "open(greeks, gates)",
        "The gates of Troy stand open and the Greek army is pouring into the city.",
        "The closed system is opened from within.",
        "story", ["betrayal"],
        "troy.gates=open, greeks.army=inside_troy"),
      node("th_fall", "Troy falls in the night", "destroy(greeks, troy)",
        "Troy is burning and its people are being killed or taken. The war is over.",
        "Recognition happened, in time, to the right object, and the city fell anyway.",
        "story", ["catastrophe"],
        "troy.standing=no, trojans.awake=yes, trojans.believe_horse_safe=no"),
    ],
    edges: [
      ...pathEdges(["th_build", "th_hide", "th_sail", "th_gift", "th_capture", "th_lie",
                    "th_seer", "th_ignore", "th_enter", "th_feast", "th_night", "th_return",
                    "th_out", "th_open", "th_fall"]),
    ],
  };

  const seeds = { red, criedWolf, trojanHorse };

  // ── entities: the closed character list per story ───────────────────────
  //
  // Who can ACT in the story — not everything mentioned (`the flock` owns
  // effects in criedWolf but never acts). branch.v4 renders it into the story
  // file's header line as `characters`; nothing constrains to it since v3.
  //
  // Closed on purpose, and the cost is real: no generated alternative can be
  // driven by a character the author did not list. What it buys was measured
  // on the (removed) frames boundary: sampling collapses onto one or two
  // actors, and restricting the actor to one entity recovers continuations
  // the sampler never proposes (experiments/NOTES.md, "--fill-actors").
  red.entities = ["Red", "Red's mother", "Red's grandmother", "the wolf", "the woodcutter"];
  criedWolf.entities = ["the boy", "the villagers", "the wolf"];
  trojanHorse.entities = ["the Greeks", "the Trojans", "Sinon", "Cassandra"];

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
