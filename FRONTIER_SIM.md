# Frontier Simulation — measuring the size of the frontier

The project's founding question is **"how big is the frontier?"** — how many
*meaningful* continuations does a story-state have (INTUITIONS §9, the
deemed-possible cone, tagged `open`). This document records how that question
got an operational answer, and the honest limits of that answer.

## The answer in one line

**Run the auto-branch + auto-merge engine as a simulation.** The number of
meaningful continuations at a world = the count of **distinct post-states**
(auto-merge's collapse-by-`stateKey`) reachable by **one action** (phi.js
`phi()` enumeration over a typed lexicon). Auto-merge's collapse-by-*world* is
what makes the count "meaningful" — distinct futures, not distinct
action-labels.

## How we got here (the chain)

1. **The opening "bug" was the instrument.** Auto-merge collapses continuations
   by *state*, not label. A node that looked like a duplicate was the engine
   correctly keeping two state-distinct continuations apart. That collapse is
   the measurement.
2. **A node is a converged world, not a move.** Merge is a *quotient* (identify
   equivalent worlds in place), not a downstream join. "Counting continuations"
   means counting **distinct next-worlds**.
3. **The worked epics were descriptive** — the cone/frontier machinery was never
   *run* on them. Drawing a DAG is not operating the instrument.
4. **The sand-castle problem governs (§8).** Structure found in a hand-drawn
   graph proves nothing — you recover what you embedded.
5. **A hand-built cone confirms this from the bad side.** A two-arm encoding made
   the cone "find" a waist that was a consequence of the two arms *I drew*.
   Predicted in advance — formalizer, not discoverer.
6. **The cone is degenerate on a single world-path.** Width 1 everywhere, every
   node a "waist," every edge criticality 1. The possibility-cone apparatus is
   about the space of *possible* paths; a realized world-line has trivial
   topology.
7. **So the content lives in the frontier and the state, not the path.** What's
   interesting is that a thread passes through *wide frontiers* by *narrow,
   improbable gates*; and derivation closure (dramatic irony) fires on a single
   node with no branching.
8. **Keystone: you must *generate* the cone, not draw it — auto-branch +
   auto-merge is that generator.** Run to depth N from the root and you get a
   *derived* possibility cone where cone.js regains signal, and the realized
   path is one thread through it.
9. **Why a *simulation*:** frontier width is not statically readable; it must be
   *unrolled* from the lexicon by repeated enumerate→merge. The meaningful count
   is an **emergent quantity of running the engine forward**.
10. **The honest cost:** the sand-castle does not vanish — it *relocates* from
    un-auditable graph topology to a **finite, inspectable typed lexicon**. The
    frontier number is real but **lexicon-relative**: §9 *operationalized*, not
    closed.

## The method

- `phi.js phi({lexicon, scope, state})` — enumerate every entry whose `requires`
  holds: the raw frontier.
- `phi.js step()` — apply a candidate's effects + derivation closure: its
  post-world.
- **Meaningful frontier width** = distinct `stateKey`s among the effectful
  candidates (drop non-effectful; merge same-world). This is auto-branch +
  auto-merge at one node.
- `frontier_sim.js simulate()` — unroll this outward from `scope.initial_state`,
  **globally** keyed by `stateKey` so two paths to the same world share a node.
  Output is a cone.js-compatible graph (the *derived* possibility cone).
- `cone.js` — run support / rim / width-profile / waists / Menger / criticality
  on the derived cone.

## First worked case — Master and Margarita, the Torgsin scene

Files: `torgsin_fixture.js` (typed lexicon), `seeds.js` `torgsin` (the realized
single world-path).

**Confirmed model** (with a reader who knows the book): Ω = the collective
Soviet self-lie cracking — markers `facade_exposed` (the crack) and
`on_fire(store)` (the fire). The foreigner's unmasking is a *side detail*. The
mechanism: **Koroviev's speech does not cause the eruption — it suspends the
self-policing norm** (`norm_intact` → `norm_suspended`), which *opens* the
frontier. The four social-eruption entries (`erupt_truth`, `loot`, `lynch`,
`restore_order`) require `norm_suspended`; `incite` produces it.

### Result 1 — frontier census along the realized path

Width stays **1–2 through the procedural escalation, spikes to 6 the instant the
speech lands**, then settles ~5. The realized edge (the meek old man's
`erupt_truth` — "Pravda!") is **one narrow gate among six**; the others
(loot / lynch / restore_order / ignite / police) are the latent collective
Bulgakov leaves implicit. *The census and the scene's theme are the same
operation:* enumerating what is latent under the cracked facade **is** the
exposure.

### Result 2 — the derived possibility cone

`frontier_sim.js` unrolls **298 worlds, 589 transitions**. The cone *breathes*:

```
level:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14
width:  1  1  1  2  2  3  8 23 47 66 66 47 23  7  1
```

cone.js on the derived graph (Ω = terminal `gone(thieves)` worlds):

- **One structural waist: the procedural escalation** (levels 1, 2, 4 —
  `norm_intact`, pre-speech). Located by cone *from the enumeration*, not drawn.
- **Menger width = 1.** Despite ballooning to 66 wide, there is exactly **one
  vertex-disjoint channel** to the ending: the post-crack explosion of
  possibility creates no independent *routes* to Ω. The freedom is in the
  *middle* (which partial-exposure world you pass through), not in the route.
- **Rim = 0**: every world can still reach the fire (re-sealing branches can
  re-incite), so nothing fizzles — and the rim test is therefore uninformative
  here (a limitation of this lexicon, not a finding).
- The balloon is the **lattice of partial exposures** — every consistent subset
  of {looted, lynched, erupted, sealed, burning, police} — and the realized
  path is one chain up through it.

## Honest grade

This is a **formalizer/checker, not yet a discoverer.** The census spike's
*location* and the cone's neck are both consequences of one reader-confirmed,
auditable precondition (the norm-gate), so the numbers (6, the width profile)
are **lexicon-relative**. But unlike the *silent* cone-on-a-path and the
discarded *sand-castle* two-arm graph, this is honest (assumptions in inspectable
`requires` clauses) **and** non-trivial (real, breathing width structure on a
single world-path). It is the first end-to-end operational handle on §9.

It becomes genuinely **generative** when a spike or waist lands somewhere we did
**not** predict — which is the next test: vary the lexicon / Ω and check whether
the structure is robust or an artifact.

## How to run

```bash
# Frontier census along the realized path, and the derived-cone analysis:
#   (see the node -e runners in the project history; frontier_sim.simulate
#    returns a cone.js-compatible graph)
node -e 'const S=require("./frontier_sim"),C=require("./cone"),F=require("./torgsin_fixture");
const {graph,info}=S.simulate({lexicon:F.lexicon,scope:F.scope,isTerminal:s=>s.has("gone(thieves)")});
const omega=graph.nodes.map(n=>n.id).filter(id=>info.get(id).terminal);
console.log(C.widthProfile(graph,omega).map(p=>p.width).join(" "));'
```

## Status

`partial` (was `open`). The closure is implemented and runs on an internal
fixture; external validation and lexicon-robustness checks are pending. Promoting
this to `operational` requires showing the frontier structure survives a richer
lexicon and is not an artifact of the singleton-entry encoding.
