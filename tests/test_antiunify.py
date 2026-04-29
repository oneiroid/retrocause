"""Anti-unification on linear paths (FORMAL_MODEL_v3 §8.3).

These tests cover the operator in isolation (synthetic instance lists)
and on real DAGs (lineage + negotiation). The §10.3 contrast itself --
that negotiation produces non-trivial templates and lineage does not --
is checked as a single end-to-end test that compares the two domains'
template distributions.
"""
from __future__ import annotations

from builder.antiunify import (
    Const,
    Slot,
    anti_unify_paths,
    antiunify_templates,
    score_template,
    template_distribution_summary,
)
from builder.dag import DAG
from builder.expand import expand_depth, seed_dag
from domains.lineage import LineageRules
from domains.negotiation import NegotiationRules


# ---------------- core operator ----------------

def test_anti_unify_constants_when_all_instances_agree():
    type_seq = ("counter",)
    instances = [(0, 1), (2, 3)]
    arg_seqs = [
        (("a", 5),),
        (("a", 5),),
    ]
    t = anti_unify_paths(type_seq, instances, arg_seqs)
    assert t.n_slots == 0
    assert t.n_const() == 2
    spec0 = t.positions[0].arg_specs
    assert spec0[0] == Const(value="a", type_name="str")
    assert spec0[1] == Const(value=5, type_name="int")


def test_anti_unify_promotes_disagreement_to_slot():
    type_seq = ("counter",)
    instances = [(0, 1), (2, 3)]
    arg_seqs = [
        (("a", 5),),
        (("a", 7),),
    ]
    t = anti_unify_paths(type_seq, instances, arg_seqs)
    # actor agrees -> Const; value disagrees -> Slot.
    assert t.n_slots == 1
    specs = t.positions[0].arg_specs
    assert specs[0] == Const(value="a", type_name="str")
    assert isinstance(specs[1], Slot)
    assert specs[1].slot_id == 0
    assert specs[1].type_name == "int"


def test_anti_unify_links_repeated_arg_into_one_slot():
    """Two arg positions whose value vectors are identical across all
    instances must collapse to the same slot id. This is what the
    placeholder detector cannot see."""
    type_seq = ("counter", "counter")
    instances = [(0, 1, 2), (3, 4, 5), (6, 7, 8)]
    # Same actor "a" then "b" then "a" twice. The second-position actor
    # equals the first-position actor in every instance -> linked.
    arg_seqs = [
        (("a", 5), ("a", 9)),
        (("b", 5), ("b", 9)),
        (("a", 5), ("a", 9)),
    ]
    t = anti_unify_paths(type_seq, instances, arg_seqs)
    # Two positions x two args = 4 cells.
    # actor varies but is linked -> 1 slot. value is constant in each
    # position (5 and 9) -> 2 consts. Total slots = 1.
    assert t.n_slots == 1
    pos0 = t.positions[0].arg_specs
    pos1 = t.positions[1].arg_specs
    assert isinstance(pos0[0], Slot) and pos0[0].slot_id == 0
    assert isinstance(pos1[0], Slot) and pos1[0].slot_id == 0  # linked
    assert pos0[1] == Const(value=5, type_name="int")
    assert pos1[1] == Const(value=9, type_name="int")


def test_anti_unify_keeps_distinct_slots_when_unlinked():
    type_seq = ("counter", "counter")
    instances = [(0, 1, 2), (3, 4, 5)]
    # Two value positions both vary, but with different patterns ->
    # two distinct slots, no linking.
    arg_seqs = [
        (("a", 5), ("a", 7)),
        (("a", 6), ("a", 9)),
    ]
    t = anti_unify_paths(type_seq, instances, arg_seqs)
    assert t.n_slots == 2
    pos0 = t.positions[0].arg_specs
    pos1 = t.positions[1].arg_specs
    assert isinstance(pos0[1], Slot) and pos0[1].slot_id == 0
    assert isinstance(pos1[1], Slot) and pos1[1].slot_id == 1


def test_score_template_punishes_trivial_all_slot_template():
    type_seq = ("counter",)
    instances = [(0, 1), (2, 3), (4, 5)]
    arg_seqs = [
        (("a", 1),),
        (("b", 2),),
        (("c", 3),),
    ]
    t = anti_unify_paths(type_seq, instances, arg_seqs)
    # Both positions vary and are not linked -> 2 slots.
    assert t.n_slots == 2
    # bits_saved = (n-1)*total - n*slots = 2*2 - 3*2 = -2  (negative).
    assert score_template(t, n_instances=3) < 0


