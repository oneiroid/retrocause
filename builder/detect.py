"""Convergence nodes and recurring-template detectors.

Two detectors per DAG_BUILDER_PLAN.md §4:

  1. convergence(dag, min_in=3, depth=2, min_distinct=3)
     Nodes whose in-degree >= min_in AND whose depth-`depth` ancestors
     include at least `min_distinct` distinct nodes. The depth gate
     filters out "fake" convergence where all predecessors come from a
     shared recent ancestor.

  2. templates(dag, size=3, top_k=10)
     Enumerate connected linear paths of `size` edges, canonicalize on
     (action_type_sequence), count occurrences, return the top_k by
     instance count.

  3. template_parameter_contrast(dag, template_key, max_instances=5)
     §7.2 contrast: for each instance of a template, list the parameter
     values that vary across instances. Cheap surrogate for the full
     parallel-DAG contrast operator.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from builder.dag import DAG, NodeId


@dataclass
class ConvergenceHit:
    node_id: NodeId
    in_degree: int
    distinct_ancestors_at_depth: int


@dataclass
class TemplateHit:
    key: Tuple[str, ...]           # canonical action-type sequence
    count: int
    instances: List[Tuple[NodeId, ...]] = field(default_factory=list)


# ---------------- convergence ----------------

def _ancestors_at_depth(dag: DAG, nid: NodeId, depth: int) -> set:
    """Nodes exactly `depth` steps back from nid (BFS). Uses a frontier
    set rather than a DFS stack so we stay per-level."""
    frontier = {nid}
    for _ in range(depth):
        nxt: set = set()
        for x in frontier:
            for p in dag.predecessors(x):
                nxt.add(p)
        frontier = nxt
        if not frontier:
            break
    return frontier


def convergence(
    dag: DAG, min_in: int = 3, depth: int = 2, min_distinct: int = 3
) -> List[ConvergenceHit]:
    hits: List[ConvergenceHit] = []
    for nid in dag.nodes:
        in_deg = dag.in_degree(nid)
        if in_deg < min_in:
            continue
        anc = _ancestors_at_depth(dag, nid, depth)
        if len(anc) >= min_distinct:
            hits.append(ConvergenceHit(nid, in_deg, len(anc)))
    hits.sort(key=lambda h: (-h.in_degree, -h.distinct_ancestors_at_depth))
    return hits


# ---------------- templates (linear size-k paths) ----------------

def templates(dag: DAG, size: int = 3, top_k: int = 10) -> List[TemplateHit]:
    """Enumerate all linear paths of exactly `size` edges, canonicalize
    by action_type sequence, count occurrences. Returns the top_k by
    count (min 2 instances, otherwise it's not a recurrence)."""
    if size < 1:
        raise ValueError("template size must be >= 1")

    # paths: dict[key -> list of node-tuples]
    paths: Dict[Tuple[str, ...], List[Tuple[NodeId, ...]]] = defaultdict(list)

    def walk(prefix_nodes: Tuple[NodeId, ...], prefix_types: Tuple[str, ...]):
        if len(prefix_types) == size:
            paths[prefix_types].append(prefix_nodes)
            return
        last = prefix_nodes[-1]
        for eidx in dag.out_edges[last]:
            e = dag.edges[eidx]
            walk(prefix_nodes + (e.to_id,), prefix_types + (e.action_type,))

    for nid in dag.nodes:
        walk((nid,), ())

    hits = [
        TemplateHit(key=k, count=len(v), instances=v)
        for k, v in paths.items()
        if len(v) >= 2
    ]
    hits.sort(key=lambda h: -h.count)
    return hits[:top_k]


# ---------------- parameter contrast ----------------

def template_parameter_contrast(
    dag: DAG, template_key: Tuple[str, ...], max_instances: int = 5
) -> List[List[str]]:
    """For each listed instance (up to max_instances), return the
    concrete action labels along the path. The caller can diff them to
    see which parameters vary."""
    out: List[List[str]] = []
    size = len(template_key)
    for nid in dag.nodes:
        if len(out) >= max_instances:
            break
        stack: List[Tuple[Tuple[NodeId, ...], Tuple[str, ...], Tuple[str, ...]]] = [
            ((nid,), (), ())
        ]
        while stack and len(out) < max_instances:
            nodes, labels, types = stack.pop()
            if types == template_key:
                out.append(list(labels))
                continue
            if len(types) >= size:
                continue
            last = nodes[-1]
            for eidx in dag.out_edges[last]:
                e = dag.edges[eidx]
                want = template_key[len(types)]
                if e.action_type != want:
                    continue
                stack.append(
                    (nodes + (e.to_id,), labels + (e.action_label,), types + (e.action_type,))
                )
    return out


# ---------------- combined report ----------------

def report(dag: DAG, rules, min_in: int = 3, depth: int = 2,
           template_size: int = 3, top_k: int = 5) -> str:
    conv = convergence(dag, min_in=min_in, depth=depth, min_distinct=min_in)
    tpl = templates(dag, size=template_size, top_k=top_k)

    lines = [
        f"-- detectors --  (DAG: nodes={len(dag.nodes)}, edges={len(dag.edges)})",
        f"convergence (in>={min_in}, depth={depth}, distinct>={min_in}): "
        f"{len(conv)} hits",
    ]
    for h in conv[:8]:
        n = dag.nodes[h.node_id]
        lines.append(
            f"  #{h.node_id}  in={h.in_degree}  distinct@{depth}="
            f"{h.distinct_ancestors_at_depth}  {n.expr}"
        )
    if len(conv) > 8:
        lines.append(f"  ... and {len(conv) - 8} more")

    lines.append(f"top-{top_k} recurring templates (size={template_size}):")
    for h in tpl:
        lines.append(f"  x{h.count:<4}  {' -> '.join(h.key)}")
    if not tpl:
        lines.append("  (none)")

    return "\n".join(lines)


def convergence_set(
    dag: DAG, min_in: int = 3, depth: int = 2, min_distinct: int = 3
) -> set:
    return {h.node_id for h in convergence(dag, min_in, depth, min_distinct)}
