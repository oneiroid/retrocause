# Branching Narrative DAG Builder: Research and Design Notes

## Supporting research

This implementation is grounded in a few recurring findings from interactive narrative and narrative-generation research:

1. **Presented stories can be mediated into branching actor-thread graphs.** Riedl and Young argue that a linear narrative plan can support an acyclic branching story structure when deviations are detected and alternative plans are generated around them. Retrocause uses that as a UI entry point, but the internal seed is not required to be one path: main characters usually carry separate causal threads that can cross, merge for a run of shared action, and split again. Source: Mark O. Riedl and R. Michael Young, “From Linear Story Generation to Branching Story Graphs,” AIIDE 2005, https://doi.org/10.1609/aiide.v1i1.18725.

2. **Causal links and character intent are useful authoring primitives.** IPOCL-style narrative planning treats story steps as a partial-order causal-link plan while also tracking believable character intentions. The UI therefore exposes edge types such as `causes`, `enables`, `blocks`, `choice`, and `rejoins`, and stores each node's state expression and optional goal/motif tags. Source: Liquid Narrative Group overview of IPOCL, https://liquidnarrative.eae.utah.edu/ipocl/.

3. **Counterfactual generation depends on preserving invariant causal chains.** Counterfactual story reasoning work frames the task as changing an earlier condition while rewriting downstream events in ways that respect unchanged causal facts. This motivates the branch composer's “rejoin target” and “invariant facts” fields: a branch should specify what changed and what must remain true before it reconnects. Source: Qin et al., “Counterfactual Story Reasoning and Generation,” EMNLP-IJCNLP 2019, https://aclanthology.org/D19-1509/.

4. **Event plot graphs make narrative structure queryable.** Retrieval-augmented narrative construction systems use event plot graphs to retrieve plot points and assemble coherent narratives. This informs the app's JSON export/import and local graph statistics panel: the DAG is not just visualization; it is a queryable story-world artifact. Source: FABULA, “Intelligence Report Generation Using Retrieval-Augmented Narrative Construction,” arXiv 2023, https://arxiv.org/abs/2310.13848.

5. **Fabula-level causal networks separate story-world facts from presentation.** Emergent narrative models distinguish underlying fabula structures from the order in which a discourse presents them. Retrocause's existing subDAG formalism is consistent with that split: the builder edits fabula-state nodes and causal edges, not prose paragraphs. Source: Swartjes and Theune, “A Fabula Model for Emergent Narrative,” TIDSE 2006, https://ris.utwente.nl/ws/portalfiles/portal/5396899/fulltext.pdf.

## Product vision

The builder should feel like a semi-manual laboratory rather than a fully automatic generator:

- **Known story seed:** Select a well-known short story/fable/fairy tale. The engine loads a canonical actor-thread DAG: main characters have their own paths, with shared encounter or convergence nodes where appropriate.
- **Inspectable causality:** Click a node to see its expression, state delta, incoming causes, outgoing effects, and motif tags.
- **Branch from anywhere:** Pick any node, describe an alternate choice or condition, optionally choose a rejoin target, and add one or more branch nodes.
- **LLM-assisted but human-owned:** The browser-only app cannot call a model directly, but it produces a structured prompt that can be pasted into an LLM. The returned JSON can be imported after human review.
- **Research-aligned constraints:** DAG validation prevents cycles, highlights orphan nodes, and distinguishes canonical edges from counterfactual branch edges.
- **Reusable artifact:** Export/import JSON so a story DAG can become input for later analysis, model prompting, or another visualization.

## Engine model

This section is the product-side shape of the engine. The **source of
truth for what nodes and edges *mean*** is `FORMAL_MODEL.md` (§1.5,
§1.6, §3.5, §7.8). The schema below is the in-memory representation
the browser app uses; it carries the formal content as fields.

```text
StoryGraph = {
  nodes: Node[],
  edges: Edge[],
  meta:  { title, sourceStory, version, scope }   // scope per FORMAL_MODEL §3.5
}

Node = {
  id, label, story,
  expr,              // typed semantic expression e.g. meet(red, wolf), per FORMAL_MODEL §1.5
  gloss,             // optional natural-language summary; not authoritative
  preState,          // Set<P-atom>: typed world state entering this node (§1.6)
  postState,         // Set<P-atom>: derivation_closure(apply(effects, preState)) (§1.7)
  kind,              // root | canonical | branch | convergence | note
  tags,              // motifs, actors, values, risks
  actors,            // agency/thread owners active at this node; not every participant in expr
  createdBy          // seed | human | assist
}

Edge = {
  id, from, to,
  type,              // causes | enables | blocks | choice | rejoins | parallels
  label,
  actor,             // character whose agency selects this outgoing edge, if any;
                     // must be active in source.actors when present
  branchId,
  canonical
}
```

The graph is kept acyclic by testing whether a proposed edge `from -> to` would make `from` reachable from `to`. Layout uses topological ranks, so canonical actor paths and counterfactual timelines remain readable even after enrichment.

Actor validity is also a graph invariant: if an edge declares
`actor: "red"`, its source node must include `"red"` in `actors`.
This prevents generated branches like Red warning someone from a node
that belongs only to Wolf's path.

State on a node is a **set of typed P-atoms** (per `FORMAL_MODEL.md`
§1.6), not free prose. The walker (`state_walker.js`) computes
`postState` by topo-replay along canonical `causes` edges. A node with
multiple canonical predecessors merges their post-states, which is how
temporarily shared actor paths and convergence points become executable.
Prose
glosses, where present, are convenience for display; the engine reads
the typed atoms.

## Initial story seeds

The first version includes compact canonical actor-thread DAGs for:

- “Little Red Riding Hood”
- “The Three Little Pigs”
- “The Tortoise and the Hare”
- “The Gift of the Magi”
- “The Necklace”

These are intentionally short, high-familiarity stories with clear state transitions and branch points.

## Implemented v2 scope

The revised builder separates the browser UI from a dependency-free graph engine so JSON persistence and causal constraints can be tested without a browser package install. The UI now includes:

- Richer seeded DAGs, not only single paths, for “Little Red Riding Hood,” “The Gift of the Magi,” “The Necklace,” and “The Tortoise and the Hare.” Red, Magi, and Tortoise now explicitly encode separate main-character paths with merge points. Counterfactual branches and rejoin edges remain human-authored or Phi/assist-generated enrichment.
- A topological D3 visualization with rank guide lines, colored node kinds, edge labels, branch/rejoin edge styling, search highlighting, and view filters for canonical actor paths versus branch structure.
- Branch metadata fields for changed condition and invariant facts, matching the counterfactual-reasoning research motivation above.
- Manual node/edge editing with edge types from the design model.
- Selected-node editing, graph validation, localStorage save/restore, JSON export/download, full-graph JSON import, and reviewed LLM-branch JSON import.
- Dependency-free Node tests for engine behavior: adding branches with rejoin edges, rejecting cyclic edges, and restoring exported JSON.
