"""Step 2 tests: lineage domain rules.

Important tests:
  - determinism of step
  - branching factor (~11 actions per alive state under defaults)
  - dead genomes are terminal (no valid actions)
  - action sequences that land on the same (genome, gen) produce
    identical state tuples (the dedup guarantee the DAG relies on)
"""
from domains.lineage import LineageRules, DOMAIN_TAG


def test_fitness_and_dead_flag():
    r = LineageRules()
    assert r.fitness((0, 0, 0, 0, 0)) == 5
    assert r.fitness((0, 0, 0, 0, 1)) == 4
    assert r.fitness((1, 1, 1, 1, 1)) == 0
    assert r.is_dead((1, 1, 1, 1, 1)) is True     # fitness 0 < threshold 2
    assert r.is_dead((0, 1, 1, 1, 1)) is True     # fitness 1 < 2
    assert r.is_dead((0, 0, 1, 1, 1)) is False    # fitness 2 >= 2


def test_seed_is_alive_and_mid_fitness():
    r = LineageRules()
    s = r.seed()
    assert s[0] == DOMAIN_TAG
    assert s[2] == 0
    # 5 sites: first 3 match target, last 2 don't -> fitness 3.
    assert r.fitness(s[1]) == 3
    assert not r.is_terminal(s)


def test_branching_factor_under_defaults():
    r = LineageRules()
    s = r.seed()
    acts = r.valid_actions(s)
    # 1 replicate + (5 sites x 2 alt alleles) mutations = 11.
    assert len(acts) == 11
    names = [a.schema.name for a in acts]
    assert names.count("replicate") == 1
    assert names.count("mutate") == 10


def test_replicate_is_identity_on_genome():
    r = LineageRules()
    s = r.seed()
    repl = next(a for a in r.valid_actions(s) if a.schema.name == "replicate")
    s1 = r.step(s, repl)
    assert s1[1] == s[1]
    assert s1[2] == 1


def test_mutate_changes_only_one_site():
    r = LineageRules()
    s = r.seed()
    mut = next(
        a
        for a in r.valid_actions(s)
        if a.schema.name == "mutate" and a.args == (3, 0)
    )
    s1 = r.step(s, mut)
    assert s1[1][3] == 0
    for i in range(5):
        if i != 3:
            assert s1[1][i] == s[1][i]


def test_dead_state_is_terminal():
    r = LineageRules()
    dead = (DOMAIN_TAG, (1, 1, 1, 1, 1), 0)
    assert r.is_terminal(dead)
    assert r.valid_actions(dead) == []


def test_generation_cap_is_terminal():
    r = LineageRules(max_generation=2)
    capped = (DOMAIN_TAG, r.seed()[1], 2)
    assert r.is_terminal(capped)
    assert r.valid_actions(capped) == []


def test_step_on_terminal_raises():
    r = LineageRules()
    dead = (DOMAIN_TAG, (1, 1, 1, 1, 1), 0)
    mut = next(
        a
        for a in r.valid_actions(r.seed())
        if a.schema.name == "mutate"
    )
    try:
        r.step(dead, mut)
    except ValueError:
        pass
    else:
        raise AssertionError("step must refuse to run from a terminal state")


def test_dedup_converges_two_paths():
    """Replicate-then-mutate and mutate-then-replicate must produce the
    same (genome, gen) tuple. This is the invariant the DAG relies on
    to merge paths rather than grow a tree."""
    r = LineageRules()
    s = r.seed()
    repl = next(a for a in r.valid_actions(s) if a.schema.name == "replicate")
    mut = next(
        a
        for a in r.valid_actions(s)
        if a.schema.name == "mutate" and a.args == (4, 0)
    )
    path_a = r.step(r.step(s, repl), mut)
    path_b = r.step(r.step(s, mut), repl)
    assert path_a == path_b
    assert hash(path_a) == hash(path_b)


def test_mutate_noop_rejected():
    r = LineageRules()
    s = r.seed()
    # Build a mutate action that tries to set an already-correct site
    # back to the same allele.
    from builder.lex import Action
    from domains.lineage import MUTATE
    cur_allele_at_0 = s[1][0]
    bad = Action(MUTATE, (0, cur_allele_at_0))
    try:
        r.step(s, bad)
    except ValueError:
        pass
    else:
        raise AssertionError("no-op mutate should raise")
