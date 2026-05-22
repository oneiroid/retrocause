// Frontier enumerator. Implements §7.8 of FORMAL_MODEL_v2.md (atomic
// frontier Phi only; template frontier Phi_T is deferred until the
// template registry exists), §7.9 metric scaffolding (Pareto helpers),
// and §1.7 derivation_closure for state-update post-processing.
//
// A *state* is a Set<string> of canonical fact atoms: "at(red,woods)",
// "has(red,basket)". Closed-world: absent => false.
// An *L entry* is { name, params:[{name,type}], requires?(b,s):bool,
//                   effects?(b,s):{add:[],remove:[]}, gloss?(b):string }.
// A *scope* is { values:{<type>:[string]}, initial_state:Set<string>,
//                derivations:[Rule] }.
// A *candidate* is { entry, binding:{paramName:value}, expr:string }.

(function attachPhi(root) {
  function cloneState(s) { return new Set(s); }

  function applyDelta(state, delta) {
    const next = cloneState(state);
    for (const f of (delta && delta.add) || []) next.add(f);
    for (const f of (delta && delta.remove) || []) next.delete(f);
    return next;
  }

  function statesEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const f of a) if (!b.has(f)) return false;
    return true;
  }

  // §1.6: pre-state at a convergence node is the union of predecessors'
  // post-states. Set-union; conflict resolution at convergence is OPEN.
  function mergeStates(...states) {
    const out = new Set();
    for (const s of states) for (const f of s) out.add(f);
    return out;
  }

  function* enumerateBindings(params, scope) {
    if (params.length === 0) { yield {}; return; }
    const [head, ...rest] = params;
    const values = (scope.values && scope.values[head.type]) || [];
    for (const v of values) {
      for (const restBinding of enumerateBindings(rest, scope)) {
        yield { [head.name]: v, ...restBinding };
      }
    }
  }

  function canonicalExpr(entry, binding) {
    const args = entry.params.map(p => binding[p.name]).join(",");
    return `${entry.name}(${args})`;
  }

  // Phi(v): atomic frontier per §7.8.
  // downstreamExprs filters out candidates whose materialized node would
  // duplicate a node already downstream of v in the DAG.
  function phi({ lexicon, scope, state, downstreamExprs = new Set() }) {
    const out = [];
    for (const entry of lexicon) {
      for (const binding of enumerateBindings(entry.params, scope)) {
        const expr = canonicalExpr(entry, binding);
        if (downstreamExprs.has(expr)) continue;
        const ok = entry.requires ? !!entry.requires(binding, state) : true;
        if (ok) out.push({ entry, binding, expr });
      }
    }
    return out;
  }

  // Materialize a candidate: returns post-state after effects + closure (§7.8 step 3).
  function step(state, entry, binding, rules = []) {
    const delta = entry.effects ? entry.effects(binding, state) : null;
    const afterEffects = delta ? applyDelta(state, delta) : state;
    return derivationClosure(afterEffects, rules);
  }

  // derivation_closure (§1.7.2): forward-chain rules to fixed point.
  // A Rule is { name, fire: (state) => {add:[],remove:[]}|null }.
  // Stratification (§1.7.5) is the rule library's responsibility, not enforced here.
  function derivationClosure(state, rules) {
    let current = state;
    let safety = 0;
    const MAX_ITER = 256;
    while (safety < MAX_ITER) {
      safety += 1;
      let changed = false;
      for (const rule of rules) {
        const delta = rule.fire(current);
        if (!delta) continue;
        if (!(delta.add && delta.add.length) && !(delta.remove && delta.remove.length)) continue;
        const next = applyDelta(current, delta);
        if (!statesEqual(next, current)) {
          current = next;
          changed = true;
        }
      }
      if (!changed) return current;
    }
    throw new Error("derivation_closure exceeded MAX_ITER; check rule stratification");
  }

  // §7.9 metrics. Each takes a candidate and returns a number.
  function specificity(candidate) {
    const total = candidate.entry.params.length;
    if (total === 0) return 1;
    const bound = Object.values(candidate.binding).filter(v => typeof v === "string" && v.length).length;
    return bound / total;
  }

  function contrastVsCanonical(candidate, canonicalCandidate) {
    if (!canonicalCandidate) return Infinity;
    if (candidate.entry.name !== canonicalCandidate.entry.name) {
      // template-incompatible: fall back to a coarse edit-distance-ish proxy
      return Math.max(candidate.expr.length, canonicalCandidate.expr.length);
    }
    let diff = 0;
    for (const p of candidate.entry.params) {
      if (candidate.binding[p.name] !== canonicalCandidate.binding[p.name]) diff += 1;
    }
    return diff;
  }

  // Pareto frontier over numeric score vectors (higher is better; pass
  // negated values for "lower is better" axes like convergence_proximity).
  function paretoFront(items, scoreFn) {
    const scored = items.map(item => ({ item, scores: scoreFn(item) }));
    return scored
      .filter(a => !scored.some(b => b !== a && dominates(b.scores, a.scores)))
      .map(x => x.item);
  }

  function dominates(a, b) {
    let strictly = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return false;
      if (a[i] > b[i]) strictly = true;
    }
    return strictly;
  }

  const api = {
    phi, step, derivationClosure, applyDelta, cloneState, canonicalExpr,
    enumerateBindings, statesEqual, mergeStates,
    specificity, contrastVsCanonical, paretoFront, dominates,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RetrocausePhi = api;
})(typeof window !== "undefined" ? window : globalThis);
