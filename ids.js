// Content-addressed ids and canonical serialization (LOCAL_LLM.md §3).
//
// The problem: every id in this codebase used to be minted from
// `Date.now()` + `Math.random()`, and every export stamped `savedAt`. Two
// runs of a perfectly deterministic grower therefore produced JSON that
// differed on every single node id — which makes "did this run reproduce?"
// an unanswerable question. Fix that here, before any model is involved.
//
// An id is derived from what the node IS (the parent it was created under,
// its content, its label), not from when it was made. Reproducibility then
// has a definition you can assert:
//
//     canonicalJson(runA) === canonicalJson(runB)     byte for byte
//
// This module is a LEAF: it requires nothing. That is deliberate — the
// engine needs it to mint branch ids and merge_predicate.js needs it for the
// content key, so anything it required back would close a require cycle.
// `normalizedContent` lives here rather than in merge_predicate.js for
// exactly that reason; merge_predicate.js re-exports it as
// `defaultContentKey`, so there is still only one definition.

(function attachIds(root) {
  // FNV-1a, 32-bit, run twice with different offset bases and concatenated.
  // Two near-independent 32-bit passes give ~64 bits of collision resistance
  // for the pair, which is ample for graphs of thousands of nodes, and it
  // needs no `node:crypto` (unavailable in the browser half of the dual-mode
  // convention) and no dependency.
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET_BASIS = 0x811c9dc5;   // the standard basis
  const FNV_SECOND_BASIS = 0x7fffffff;   // any other constant; makes pass 2 independent
  const HEX_PER_PASS = 8;                // 32 bits = 8 hex chars
  const RADIX_HEX = 16;

  function fnv1a(text, basis) {
    let hash = basis;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      // >>> 0 keeps the value an unsigned 32-bit int; Math.imul does the
      // multiply in 32-bit space so it cannot drift into float territory.
      hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
  }

  function shortHash(text) {
    const input = String(text);
    const a = fnv1a(input, FNV_OFFSET_BASIS).toString(RADIX_HEX).padStart(HEX_PER_PASS, "0");
    const b = fnv1a(input, FNV_SECOND_BASIS).toString(RADIX_HEX).padStart(HEX_PER_PASS, "0");
    return a + b;
  }

  // The single definition of "what is true here", used by BOTH the id hash
  // and the merge decision (merge_predicate.js). Two copies that drifted
  // apart would mean nodes that merge but hash differently.
  //
  // Deliberately dumb: trim, collapse internal whitespace, lowercase.
  // Anything semantic belongs in the `contentKey` that `sameInContext`
  // already accepts as a parameter — not in an id.
  function normalizedContent(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/\s+/g, " ");
  }

  // `taken` may be a Set, an array of ids, a graph, or a predicate function.
  // Normalizing it here keeps every call site honest about collisions without
  // forcing one representation on all of them.
  function asTakenPredicate(taken) {
    if (!taken) return () => false;
    if (typeof taken === "function") return taken;
    if (taken instanceof Set) return (id) => taken.has(id);
    if (Array.isArray(taken)) return (id) => taken.includes(id);
    if (taken.nodes || taken.edges) {
      return (id) => (taken.nodes || []).some((n) => n.id === id)
        || (taken.edges || []).some((e) => e.id === id);
    }
    return () => false;
  }

  // Collisions get a deterministic numeric suffix — `_2`, `_3` — rather than
  // the old `do…while` random retry. A retry that draws a fresh random id is
  // exactly the nondeterminism this module exists to remove.
  const FIRST_COLLISION_SUFFIX = 2;

  function disambiguate(candidate, taken) {
    const isTaken = asTakenPredicate(taken);
    if (!isTaken(candidate)) return candidate;
    let suffix = FIRST_COLLISION_SUFFIX;
    while (isTaken(`${candidate}_${suffix}`)) suffix += 1;
    return `${candidate}_${suffix}`;
  }

  // A node's id is a birth certificate: it hashes the parent it was CREATED
  // UNDER, not its live set of parents. A later `rejoins` edge adds a second
  // parent without rehashing.
  //
  // Pass the RESOLVED fields — the ones after defaults have been applied —
  // or two nodes that render identically will hash differently.
  function nodeId({ parentId, expr, label } = {}, taken) {
    const material = [
      String(parentId == null ? "" : parentId),
      normalizedContent(expr),
      normalizedContent(label)
    ].join("|");
    return disambiguate(`n_${shortHash(material)}`, taken);
  }

  // Extends the `e_${from}_${to}_${type}` scheme the `edge()` factory in
  // seeds.js already uses — the only content-derived id scheme that predates
  // this module. Its known weakness is that it collides on parallel same-type
  // edges between the same pair, which `disambiguate` resolves in a fixed
  // order rather than by inventing a second scheme.
  function edgeId({ from, to, type } = {}, taken) {
    return disambiguate(`e_${from}_${to}_${type || "edge"}`, taken);
  }

  // ── canonical serialization ────────────────────────────────────────────
  //
  // A separate concern from ids and equally required: identical content must
  // serialize to identical bytes. Nodes and edges sorted by id, keys emitted
  // in a declared order, and `meta.savedAt` omitted entirely — a wall-clock
  // stamp is provenance, and provenance belongs in the run manifest where it
  // does not contaminate the content being compared.
  //
  // Keys not named below are emitted after the declared ones, sorted. That
  // matters: canonicalization must never silently DROP data, or a diff of two
  // canonical forms stops being a diff of two graphs.
  const NODE_KEY_ORDER = ["id", "label", "kind", "expr", "state", "tags", "delta", "invariants", "createdBy", "runId"];
  const EDGE_KEY_ORDER = ["id", "from", "to", "type", "label", "branchId"];
  const META_KEY_ORDER = ["title", "summary", "version"];
  const GRAPH_KEY_ORDER = ["meta", "root", "nodes", "edges"];
  const OMITTED_META_KEYS = ["savedAt"];
  const JSON_INDENT = 2;

  function orderKeys(object, declared, omitted = []) {
    const source = object || {};
    const rest = Object.keys(source)
      .filter((key) => !declared.includes(key) && !omitted.includes(key))
      .sort();
    const ordered = {};
    declared.concat(rest).forEach((key) => {
      if (key in source && !omitted.includes(key)) ordered[key] = source[key];
    });
    return ordered;
  }

  function byId(a, b) {
    return String(a.id).localeCompare(String(b.id));
  }

  function canonicalGraph(graph) {
    const source = graph || {};
    const canonical = orderKeys(source, GRAPH_KEY_ORDER);
    canonical.meta = orderKeys(source.meta, META_KEY_ORDER, OMITTED_META_KEYS);
    canonical.nodes = (source.nodes || []).map((node) => orderKeys(node, NODE_KEY_ORDER)).sort(byId);
    canonical.edges = (source.edges || []).map((edge) => orderKeys(edge, EDGE_KEY_ORDER)).sort(byId);
    return canonical;
  }

  function canonicalJson(graph) {
    return JSON.stringify(canonicalGraph(graph), null, JSON_INDENT);
  }

  const api = { shortHash, normalizedContent, nodeId, edgeId, canonicalGraph, canonicalJson };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagIds = api;
})(typeof window !== "undefined" ? window : globalThis);
