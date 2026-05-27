# Retrocause — Branching Narrative DAG Builder

Browser-only D3 lab for editing canonical story DAGs and expanding any state
node into counterfactual branches. Grounded in `FORMAL_MODEL_v2.md`, which
rebases on Lessard & Levison's threaded-DAG formalism
(`prior_research/W13-1408.md`). When code conflicts with the formal model,
the model wins — see `RESEARCH_AND_DESIGN.md` and `INTUITIONS.md` for
philosophical context, `DAG_ILIAD.md` / `DAG_ODYSSEY.md` for worked DAGs.

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
| `state_walker.js` | Topo-replay of canonical edges → per-node post-state |
| `seeds.js` | Visual canonical DAGs (red, magi, …) with optional `action: {entry, binding}` |
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
- **State representation.** A state is `Set<string>` of canonical fact
  atoms like `"at(red,woods)"`, closed-world. Don't add spaces in atoms;
  argument order follows the entry declaration.
- **Section anchors.** When implementing or reviewing formal behavior,
  cite section numbers from `FORMAL_MODEL_v2.md` in code comments — the
  existing code does this (`phi.js` headers, `seeds.js` Magi note, etc.).

## Gotchas

See top-of-file comments in `seeds.js` and `magi_fixture.js` for
non-obvious deviations from `FORMAL_MODEL_v2.md` (parallel-chain layout
in the magi seed, refined `useless_pairing` form). Preserve those
headers if you touch the rules they document.
