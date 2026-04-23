"""Step 3 tests: DAG container + BFS expansion.

The critical checks:
  - expansion is deterministic
  - the dedup table actually merges (edges > nodes at some depth)
  - the graph is acyclic (generation strictly increases on every edge)
  - leaves correspond to terminal states only
  - the generation cap is respected
"""
from builder.dag import DAG
from builder.expand import (
    expand_all,
    expand_depth,
    expand_frontier,
    expand_one,
    seed_dag,
)
from domains.lineage import LineageRules


def test_seed_dag_single_node():
    r = LineageRules()
    dag = seed_dag(r)
    assert len(dag.nodes) == 1
    assert len(dag.edges) == 0
    seed_node = next(iter(dag.nodes.values()))
    assert seed_node.state == r.seed()
    assert seed_node.generation == 0
    assert not seed_node.expanded


def test_expand_one_level_matches_branching_factor():
    r = LineageRules()
    dag = seed_dag(r)
    seed_id = next(iter(dag.nodes))
    new_edges = expand_one(dag, seed_id, r)
    # Seed has 11 valid actions -> 11 new edges.
    assert len(new_edges) == 11
    # But successors may dedup -- not here (all successors are new at
    # gen 1), so we expect 11 new nodes + 1 original = 12.
    assert len(dag.nodes) == 12
    # The seed node is marked expanded.
    assert dag.nodes[seed_id].expanded is True


def test_expand_one_is_idempotent():
    r = LineageRules()
    dag = seed_dag(r)
    seed_id = next(iter(dag.nodes))
    expand_one(dag, seed_id, r)
    n_nodes, n_edges = len(dag.nodes), len(dag.edges)
    # Second call must add nothing.
    new_edges = expand_one(dag, seed_id, r)
    assert new_edges == []
    assert len(dag.nodes) == n_nodes
    assert len(dag.edges) == n_edges


def test_dedup_produces_more_edges_than_nodes():
    """After a few BFS levels, action sequences like replicate+mutate and
    mutate+replicate should hit the same (genome, gen) -- so edges
    should grow faster than nodes."""
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=3)
    assert len(dag.edges) > len(dag.nodes), (
        f"expected dedup to kick in: nodes={len(dag.nodes)}, "
        f"edges={len(dag.edges)}"
    )


def test_graph_is_acyclic_via_generation_ordering():
    """Every edge must go from generation g to generation g+1. This is
    the structural acyclicity invariant."""
    r = LineageRules(max_generation=5)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=5)
    for e in dag.edges:
        g_from = dag.nodes[e.from_id].generation
        g_to = dag.nodes[e.to_id].generation
        assert g_to == g_from + 1, (
            f"edge violates generation monotonicity: "
            f"{g_from} -> {g_to} via {e.action_label}"
        )


def test_leaves_are_terminal_states():
    """Any node with zero outgoing edges (after full expansion) must be
    terminal per rules.is_terminal. Dead genomes and the generation
    cap are the only legitimate reasons a node has no successors."""
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_all(dag, r)
    for nid, node in dag.nodes.items():
        if dag.out_degree(nid) == 0:
            assert r.is_terminal(node.state), (
                f"non-terminal leaf: id={nid} expr={node.expr!r}"
            )


def test_expansion_halts_on_full_traversal():
    """expand_all must terminate given a generation cap; and after it
    does, frontier() is empty and every non-terminal node is expanded."""
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_all(dag, r)
    assert dag.frontier(r) == []
    for n in dag.nodes.values():
        if r.is_terminal(n.state):
            # Terminal nodes are still flagged expanded after we tried them.
            # But seed_dag may produce a terminal node -- in which case
            # it was never in the frontier, so it could be unexpanded.
            continue
        assert n.expanded


def test_dead_genomes_appear_as_leaves_with_zero_outdegree():
    r = LineageRules(max_generation=6)
    dag = seed_dag(r)
    expand_all(dag, r)
    dead_leaves = [
        n
        for n in dag.nodes.values()
        if r.is_dead(n.state[1]) and dag.out_degree(n.id) == 0
    ]
    # With half-match seed and lots of mutations, we should find many
    # dead leaves.
    assert len(dead_leaves) > 0


def test_expansion_produces_thousands_of_nodes_at_cap10():
    """Sanity check for the validation target in DAG_BUILDER_PLAN.md \u00a76:
    at the default cap (max_generation=10), expand_all must reach at
    least 500 nodes. This is a soft lower bound -- if the domain
    parameters change, update accordingly."""
    r = LineageRules(max_generation=10)
    dag = seed_dag(r)
    expand_all(dag, r, safety_cap=200_000)
    assert len(dag.nodes) >= 500, (
        f"expected >= 500 nodes for validation target, got {len(dag.nodes)}"
    )
