"""Rock-Paper-Scissors domain with N players and simultaneous throws.

Each round every alive player picks one of {R, P, S} simultaneously,
observing only the shared history of prior rounds (scores are the
sufficient statistic for the game mechanics -- the DAG stores that,
not the history). A "round" action is therefore a joint profile over
the currently-alive players.

Per-round score delta for an alive player with choice c:
    delta = (# other alive players whose choice c beats)
          - (# other alive players whose choice beats c)
    Equivalently, with r/p/s = counts of each choice this round:
        c = R -> s - p
        c = P -> r - s
        c = S -> p - r

Scores accumulate across rounds. A player whose cumulative score drops
*below* rules.min_score at the end of a round is eliminated: their
score freezes and they stop throwing for the rest of the game.

State payload:
    (DOMAIN_TAG, round, scores_tuple, alive_tuple)
    scores_tuple : tuple[int, ...]  length = n_players
    alive_tuple  : tuple[bool, ...] length = n_players

Action lexicon:
    The "round" action has n_players parameters, one per player seat.
    Args are a tuple of length n_players: choice in {'R','P','S'} for
    alive players and the sentinel '_' for eliminated seats, so two
    different states with the same alive set use the same schema
    instance. One action_type across the whole domain -- RPS here is
    a showcase of round-boundary convergence, not a sec 10.3 alphabet
    variety case.

DAG convergence property:
    Many joint profiles yield the same per-player score-delta tuple
    (e.g. all-same and all-different both yield zeros), so distinct
    round-1 profiles fold onto the same round-2 state. That is where
    the DAG actually merges.
"""
from __future__ import annotations

import functools
from dataclasses import dataclass
from itertools import product
from typing import List, Tuple

from builder.lex import Action, ActionSchema
from builder.state import State


DOMAIN_TAG = "rps"

CHOICES: Tuple[str, ...] = ("R", "P", "S")
DEAD_SLOT = "_"

# choice -> the choice it beats
_BEATS = {"R": "S", "P": "R", "S": "P"}


@functools.lru_cache(maxsize=None)
def _round_schema(n_players: int) -> ActionSchema:
    return ActionSchema(
        "round",
        tuple(f"p{i}" for i in range(n_players)),
        ("sym",) * n_players,
    )


@dataclass(frozen=True)
class RpsRules:
    n_players: int = 3
    max_round: int = 5
    min_score: int = -3        # eliminated when score < min_score

    def __post_init__(self) -> None:
        if self.n_players < 2:
            raise ValueError("n_players must be >= 2")
        if self.max_round < 1:
            raise ValueError("max_round must be >= 1")

    # -------------------- helpers --------------------

    @staticmethod
    def _deltas(profile: Tuple[str, ...]) -> Tuple[int, ...]:
        """Per-seat score delta for one simultaneous round. Entries that
        are DEAD_SLOT contribute 0. Only counts against other alive
        seats (DEAD_SLOT does not beat or lose to anything)."""
        counts = {"R": 0, "P": 0, "S": 0}
        for c in profile:
            if c in counts:
                counts[c] += 1
        out: List[int] = []
        for c in profile:
            if c == DEAD_SLOT:
                out.append(0)
                continue
            loses_to = _BEATS_INV[c]       # choice that beats c
            beats = _BEATS[c]              # choice that c beats
            out.append(counts[beats] - counts[loses_to])
        return tuple(out)

    # -------------------- rules API --------------------

    def generation(self, s: State) -> int:
        return s[1]

    def is_terminal(self, s: State) -> bool:
        _, rnd, _, alive = s
        if rnd >= self.max_round:
            return True
        if sum(alive) <= 1:
            return True
        return False

    def expr(self, s: State) -> str:
        _, rnd, scores, alive = s
        parts = []
        for i, (sc, al) in enumerate(zip(scores, alive)):
            tag = "" if al else "x"
            parts.append(f"p{i}{tag}={sc}")
        score_str = " ".join(parts)
        n_alive = sum(alive)
        if rnd >= self.max_round or n_alive <= 1:
            if n_alive == 1:
                winner = alive.index(True)
                return f"r{rnd} WIN p{winner}  {score_str}"
            if n_alive == 0:
                return f"r{rnd} WIPEOUT  {score_str}"
            # max_round with >1 alive
            top = max(sc for sc, al in zip(scores, alive) if al)
            tied = [i for i, (sc, al) in enumerate(zip(scores, alive))
                    if al and sc == top]
            if len(tied) == 1:
                return f"r{rnd} END p{tied[0]}  {score_str}"
            return f"r{rnd} DRAW {tied}  {score_str}"
        return f"r{rnd}  {score_str}"

    def seed(self) -> State:
        scores = tuple(0 for _ in range(self.n_players))
        alive = tuple(True for _ in range(self.n_players))
        return (DOMAIN_TAG, 0, scores, alive)

    def valid_actions(self, s: State) -> List[Action]:
        if self.is_terminal(s):
            return []
        _, _, _, alive = s
        schema = _round_schema(self.n_players)
        alive_seats = [i for i, a in enumerate(alive) if a]
        acts: List[Action] = []
        # Cartesian product across alive seats; dead seats pinned to DEAD_SLOT.
        for profile in product(CHOICES, repeat=len(alive_seats)):
            full = [DEAD_SLOT] * self.n_players
            for k, seat in enumerate(alive_seats):
                full[seat] = profile[k]
            acts.append(Action(schema, tuple(full)))
        return acts

    def step(self, s: State, a: Action) -> State:
        if self.is_terminal(s):
            raise ValueError("cannot step from a terminal state")
        if a.schema.name != "round":
            raise ValueError(f"unknown action: {a.schema.name!r}")
        _, rnd, scores, alive = s
        profile = a.args
        if len(profile) != self.n_players:
            raise ValueError(
                f"profile length {len(profile)} != n_players {self.n_players}"
            )
        # Consistency: dead seats must be DEAD_SLOT; alive seats must be
        # a real choice. This guards against malformed actions.
        for i, (c, al) in enumerate(zip(profile, alive)):
            if al:
                if c not in CHOICES:
                    raise ValueError(
                        f"alive seat p{i} got non-choice {c!r}"
                    )
            else:
                if c != DEAD_SLOT:
                    raise ValueError(
                        f"dead seat p{i} must be {DEAD_SLOT!r}, got {c!r}"
                    )

        deltas = self._deltas(profile)
        new_scores = tuple(sc + d for sc, d in zip(scores, deltas))
        # Elimination check: a previously-alive seat whose new score
        # dropped *below* min_score becomes dead. Dead seats stay dead.
        new_alive = tuple(
            al and (sc >= self.min_score)
            for al, sc in zip(alive, new_scores)
        )
        return (DOMAIN_TAG, rnd + 1, new_scores, new_alive)


# Built from _BEATS so the loser lookup is kept in sync with the winner map.
_BEATS_INV = {v: k for k, v in _BEATS.items()}
