# Section 10.3: Result

A single result, recorded so future passes do not re-derive it. Reads
against `FORMAL_MODEL_v3.md` (which states the prediction) and
`DAG_BUILDER_PLAN.md` (which gates what counts as on-plan work).

## 1. The prediction

`FORMAL_MODEL_v3` §10.3 states that a domain with k > 4 action types
should produce non-trivial anti-unified templates, while a domain with
k = 2 should not. The reasoning:

- With a small alphabet, *every* long path through the DAG is forced
  into one of a handful of action-type sequences by combinatorics. Any
  "template" detected at the type-sequence level is a tautology of the
  alphabet.
- With a larger alphabet, recurrences require alignment beyond the
  bare type sequence -- specifically, alignment of *which arguments
  link to which other arguments*. That alignment is structure, not
  combinatorics.

Until anti-unification existed in code, this was a prediction the
project could not test. It has now been tested.

## 2. What was needed

`builder/antiunify.py` -- linear-path anti-unifier:

- **Constants**: argument positions whose value is the same in every
  instance.
- **Linked slots**: argument positions whose per-instance value
  vectors are identical. Two positions become the same slot iff they
  vary together. This is the operator the placeholder detector
  (`templates_linear_placeholder`) cannot do.
- **MDL score** `bits_saved = (n - 1) * total_args - n * n_slots`.
  Positive when the template compresses; negative or zero when every
  argument is independent (the trivial case).

`experiment_section_10_3.py` runs the comparison.

## 3. The result

Linear paths of length 3, expansion depths chosen to bring the two
DAGs to roughly comparable sizes:

    domain        nodes  n_nontrivial  max bits_saved
    -----------   -----  ------------  --------------
    lineage         186             0              -2
    negotiation      96             6           +1274

A second run at default parameters (lineage 373 nodes, negotiation 40
nodes) gave the same qualitative shape: lineage 0 / 0, negotiation 6 /
+42. The contrast is not an artifact of one parameter setting.

The prediction holds on this evidence.

## 4. What the top negotiation template shows

    counter(?0:str, ?1:int) -> counter(?2:str, ?3:int) -> counter(?0:str, ?4:int)
    count = 1280   bits_saved = +1274

Slot `?0` appears at position 1 and again at position 3. Across all
1280 instances of this three-counter chain, the actor of the third
counter equals the actor of the first counter. This is the domain's
actor-alternation rule (a counter must come from the *other* actor;
two alternations bring you back to the same actor) showing up as a
structural link, not as a hand-coded constraint.

The placeholder detector cannot represent this. It would group the
same 1280 instances under the bare key `(counter, counter, counter)`
alongside any other three-counter chain, regardless of whether the
actors line up.

## 5. What this result does not say

- It does not show that `§8.3` is solved in general. The
  implementation handles linear paths. Branching subDAGs -- the
  general case `§8.3` names -- are out of scope here.
- It does not give the `bits_saved` scale absolute meaning.
  Comparisons within a single run are fine; comparisons across runs
  with different DAG sizes are not. Read ranks and signs, not
  magnitudes.
- It does not show that lineage has "no structure." It shows that
  lineage has no structure that *this* anti-unifier rewards at
  *this* path length. Longer paths or genome-level invariants may
  surface something the current operator misses.
- It does not calibrate the `k > 4` precondition. Two data points
  cannot pin down a threshold. The result is consistent with the
  prediction; it does not locate where the boundary actually sits.

## 6. To reproduce

    python experiment_section_10_3.py
    python experiment_section_10_3.py --neg-value-max 4 --neg-max-turn 7 \
        --levels-neg 7 --lineage-max-gen 3 --levels-lineage 3

The first command runs at defaults. The second is the comparable-size
configuration whose numbers appear in §3.

## 7. Followups, in priority order

1. **Branching-subDAG anti-unification.** The general `§8.3` operator.
   The public surface in `builder/antiunify.py` (`AntiUnifiedHit`,
   `score_template`) was kept narrow enough to absorb this without a
   rewrite of callers, but the algorithm changes -- canonicalization
   on a graph rather than a sequence. Worth doing only if a concrete
   question requires it.

2. **Path-length sweep on negotiation.** Does `bits_saved` per
   template stabilize, grow, or fall as path length goes from 3 to
   5 to 7? Cheap; tells us whether the linear-path operator hits a
   ceiling.

3. **Re-examination of "linear paths are enough."** If the linear case
   turns out to capture most of what §8.3 cares about for these
   domains, that itself is a finding -- the rest of §8.3 may be less
   load-bearing than it reads.

Followups explicitly *not* on this list, per
`DAG_BUILDER_PLAN.md` §6:

- Adding a third domain. (RPS exists in-tree; it is not part of this
  result and was not consulted in producing it.)
- Tuning lineage or negotiation parameters until the contrast "looks
  more interesting." See `FORMAL_MODEL_v3` §5.2.
- Visualization features for templates. The finding is in the table
  in §3, not in a graph render.

## 8. Files

    builder/antiunify.py             operator + MDL score
    builder/detect.py                templates() -> anti-unified
                                     templates_linear_placeholder() -> prior
    experiment_section_10_3.py       reproducer for the table in §3
    tests/test_antiunify.py          10 tests: const detection, link
                                     detection, MDL ordering,
                                     determinism, cross-domain contrast
