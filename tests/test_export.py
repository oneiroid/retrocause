"""Step 4 tests: export.py.

Round-trip: expand a small DAG, export to JSON, parse it back, and
verify the structural counts match the source DAG.
"""
import json
import tempfile
from pathlib import Path

from builder.expand import expand_depth, seed_dag
from builder.export import dag_to_dict, write_json
from domains.lineage import LineageRules


def test_dag_to_dict_structure():
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=2)

    data = dag_to_dict(dag, r)
    assert set(data.keys()) == {"nodes", "edges", "aggregation", "meta"}
    assert set(data["aggregation"].keys()) == {"nodes", "edges"}
    assert data["meta"]["n_nodes"] == len(dag.nodes)
    assert data["meta"]["n_edges"] == len(dag.edges)

    # Every edge's endpoints must be valid node ids.
    ids = {n["id"] for n in data["nodes"]}
    for e in data["edges"]:
        assert e["from"] in ids
        assert e["to"] in ids

    # Every node must have the expected fields.
    for n in data["nodes"]:
        assert set(n.keys()) >= {
            "id", "expr", "generation", "labels", "pinned",
            "in_degree", "out_degree", "terminal",
        }


def test_write_json_roundtrip():
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=2)

    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "dag.json"
        written = write_json(dag, r, path)
        assert written.exists()
        reloaded = json.loads(written.read_text(encoding="utf-8"))
        assert reloaded["meta"]["n_nodes"] == len(dag.nodes)
        assert reloaded["meta"]["n_edges"] == len(dag.edges)


def test_convergence_count_matches_in_degree_ge_3():
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=4)
    data = dag_to_dict(dag, r)

    expected = sum(1 for nid in dag.nodes if dag.in_degree(nid) >= 3)
    assert data["meta"]["n_convergence"] == expected
