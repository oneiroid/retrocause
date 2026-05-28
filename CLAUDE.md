# Retrocause — Branching Narrative DAG Builder

Browser-only D3 lab for editing canonical actor-thread story DAGs and
expanding any state node into counterfactual branches.

**Doc stack (philosophy-first ordering — read in this order):**

1. `CONCEPT.md` — the project's thesis (narrative-as-substrate) and
   the dependency between layers: intuitions → formalism → code.
2. `INTUITIONS.md` — philosophical core. Each claim tagged
   `operational` / `partial` / `open`.
3. `FORMAL_MODEL.md` — the apparatus the intuitions require. Rebased
   on Lessard & Levison (`prior_research/W13-1408.md`). The v1 model
   is archived at `prior_research/FORMAL_MODEL_v1.md`.
4. `RESEARCH_AND_DESIGN.md` — product spec; defers to FORMAL_MODEL
   for what nodes / edges / state mean.
5. `DAG_ILIAD.md`, `DAG_ODYSSEY.md` — worked DAGs.

**Conflict resolution:** when code conflicts with the formal model, the
model wins. When the formal model and intuitions conflict, the
disagreement is data — flag it in both docs, don't silently absorb
either side. See `CONCEPT.md` §"What each layer commits to".

## Run

- App: open `story_builder.html` directly in a browser (no bundler; loads
  D3 from CDN, reads `seeds.js` / fixtures via `window.*`).
- Tests: `npm test` — syntax-checks every source file via `node --check`,
  then runs `node --test tests/*.test.js`.

## Module map

| File | Role |
|------|------|
| `story_builder.html` / `.css` / `story_builder_app.js` | D3 UI shell |
| `story_builder_engine.js` | Graph ops: add/remove nodes & edges, cycle checks, branch composition |
| `phi.js` | Frontier enumerator (§7.8) + derivation closure (§1.7) + Pareto helpers (§7.9) |
| `state_walker.js` | Topo-replay of canonical actor-thread edges → per-node post-state |
| `seeds.js` | Visual canonical actor-thread DAGs (red, magi, …) with optional `action: {entry, binding}` |
| `red_fixture.js`, `magi_fixture.js` | Typed L-lexicons (Appendices B / C) |
| `tests/*.test.js` | `node --test` unit tests |

## Conventions

- **Dual-mode modules.** Every source file is an IIFE
  `(function attachX(root){ … })(typeof window !== "undefined" ? window : global)`
  so the same file loads via `<script>` in the browser and `require()` in
  Node tests. New modules must follow this pattern.
- **Seeds vs fixtures.** `seeds.js` carries *graph shape*; fixtures carry
  *typed semantics* (entries with `requires` / `effects`). The walker only
  replays `action` annotations on canonical (`type:"causes"`) edges;
  non-canonical edges (choice / rejoins / parallels / foreshadows) are
  visual and contribute no state.
- **Actor threads.** Seeds are not linearized around one protagonist.
  Main characters can follow separate canonical paths, merge into shared
  encounter nodes, and split again. `mainCharacters`, node `actors`, and
  edge `actor` fields document whose agency a branch point represents.
  `actors` means agency/thread ownership, not every participant named in
  `expr`.
  An edge with `actor: "x"` is valid only when its source node's
  `actors` contains `"x"`; Phi/auto materialization and graph validation
  both enforce this.
- **State representation.** A state is `Set<string>` of canonical fact
  atoms like `"at(red,woods)"`, closed-world. Don't add spaces in atoms;
  argument order follows the entry declaration.
- **Section anchors.** When implementing or reviewing formal behavior,
  cite section numbers from `FORMAL_MODEL.md` in code comments — the
  existing code does this (`phi.js` headers, `seeds.js` Magi note, etc.).

## Gotchas

See top-of-file comments in `seeds.js` and `magi_fixture.js` for
non-obvious formal details (actor-thread layout, refined
`useless_pairing` form). Preserve those headers if you touch the rules
they document.
