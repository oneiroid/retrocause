"""Rock-Paper-Scissors domain with N players, simultaneous throws, and
per-player history-reactive strategies.

Each round every alive player picks one of {R, P, S} simultaneously.
Each player's strategy is fixed at game start (rules.strategies, length
n_players). A strategy is a deterministic policy from the visible
history to a *set* of legal moves: when the strategy is unambiguous
the set has size 1 (no branching for that player); when the strategy
is ambiguous (round 0 has no history; ties leave several "best"
candidates) the set is larger and the DAG branches.

Per-round score delta for an alive player with choice c:
    delta = (# other alive players whose choice c beats)
          - (# other alive players whose choice beats c)
    Equivalently, with r/p/s = counts of each choice this round:
        c = R -> s - p
        c = P -> r - s
        c = S -> p - r

A player whose cumulative score drops *below* rules.min_score at the
end of a round is eliminated: their score freezes and they stop
throwing.

State payload:
    (DOMAIN_TAG, round, scores, alive, last_profile)
    scores       : tuple[int, ...]  length = n_players
    alive        : tuple[bool, ...] length = n_players
    last_profile : tuple[str, ...] | None
                   None on round 0; otherwise the previous round's
                   profile (per-seat choices, with DEAD_SLOT for seats
                   that were already dead at that round). Strategies
                   read from it.

Action lexicon:
    The "round" action has n_players parameters. Args = the joint
    profile, with DEAD_SLOT for eliminated seats.

Strategy library (all reactive, all deterministic, all return a *set*
of candidate moves so ties produce branching):
    beat_plurality      -- play what beats last round's modal choice
    copy_plurality      -- repeat last round's modal choice
    lose_to_plurality   -- play what last round's modal beats
    beat_self_last      -- play what beats your own last move
    copy_self_last      -- repeat your own last move
    avoid_self_last     -- anything except your own last
    beat_winner         -- play what beats last round's top scorer's move
    copy_loser          -- repeat last round's bottom scorer's move

Round 0 has no history -> every strategy returns all of CHOICES, so
the seed branches with the full 3^n_players profile space.
"""
from __future__ import annotations

import functools
from collections import Counter
from dataclasses import dataclass, field
from itertools import product
from typing import Callable, Dict, List, Optional, Tuple

from builder.lex import Action, ActionSchema
from builder.state import State


DOMAIN_TAG = "rps"

CHOICES: Tuple[str, ...] = ("R", "P", "S")
DEAD_SLOT = "_"

# choice -> the choice it beats
_BEATS = {"R": "S", "P": "R", "S": "P"}
# choice -> the choice that beats it (built once at module load)
_BEATS_INV = {v: k for k, v in _BEATS.items()}


@functools.lru_cache(maxsize=None)
def _round_schema(n_players: int) -> ActionSchema:
    return ActionSchema(
        "round",
        tuple(f"p{i}" for i in range(n_players)),
        ("sym",) * n_players,
    )


# ---------------------------------------------------------------------
# Strategies
#
# A strategy is a function:
#   (player_idx, last_profile, scores, alive, prev_alive) -> tuple[str, ...]
# returning the set of choices the strategy considers acceptable for
# `player_idx` this round. The Cartesian product across alive players
# becomes the set of valid joint profiles.
#
# Conventions:
#   * If `last_profile` is None (round 0), every strategy returns all
#     of CHOICES so the seed branches fully.
#   * Strategies that look at "last round's plurality / winner / loser"
#     consult only seats that were alive *during the previous round*
#     (`prev_alive`) -- a freshly-eliminated seat still cast a vote
#     last round.
#   * Ties never collapse to an arbitrary pick; they fan out into
#     multiple candidate moves so the DAG records every consistent path.
# ---------------------------------------------------------------------


def _alive_choices_in_profile(
    profile: Tuple[str, ...], prev_alive: Tuple[bool, ...]
) -> List[Tuple[int, str]]:
    """List of (seat, choice) pairs for seats that actually played a
    real symbol last round."""
    return [
        (i, c) for i, (c, al) in enumerate(zip(profile, prev_alive))
        if al and c in CHOICES
    ]


