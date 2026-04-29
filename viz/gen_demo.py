"""Generate a demo DAG for the RPS domain and write viz/dag.json.

Multiple named configs are provided -- each probes a different DAG
shape so the viewer has variety to inspect:

  symmetric_3p   homogeneous strategy across 3 seats; symmetric, heavy
                 convergence on (round, scores, alive, last_profile)
                 since every seat reacts the same way.
  mixed_3p       heterogeneous strategies; asymmetric branching per
                 seat, distinct templates per player role.
  deterministic  every seat plays copy_self_last -> after round 0 the
                 27 seed branches each evolve as a single chain.
                 Control case: convergence only at the seed.
  branchy_3p     every seat plays avoid_self_last -> 2 candidate moves
                 per seat per round (8 actions per state) -> maximal
                 post-seed fan-out and merging.
  harsh_2p      2 players, min_score=-1: eliminations fire fast, so
                 terminal nodes appear early and the DAG is shallow.
  duel_2p        2 players over a long horizon; small branching factor
                 (3^2 = 9 at seed) makes individual paths legible.

Usage:
  python gen_demo.py                  # default config -> viz/dag.json
  python gen_demo.py <config_name>    # named config  -> viz/dag.json
  python gen_demo.py --all            # all configs   -> viz/dag_<name>.json
  python gen_demo.py --list           # list configs and exit
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from builder.expand import expand_all, seed_dag
from builder.export import write_json
from domains.rps import RpsRules


CONFIGS: dict[str, RpsRules] = {
    "symmetric_3p": RpsRules(
        n_players=3,
        max_round=6,
        min_score=-3,
        strategies=("beat_plurality",) * 3,
    ),
    "mixed_3p": RpsRules(
        n_players=3,
        max_round=6,
        min_score=-3,
        strategies=("beat_plurality", "copy_self_last", "avoid_self_last"),
    ),
    "deterministic": RpsRules(
        n_players=3,
        max_round=6,
        min_score=-5,
        strategies=("copy_self_last",) * 3,
    ),
    "branchy_3p": RpsRules(
        n_players=3,
        max_round=4,
        min_score=-3,
        strategies=("avoid_self_last",) * 3,
    ),
    "harsh_2p": RpsRules(
        n_players=2,
        max_round=8,
        min_score=-1,
        strategies=("beat_plurality", "copy_loser"),
    ),
    "duel_2p": RpsRules(
        n_players=2,
        max_round=10,
        min_score=-3,
        strategies=("beat_winner", "lose_to_plurality"),
    ),
}

DEFAULT_CONFIG = "symmetric_3p"


def _generate(name: str, rules: RpsRules, out: Path) -> None:
    dag = seed_dag(rules)
    expand_all(dag, rules)
    write_json(dag, rules, out)
    print(f"[{name}] {dag.summary(rules)}")
    print(f"[{name}] wrote {out}")


def main() -> None:
    args = sys.argv[1:]
    viz_dir = Path(__file__).parent

    if args and args[0] == "--list":
        for n, r in CONFIGS.items():
            print(f"{n:14s}  n_players={r.n_players}  max_round={r.max_round}  "
                  f"min_score={r.min_score}  strategies={r.strategies}")
        return

    if args and args[0] == "--all":
        for name, rules in CONFIGS.items():
            _generate(name, rules, viz_dir / f"dag_{name}.json")
        return

    name = args[0] if args else DEFAULT_CONFIG
    if name not in CONFIGS:
        print(f"unknown config {name!r}; available: {sorted(CONFIGS)}")
        sys.exit(2)
    _generate(name, CONFIGS[name], viz_dir / "dag.json")


if __name__ == "__main__":
    main()
