# Branching Narrative DAG Builder: Research and Design Notes

## Supporting research

This implementation is grounded in a few recurring findings from interactive narrative and narrative-generation research:

1. **Linear stories can be mediated into branching graphs.** Riedl and Young argue that a linear narrative plan can support an acyclic branching story structure when deviations are detected and alternative plans are generated around them. This supports the app's core workflow: start with a familiar one-path story spine, then branch from any state node while preserving causal links. Source: Mark O. Riedl and R. Michael Young, “From Linear Story Generation to Branching Story Graphs,” AIIDE 2005, https://doi.org/10.1609/aiide.v1i1.18725.

2. **Causal links and character intent are useful authoring primitives.** IPOCL-style narrative planning treats story steps as a partial-order causal-link plan while also tracking believable character intentions. The UI therefore exposes edge types such as `causes`, `enables`, `blocks`, `choice`, and `rejoins`, and stores each node's state expression and optional goal/motif tags. Source: Liquid Narrative Group overview of IPOCL, https://liquidnarrative.eae.utah.edu/ipocl/.

3. **Counterfactual generation depends on preserving invariant causal chains.** Counterfactual story reasoning work frames the task as changing an earlier condition while rewriting downstream events in ways that respect unchanged causal facts. This motivates the branch composer's “rejoin target” and “invariant facts” fields: a branch should specify what changed and what must remain true before it reconnects. Source: Qin et al., “Counterfactual Story Reasoning and Generation,” EMNLP-IJCNLP 2019, https://aclanthology.org/D19-1509/.

4. **Event plot graphs make narrative structure queryable.** Retrieval-augmented narrative construction systems use event plot graphs to retrieve plot points and assemble coherent narratives. This informs the app's JSON export/import and local graph statistics panel: the DAG is not just visualization; it is a queryable story-world artifact. Source: FABULA, “Intelligence Report Generation Using Retrieval-Augmented Narrative Construction,” arXiv 2023, https://arxiv.org/abs/2310.13848.

5. **Fabula-level causal networks separate story-world facts from presentation.** Emergent narrative models distinguish underlying fabula structures from the order in which a discourse presents them. Retrocause's existing subDAG formalism is consistent with that split: the builder edits fabula-state nodes and causal edges, not prose paragraphs. Source: Swartjes and Theune, “A Fabula Model for Emergent Narrative,” TIDSE 2006, https://ris.utwente.nl/ws/portalfiles/portal/5396899/fulltext.pdf.

## Product vision

The builder should feel like a semi-manual laboratory rather than a fully automatic generator:

- **Known story seed:** Select a well-known short story/fable/fairy tale. The engine loads a single canonical path of state nodes.
- **Inspectable causality:** Click a node to see its expression, state delta, incoming causes, outgoing effects, and motif tags.
- **Branch from anywhere:** Pick any node, describe an alternate choice or condition, optionally choose a rejoin target, and add one or more branch nodes.
- **LLM-assisted but human-owned:** The browser-only app cannot call a model directly, but it produces a structured prompt that can be pasted into an LLM. The returned JSON can be imported after human review.
- **Research-aligned constraints:** DAG validation prevents cycles, highlights orphan nodes, and distinguishes canonical edges from counterfactual branch edges.
- **Reusable artifact:** Export/import JSON so a story DAG can become input for later analysis, model prompting, or another visualization.

## Engine model

```text
StoryGraph = {
  nodes: Node[],
  edges: Edge[],
  meta: { title, sourceStory, version }
}

Node = {
  id, label, story,
  expr,              // typed semantic expression, e.g. meet(red, wolf)
  state,             // natural-language story-world state after this event
  kind,              // root | canonical | branch | convergence | note
  tags,              // motifs, actors, values, risks
  createdBy          // seed | human | assist
}

Edge = {
  id, from, to,
  type,              // causes | enables | blocks | choice | rejoins | parallels
  label,
  branchId,
  canonical
}
```

The graph is kept acyclic by testing whether a proposed edge `from -> to` would make `from` reachable from `to`. Layout uses topological ranks, so canonical and counterfactual timelines remain readable even after enrichment.

## Initial story seeds

The first version includes compact canonical paths for:

- “Little Red Riding Hood”
- “The Three Little Pigs”
- “The Tortoise and the Hare”
- “The Gift of the Magi”
- “The Necklace”

These are intentionally short, high-familiarity stories with clear state transitions and branch points.

## Implemented v2 scope

The revised builder separates the browser UI from a dependency-free graph engine so JSON persistence and causal constraints can be tested without a browser package install. The UI now includes:

- Richer seeded DAGs, not only single paths, for “Little Red Riding Hood,” “The Gift of the Magi,” “The Necklace,” and “The Tortoise and the Hare.” “The Gift of the Magi” and “The Necklace” include prebuilt counterfactual branches and rejoin edges because their core conflicts are especially well suited to invariant-preserving counterfactual analysis.
- A topological D3 visualization with rank guide lines, colored node kinds, edge labels, branch/rejoin edge styling, search highlighting, and view filters for canonical paths versus branch structure.
- Branch metadata fields for changed condition and invariant facts, matching the counterfactual-reasoning research motivation above.
- Manual node/edge editing with edge types from the design model.
- Selected-node editing, graph validation, localStorage save/restore, JSON export/download, full-graph JSON import, and reviewed LLM-branch JSON import.
- Dependency-free Node tests for engine behavior: adding branches with rejoin edges, rejecting cyclic edges, and restoring exported JSON.
