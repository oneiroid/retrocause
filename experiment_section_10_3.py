"""FORMAL_MODEL_v3 §10.3 experiment.

Expand the negotiation (4 action types) and lineage (2 action types)
DAGs at comparable node count, run anti-unification on linear paths of
length 3, and compare the template distributions.

Prediction (FORMAL_MODEL_v3 §10.3):
    negotiation produces non-trivial anti-unified templates;
    lineage produces only trivial ones.

A trivial template here means n_slots == total_args -- every argument
varies independently across instances, so the "template" is just a
typed action-sequence. MDL bits_saved is non-positive.

Per FORMAL_MODEL_v3 §5.2 and DAG_BUILDER_PLAN.md §5, absolute numbers
prove nothing in isolation -- the contrast between the two domains is
what counts. If lineage shows non-trivial structure on this experiment,
either link detection is over-eager (a code bug) or the small-alphabet
precondition is wrong (a model bug).
"""
from __future__ import annotations

import argparse
from typing import List

from builder.antiunify import (
    AntiUnifiedHit,
    antiunify_templates,
    template_distribution_summary,
)
from builder.expand import expand_depth, seed_dag
from domains.lineage import LineageRules
from domains.negotiation import NegotiationRules


def _format_hits(hits: List[AntiUnifiedHit], top_n: int) -> List[str]:
    lines: List[str] = []
    for h in hits[:top_n]:
        t = h.template
        lines.append(
            f"  x{h.count:<5} bits={h.bits_saved:+6.0f}  "
            f"slots={t.n_slots}  const={t.n_const()}  "
            f"{t.signature()}"
        )
    if len(hits) > top_n:
        lines.append(f"  ... and {len(hits) - top_n} more")
    return lines


def _section_header(name: str) -> str:
    bar = "=" * 64
    return f"{bar}\n{name}\n{bar}"


def run(
    template_size: int = 3,
    top_k: int = 10,
    lin_max_gen: int = 4,
    neg_value_max: int = 2,
    neg_max_turn: int = 5,
    levels_lineage: int = 4,
    levels_neg: int = 5,
) -> int:
    print(_section_header("FORMAL_MODEL_v3 §10.3 -- experiment"))
    print(f"template size (linear path edges): {template_size}")
    print(f"min_instances: 2 (a recurrence requires at least two)")
    print()

    # ---- lineage ----
    print(_section_header("lineage  (2 action types: replicate, mutate)"))
    lin = LineageRules(max_generation=lin_max_gen)
    lin_dag = seed_dag(lin)
    expand_depth(lin_dag, lin, levels=levels_lineage)
    print(
        f"rules: {lin}\n"
        f"DAG:   nodes={len(lin_dag.nodes)} edges={len(lin_dag.edges)}"
    )
    lin_hits = antiunify_templates(
        lin_dag, size=template_size, top_k=top_k
    )
    print(f"top {top_k} anti-unified templates:")
    for line in _format_hits(lin_hits, top_k):
        print(line)
    if not lin_hits:
        print("  (none)")
    lin_sum = template_distribution_summary(lin_hits)
    print(f"summary: {lin_sum}")
    print()

    # ---- negotiation ----
    print(
        _section_header(
            "negotiation  (4 action types: propose, counter, accept, walk)"
        )
    )
    neg = NegotiationRules(
        value_max=neg_value_max, max_turn=neg_max_turn, opener="a"
    )
    neg_dag = seed_dag(neg)
    expand_depth(neg_dag, neg, levels=levels_neg)
    print(
        f"rules: {neg}\n"
        f"DAG:   nodes={len(neg_dag.nodes)} edges={len(neg_dag.edges)}"
    )
    neg_hits = antiunify_templates(
        neg_dag, size=template_size, top_k=top_k
    )
    print(f"top {top_k} anti-unified templates:")
    for line in _format_hits(neg_hits, top_k):
        print(line)
    if not neg_hits:
        print("  (none)")
    neg_sum = template_distribution_summary(neg_hits)
    print(f"summary: {neg_sum}")
    print()

    # ---- contrast ----
    print(_section_header("contrast"))
    print(
        f"lineage     n_nontrivial={lin_sum.get('n_nontrivial', 0):>4}  "
        f"max_bits_saved={lin_sum['max_bits_saved']:+.0f}"
    )
    print(
        f"negotiation n_nontrivial={neg_sum.get('n_nontrivial', 0):>4}  "
        f"max_bits_saved={neg_sum['max_bits_saved']:+.0f}"
    )
    print()

    lin_nontrivial = lin_sum.get("n_nontrivial", 0)
    neg_nontrivial = neg_sum.get("n_nontrivial", 0)
    if neg_nontrivial > lin_nontrivial and neg_sum["max_bits_saved"] > lin_sum["max_bits_saved"]:
        verdict = (
            "PREDICTION HOLDS: negotiation produces strictly more "
            "non-trivial templates and higher MDL compression than "
            "lineage at comparable scale."
        )
    elif neg_nontrivial == 0 and lin_nontrivial == 0:
        verdict = (
            "INCONCLUSIVE: neither domain produced non-trivial "
            "templates. The anti-unifier may be too conservative, or "
            "the path-length / expansion depth is too small to show "
            "structure. Increase --template-size or expansion levels "
            "before reading this as a §10.3 disconfirmation."
        )
    elif neg_nontrivial <= lin_nontrivial:
        verdict = (
            "PREDICTION FAILS: lineage is producing as much or more "
            "non-trivial structure as negotiation. Per "
            "DAG_BUILDER_PLAN.md §4, this is a finding -- the model's "
            "small-alphabet precondition (§10.3) is wrong, or link "
            "detection is over-firing on lineage."
        )
    else:
        verdict = (
            "MIXED: counts and bits_saved point in different "
            "directions. Read the per-template tables above; do not "
            "treat the summary line as the answer."
        )

    print(verdict)
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Run FORMAL_MODEL_v3 §10.3.")
    p.add_argument("--template-size", type=int, default=3)
    p.add_argument("--top-k", type=int, default=10)
    p.add_argument("--lineage-max-gen", type=int, default=4)
    p.add_argument("--neg-value-max", type=int, default=2)
    p.add_argument("--neg-max-turn", type=int, default=5)
    p.add_argument("--levels-lineage", type=int, default=4)
    p.add_argument("--levels-neg", type=int, default=5)
    args = p.parse_args()
    return run(
        template_size=args.template_size,
        top_k=args.top_k,
        lin_max_gen=args.lineage_max_gen,
        neg_value_max=args.neg_value_max,
        neg_max_turn=args.neg_max_turn,
        levels_lineage=args.levels_lineage,
        levels_neg=args.levels_neg,
    )


if __name__ == "__main__":
    raise SystemExit(main())
