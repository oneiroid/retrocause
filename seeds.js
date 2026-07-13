// Story seed data. Shared between the browser UI (story_builder_app.js)
// and node-based tests.
//
// A seed is a visual + structural declaration of a story DAG: nodes
// (story states) joined by edges. Edges are plain narrative relations
// (`causes`, `leads_to`, `choice`, `rejoins`) — there is no privileged
// "canonical" class of edge. Seeds do not ship premade counterfactual
// branches; branches are created in the UI by the user.

(function attachSeeds(root) {

  function node(id, label, expr, state, kind, tags) {
    return {
      id, label, expr, state,
      kind: kind || "story",
      tags: tags || [],
      createdBy: "seed",
      delta: "",
      invariants: "",
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
  const red = {
    title: "Little Red Riding Hood",
    summary: "Clean warning → temptation → disguise → rescue structure; good for early-detection branches.",
    root: "red_start",
    nodes: [
      node("red_start", "Mother gives errand", "send(mother, red, basket)",
        "Red has a mission, a destination, and a warning to stay on the path.",
        "root", ["warning", "quest"]),
      node("red_woods", "Red enters the woods", "enter(red, woods)",
        "Red crosses from domestic safety into a place where strangers can intervene.",
        "story", ["threshold"]),
      node("red_wolf", "Wolf learns destination", "deceive(wolf, red)",
        "The wolf gains enough information to race ahead and construct a trap.",
        "story", ["deception", "predator"]),
      node("red_delay", "Red gathers flowers", "delay(red, flowers)",
        "Red loses time; the predator's route becomes causally prior to hers.",
        "story", ["temptation", "delay"]),
      node("red_grandma", "Wolf reaches grandmother", "arrive(wolf, grandmother_house)",
        "The safe endpoint becomes compromised before Red arrives.",
        "story", ["inversion"]),
      node("red_disguise", "Wolf impersonates grandmother", "impersonate(wolf, grandmother)",
        "A trusted role now hides a threat inside a trusted house.",
        "story", ["disguise"]),
      node("red_recognition", "Red recognizes danger too late", "recognize(red, wolf, late)",
        "The deception collapses after Red has entered the trap.",
        "story", ["recognition"]),
      node("red_rescue", "Rescue restores household", "rescue(woodcutter, red, grandmother)",
        "Outside intervention reverses the closed predator-prey path.",
        "story", ["rescue", "restoration"]),
    ],
    edges: [
      ...pathEdges(["red_start", "red_woods", "red_wolf", "red_delay",
                    "red_grandma", "red_disguise", "red_recognition", "red_rescue"]),
    ],
  };

  // ---------------------------------------------------------------
  // The Boy Who Cried Wolf
  // ---------------------------------------------------------------
  // Shares the `wolf` entity with Red, so the two possibility spaces braid.
  // Carries a real in-story recurrence: the second false cry is the same
  // state content in a changed world (trust already spent).
  const criedWolf = {
    title: "The Boy Who Cried Wolf",
    summary: "Deception by the protagonist; rescue arrives mid-story and trust erodes until recognition fails.",
    root: "cw_watch",
    nodes: [
      node("cw_watch", "Boy set to watch the flock", "send(villagers, boy, flock)",
        "The village delegates its vigilance to a single bored watcher.",
        "root", ["duty", "trust"]),
      node("cw_cry1", "Boy cries wolf for fun", "deceive(boy, villagers)",
        "The alarm channel is spent on a joke; trust takes its first debit.",
        "story", ["deception"]),
      node("cw_rescue1", "Villagers rush to the rescue", "rescue(villagers, boy, flock)",
        "The system works exactly as designed — for a false signal.",
        "story", ["rescue", "false-alarm"]),
      node("cw_cry2", "Boy cries wolf again", "deceive(boy, villagers)",
        "The same act in a changed world: this time belief is thinner.",
        "story", ["deception", "recurrence"]),
      node("cw_wolf", "A real wolf arrives", "arrive(wolf, flock)",
        "The threat the alarm was built for finally appears.",
        "story", ["threat"]),
      node("cw_dismiss", "True cry dismissed as another lie", "recognize(villagers, boy, late)",
        "The villagers correctly recognize the boy — as a liar — and are wrong about the wolf.",
        "story", ["recognition", "inversion"]),
      node("cw_loss", "The flock is lost", "devour(wolf, flock)",
        "The cost of the spent alarm channel is paid all at once.",
        "story", ["loss"]),
    ],
    edges: [
      ...pathEdges(["cw_watch", "cw_cry1", "cw_rescue1", "cw_cry2",
                    "cw_wolf", "cw_dismiss", "cw_loss"]),
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
      node("th_build", "Greeks build the horse", "build(greeks, horse)",
        "A weapon is disguised as an offering.",
        "root", ["deception", "artifact"]),
      node("th_gift", "Horse left at the gates", "send(greeks, horse, troy)",
        "The trap is delivered by the enemy's own curiosity.",
        "story", ["gift", "trap"]),
      node("th_lie", "Sinon sells the lie", "deceive(sinon, trojans)",
        "A planted defector supplies the story the trap needs.",
        "story", ["deception"]),
      node("th_seer", "Cassandra sees through it", "recognize(cassandra, horse, early)",
        "The deception is correctly identified — before it can do harm.",
        "story", ["recognition", "warning"]),
      node("th_ignore", "Her warning is dismissed", "ignore(trojans, cassandra)",
        "Recognition without authority changes nothing.",
        "story", ["dismissal"]),
      node("th_enter", "Horse brought inside the walls", "enter(horse, troy)",
        "The city carries the threat across its own threshold.",
        "story", ["threshold", "inversion"]),
      node("th_fall", "Troy falls in the night", "destroy(greeks, troy)",
        "The closed system is opened from within.",
        "story", ["catastrophe"]),
    ],
    edges: [
      ...pathEdges(["th_build", "th_gift", "th_lie", "th_seer",
                    "th_ignore", "th_enter", "th_fall"]),
    ],
  };

  const seeds = { red, criedWolf, trojanHorse };

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
