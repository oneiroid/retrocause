"""Action lexicon.

An ActionSchema names one kind of action in a domain along with its
parameter names and types. An Action binds a schema to specific
argument values; it is what labels edges in the DAG.

This is deliberately lightweight -- no dispatch, no execution. The
domain's rules module (e.g. domains/lineage.py) maps an Action back to
a successor state.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Tuple


@dataclass(frozen=True)
class ActionSchema:
    name: str
    param_names: Tuple[str, ...]
    param_types: Tuple[str, ...]

    def __post_init__(self) -> None:
        if len(self.param_names) != len(self.param_types):
            raise ValueError(
                f"ActionSchema {self.name!r}: param_names and param_types "
                f"must have equal length"
            )

    def signature(self) -> str:
        ps = ", ".join(
            f"{n}:{t}" for n, t in zip(self.param_names, self.param_types)
        )
        return f"{self.name}({ps})"


@dataclass(frozen=True)
class Action:
    schema: ActionSchema
    args: Tuple[Any, ...]

    def __post_init__(self) -> None:
        if len(self.args) != len(self.schema.param_names):
            raise ValueError(
                f"Action {self.schema.name!r}: expected "
                f"{len(self.schema.param_names)} args, got {len(self.args)}"
            )

    def label(self) -> str:
        if not self.args:
            return self.schema.name
        return f"{self.schema.name}({','.join(str(a) for a in self.args)})"

    def action_type(self) -> str:
        """Parameter-stripped label. Used by template detectors that
        want to treat mutate(L1,2) and mutate(L1,5) as the same."""
        return self.schema.name
