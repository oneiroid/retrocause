"""RPS domain tests: simultaneous joint-profile moves, elimination,
strategies, and DAG-level convergence.

State shape is (DOMAIN_TAG, round, scores, alive, last_profile);
last_profile is None on round 0 and a per-seat tuple after each step.
"""
from builder.lex import Action
from domains.rps import (
    DOMAIN_TAG,
    CHOICES,
    DEAD_SLOT,
    RpsRules,
    STRATEGIES,
    _round_schema,
)


def _all_free():
    """Helper: 3 players with avoid_self_last produces wide branching
    after round 0 (2 choices per player) -- useful baseline for tests
    that don't want strategy-driven collapse."""
    return RpsRules(n_players=3, strategies=("avoid_self_last",) * 3)


def test_seed_shape():
    r = RpsRules(n_players=3, max_round=5, min_score=-3)
    s = r.seed()
    assert s[0] == DOMAIN_TAG
    assert s[1] == 0
    assert s[2] == (0, 0, 0)
    assert s[3] == (True, True, True)
    assert s[4] is None
    assert not r.is_terminal(s)


def test_branching_from_seed_is_three_to_n():
    """Round 0 has no history, so every strategy returns CHOICES and
    branching is the full 3^n joint-profile space."""
    for strat in STRATEGIES:
        r = RpsRules(n_players=3, strategies=(strat,) * 3)
        acts = r.valid_actions(r.seed())
        assert len(acts) == 27, f"strat={strat}"
        for a in acts:
            assert a.schema.name == "round"
            assert all(c in CHOICES for c in a.args)


def test_all_same_profile_yields_zero_deltas():
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "R", "R")))
    assert s1[1] == 1
    assert s1[2] == (0, 0, 0)
    assert s1[3] == (True, True, True)
    assert s1[4] == ("R", "R", "R")


def test_all_different_profile_yields_zero_deltas():
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "P", "S")))
    assert s1[2] == (0, 0, 0)
    assert s1[4] == ("R", "P", "S")


def test_two_vs_one_deltas():
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "R", "P")))
    assert s1[2] == (-1, -1, 2)


def test_elimination_when_score_drops_below_min():
    r = RpsRules(n_players=3, max_round=10, min_score=-1)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "R", "P")))
    assert s1[2] == (-1, -1, 2)
    assert s1[3] == (True, True, True)
    s2 = r.step(s1, Action(sch, ("R", "R", "P")))
    assert s2[2] == (-2, -2, 4)
    assert s2[3] == (False, False, True)
    assert r.is_terminal(s2)


def test_dead_seat_excluded_from_branching():
    r = RpsRules(n_players=4, max_round=10, min_score=-1)
    sch = _round_schema(4)
    s = r.step(r.seed(), Action(sch, ("R", "R", "R", "P")))
    s = r.step(s,        Action(sch, ("R", "R", "R", "P")))
    assert s[3] == (False, False, False, True)
    assert r.is_terminal(s)
    assert r.valid_actions(s) == []


def test_max_round_terminates():
    r = RpsRules(n_players=3, max_round=2, min_score=-99)
    sch = _round_schema(3)
    s = r.step(r.seed(), Action(sch, ("R", "R", "R")))
    s = r.step(s,        Action(sch, ("R", "R", "R")))
    assert s[1] == 2
    assert r.is_terminal(s)
    assert r.valid_actions(s) == []


def test_step_on_terminal_raises():
    r = RpsRules(n_players=3, max_round=1, min_score=-99)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "P", "S")))
    assert r.is_terminal(s1)
    try:
        r.step(s1, Action(sch, ("R", "R", "R")))
    except ValueError:
        pass
    else:
        raise AssertionError("step on terminal state should raise")


def test_alive_seat_cannot_play_dead_slot():
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    try:
        r.step(r.seed(), Action(sch, ("R", DEAD_SLOT, "S")))
    except ValueError:
        pass
    else:
        raise AssertionError("alive seat with DEAD_SLOT must raise")


def test_dead_seat_cannot_play_a_choice():
    r = RpsRules(n_players=4, max_round=10, min_score=-1)
    sch = _round_schema(4)
    s = r.step(r.seed(), Action(sch, ("R", "R", "P", "P")))
    try:
        r.step(s, Action(sch, ("R", "R", "P", "S")))
    except ValueError:
        pass
    else:
        raise AssertionError("dead seat with a real choice must raise")


