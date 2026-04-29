"""Anti-unification on linear paths in the typed DAG.

FORMAL_MODEL_v3 §8.3 names anti-unification as the one missing operator:
given concrete subDAGs S_1, ..., S_n, compute the most specific template
A and parameter vectors q_1, ..., q_n such that S_i = A[q_i].

This module implements the linear-path case. A "small connected subDAG"
of length k along a single chain of edges is the simplest case that is
both (a) what the existing detect.py placeholder enumerates, and (b)
enough substrate to test the §10.3 prediction on negotiation vs lineage.
DAG-shaped (branching) anti-unification is a future extension; the
public surface here (LinearTemplate, AntiUnifiedHit, score_template) is
written so the linear case is one specialization, not the whole API.

Design:

  Group paths by (action_type sequence). Within a group, every instance
  has the same schemas at the same positions, so arg-type matching is
  trivial. Per (position, arg_index):

    - If all instances share the same value, the slot is a Constant.
    - Otherwise it is a typed Slot.

  Slots are then linked: two slot positions collapse to the same Slot id
  iff the value vectors across all instances are identical at those two
  positions. Link detection is what separates this from the placeholder
  -- it turns "the same actor counters again" from coincidence into a
  template constraint.

  Slot ids are renamed in canonical traversal order (positions left to
  right; args left to right within position) so the template_key is
  stable regardless of the input ordering of instances.

MDL score (bits_saved):

  Storing N instances independently costs   N * total_args  cells.
  Storing as (template body) + (N bindings) costs
                                 total_args + N * n_slots   cells.
  bits_saved = (N - 1) * total_args - N * n_slots.

  - n_slots == total_args (every arg distinct, no linking, no constants)
    -> bits_saved < 0 (anti-compression: template costs more than the
    raw list). Trivial templates self-disqualify.
  - n_slots small relative to total_args -> high bits_saved. The
    template captured real structure.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple, Union

from builder.dag import DAG, NodeId


# ---------------- template structure ----------------

@dataclass(frozen=True)
class Const:
    value: Any
    type_name: str


@dataclass(frozen=True)
class Slot:
    slot_id: int
    type_name: str


ArgSpec = Union[Const, Slot]


@dataclass(frozen=True)
class PositionTemplate:
    action_type: str
    arg_specs: Tuple[ArgSpec, ...]

    def signature(self) -> str:
        if not self.arg_specs:
            return self.action_type
        parts: List[str] = []
        for spec in self.arg_specs:
            if isinstance(spec, Const):
                parts.append(repr(spec.value))
            else:
                parts.append(f"?{spec.slot_id}:{spec.type_name}")
        return f"{self.action_type}({','.join(parts)})"


@dataclass
class LinearTemplate:
    positions: Tuple[PositionTemplate, ...]
    n_slots: int

    def signature(self) -> str:
        return " -> ".join(p.signature() for p in self.positions)

    def total_args(self) -> int:
        return sum(len(p.arg_specs) for p in self.positions)

    def n_const(self) -> int:
        return sum(
            1
            for p in self.positions
            for s in p.arg_specs
            if isinstance(s, Const)
        )


@dataclass
class AntiUnifiedHit:
    template: LinearTemplate
    # Each instance: tuple of node ids along the path (length size+1).
    instances: List[Tuple[NodeId, ...]] = field(default_factory=list)
    # Each instance: the slot binding vector (length n_slots).
    bindings: List[Tuple[Any, ...]] = field(default_factory=list)
    bits_saved: float = 0.0

    @property
    def count(self) -> int:
        return len(self.instances)


# ---------------- core anti-unifier ----------------

def _type_name(v: Any) -> str:
    return type(v).__name__


def anti_unify_paths(
    type_seq: Tuple[str, ...],
    instances: List[Tuple[NodeId, ...]],
    arg_seqs: List[Tuple[Tuple[Any, ...], ...]],
) -> LinearTemplate:
    """Given paths sharing `type_seq` (action types per edge) and their
    per-edge arg tuples, build the most specific LinearTemplate.

    instances and arg_seqs are parallel lists (same length, same order).
    arg_seqs[i] is a tuple-of-tuples: outer index = edge position,
    inner = argument index at that position.
    """
    if not instances:
        raise ValueError("need at least one instance")
    n = len(instances)
    size = len(type_seq)

    # Sanity: every instance has `size` edges, and arg counts per
    # position agree. Action types are guaranteed by grouping in the
    # caller, so schemas (and thus arg counts) match.
    for ai in arg_seqs:
        if len(ai) != size:
            raise ValueError("arg_seq length does not match type_seq")

    # Per-position arg width. Read from first instance; equal across
    # instances by schema identity.
    arg_widths = tuple(len(arg_seqs[0][p]) for p in range(size))
    for ai in arg_seqs[1:]:
        for p in range(size):
            if len(ai[p]) != arg_widths[p]:
                raise ValueError(
                    f"arg-count mismatch at position {p}: schemas should "
                    f"have made this impossible"
                )

    # Collect per-(pos, arg) value vector across all instances. Index
    # the (pos, arg) pairs in canonical order.
    keys: List[Tuple[int, int]] = [
        (p, a) for p in range(size) for a in range(arg_widths[p])
    ]
    value_vectors: Dict[Tuple[int, int], Tuple[Any, ...]] = {}
    for k in keys:
        p, a = k
        value_vectors[k] = tuple(arg_seqs[i][p][a] for i in range(n))

    # A position is Const iff all values agree. Otherwise it goes into
    # the slot pool.
    is_const: Dict[Tuple[int, int], bool] = {}
    const_value: Dict[Tuple[int, int], Any] = {}
    for k, vec in value_vectors.items():
        if all(v == vec[0] for v in vec):
            is_const[k] = True
            const_value[k] = vec[0]
        else:
            is_const[k] = False

    # Link detection on the non-const positions: two positions share a
    # slot iff their value vectors are identical. Assign slot ids in
    # canonical traversal order (the order of `keys`).
    slot_id_of: Dict[Tuple[int, int], int] = {}
    vec_to_slot: Dict[Tuple[Any, ...], int] = {}
    next_slot = 0
    for k in keys:
        if is_const[k]:
            continue
        vec = value_vectors[k]
        if vec in vec_to_slot:
            slot_id_of[k] = vec_to_slot[vec]
        else:
            vec_to_slot[vec] = next_slot
            slot_id_of[k] = next_slot
            next_slot += 1

    # Build PositionTemplates. Type names come from the first instance's
    # values; type-stable across instances by schema.
    sample_args = arg_seqs[0]
    positions: List[PositionTemplate] = []
    for p in range(size):
        specs: List[ArgSpec] = []
        for a in range(arg_widths[p]):
            k = (p, a)
            t_name = _type_name(sample_args[p][a])
            if is_const[k]:
                specs.append(Const(value=const_value[k], type_name=t_name))
            else:
                specs.append(Slot(slot_id=slot_id_of[k], type_name=t_name))
        positions.append(
            PositionTemplate(action_type=type_seq[p], arg_specs=tuple(specs))
        )

    return LinearTemplate(positions=tuple(positions), n_slots=next_slot)


def _binding_for_instance(
    template: LinearTemplate,
    arg_seq: Tuple[Tuple[Any, ...], ...],
) -> Tuple[Any, ...]:
    """Read the slot values out of one instance, in slot-id order. Slots
    that appear at multiple positions are read once at first occurrence
    (which is canonical because slot ids are assigned in traversal
    order)."""
    out: List[Any] = [None] * template.n_slots
    seen = [False] * template.n_slots
    for p, pos in enumerate(template.positions):
        for a, spec in enumerate(pos.arg_specs):
            if isinstance(spec, Slot) and not seen[spec.slot_id]:
                out[spec.slot_id] = arg_seq[p][a]
                seen[spec.slot_id] = True
    return tuple(out)


def score_template(template: LinearTemplate, n_instances: int) -> float:
    """Bits saved by representing n_instances as (template + bindings)
    rather than as independent concrete paths. See module docstring for
    the formula and the n_slots == total_args anti-compression case."""
    total = template.total_args()
    return (n_instances - 1) * total - n_instances * template.n_slots


# ---------------- DAG-level enumeration ----------------

def _enumerate_paths(
    dag: DAG, size: int
) -> Dict[
    Tuple[str, ...],
    Tuple[
        List[Tuple[NodeId, ...]],
        List[Tuple[Tuple[Any, ...], ...]],
    ],
]:
    """Walk the DAG, collecting linear paths of exactly `size` edges,
    grouped by their action-type sequence. Returns
        type_seq -> ([instance_node_tuples], [instance_arg_seqs]).
    """
    out: Dict[
        Tuple[str, ...],
        Tuple[List[Tuple[NodeId, ...]], List[Tuple[Tuple[Any, ...], ...]]],
    ] = defaultdict(lambda: ([], []))

    def walk(
        nodes: Tuple[NodeId, ...],
        types: Tuple[str, ...],
        args: Tuple[Tuple[Any, ...], ...],
    ) -> None:
        if len(types) == size:
            buckets = out[types]
            buckets[0].append(nodes)
            buckets[1].append(args)
            return
        last = nodes[-1]
        for eidx in dag.out_edges[last]:
            e = dag.edges[eidx]
            walk(
                nodes + (e.to_id,),
                types + (e.action_type,),
                args + (tuple(e.action_args),),
            )

    for nid in dag.nodes:
        walk((nid,), (), ())

    return out


def antiunify_templates(
    dag: DAG,
    size: int = 3,
    top_k: int = 10,
    min_instances: int = 2,
) -> List[AntiUnifiedHit]:
    """Top-`top_k` anti-unified linear templates of `size` edges.

    Templates with fewer than `min_instances` instances are dropped (no
    recurrence). Sorted by bits_saved descending, then by count, then
    by signature for determinism.
    """
    if size < 1:
        raise ValueError("template size must be >= 1")

    grouped = _enumerate_paths(dag, size)

    hits: List[AntiUnifiedHit] = []
    for type_seq, (node_tuples, arg_seqs) in grouped.items():
        if len(node_tuples) < min_instances:
            continue
        template = anti_unify_paths(type_seq, node_tuples, arg_seqs)
        bindings = [_binding_for_instance(template, ai) for ai in arg_seqs]
        hits.append(
            AntiUnifiedHit(
                template=template,
                instances=node_tuples,
                bindings=bindings,
                bits_saved=score_template(template, len(node_tuples)),
            )
        )

    hits.sort(
        key=lambda h: (-h.bits_saved, -h.count, h.template.signature())
    )
    return hits[:top_k]


# ---------------- comparison report ----------------

def template_distribution_summary(hits: List[AntiUnifiedHit]) -> Dict[str, Any]:
    """Compact summary for §10.3 cross-domain comparison. The point is
    not the absolute numbers (a sand-castle problem -- §5.2) but the
    contrast between two domains run with the same parameters."""
    if not hits:
        return {
            "n_templates": 0,
            "trivial_only": True,
            "max_bits_saved": 0.0,
            "max_n_slots": 0,
            "max_const": 0,
            "best": None,
        }
    best = hits[0]
    n_nontrivial = sum(1 for h in hits if h.bits_saved > 0)
    return {
        "n_templates": len(hits),
        "n_nontrivial": n_nontrivial,
        "trivial_only": n_nontrivial == 0,
        "max_bits_saved": max(h.bits_saved for h in hits),
        "max_n_const": max(h.template.n_const() for h in hits),
        "min_n_slots": min(h.template.n_slots for h in hits),
        "best": {
            "signature": best.template.signature(),
            "count": best.count,
            "bits_saved": best.bits_saved,
            "n_slots": best.template.n_slots,
            "n_const": best.template.n_const(),
        },
    }
