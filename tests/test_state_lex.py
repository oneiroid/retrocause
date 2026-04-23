"""Step 1 tests: state hashing/equality and action formatting."""
from builder.state import state_key
from builder.lex import ActionSchema, Action


def test_state_dedup_via_hash():
    # Two identical tuples must hash/equal-compare identically.
    a = ("lineage", (0, 1, 2), 3)
    b = ("lineage", (0, 1, 2), 3)
    assert a == b
    assert hash(a) == hash(b)
    assert state_key(a) == state_key(b)

    # A different payload must not collide.
    c = ("lineage", (0, 1, 3), 3)
    assert a != c


def test_state_survives_dict_key():
    d = {}
    s1 = ("lineage", (0, 1, 2), 0)
    s2 = ("lineage", (0, 1, 2), 0)  # structurally equal -> same key
    d[s1] = "first"
    d[s2] = "second"
    assert len(d) == 1
    assert d[s1] == "second"


def test_action_schema_validates():
    # Good schema.
    s = ActionSchema("mutate", ("lineage", "site"), ("lineage", "int"))
    assert s.signature() == "mutate(lineage:lineage, site:int)"

    # Mismatched arity should raise.
    try:
        ActionSchema("bad", ("a", "b"), ("int",))
    except ValueError:
        pass
    else:
        raise AssertionError("ActionSchema must reject mismatched arities")


def test_action_label_and_type():
    s = ActionSchema("mutate", ("lineage", "site"), ("lineage", "int"))
    a = Action(s, ("L1", 2))
    assert a.label() == "mutate(L1,2)"
    assert a.action_type() == "mutate"

    # Zero-arg action (e.g., go_extinct after binding the implicit self).
    s2 = ActionSchema("go_extinct", (), ())
    a2 = Action(s2, ())
    assert a2.label() == "go_extinct"


def test_action_rejects_wrong_arity():
    s = ActionSchema("mutate", ("lineage", "site"), ("lineage", "int"))
    try:
        Action(s, ("L1",))
    except ValueError:
        pass
    else:
        raise AssertionError("Action must reject wrong-arity args")