def _plurality_set(profile, prev_alive) -> Tuple[str, ...]:
    """Symbols tied for last round's max count. Empty if no live throws."""
    counts = Counter(c for _, c in _alive_choices_in_profile(profile, prev_alive))
    if not counts:
        return ()
    top = max(counts.values())
    return tuple(c for c, k in counts.items() if k == top)


def _strat_beat_plurality(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    plur = _plurality_set(last_profile, prev_alive)
    if not plur:
        return CHOICES
    return tuple(sorted({_BEATS_INV[c] for c in plur}))


def _strat_copy_plurality(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    plur = _plurality_set(last_profile, prev_alive)
    return plur or CHOICES


def _strat_lose_to_plurality(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    plur = _plurality_set(last_profile, prev_alive)
    if not plur:
        return CHOICES
    return tuple(sorted({_BEATS[c] for c in plur}))


def _strat_beat_self_last(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    own = last_profile[player]
    if own == DEAD_SLOT:        # was dead last round (shouldn't happen if alive now)
        return CHOICES
    return (_BEATS_INV[own],)


def _strat_copy_self_last(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    own = last_profile[player]
    if own == DEAD_SLOT:
        return CHOICES
    return (own,)


def _strat_avoid_self_last(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    own = last_profile[player]
    if own == DEAD_SLOT:
        return CHOICES
    return tuple(c for c in CHOICES if c != own)


def _strat_beat_winner(player, last_profile, scores, alive, prev_alive):
    """Beat the move played by the *current* top scorer (among seats
    that played last round). Ties on top score branch."""
    if last_profile is None:
        return CHOICES
    eligible = [i for i, al in enumerate(prev_alive) if al]
    if not eligible:
        return CHOICES
    top = max(scores[i] for i in eligible)
    leaders = [i for i in eligible if scores[i] == top]
    return tuple(sorted({_BEATS_INV[last_profile[i]]
                         for i in leaders if last_profile[i] in CHOICES}) or CHOICES)


def _strat_copy_loser(player, last_profile, scores, alive, prev_alive):
    if last_profile is None:
        return CHOICES
    eligible = [i for i, al in enumerate(prev_alive) if al]
    if not eligible:
        return CHOICES
    bot = min(scores[i] for i in eligible)
    losers = [i for i in eligible if scores[i] == bot]
    return tuple(sorted({last_profile[i] for i in losers
                         if last_profile[i] in CHOICES}) or CHOICES)


STRATEGIES: Dict[str, Callable] = {
    "beat_plurality":    _strat_beat_plurality,
    "copy_plurality":    _strat_copy_plurality,
    "lose_to_plurality": _strat_lose_to_plurality,
    "beat_self_last":    _strat_beat_self_last,
    "copy_self_last":    _strat_copy_self_last,
    "avoid_self_last":   _strat_avoid_self_last,
    "beat_winner":       _strat_beat_winner,
    "copy_loser":        _strat_copy_loser,
}


# ---------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------


@dataclass(frozen=True)
class RpsRules:
    n_players: int = 3
    max_round: int = 5
    min_score: int = -3                       # eliminated when score < min_score
    strategies: Tuple[str, ...] = ()          # one per player; default = all beat_plurality

    def __post_init__(self) -> None:
        if self.n_players < 2:
            raise ValueError("n_players must be >= 2")
        if self.max_round < 1:
            raise ValueError("max_round must be >= 1")
        # Frozen dataclass -- use object.__setattr__ to fill in the
        # default strategies tuple if caller passed an empty one.
        if not self.strategies:
            object.__setattr__(
                self, "strategies",
                tuple("beat_plurality" for _ in range(self.n_players)),
            )
        if len(self.strategies) != self.n_players:
            raise ValueError(
                f"strategies length {len(self.strategies)} != n_players {self.n_players}"
            )
        for s in self.strategies:
            if s not in STRATEGIES:
                raise ValueError(
                    f"unknown strategy {s!r}; valid: {sorted(STRATEGIES)}"
                )

    # -------------------- helpers --------------------

    @staticmethod
    def _deltas(profile: Tuple[str, ...]) -> Tuple[int, ...]:
        counts = {"R": 0, "P": 0, "S": 0}
        for c in profile:
            if c in counts:
                counts[c] += 1
        out: List[int] = []
        for c in profile:
            if c == DEAD_SLOT:
                out.append(0)
                continue
            loses_to = _BEATS_INV[c]
            beats = _BEATS[c]
            out.append(counts[beats] - counts[loses_to])
        return tuple(out)

    # -------------------- rules API --------------------

    def generation(self, s: State) -> int:
        return s[1]

    def is_terminal(self, s: State) -> bool:
        _, rnd, _, alive, _ = s
        if rnd >= self.max_round:
            return True
        if sum(alive) <= 1:
            return True
        return False

    def expr(self, s: State) -> str:
        _, rnd, scores, alive, last_profile = s
        # Per-player block: "p0=R/2"  ->  player 0 played R last round,
        # current score 2. "p1x=P/-3" -> player 1 is eliminated, last
        # threw P, frozen at -3. Round 0 has no last_profile, so we
        # omit the "/symbol" half.
        parts = []
        for i, (sc, al) in enumerate(zip(scores, alive)):
            tag = "" if al else "x"
            if last_profile is None:
                parts.append(f"p{i}{tag}={sc}")
            else:
                sym = last_profile[i]
                parts.append(f"p{i}{tag}={sym}/{sc}")
        body = " ".join(parts)

        n_alive = sum(alive)
        if rnd >= self.max_round or n_alive <= 1:
            if n_alive == 1:
                winner = alive.index(True)
                return f"r{rnd} WIN p{winner}  {body}"
            if n_alive == 0:
                return f"r{rnd} WIPEOUT  {body}"
            top = max(sc for sc, al in zip(scores, alive) if al)
            tied = [i for i, (sc, al) in enumerate(zip(scores, alive))
                    if al and sc == top]
            if len(tied) == 1:
                return f"r{rnd} END p{tied[0]}  {body}"
            return f"r{rnd} DRAW {tied}  {body}"
        return f"r{rnd}  {body}"

    def seed(self) -> State:
        scores = tuple(0 for _ in range(self.n_players))
        alive = tuple(True for _ in range(self.n_players))
        return (DOMAIN_TAG, 0, scores, alive, None)

    def valid_actions(self, s: State) -> List[Action]:
        if self.is_terminal(s):
            return []
        _, _, scores, alive, last_profile = s
        # `prev_alive` describes who threw last round. On round 0 it's
        # irrelevant (last_profile is None and every strategy short-
        # circuits). Otherwise: a seat is `prev_alive` iff it cast a
        # real symbol in last_profile (DEAD_SLOT means it was already
        # dead before that round).
        if last_profile is None:
            prev_alive = tuple(True for _ in range(self.n_players))
        else:
            prev_alive = tuple(c in CHOICES for c in last_profile)

        per_player: List[Tuple[str, ...]] = []
        for p in range(self.n_players):
            if not alive[p]:
                per_player.append((DEAD_SLOT,))
                continue
            strat = STRATEGIES[self.strategies[p]]
            choices = strat(p, last_profile, scores, alive, prev_alive)
            if not choices:
                # Shouldn't happen with the library above, but guard
                # anyway: empty would silently kill the branch.
                choices = CHOICES
            per_player.append(tuple(choices))

        schema = _round_schema(self.n_players)
        return [Action(schema, profile) for profile in product(*per_player)]

    def step(self, s: State, a: Action) -> State:
        if self.is_terminal(s):
            raise ValueError("cannot step from a terminal state")
        if a.schema.name != "round":
            raise ValueError(f"unknown action: {a.schema.name!r}")
        _, rnd, scores, alive, _ = s
        profile = a.args
        if len(profile) != self.n_players:
            raise ValueError(
                f"profile length {len(profile)} != n_players {self.n_players}"
            )
        for i, (c, al) in enumerate(zip(profile, alive)):
            if al:
                if c not in CHOICES:
                    raise ValueError(f"alive seat p{i} got non-choice {c!r}")
            else:
                if c != DEAD_SLOT:
                    raise ValueError(f"dead seat p{i} must be {DEAD_SLOT!r}, got {c!r}")

        deltas = self._deltas(profile)
        new_scores = tuple(sc + d for sc, d in zip(scores, deltas))
        new_alive = tuple(
            al and (sc >= self.min_score)
            for al, sc in zip(alive, new_scores)
        )
        return (DOMAIN_TAG, rnd + 1, new_scores, new_alive, profile)
