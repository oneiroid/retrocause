"""Domain state representation.

A State is any hashable tuple the domain defines. Equality and hash go
through the tuple, which is what enables the dedup table in dag.py --
two paths arriving at the same (domain-level) state collapse onto the
same node, turning what would be an expansion tree into a DAG.

Convention: domains should prefix their payload with a short domain tag
string so two domains loaded in the same session cannot collide.
"""
from __future__ import annotations

from typing import Any, Tuple

# Alias rather than a wrapper class: tuples are already hashable and
# cheap, and keeping State as a plain type avoids hiding that fact.
State = Tuple[Any, ...]


def state_key(s: State) -> State:
    """Dedup key. Identity today; a future refinement could canonicalize
    symmetric components (e.g., sort lineage ids) so semantically-equal
    states hash together even when surface-different."""
    return s