# ---- strategy unit tests --------------------------------------------


def _step_with(rules, sch, profile):
    return rules.step(rules.seed(), Action(sch, profile))


def test_beat_plurality_unique_when_modal_is_unique():
    r = RpsRules(n_players=3, strategies=("beat_plurality",) * 3)
    sch = _round_schema(3)
    # last profile (R,R,P): plurality = R; each player should play P.
    s1 = _step_with(r, sch, ("R", "R", "P"))
    acts = r.valid_actions(s1)
    assert len(acts) == 1
    assert acts[0].args == ("P", "P", "P")


def test_beat_plurality_tied_branches_per_tied_symbol():
    r = RpsRules(n_players=3, strategies=("beat_plurality",) * 3)
    sch = _round_schema(3)
    # last profile (R,P,S): all three tied; plurality_set = {R,P,S};
    # beats = {P,S,R} = all 3. So branching = 3^3 = 27 again.
    s1 = _step_with(r, sch, ("R", "P", "S"))
    assert len(r.valid_actions(s1)) == 27


def test_copy_self_last_collapses_to_one():
    r = RpsRules(n_players=3, strategies=("copy_self_last",) * 3)
    sch = _round_schema(3)
    s1 = _step_with(r, sch, ("R", "P", "S"))
    acts = r.valid_actions(s1)
    assert len(acts) == 1
    assert acts[0].args == ("R", "P", "S")


def test_avoid_self_last_branches_2_per_player():
    r = RpsRules(n_players=3, strategies=("avoid_self_last",) * 3)
    sch = _round_schema(3)
    s1 = _step_with(r, sch, ("R", "P", "S"))
    acts = r.valid_actions(s1)
    assert len(acts) == 8           # 2^3
    for a in acts:
        assert a.args[0] != "R"
        assert a.args[1] != "P"
        assert a.args[2] != "S"


def test_mixed_strategies_compose():
    r = RpsRules(
        n_players=3,
        strategies=("copy_self_last", "avoid_self_last", "beat_self_last"),
    )
    sch = _round_schema(3)
    s1 = _step_with(r, sch, ("R", "P", "S"))
    acts = r.valid_actions(s1)
    # p0 copy_self_last -> {R}, p1 avoid_self_last -> {R, S},
    # p2 beat_self_last -> {R}. Joint = 1 * 2 * 1 = 2.
    assert len(acts) == 2
    p1_choices = {a.args[1] for a in acts}
    assert p1_choices == {"R", "S"}


def test_invalid_strategy_name_raises():
    try:
        RpsRules(n_players=3, strategies=("nonsense",) * 3)
    except ValueError:
        pass
    else:
        raise AssertionError("unknown strategy should raise")


def test_strategies_length_must_match_n_players():
    try:
        RpsRules(n_players=3, strategies=("beat_plurality",) * 2)
    except ValueError:
        pass
    else:
        raise AssertionError("strategies length mismatch should raise")


# ---- DAG-level: convergence / branching at scale ---------------------


def test_dag_expansion_shows_convergence_with_branching_strategy():
    """avoid_self_last branches 2/player after round 0, so multiple
    round-1 paths still merge on round-2 states with equal scores."""
    from builder.expand import expand_depth, seed_dag

    r = RpsRules(n_players=3, max_round=3, min_score=-99,
                 strategies=("avoid_self_last",) * 3)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=3)
    max_in = max(dag.in_degree(nid) for nid in dag.nodes)
    assert max_in >= 2, (
        f"expected merging, got max in_degree={max_in} "
        f"over {len(dag.nodes)} nodes"
    )


def test_deterministic_strategy_yields_chain():
    """copy_self_last is fully deterministic after round 0, so each
    round-0 profile produces a single chain. With 3 players we get
    27 distinct chains (one per round-0 profile)."""
    from builder.expand import expand_all, seed_dag

    r = RpsRules(n_players=3, max_round=4, min_score=-99,
                 strategies=("copy_self_last",) * 3)
    dag = seed_dag(r)
    expand_all(dag, r)
    # Round 0 -> 27 round-1 nodes. Each then steps deterministically
    # to round 2, 3, 4. Some of these chains will land on identical
    # (scores, alive, last_profile) tuples and merge.
    assert len(dag.nodes) >= 27
    # Any node past round 0 has at most 1 successor (deterministic).
    for nid, node in dag.nodes.items():
        if node.generation >= 1:
            assert dag.out_degree(nid) <= 1
