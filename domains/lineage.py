"""Lineage evolution domain.

A genome is a tuple of N integer alleles, each in 0..n_alleles-1. The
"fitness" of a genome is the count of sites matching a fixed target
genome. A lineage is dead if its fitness is below alive_threshold; dead
states have no valid actions (they are leaves in the DAG -- this is
how die-off shows up).

State payload:
    (DOMAIN_TAG, genome_tuple, generation_int)

Lexicon:
    replicate        -- copy genome forward one generation
    mutate(site, v)  -- change site's allele to v (v != current)

There is no go_extinct action: death is automatic via the fitness rule.
Terminal nodes come from (a) dead genomes and (b) hitting max_generation.

Defaults (5 sites, 3 alleles, threshold 2, cap 10) give:
    - 131 alive genomes out of 243
    - 11 actions per alive state (1 replicate + 10 mutations)
    - up to 1310 alive (genome, gen) nodes + dead-state leaves reachable
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from builder.lex import Action, ActionSchema
from builder.state import State


DOMAIN_TAG = "lineage"

REPLICATE = ActionSchema("replicate", (), ())
MUTATE = ActionSchema("mutate", ("site", "allele"), ("int", "int"))


@dataclass(frozen=True)
class LineageRules:
    n_sites: int = 5
    n_alleles: int = 3
    target: Tuple[int, ...] = (0, 0, 0, 0, 0)
    alive_threshold: int = 2
    max_generation: int = 10

    def __post_init__(self) -> None:
        if len(self.target) != self.n_sites:
            raise ValueError("target length must equal n_sites")
        if self.alive_threshold < 0 or self.alive_threshold > self.n_sites:
            raise ValueError("alive_threshold must be in [0, n_sites]")
        for a in self.target:
            if not (0 <= a < self.n_alleles):
                raise ValueError("target alleles must be in [0, n_alleles)")

    # ---- state inspection ----

    def fitness(self, genome: Tuple[int, ...]) -> int:
        return sum(1 for a, b in zip(genome, self.target) if a == b)

    def generation(self, s: State) -> int:
        return s[2]

    def is_dead(self, genome: Tuple[int, ...]) -> bool:
        return self.fitness(genome) < self.alive_threshold

    def is_terminal(self, s: State) -> bool:
        _, genome, gen = s
        if gen >= self.max_generation:
            return True
        return self.is_dead(genome)

    def expr(self, s: State) -> str:
        _, genome, gen = s
        fit = self.fitness(genome)
        tag = "dead" if self.is_dead(genome) else "alive"
        g_str = "".join(str(a) for a in genome)
        return f"gen{gen} {tag} f={fit} [{g_str}]"

    # ---- DAG expansion interface ----

    def seed(self) -> State:
        """Half-match seed: first half of sites agree with target, rest
        disagree. Gives fitness = ceil(n_sites/2), which is above
        threshold and leaves room to improve or degrade."""
        g = list(self.target)
        for i in range((self.n_sites + 1) // 2, self.n_sites):
            g[i] = (self.target[i] + 1) % self.n_alleles
        return (DOMAIN_TAG, tuple(g), 0)

    def valid_actions(self, s: State) -> List[Action]:
        if self.is_terminal(s):
            return []
        _, genome, _ = s
        acts: List[Action] = [Action(REPLICATE, ())]
        for site in range(self.n_sites):
            cur = genome[site]
            for allele in range(self.n_alleles):
                if allele != cur:
                    acts.append(Action(MUTATE, (site, allele)))
        return acts

    def step(self, s: State, a: Action) -> State:
        if self.is_terminal(s):
            raise ValueError("cannot step from a terminal state")
        _, genome, gen = s
        new_gen = gen + 1
        name = a.schema.name
        if name == "replicate":
            return (DOMAIN_TAG, genome, new_gen)
        if name == "mutate":
            site, allele = a.args
            if not (0 <= site < self.n_sites):
                raise ValueError("mutate site out of range")
            if not (0 <= allele < self.n_alleles):
                raise ValueError("mutate allele out of range")
            if allele == genome[site]:
                raise ValueError("mutate is a no-op (same allele)")
            new_genome = genome[:site] + (allele,) + genome[site + 1:]
            return (DOMAIN_TAG, new_genome, new_gen)
        raise ValueError(f"unknown action: {name!r}")
