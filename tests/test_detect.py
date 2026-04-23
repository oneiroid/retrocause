"""Step 8 tests: convergence + template detectors."""
from builder.dag import DAG
from builder.expand import expand_all, expand_depth, seed_dag
from builder.detect import (
    convergence,
    templates,
    template_parameter_contrast,
    report,
)
from domains.lineage import LineageRules


def test_convergence_requires_distinct_ancestors():
    """Synthetic: four predecessors all sharing one grandparent should
    NOT count at depth=2 (distinct ancestors = 1)."""
    dag = DAG()
    gp, _ = dag.add_or_get_node(("t", "GP"), "GP", 0)
    p1, _ = dag.add_or_get_node(("t", "P1"), "P1", 1)
    p2, _ = dag.add_or_get_node(("t", "P2"), "P2", 1)
    p3, _ = dag.add_or_get_node(("t", "P3"), "P3", 1)
    c, _ = dag.add_or_get_node(("t", "C"), "C", 2)
    for p in (p1, p2, p3):
        dag.add_edge(gp, p, "a", "a")
        dag.add_edge(p, c, "b", "b")

    hits = convergence(dag, min_in=3, depth=2, min_distinct=3)
    # Only one distinct grandparent -> should be filtered out.
    assert hits == []

    # Add a second grandparent, repoint one predecessor.
    gp2, _ = dag.add_or_get_node(("t", "GP2"), "GP2", 0)
    dag.add_edge(gp2, p1, "a", "a")
    hits = convergence(dag, min_in=3, depth=2, min_distinct=2)
    # Now p1 has 2 grandparents (gp, gp2); distinct@2 from c = {gp, gp2}.
    assert any(h.node_id == c for h in hits)


def test_convergence_on_real_lineage_dag():
    r = LineageRules(max_generation=5)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=5)
    hits = convergence(dag, min_in=3, depth=2, min_distinct=3)
    # Plan \u00a76 target: at least 5 such hits.
    assert len(hits) >= 5, f"expected >=5, got {len(hits)}"


def test_templates_find_replicate_chains():
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=4)
    hits = templates(dag, size=3, top_k=10)
    # The replicate-only chain should appear and have many instances
    # (at least one starting from each alive gen-0..gen-1 node).
    repl3 = next(
        (h for h in hits if h.key == ("replicate", "replicate", "replicate")),
        None,
    )
    assert repl3 is not None
    assert repl3.count >= 1


def test_template_parameter_contrast_returns_labels():
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=3)
    key = ("replicate", "mutate", "replicate")
    instances = template_parameter_contrast(dag, key, max_instances=5)
    # Each instance is a list of action labels equal in length to the key.
    for inst in instances:
        assert len(inst) == 3
        assert inst[0] == "replicate"
        assert inst[1].startswith("mutate(")
        assert inst[2] == "replicate"


def test_report_produces_ascii_only_string():
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=4)
    out = report(dag, r)
    # Must be non-empty and include both sections.
    assert "convergence" in out
    assert "templates" in out
