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

  const seeds = { red };

  const api = { seeds, node, edge, pathEdges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocauseSeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
