"""RPS domain tests: simultaneous joint-profile moves with elimination.

Covers:
- seed shape and determinism
- branching factor (3^n_alive) including after elimination
- per-round score deltas match beats - beaten_by
- elimination happens at round boundary when score dips below min_score
- max_round terminates the game
- <=1 alive terminates the game
- DAG dedup: two different round-1 profiles yielding the same (scores,
  alive) tuple must land on the same state.
"""
from builder.lex import Action
from domains.rps import DOMAIN_TAG, CHOICES, DEAD_SLOT, RpsRules, _round_schema


def test_seed_shape():
    r = RpsRules(n_players=3, max_round=5, min_score=-3)
    s = r.seed()
    assert s[0] == DOMAIN_TAG
    assert s[1] == 0
    assert s[2] == (0, 0, 0)
    assert s[3] == (True, True, True)
    assert not r.is_terminal(s)


def test_branching_is_three_to_the_n_alive():
    r = RpsRules(n_players=3)
    acts = r.valid_actions(r.seed())
    assert len(acts) == 27                 # 3 players, 3 choices each
    # All are "round" actions with length-n_players args.
    for a in acts:
        assert a.schema.name == "round"
        assert len(a.args) == 3
        assert all(c in CHOICES for c in a.args)


def test_all_same_profile_yields_zero_deltas():
    r = RpsRules(n_players=3)
    s = r.seed()
    sch = _round_schema(3)
    s1 = r.step(s, Action(sch, ("R", "R", "R")))
    assert s1[1] == 1
    assert s1[2] == (0, 0, 0)
    assert s1[3] == (True, True, True)


def test_all_different_profile_yields_zero_deltas():
    # R beats S, P beats R, S beats P -- each player wins once and loses once.
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "P", "S")))
    assert s1[2] == (0, 0, 0)


def test_two_vs_one_deltas():
    # Profile (R, R, P): the two R players each face one R (tie) and
    # one P (lose) -> delta -1 each. The P player faces two Rs (beats
    # both) -> delta +2.
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    s1 = r.step(r.seed(), Action(sch, ("R", "R", "P")))
    assert s1[2] == (-1, -1, 2)


def test_elimination_when_score_drops_below_min():
    r = RpsRules(n_players=3, max_round=10, min_score=-1)
    sch = _round_schema(3)
    # Round 1: (R, R, P) -> scores (-1, -1, 2). min_score=-1, so
    # elimination is "below -1", i.e. strictly < -1. Neither p0 nor p1
    # is out yet (both at -1 exactly).
    s1 = r.step(r.seed(), Action(sch, ("R", "R", "P")))
    assert s1[2] == (-1, -1, 2)
    assert s1[3] == (True, True, True)
    # Round 2: same profile. scores -> (-2, -2, 4). Now p0, p1 are out.
    s2 = r.step(s1, Action(sch, ("R", "R", "P")))
    assert s2[2] == (-2, -2, 4)
    assert s2[3] == (False, False, True)
    # <=1 alive -> terminal.
    assert r.is_terminal(s2)


def test_dead_seat_excluded_from_branching():
    r = RpsRules(n_players=3, max_round=10, min_score=-1)
    sch = _round_schema(3)
    # Force p0 and p1 dead by repeating (R, R, P) twice.
    s = r.seed()
    s1 = r.step(s, Action(sch, ("R", "R", "P")))
    # Manually construct a state where only p2 is alive but we aren't
    # terminal yet -- use a 4-player game so something is left to branch.
    r4 = RpsRules(n_players=4, max_round=10, min_score=-1)
    sch4 = _round_schema(4)
    # Profile (R, R, R, P): Rs get -1 each (tie among themselves, each
    # loses to P), P gets +3. Run twice; Rs hit -2 -> out.
    s = r4.seed()
    s = r4.step(s, Action(sch4, ("R", "R", "R", "P")))
    s = r4.step(s, Action(sch4, ("R", "R", "R", "P")))
    assert s[3] == (False, False, False, True)
    # 1 alive -> terminal, zero actions.
    assert r4.is_terminal(s)
    assert r4.valid_actions(s) == []


def test_branching_after_partial_elimination():
    # 4 players, eliminate two -> branching = 3^2 = 9.
    r = RpsRules(n_players=4, max_round=10, min_score=-1)
    sch = _round_schema(4)
    s = r.seed()
    # (R, R, P, P): Rs face 1R (tie) + 2P (lose twice) -> -2 each.
    # Ps face 2R (beat twice) + 1P (tie) -> +2 each. min_score=-1, so
    # Rs' -2 is below -> both out after this one round.
    s1 = r.step(s, Action(sch, ("R", "R", "P", "P")))
    assert s1[2] == (-2, -2, 2, 2)
    assert s1[3] == (False, False, True, True)
    # Not terminal (2 alive, round 1 < max 10).
    assert not r.is_terminal(s1)
    acts = r.valid_actions(s1)
    assert len(acts) == 9
    # Dead seats must be DEAD_SLOT in every action.
    for a in acts:
        assert a.args[0] == DEAD_SLOT
        assert a.args[1] == DEAD_SLOT
        assert a.args[2] in CHOICES
        assert a.args[3] in CHOICES


def test_max_round_terminates():
    r = RpsRules(n_players=3, max_round=2, min_score=-99)
    sch = _round_schema(3)
    s = r.seed()
    s1 = r.step(s, Action(sch, ("R", "R", "R")))
    s2 = r.step(s1, Action(sch, ("R", "R", "R")))
    assert s2[1] == 2
    assert r.is_terminal(s2)
    assert r.valid_actions(s2) == []


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
    # p0 and p1 are now dead.
    try:
        r.step(s, Action(sch, ("R", "R", "P", "S")))
    except ValueError:
        pass
    else:
        raise AssertionError("dead seat with a real choice must raise")


def test_dedup_distinct_profiles_same_next_state():
    """All-same and all-different profiles both yield (0,0,0) deltas
    -- the resulting next-states must be equal tuples so the DAG merges
    them. This is the convergence property RPS demonstrates."""
    r = RpsRules(n_players=3)
    sch = _round_schema(3)
    sA = r.step(r.seed(), Action(sch, ("R", "R", "R")))
    sB = r.step(r.seed(), Action(sch, ("R", "P", "S")))
    sC = r.step(r.seed(), Action(sch, ("P", "S", "R")))
    assert sA == sB == sC
    assert hash(sA) == hash(sB) == hash(sC)


def test_dag_expansion_shows_convergence():
    """End-to-end: run the DAG expander on a tiny RPS game and confirm
    real merges (in_degree >= 2) happen at round boundaries."""
    from builder.dag import DAG
    from builder.expand import expand_depth, seed_dag

    r = RpsRules(n_players=3, max_round=2, min_score=-99)
    dag = seed_dag(r)
    expand_depth(dag, r, levels=2)
    # At least some node should have in_degree >= 2 (the round-2 states
    # reachable from multiple round-1 profiles).
    max_in = max(dag.in_degree(nid) for nid in dag.nodes)
    assert max_in >= 2, (
        f"expected some merging, got max in_degree = {max_in} "
        f"over {len(dag.nodes)} nodes"
    )
