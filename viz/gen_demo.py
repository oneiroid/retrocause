"""Generate a demo DAG for the negotiation domain and write viz/dag.json.

The negotiation domain (4 action types: propose, counter, accept, walk) is
the §10.3 counter-example: merges occur at (offer, last_actor, turn, phase)
nodes as many distinct counter sequences funnel into the same target state.

Parameters are tuned to give a ~50-node graph that shows:
  - the phase=open seed
  - per-actor countering layers with heavy convergence on (offer, actor, turn)
  - three kinds of terminal: accepted, walked, and timeout at max_turn
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.expand import expand_all, seed_dag
from builder.export import write_json
from domains.negotiation import NegotiationRules
from domains.rps import RpsRules



def main() -> None:
    # value_max=3, max_turn=5 -> ~50 nodes with real (in_degree >= 3)
    # convergence on the counter-result nodes.
    rules = RpsRules(n_players=3, min_score=-2, max_round=5)
    dag = seed_dag(rules)
    expand_all(dag, rules)

    out = Path(__file__).parent / "dag.json"
    write_json(dag, rules, out)
    print(dag.summary(rules))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
