"""DAG container.

A Node is minted once per unique state tuple; repeated arrivals at the
same state reuse the existing node (via state_index). That reuse is the
whole reason this is a DAG and not an expansion tree.

Edges are kept in a flat list; out_edges / in_edges store edge indices
into that list so callers can recover both the action label and the
neighbor id from a single lookup.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Set, Tuple


NodeId = int
StateKey = Tuple[Any, ...]


@dataclass
class Node:
    id: NodeId
    expr: str
    state: StateKey
    generation: int
    labels: Set[str] = field(default_factory=set)
    pinned: bool = False
    expanded: bool = False


@dataclass
class Edge:
    from_id: NodeId
    to_id: NodeId
    action_label: str
    action_type: str


class DAG:
    def __init__(self) -> None:
        self.nodes: Dict[NodeId, Node] = {}
        self.edges: List[Edge] = []
        self.state_index: Dict[StateKey, NodeId] = {}
        self.out_edges: Dict[NodeId, List[int]] = defaultdict(list)
        self.in_edges: Dict[NodeId, List[int]] = defaultdict(list)
        self._next_id: NodeId = 0

    def add_or_get_node(
        self, state: StateKey, expr: str, generation: int
    ) -> Tuple[NodeId, bool]:
        """Return (id, created). `created` is True iff a new node was
        minted. If the state already exists, the existing node's expr
        and generation are NOT overwritten -- first writer wins."""
        existing = self.state_index.get(state)
        if existing is not None:
            return existing, False
        nid = self._next_id
        self._next_id += 1
        self.nodes[nid] = Node(
            id=nid, expr=expr, state=state, generation=generation
        )
        self.state_index[state] = nid
        # Touch defaultdict entries so iteration order is stable.
        _ = self.out_edges[nid]
        _ = self.in_edges[nid]
        return nid, True

    def add_edge(
        self,
        from_id: NodeId,
        to_id: NodeId,
        action_label: str,
        action_type: str,
    ) -> int:
        idx = len(self.edges)
        self.edges.append(
            Edge(
                from_id=from_id,
                to_id=to_id,
                action_label=action_label,
                action_type=action_type,
            )
        )
        self.out_edges[from_id].append(idx)
        self.in_edges[to_id].append(idx)
        return idx

    # --- queries ---

    def successors(self, nid: NodeId) -> List[NodeId]:
        return [self.edges[e].to_id for e in self.out_edges[nid]]

    def predecessors(self, nid: NodeId) -> List[NodeId]:
        return [self.edges[e].from_id for e in self.in_edges[nid]]

    def in_degree(self, nid: NodeId) -> int:
        return len(self.in_edges[nid])

    def out_degree(self, nid: NodeId) -> int:
        return len(self.out_edges[nid])

    def frontier(self, rules) -> List[NodeId]:
        """Nodes that haven't been expanded and are not terminal. Order
        is stable (insertion order of the node dict)."""
        return [
            n.id
            for n in self.nodes.values()
            if not n.expanded and not rules.is_terminal(n.state)
        ]

    def prune(self, nid: NodeId) -> Set[NodeId]:
        """Remove `nid` and every descendant that becomes orphaned
        (loses all its predecessors as a consequence). Returns the set
        of removed node ids.

        A descendant with another live parent survives -- this is the
        whole point of pruning in a DAG rather than in a tree.
        """
        if nid not in self.nodes:
            return set()

        # Forward-reachable candidates (including nid itself).
        candidates: Set[NodeId] = set()
        stack = [nid]
        while stack:
            x = stack.pop()
            if x in candidates:
                continue
            candidates.add(x)
            for succ in self.successors(x):
                stack.append(succ)

        # Compute the actual removal set: nid, plus any candidate all of
        # whose predecessors are in the removal set. Iterate to fixed
        # point. O(|candidates|^2) worst case, fine for our scale.
        removed: Set[NodeId] = {nid}
        changed = True
        while changed:
            changed = False
            for c in candidates:
                if c in removed:
                    continue
                preds = self.predecessors(c)
                if preds and all(p in removed for p in preds):
                    removed.add(c)
                    changed = True

        # Rebuild edges list, skipping any edge touching a removed node.
        new_edges: List[Edge] = []
        new_out: Dict[NodeId, List[int]] = defaultdict(list)
        new_in: Dict[NodeId, List[int]] = defaultdict(list)
        for e in self.edges:
            if e.from_id in removed or e.to_id in removed:
                continue
            i = len(new_edges)
            new_edges.append(e)
            new_out[e.from_id].append(i)
            new_in[e.to_id].append(i)
        self.edges = new_edges
        self.out_edges = new_out
        self.in_edges = new_in

        # Drop the nodes (and their state_index entries).
        for r in removed:
            state = self.nodes[r].state
            del self.nodes[r]
            if self.state_index.get(state) == r:
                del self.state_index[state]

        # Ensure adjacency entries exist for surviving nodes.
        for nid2 in self.nodes:
            _ = self.out_edges[nid2]
            _ = self.in_edges[nid2]

        return removed

    def summary(self, rules=None) -> str:
        n_expanded = sum(1 for n in self.nodes.values() if n.expanded)
        n_leaf = sum(1 for nid in self.nodes if self.out_degree(nid) == 0)
        parts = [
            f"nodes={len(self.nodes)}",
            f"edges={len(self.edges)}",
            f"expanded={n_expanded}",
            f"leaves={n_leaf}",
        ]
        if rules is not None:
            n_frontier = len(self.frontier(rules))
            parts.append(f"frontier={n_frontier}")
        return "DAG: " + ", ".join(parts)
