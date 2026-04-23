# Semi-Automatic Visual DAG Builder -- Plan

Handoff document. Read `FORMAL_MODEL_v3.md` first. This file covers only
what the model doesn't: build choices, environment, current state, and
what to do next.

Previous documents superseded: `FORMAL_MODEL_v2.md` (deleted), `INTUITIONS.md`
(archived to `prior_research/INTUITIONS_archived.md`). Do not revive.

---

## 1. Goal

A semi-automatic visual DAG builder: lexicon + rules -> auto-expanded
DAG -> interactive viz. Two domains wired in as §10.3 test fixtures of
the formal model:

- **negotiation** (4 action types): the primary domain, expected to
  produce non-trivial recurring paths once anti-unification exists.
- **lineage** (2 action types): the minimal-alphabet control, expected
  to produce only trivial recurring paths. Kept in-repo as the
  confirming case for v3 §10.3.

Both domains must be runnable with `python cli.py --domain {name}`.
Neither is a "success case" alone -- the point is the comparison.

## 2. Environment

- Project root: `c:/workspace/retrocause/`
- Windows 10, bash. Use `python` (not `python3`). Forward-slash paths.
  ASCII console output only; avoid Unicode special chars.
- No `gh` CLI.

## 3. Current State

Implemented:
- `builder/{state,lex,dag,expand,export,detect}.py` -- single-file
  package, ~750 LOC, passes its test suite.
- `domains/lineage.py` and `domains/negotiation.py` with matching
  `tests/test_lineage.py` and `tests/test_negotiation.py`.
- `cli.py` REPL with commands: info, list, node, expand (all | depth N
  | <id>), prune, label, unlabel, pin, unpin, detect, save.
- `viz/dag.html` -- d3 v7 single-file force viewer consuming
  `viz/dag.json` from `cli.py save`.
- `run_tests.py` -- stdlib-only runner (pytest not required).

What `builder/detect.py` computes:
- **Merge nodes** (formal-model §9.1). High-in-degree nodes with
  predecessors at distinct BFS depth. Honest implementation.
- **Recurring linear paths** (§9.2). Placeholder standing in for
  anti-unification. Dominated by combinatorial noise in
  small-alphabet domains.
- **Parameter contrast** (§9.3). Works as far as the placeholder
  templates go.

## 4. What to Do Next

The next useful step is anti-unification on typed DAGs
(FORMAL_MODEL_v3 §8.3). Until that exists, the template detector is
known to be a placeholder and further work on domains, viz, or
convergence heuristics is decoration.

Concrete sequence:

1. Read `FORMAL_MODEL_v3.md` cover to cover. Note §5.2 (sand-castle
   problem) and §10.3 (small-alphabet precondition) -- both constrain
   what counts as a valid output.
2. Implement anti-unification in `builder/antiunify.py`:
   - type-compatible matching on `Action` labels via the existing
     `ActionSchema` machinery in `builder/lex.py`;
   - a canonicalization for small connected subDAGs so isomorphic
     instances collapse;
   - an MDL-style quality metric (template specificity vs. instance
     coverage).
3. Replace `builder/detect.py::templates` with the anti-unification
   version. Keep the old function as `templates_linear_placeholder` for
   regression comparison.
4. Run the §10.3 experiment: expand negotiation + lineage DAGs of
   comparable node count, run anti-unification on each, compare the
   template distributions. The formal-model prediction is that
   negotiation produces non-trivial templates and lineage does not. If
   both look the same, §10.3 is wrong and the model needs revision
   (not more code).

## 5. Validation Criteria

Numeric thresholds are mostly useless here -- see v2's §6, which could
be hit by any BFS of any rule-driven state space. The real tests:

- Anti-unification on lineage returns templates that collapse to
  trivial combinatorics of {replicate, mutate} sequences.
- Anti-unification on negotiation returns templates whose structure is
  not recoverable from the action-type sequence alone -- e.g., it
  distinguishes "open-counter-counter-accept" shapes with shared offer
  structure from superficially identical shapes with different offer
  dynamics.
- If the second bullet fails, say so and treat it as the finding.

## 6. Anti-Goals

- Do not add a third domain before anti-unification exists. Two
  contrast points are enough; more is decoration without the operator.
- Do not hand-tune domain rules after inspecting output. See v3 §5.2.
- Do not reintroduce predictive reach, persistence depth, story
  boundary, mutual predictive entanglement, or predictive surplus.
  These were deliberately cut in the v2->v3 pass.
- Do not spawn exploration sub-agents for a repo this small.
- Do not leave stale generated JSONs or PNGs around.

## 7. Open Questions (flag but do not resolve pre-implementation)

- Canonicalization cost for anti-unification at sizes above ~6 nodes.
  Graph isomorphism is polynomial for small graphs but the constant
  matters. Fall back to hashing by typed degree sequence if exact
  isomorphism is too slow; flag that it's an approximation.
- MDL metric calibration. The trivial template matches everything and
  the fully-specific template matches only itself. The right tradeoff
  is domain-dependent; pick a default, expose it as a parameter, move
  on.
- Viz for template matches. Current d3 viz has no rendering for
  template membership. Defer until anti-unification output stabilizes.
