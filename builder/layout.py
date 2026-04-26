"""Layered DAG layout.

Assigns each node an (x, y) in abstract units:
    y = node.generation                    (one "layer" per generation)
    x = layer-local slot after crossing-reduction sweeps

Algorithm is the standard barycentric heuristic from Sugiyama-style
drawings: for a number of iterations, sweep layers top-down (order by
mean x of predecessors) and then bottom-up (by mean x of successors),
respacing each layer's nodes to integer slots after each pass.

Output units are abstract: x is in "slots" (1 unit per node in the
widest layer at worst), y is in "generations." The viewer picks px
scales.

This replaces the viewer's live d3-force simulation entirely for the
DAG case -- force-directed is the wrong shape when we already know
the layering.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, Tuple

from builder.dag import DAG, NodeId


def compute_layout(
    dag: DAG, iterations: int = 6
) -> Dict[NodeId, Tuple[float, float]]:
    if not dag.nodes:
        return {}

    # ---- 1. bucket nodes by generation (the layer) ----
    layers: Dict[int, list] = defaultdict(list)
    for nid, node in dag.nodes.items():
        layers[node.generation].append(nid)
    gens = sorted(layers.keys())

    # Stable initial order -- insertion order within the layer. Fix it so
    # the sort-key lambdas below see a deterministic starting point.
    for g in gens:
        layers[g].sort()

    # ---- 2. initial x: evenly spaced per layer, centered on 0 ----
    x: Dict[NodeId, float] = {}
    for g in gens:
        row = layers[g]
        n = len(row)
        for i, nid in enumerate(row):
            x[nid] = float(i) - (n - 1) / 2.0

    def respace(row: list) -> None:
        n = len(row)
        for i, nid in enumerate(row):
            x[nid] = float(i) - (n - 1) / 2.0

    def bary_down(nid: NodeId) -> float:
        preds = dag.predecessors(nid)
        if not preds:
            return x[nid]
        return sum(x[p] for p in preds) / len(preds)

    def bary_up(nid: NodeId) -> float:
        succs = dag.successors(nid)
        if not succs:
            return x[nid]
        return sum(x[s] for s in succs) / len(succs)

    # ---- 3. alternate sweeps to reduce crossings ----
    for _ in range(iterations):
        # Top-down: later layers follow their parents.
        for g in gens[1:]:
            row = layers[g]
            row.sort(key=lambda n: (bary_down(n), n))
            respace(row)
        # Bottom-up: earlier layers follow their children.
        for g in reversed(gens[:-1]):
            row = layers[g]
            row.sort(key=lambda n: (bary_up(n), n))
            respace(row)

    # ---- 4. emit coords ----
    return {
        nid: (x[nid], float(dag.nodes[nid].generation))
        for nid in dag.nodes
    }
