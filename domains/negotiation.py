"""Iterated bilateral negotiation domain.

Two agents a and b exchange integer offers. State is
(phase_or_outcome, current_offer, last_actor, turn), wrapped with a
DOMAIN_TAG as usual.

Phases:
    open         -- no offer on the table; the opener (rules.opener) moves
    countering   -- offer on the table; the other agent moves
Outcomes (all terminal):
    ('accepted', v)
    'walked'
    'timeout'    -- hit turn cap before reaching accepted/walked

Action lexicon (4 types above the "k > 4" floor in FORMAL_MODEL_v3
§10.3 is marginal but sufficient):
    propose(actor, value)   -- legal from phase=open
    counter(actor, value)   -- legal from phase=countering, value != offer
    accept(actor)           -- legal from phase=countering
    walk(actor)             -- legal from phase=countering

Design notes:

- The DAG deduplicates on (offer, last_actor, turn, phase_or_outcome).
  Turn is monotonically increasing, so merges happen only within the
  same turn slice -- but real merges do occur there: many counter
  sequences funnel onto the same (offer, actor, turn, countering) node.
  This is the §10.3 counter-example to lineage's small-alphabet case.
- `opener` is a rules parameter, not a state field. The seed is the
  same regardless; valid_actions consults rules.opener when phase=open.
- Terminal nodes are phase_or_outcome in a fixed set, or turn >= cap.
  Turn-cap termination does not rewrite the phase -- callers inspect
  the state to see whether a terminal node is an outcome or a timeout.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple, Union

from builder.lex import Action, ActionSchema
from builder.state import State


DOMAIN_TAG = "negotiation"

PROPOSE = ActionSchema("propose", ("actor", "value"), ("entity", "int"))
COUNTER = ActionSchema("counter", ("actor", "value"), ("entity", "int"))
ACCEPT = ActionSchema("accept", ("actor",), ("entity",))
WALK = ActionSchema("walk", ("actor",), ("entity",))


# A phase_or_outcome is one of:
#   "open"
#   "countering"
#   ("accepted", v)
#   "walked"
PhaseOrOutcome = Union[str, Tuple[str, int]]


@dataclass(frozen=True)
class NegotiationRules:
    value_max: int = 5        # offer values in 0..value_max inclusive
    max_turn: int = 8         # state with turn >= max_turn is terminal
    opener: str = "a"         # which entity moves from phase=open

    def __post_init__(self) -> None:
        if self.value_max < 1:
            raise ValueError("value_max must be >= 1")
        if self.max_turn < 1:
            raise ValueError("max_turn must be >= 1")
        if self.opener not in ("a", "b"):
            raise ValueError("opener must be 'a' or 'b'")

    # -------------------- helpers --------------------

    @staticmethod
    def _other(actor: str) -> str:
        return "b" if actor == "a" else "a"

    @staticmethod
    def _is_outcome(phase: PhaseOrOutcome) -> bool:
        if isinstance(phase, tuple):
            return True                     # ('accepted', v)
        return phase == "walked"

    # -------------------- rules API --------------------

    def generation(self, s: State) -> int:
        # turn doubles as generation: every action increments it by 1.
        return s[3]

    def is_terminal(self, s: State) -> bool:
        _, _, _, turn, phase = s
        if self._is_outcome(phase):
            return True
        if turn >= self.max_turn:
            return True
        return False

    def expr(self, s: State) -> str:
        _, offer, last_actor, turn, phase = s
        if isinstance(phase, tuple):
            _, v = phase
            return f"t{turn} ACCEPTED by {last_actor} at {v}"
        if phase == "walked":
            return f"t{turn} WALKED by {last_actor}"
        if phase == "open":
            return f"t{turn} open (to_move={self.opener})"
        # countering (possibly also timeout, which has no special label --
        # caller sees `phase=countering` with turn>=max_turn and reads it
        # as a timeout).
        if turn >= self.max_turn and phase == "countering":
            return f"t{turn} TIMEOUT offer={offer} last={last_actor}"
        return f"t{turn} offer={offer} by {last_actor}"

    def seed(self) -> State:
        return (DOMAIN_TAG, None, "none", 0, "open")

    def valid_actions(self, s: State) -> List[Action]:
        if self.is_terminal(s):
            return []
        _, offer, last_actor, _, phase = s

        if phase == "open":
            mover = self.opener
            return [
                Action(PROPOSE, (mover, v))
                for v in range(self.value_max + 1)
            ]

        if phase == "countering":
            mover = self._other(last_actor)
            acts: List[Action] = [
                Action(ACCEPT, (mover,)),
                Action(WALK, (mover,)),
            ]
            for v in range(self.value_max + 1):
                if v == offer:
                    continue
                acts.append(Action(COUNTER, (mover, v)))
            return acts

        raise ValueError(f"unreachable phase: {phase!r}")

    def step(self, s: State, a: Action) -> State:
        if self.is_terminal(s):
            raise ValueError("cannot step from a terminal state")
        _, offer, last_actor, turn, phase = s
        name = a.schema.name
        new_turn = turn + 1

        if name == "propose":
            if phase != "open":
                raise ValueError("propose only valid from phase=open")
            actor, v = a.args
            if actor != self.opener:
                raise ValueError(
                    f"opener is {self.opener!r}, not {actor!r}"
                )
            if not (0 <= v <= self.value_max):
                raise ValueError("propose value out of range")
            return (DOMAIN_TAG, v, actor, new_turn, "countering")

        if name == "counter":
            if phase != "countering":
                raise ValueError("counter only valid from phase=countering")
            actor, v = a.args
            if actor != self._other(last_actor):
                raise ValueError("counter must come from the other actor")
            if not (0 <= v <= self.value_max):
                raise ValueError("counter value out of range")
            if v == offer:
                raise ValueError("counter value must differ from offer")
            return (DOMAIN_TAG, v, actor, new_turn, "countering")

        if name == "accept":
            if phase != "countering":
                raise ValueError("accept only valid from phase=countering")
            (actor,) = a.args
            if actor != self._other(last_actor):
                raise ValueError("accept must come from the other actor")
            return (DOMAIN_TAG, offer, actor, new_turn, ("accepted", offer))

        if name == "walk":
            if phase != "countering":
                raise ValueError("walk only valid from phase=countering")
            (actor,) = a.args
            if actor != self._other(last_actor):
                raise ValueError("walk must come from the other actor")
            return (DOMAIN_TAG, offer, actor, new_turn, "walked")

        raise ValueError(f"unknown action: {name!r}")
