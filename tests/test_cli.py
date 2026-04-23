"""Step 6-7 tests: CLI command handlers.

Tested as direct function calls (not subprocess) so failures produce
clean tracebacks.
"""
from builder.expand import seed_dag
from domains.lineage import LineageRules
import cli


def fresh():
    r = LineageRules(max_generation=3)
    dag = seed_dag(r)
    return dag, r


def test_cmd_info_and_list():
    dag, r = fresh()
    out = cli.cmd_info(dag, r, [])
    assert "nodes=1" in out
    listing = cli.cmd_list(dag, r, [])
    assert "frontier" in listing


def test_cmd_expand_all_then_depth():
    dag, r = fresh()
    cli.cmd_expand(dag, r, ["all"])
    n_after_one = len(dag.nodes)
    assert n_after_one > 1
    cli.cmd_expand(dag, r, ["depth", "2"])
    assert len(dag.nodes) > n_after_one


def test_cmd_expand_unknown_id_reports_error():
    dag, r = fresh()
    out = cli.cmd_expand(dag, r, ["9999"])
    assert "no such node" in out


def test_cmd_label_and_pin_lifecycle():
    dag, r = fresh()
    out = cli.cmd_label(dag, r, ["0", "root"])
    assert "root" in out
    assert "root" in dag.nodes[0].labels

    cli.cmd_pin(dag, r, ["0"])
    assert dag.nodes[0].pinned is True

    cli.cmd_unlabel(dag, r, ["0", "root"])
    assert "root" not in dag.nodes[0].labels

    cli.cmd_unpin(dag, r, ["0"])
    assert dag.nodes[0].pinned is False


def test_cmd_prune_respects_pin():
    dag, r = fresh()
    cli.cmd_expand(dag, r, ["all"])
    # Pin one child; pruning the seed should refuse because the pinned
    # node is in the seed's forward-reachable set.
    child_id = next(iter(dag.successors(0)))
    cli.cmd_pin(dag, r, [str(child_id)])
    out = cli.cmd_prune(dag, r, ["0"])
    assert "refuse" in out
    assert 0 in dag.nodes  # still there


def test_cmd_save_writes_json(tmp_path_factory=None):
    import tempfile
    from pathlib import Path as P
    dag, r = fresh()
    cli.cmd_expand(dag, r, ["all"])
    with tempfile.TemporaryDirectory() as t:
        out_path = P(t) / "dag.json"
        out = cli.cmd_save(dag, r, [str(out_path)])
        assert "wrote" in out
        assert out_path.exists()
        assert out_path.stat().st_size > 0


def test_cmd_node_on_seed():
    dag, r = fresh()
    out = cli.cmd_node(dag, r, ["0"])
    assert "#0" in out
    assert "gen: 0" in out
