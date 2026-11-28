# Branching Narrative DAG Builder: Research and Design Notes

## Supporting research

This implementation is grounded in a few recurring findings from interactive narrative and narrative-generation research:

1. **Linear stories can be mediated into branching graphs.** Riedl and Young argue that a linear narrative plan can support an acyclic branching story structure when deviations are detected and alternative plans are generated around them. This supports the app's core workflow: start with a familiar one-path story spine, then branch from any state node while preserving causal links. Source: Mark O. Riedl and R. Michael Young, “From Linear Story Generation to Branching Story Graphs,” AIIDE 2005, https://doi.org/10.1609/aiide.v1i1.18725.

2. **Causal links and character intent are useful authoring primitives.** IPOCL-style narrative planning treats story steps as a partial-order causal-link plan while also tracking believable character intentions. The UI therefore exposes edge types — `causes`, `leads_to`, `choice`, and `rejoins` — and stores each node's expression and optional motif tags. Source: Liquid Narrative Group overview of IPOCL, https://liquidnarrative.eae.utah.edu/ipocl/.

3. **Counterfactual generation depends on preserving invariant causal chains.** Counterfactual story reasoning work frames the task as changing an earlier condition while rewriting downstream events in ways that respect unchanged causal facts. This motivates the branch composer's “rejoin target” and “invariant facts” fields: a branch should specify what changed and what must remain true before it reconnects. Source: Qin et al., “Counterfactual Story Reasoning and Generation,” EMNLP-IJCNLP 2019, https://aclanthology.org/D19-1509/.

4. **Event plot graphs make narrative structure queryable.** Retrieval-augmented narrative construction systems use event plot graphs to retrieve plot points and assemble coherent narratives. This informs the app's JSON export/import and local graph statistics panel: the DAG is not just visualization; it is a queryable story-world artifact. Source: FABULA, “Intelligence Report Generation Using Retrieval-Augmented Narrative Construction,” arXiv 2023, https://arxiv.org/abs/2310.13848.

5. **Fabula-level causal networks separate story-world facts from presentation.** Emergent narrative models distinguish underlying fabula structures from the order in which a discourse presents them. Retrocause is consistent with that split: the builder edits fabula-state nodes and causal edges, not prose paragraphs. Source: Swartjes and Theune, “A Fabula Model for Emergent Narrative,” TIDSE 2006, https://ris.utwente.nl/ws/portalfiles/portal/5396899/fulltext.pdf.

## Product vision

The builder — the page you open — should feel like a semi-manual laboratory rather than a fully automatic generator. Bulk generation is a separate tool you run deliberately, not something the editor does while you work in it:

- **Known story seed:** Start from a familiar short story laid out as a single path of state nodes.
- **Inspectable causality:** Click a node to see its expression, state note, incoming causes, outgoing effects, and motif tags.
- **Branch from anywhere:** Pick any node, describe an alternate choice or condition, optionally choose a rejoin target, and add one or more branch nodes.
- **LLM-assisted, through a bridge.** The page never calls a model. Its Lab panel streams from a Node-side grower (`LOCAL_LLM.md`) that calls a local model through `llama.cpp`; nodes land in the graph as they are written. Without the bridge the page still works as an editor, opened from disk.
- **Recorded, not replayable (since 2026-11-02).** A grow run writes its parameters, model, prompt hashes and every request and completion to `runs/<runId>/`. Node ids stay content-addressed, but concurrent generation means a rerun gives another graph.
- **Research-aligned constraints:** DAG validation prevents cycles and highlights orphan nodes and open branches.
- **Reusable artifact:** Export/import JSON so a story DAG can become input for later analysis, model prompting, or another visualization.

## Engine model

The schema below is the in-memory representation the browser app uses.

```text
StoryGraph = {
  nodes: Node[],
  edges: Edge[],
  meta:  { title, summary, version, savedAt }
}

Node = {
  id, label,
  expr,              // free-form expression, e.g. meet(red, wolf)
  state,             // prose note: what is true in the story world here
  kind,              // root | story | branch | note  (bottleneck is derived, not a kind)
  tags,              // motifs, actors, values, risks
  delta,             // branch metadata: what changed from the original
  invariants,        // branch metadata: facts that must stay true
  createdBy          // seed | human | human-edited | assist | grown
  runId              // grown nodes only: which growth run produced this
}

Edge = {
  id, from, to,
  type,              // causes | leads_to | choice | rejoins
  label,
  branchId
}
```

The graph is kept acyclic by testing whether a proposed edge `from -> to` would make `from` reachable from `to`. Layout uses topological ranks, so the original story and its counterfactual branches stay readable even after enrichment. Edges are plain narrative relations; none is privileged as a "canonical" spine.

## Story seed

The app ships three seeds — “Little Red Riding Hood”, “The Boy Who Cried
Wolf” and “The Trojan Horse” — short, high-familiarity stories with clear
state transitions and branch points. Each is a single path of state nodes
with hand-authored `effects` facts; counterfactual branches are added in
the UI or grown, not shipped in the seed.

## Implemented scope

The builder separates the browser UI from a dependency-free graph engine so JSON persistence and causal constraints can be tested without a browser package install. The UI includes:

- A topological D3 visualization with colored node kinds, edge labels, branch/rejoin edge styling, search highlighting, and view filters for the story spine versus branch structure.
- Branch metadata fields for changed condition and invariant facts, matching the counterfactual-reasoning research motivation above.
- Manual node/edge editing with the design model's edge types.
- Selected-node editing, graph validation, localStorage save/restore, JSON export/download, full-graph JSON import, and reviewed LLM-branch JSON import.
- Dependency-free Node tests for engine behavior: adding branches with rejoin edges, rejecting cyclic edges, and restoring exported JSON.
