"""Step 6-7 tests: prune + labels + pinning.

Prune is the tricky one because descendants can have multiple parents.
"""
from builder.dag import DAG
from builder.expand import expand_depth, seed_dag
from domains.lineage import LineageRules


def test_prune_removes_node_and_edges():
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=1)
    # Seed has 11 children, no dedup yet.
    seed_id = 0
    child_ids = list(dag.successors(seed_id))
    assert len(child_ids) == 11

    # Prune one child (unexpanded, so it has no descendants).
    target = child_ids[0]
    removed = dag.prune(target)
    assert removed == {target}
    assert target not in dag.nodes
    assert all(e.from_id != target and e.to_id != target for e in dag.edges)


def test_prune_keeps_descendants_with_other_parents():
    """If a grandchild is reached from TWO children of the seed, and we
    prune only one of those children, the grandchild must survive."""
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=2)

    # Find a gen-2 node with in_degree >= 2.
    merged = None
    for nid, node in dag.nodes.items():
        if node.generation == 2 and dag.in_degree(nid) >= 2:
            merged = nid
            break
    assert merged is not None, "test precondition: need a gen-2 merge node"

    # Pick one predecessor to prune.
    prune_target = dag.predecessors(merged)[0]
    removed = dag.prune(prune_target)
    assert prune_target in removed
    # The merged descendant must still be in the DAG.
    assert merged in dag.nodes, (
        f"merged gen-2 node {merged} was pruned erroneously; "
        f"its preds were {dag.predecessors(merged)}"
    )


def test_prune_cascades_through_orphaned_subtree():
    """Pruning a node that is the ONLY parent of its descendants must
    remove those descendants too. Built as a synthetic minimal DAG so
    the test does not depend on dedup patterns in lineage expansion."""
    dag = DAG()
    # Linear chain A -> B -> C, plus a side arrow A -> D.
    a, _ = dag.add_or_get_node(("t", "A"), "A", 0)
    b, _ = dag.add_or_get_node(("t", "B"), "B", 1)
    c, _ = dag.add_or_get_node(("t", "C"), "C", 2)
    d, _ = dag.add_or_get_node(("t", "D"), "D", 1)
    dag.add_edge(a, b, "ab", "ab")
    dag.add_edge(b, c, "bc", "bc")
    dag.add_edge(a, d, "ad", "ad")

    # Pruning A must cascade: B loses its only parent, then C loses its
    # only parent. D was a direct child of A with no other parents, so
    # it's cascade-removed too. Everything should go.
    removed = dag.prune(a)
    assert removed == {a, b, c, d}
    assert dag.nodes == {}


def test_prune_missing_id_noop():
    r = LineageRules()
    dag = seed_dag(r)
    removed = dag.prune(99999)
    assert removed == set()


def test_labels_and_pinning_roundtrip():
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=1)

    nid = 0
    dag.nodes[nid].labels.add("root")
    dag.nodes[nid].labels.add("marked")
    dag.nodes[nid].pinned = True

    assert "root" in dag.nodes[nid].labels
    assert "marked" in dag.nodes[nid].labels
    assert dag.nodes[nid].pinned is True
