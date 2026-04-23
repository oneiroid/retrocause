"""Negotiation domain tests.

Mirror the shape of test_lineage: determinism of step, branching factor,
terminal behavior, reject-bad-inputs, and the dedup invariant that two
differently-ordered paths land on the same (offer, actor, turn, phase)
tuple.
"""
from builder.lex import Action
from domains.negotiation import (
    NegotiationRules,
    DOMAIN_TAG,
    PROPOSE,
    COUNTER,
    ACCEPT,
    WALK,
)


def test_seed_is_open():
    r = NegotiationRules()
    s = r.seed()
    assert s[0] == DOMAIN_TAG
    assert s[1] is None                # no offer yet
    assert s[2] == "none"              # no last actor
    assert s[3] == 0                   # turn 0
    assert s[4] == "open"
    assert not r.is_terminal(s)


def test_branching_from_seed_is_value_max_plus_one():
    r = NegotiationRules(value_max=5)
    acts = r.valid_actions(r.seed())
    # value_max=5 -> propose values 0..5 inclusive = 6 actions.
    assert len(acts) == 6
    assert all(a.schema.name == "propose" for a in acts)
    assert {a.args[1] for a in acts} == set(range(6))
    # All from the opener.
    assert {a.args[0] for a in acts} == {r.opener}


def test_countering_branching_is_two_plus_value_max():
    r = NegotiationRules(value_max=5)
    s = r.seed()
    opened = r.step(s, Action(PROPOSE, ("a", 3)))
    acts = r.valid_actions(opened)
    # value_max=5 -> 6 possible values, minus the current offer (3),
    # plus accept and walk = 5 + 2 = 7.
    assert len(acts) == 7
    kinds = [a.schema.name for a in acts]
    assert kinds.count("accept") == 1
    assert kinds.count("walk") == 1
    assert kinds.count("counter") == 5
    # No-op counter at the current offer is not offered.
    for a in acts:
        if a.schema.name == "counter":
            assert a.args[1] != 3
    # All moves come from the other actor.
    for a in acts:
        assert a.args[0] == "b"


def test_accept_terminates_with_outcome():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 4)))
    s2 = r.step(s1, Action(ACCEPT, ("b",)))
    assert r.is_terminal(s2)
    assert s2[4] == ("accepted", 4)
    assert r.valid_actions(s2) == []


def test_walk_terminates_with_outcome():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 2)))
    s2 = r.step(s1, Action(WALK, ("b",)))
    assert r.is_terminal(s2)
    assert s2[4] == "walked"
    assert r.valid_actions(s2) == []


def test_timeout_at_max_turn():
    r = NegotiationRules(max_turn=1)
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 3)))
    # turn is now 1, which is >= max_turn -> terminal by cap.
    assert s1[3] == 1
    assert r.is_terminal(s1)
    assert r.valid_actions(s1) == []


def test_counter_value_must_differ_from_offer():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 2)))
    try:
        r.step(s1, Action(COUNTER, ("b", 2)))
    except ValueError:
        pass
    else:
        raise AssertionError("counter at current offer should raise")


def test_counter_must_be_from_other_actor():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 2)))   # last_actor = a
    try:
        r.step(s1, Action(COUNTER, ("a", 3)))   # a again
    except ValueError:
        pass
    else:
        raise AssertionError("same-actor counter should raise")


def test_accept_must_be_from_other_actor():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 2)))
    try:
        r.step(s1, Action(ACCEPT, ("a",)))
    except ValueError:
        pass
    else:
        raise AssertionError("same-actor accept should raise")


def test_propose_only_from_open():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 2)))
    try:
        r.step(s1, Action(PROPOSE, ("b", 3)))
    except ValueError:
        pass
    else:
        raise AssertionError("propose in non-open phase should raise")


def test_step_on_terminal_raises():
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 4)))
    s2 = r.step(s1, Action(ACCEPT, ("b",)))
    try:
        r.step(s2, Action(WALK, ("a",)))
    except ValueError:
        pass
    else:
        raise AssertionError("step on terminal state should raise")


def test_dedup_two_counter_paths_converge():
    """Two different turn-1 parents counter onto the same value.
    The resulting (offer, last_actor, turn, phase) tuples must be equal
    so the DAG merges them -- this is the negotiation-domain version of
    the invariant DAG expansion relies on."""
    r = NegotiationRules()
    s = r.seed()
    # Path A: a opens at 3, b counters to 5.
    sA1 = r.step(s, Action(PROPOSE, ("a", 3)))
    sA2 = r.step(sA1, Action(COUNTER, ("b", 5)))
    # Path B: a opens at 4, b counters to 5.
    sB1 = r.step(s, Action(PROPOSE, ("a", 4)))
    sB2 = r.step(sB1, Action(COUNTER, ("b", 5)))
    assert sA2 == sB2
    assert hash(sA2) == hash(sB2)


def test_opener_b_works_symmetrically():
    r = NegotiationRules(opener="b")
    acts = r.valid_actions(r.seed())
    assert all(a.args[0] == "b" for a in acts)
    s1 = r.step(r.seed(), Action(PROPOSE, ("b", 1)))
    # After b opens, a is to move.
    acts2 = r.valid_actions(s1)
    assert all(a.args[0] == "a" for a in acts2)


def test_action_types_are_exactly_four():
    """The §10.3 precondition: negotiation must have > 2 action types."""
    r = NegotiationRules()
    s = r.seed()
    s1 = r.step(s, Action(PROPOSE, ("a", 2)))
    types_from_seed = {a.schema.name for a in r.valid_actions(s)}
    types_from_countering = {a.schema.name for a in r.valid_actions(s1)}
    all_types = types_from_seed | types_from_countering
    assert all_types == {"propose", "counter", "accept", "walk"}
