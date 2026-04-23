"""Generate a small (~50-node) DAG and write viz/dag.json.

This is the §5 gate: load the JSON in dag.html, verify it's readable,
only then move on to detectors.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.expand import expand_depth, seed_dag
from builder.export import write_json
from domains.lineage import LineageRules


def main() -> None:
    # Small params so BFS-by-2-levels gives ~50 nodes.
    rules = LineageRules(max_generation=3)
    dag = seed_dag(rules)
    expand_depth(dag, rules, levels=2)

    out = Path(__file__).parent / "dag.json"
    write_json(dag, rules, out)
    print(dag.summary(rules))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