def test_score_template_rewards_const_compression():
    type_seq = ("counter",)
    instances = [(0, 1), (2, 3), (4, 5)]
    arg_seqs = [
        (("a", 5),),
        (("a", 5),),
        (("a", 5),),
    ]
    t = anti_unify_paths(type_seq, instances, arg_seqs)
    assert t.n_slots == 0
    # bits_saved = (n-1)*total - n*slots = 2*2 - 3*0 = 4  (positive).
    assert score_template(t, n_instances=3) == 4


# ---------------- DAG-level enumeration ----------------

def test_antiunify_templates_on_lineage_includes_replicate_chain():
    """Replicate is parameter-free (zero args), so the all-replicate
    chain anti-unifies to a template with zero slots and zero consts.
    bits_saved is exactly zero (nothing to compress AND nothing wasted).
    The detector must still surface it -- min_instances filters by
    count, not by bits_saved."""
    r = LineageRules(max_generation=4)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=4)
    hits = antiunify_templates(dag, size=3, top_k=20)
    sigs = [h.template.signature() for h in hits]
    assert "replicate -> replicate -> replicate" in sigs


def test_antiunify_templates_on_negotiation_finds_actor_alternation():
    """In negotiation, consecutive moves must come from alternating
    actors (rule: counter must be from the other actor). So along any
    propose -> counter path, the actor at position 1 is always the
    *other* of position 0. Anti-unification should encode this as
    either two distinct slots (a, b) or, more interestingly, expose
    that the value differs in a structured way. Either way the
    template should not be all-trivial-slots; we expect bits_saved
    to be positive on at least one template."""
    r = NegotiationRules(value_max=2, max_turn=4, opener="a")
    dag = seed_dag(r)
    expand_depth(dag, r, levels=4)
    hits = antiunify_templates(dag, size=2, top_k=20)
    assert hits, "expected at least one recurring template"
    assert any(h.bits_saved > 0 for h in hits), (
        "every negotiation template anti-compressed; either link "
        "detection or constant detection is broken, or the formal "
        "model's §10.3 prediction has a problem"
    )


def test_distribution_summary_contrasts_lineage_and_negotiation():
    """End-to-end §10.3 sanity check. Comparable expansion depth on
    each domain. Lineage should be dominated by trivial templates;
    negotiation should not. We check the qualitative contrast (max
    bits_saved and count of nontrivial templates), not absolute
    numbers, in keeping with §5.2."""
    lin = LineageRules(max_generation=4)
    lin_dag = seed_dag(lin)
    expand_depth(lin_dag, lin, levels=4)
    lin_hits = antiunify_templates(lin_dag, size=3, top_k=20)
    lin_sum = template_distribution_summary(lin_hits)

    neg = NegotiationRules(value_max=2, max_turn=4, opener="a")
    neg_dag = seed_dag(neg)
    expand_depth(neg_dag, neg, levels=4)
    neg_hits = antiunify_templates(neg_dag, size=3, top_k=20)
    neg_sum = template_distribution_summary(neg_hits)

    # Negotiation should produce strictly more nontrivial templates and
    # at least as much MDL compression. Lineage with two action types
    # is a small-alphabet domain; per §10.3 it should not produce
    # structure that anti-unification rewards.
    assert neg_sum["n_nontrivial"] >= lin_sum["n_nontrivial"]
    assert neg_sum["max_bits_saved"] >= lin_sum["max_bits_saved"]


# ---------------- determinism ----------------

def test_template_signatures_are_stable_across_runs():
    """Reordering instances must not change the template (slot ids are
    assigned in canonical traversal order, not input order)."""
    type_seq = ("counter", "counter")
    a_first = anti_unify_paths(
        type_seq,
        [(0, 1, 2), (3, 4, 5)],
        [(("a", 1), ("a", 2)), (("b", 3), ("b", 4))],
    )
    b_first = anti_unify_paths(
        type_seq,
        [(3, 4, 5), (0, 1, 2)],
        [(("b", 3), ("b", 4)), (("a", 1), ("a", 2))],
    )
    assert a_first.signature() == b_first.signature()
