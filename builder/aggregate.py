"""DAG aggregation for the viewer's summary view.

Groups nodes into supernodes keyed on (generation, kind), then aggregates
edges between supernodes into weighted multi-edges. Gives the viewer an
O(layers x kinds) overview regardless of underlying DAG size -- the
only way 1000+ node DAGs stay legible.

`kind` is derived from the node's `expr` string via a regex heuristic.
We chose this over adding a rules-API hook because the mapping is
already viewer presentation (not domain mechanics), and keeping it in
one place (here + the viewer's legend) avoids a cross-cutting change
every time someone adds a new domain flavour. If you add a domain,
add a matching regex below and a colour entry in viz/dag.html.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Dict, List, Tuple

from builder.dag import DAG
from builder.layout import compute_layout


_RE_OPEN = re.compile(r"^t\d+ open")
_RE_ACTOR = re.compile(r" by (a|b)$")
_RE_RPS_WIN = re.compile(r"^r\d+ (WIN|END)")
_RE_RPS_DRAW = re.compile(r"^r\d+ DRAW")
_RE_RPS_WIPEOUT = re.compile(r"^r\d+ WIPEOUT")
_RE_RPS_ROUND = re.compile(r"^r\d+ ")


def kind_of(expr: str, terminal: bool) -> str:
    if "ACCEPTED" in expr:
        return "accepted"
    if "WALKED" in expr:
        return "walked"
    if "TIMEOUT" in expr:
        return "timeout"
    if _RE_OPEN.match(expr):
        return "open"
    m = _RE_ACTOR.search(expr)
    if m:
        return "actor_a" if m.group(1) == "a" else "actor_b"
    if _RE_RPS_WIN.match(expr):
        return "rps_win"
    if _RE_RPS_DRAW.match(expr):
        return "rps_draw"
    if _RE_RPS_WIPEOUT.match(expr):
        return "rps_wipeout"
    if _RE_RPS_ROUND.match(expr):
        return "alive"
    if "dead" in expr:
        return "dead"
    if terminal:
        return "terminal"
    return "alive"


def aggregate(
    dag: DAG, rules, coords: Dict[int, Tuple[float, float]] | None = None
) -> Tuple[List[dict], List[dict], Dict[int, int]]:
    """Return (super_nodes, super_edges, node_to_super).

    Each supernode carries its inner member ids and a position = mean
    (x, y) of its members from compute_layout. `node_to_super` lets
    callers (the exporter, the viewer) map base-node ids back to their
    bucket without rebuilding the mapping.
    """
    if not dag.nodes:
        return [], [], {}

    if coords is None:
        coords = compute_layout(dag)

    buckets: Dict[Tuple[int, str], List[int]] = defaultdict(list)
    for nid, node in dag.nodes.items():
        terminal = dag.out_degree(nid) == 0 and rules.is_terminal(node.state)
        kind = kind_of(node.expr, terminal)
        buckets[(node.generation, kind)].append(nid)

    # Stable supernode ordering: sort by (generation, kind).
    keys = sorted(buckets.keys())
    node_to_super: Dict[int, int] = {}
    super_nodes: List[dict] = []
    for sid, key in enumerate(keys):
        gen, kind = key
        members = sorted(buckets[key])
        xs = [coords[n][0] for n in members]
        mean_x = sum(xs) / len(xs)
        for nid in members:
            node_to_super[nid] = sid
        super_nodes.append({
            "id": sid,
            "generation": gen,
            "kind": kind,
            "count": len(members),
            "x": mean_x,
            "y": float(gen),
            "member_ids": members,
        })

    counts: Dict[Tuple[int, int], int] = defaultdict(int)
    for e in dag.edges:
        counts[(node_to_super[e.from_id], node_to_super[e.to_id])] += 1

    super_edges = [
        {"from": s, "to": t, "count": c}
        for (s, t), c in sorted(counts.items())
    ]

    return super_nodes, super_edges, node_to_super
