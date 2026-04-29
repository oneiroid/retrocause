"""Frontier expansion.

expand_one:    expand a single frontier node (one BFS hop)
expand_frontier: expand every currently-frontier node once
expand_depth:  BFS by levels, N levels deep

The expansion is pure with respect to the Rules object -- Rules supplies
valid_actions, step, expr, generation, and is_terminal; this module calls
them and updates the DAG. No randomness.
"""
from __future__ import annotations

from typing import List

from builder.dag import DAG, NodeId


def expand_one(dag: DAG, frontier_id: NodeId, rules) -> List[int]:
    """Generate all successors of one node. Returns the new edge indices.
    Sets node.expanded = True unconditionally, so terminal nodes are also
    flagged (with zero successors) and won't be visited again."""
    node = dag.nodes[frontier_id]
    if node.expanded:
        return []

    new_edge_ids: List[int] = []
    for a in rules.valid_actions(node.state):
        s_prime = rules.step(node.state, a)
        to_id, _ = dag.add_or_get_node(
            state=s_prime,
            expr=rules.expr(s_prime),
            generation=rules.generation(s_prime),
        )
        eidx = dag.add_edge(
            from_id=frontier_id,
            to_id=to_id,
            action_label=a.label(),
            action_type=a.action_type(),
            action_args=a.args,
        )
        new_edge_ids.append(eidx)

    node.expanded = True
    return new_edge_ids


def expand_frontier(dag: DAG, rules) -> int:
    """Expand every currently-frontier node once. Returns the number of
    edges added. Does NOT recurse into newly-discovered frontier nodes
    -- one BFS level at a time."""
    frontier_snapshot = dag.frontier(rules)
    added = 0
    for fid in frontier_snapshot:
        added += len(expand_one(dag, fid, rules))
    return added


def expand_depth(dag: DAG, rules, levels: int) -> int:
    """Run expand_frontier `levels` times (or until frontier empties).
    Returns the total number of edges added."""
    total = 0
    for _ in range(levels):
        added = expand_frontier(dag, rules)
        if added == 0:
            break
        total += added
    return total


def expand_all(dag: DAG, rules, safety_cap: int = 100_000) -> int:
    """Expand until the frontier is empty. safety_cap bounds the edge
    count as a sanity check against runaway expansion."""
    total = 0
    while True:
        added = expand_frontier(dag, rules)
        if added == 0:
            return total
        total += added
        if total > safety_cap:
            raise RuntimeError(
                f"expand_all exceeded safety_cap={safety_cap}; "
                f"DAG now has {len(dag.nodes)} nodes, {len(dag.edges)} edges"
            )


def seed_dag(rules) -> DAG:
    """Build a fresh DAG with the rule's seed state as the only node."""
    dag = DAG()
    s = rules.seed()
    dag.add_or_get_node(
        state=s,
        expr=rules.expr(s),
        generation=rules.generation(s),
    )
    return dag
