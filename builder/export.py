"""Export a DAG to JSON for the d3 viewer.

Output shape (stable; the viewer depends on these field names):

    {
        "nodes": [
            {"id": int, "expr": str, "generation": int,
             "labels": [str, ...], "pinned": bool,
             "in_degree": int, "out_degree": int, "terminal": bool}
        ],
        "edges": [
            {"from": int, "to": int, "action": str, "type": str}
        ],
        "meta": {
            "n_nodes": int, "n_edges": int,
            "n_terminal": int, "n_convergence": int
        }
    }

`terminal` is "this node has zero successors AND is flagged terminal by
the domain rules." `n_convergence` is "nodes with in_degree >= 3,"
matching the detector in detect.py (§5.9 of the plan).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from builder.aggregate import aggregate
from builder.dag import DAG
from builder.detect import convergence_set, templates
from builder.layout import compute_layout


def dag_to_dict(dag: DAG, rules, include_detectors: bool = True) -> Dict[str, Any]:
    # Depth-filtered convergence set (stronger than in_degree >= 3 alone).
    strong_conv: set = (
        convergence_set(dag, min_in=3, depth=2, min_distinct=3)
        if include_detectors
        else set()
    )
    top_templates = (
        templates(dag, size=3, top_k=5) if include_detectors else []
    )
    # Map node_id -> list of template_keys it participates in (as the
    # starting node of an instance). Lets the viewer colour by template.
    node_templates: Dict[int, list] = {}
    for t in top_templates:
        key_str = " -> ".join(t.key)
        for inst in t.instances[:200]:
            node_templates.setdefault(inst[0], []).append(key_str)

    coords = compute_layout(dag)
    super_nodes, super_edges, _ = aggregate(dag, rules, coords=coords)

    nodes = []
    n_terminal = 0
    n_convergence = 0
    for nid, node in dag.nodes.items():
        in_deg = dag.in_degree(nid)
        out_deg = dag.out_degree(nid)
        is_terminal = out_deg == 0 and rules.is_terminal(node.state)
        if is_terminal:
            n_terminal += 1
        if in_deg >= 3:
            n_convergence += 1
        x, y = coords.get(nid, (0.0, 0.0))
        nodes.append(
            {
                "id": nid,
                "expr": node.expr,
                "generation": node.generation,
                "labels": sorted(node.labels),
                "pinned": node.pinned,
                "in_degree": in_deg,
                "out_degree": out_deg,
                "terminal": is_terminal,
                "strong_converge": nid in strong_conv,
                "template_starts": node_templates.get(nid, []),
                "x": x,
                "y": y,
            }
        )

    edges = [
        {
            "from": e.from_id,
            "to": e.to_id,
            "action": e.action_label,
            "type": e.action_type,
        }
        for e in dag.edges
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "aggregation": {
            "nodes": super_nodes,
            "edges": super_edges,
        },
        "meta": {
            "n_nodes": len(nodes),
            "n_edges": len(edges),
            "n_terminal": n_terminal,
            "n_convergence": n_convergence,
            "n_strong_convergence": len(strong_conv),
            "n_super_nodes": len(super_nodes),
            "n_super_edges": len(super_edges),
            "templates": [
                {"key": " -> ".join(t.key), "count": t.count}
                for t in top_templates
            ],
        },
    }


def write_json(dag: DAG, rules, path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = dag_to_dict(dag, rules)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return p
