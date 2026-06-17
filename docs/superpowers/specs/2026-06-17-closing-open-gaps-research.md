# Closing the two open gaps: Ω and the capability↔influence bridge

**Date:** 2026-06-17
**Status:** research synthesis + hypotheses. Everything here is `open` or
`partial`; nothing is promoted to `operational`.
**Backs:** FORMAL_MODEL §8.3 (revised by this pass), INTUITIONS claim 9 / Open-Q 9.
**Method:** 5 parallel literature probes (absorbing chains / attractor theory /
max-caliber / least-action; flow-centrality / Menger / vitality; institutional
economics; Price-equation; active-inference / empowerment). Findings
cross-corroborated; one of my two candidates was refuted (see Gap 1).

---

## Gap 1 — "derive Ω" — REFUTED as stated; closed by reclassification

**My candidate** (FORMAL §8.3.4 v1): Ω = the dominant absorbing class of a
max-entropy forward walk; a fixed point that makes Ω structural.

**Why it fails (three independent verdicts):**

1. **Naming.** "Uniform over enabled out-edges" is *not* the Maximum Entropy
   Random Walk. MERW (Burda–Duda–Łuck–Wacław 2009) maximizes entropy over
   whole *paths* and gives non-uniform, Perron-eigenvector-weighted steps;
   uniform-out only maximizes one-step entropy. The two agree only on regular
   graphs. So the principled-sounding label was wrong.
2. **Reparametrization sensitivity.** On a DAG, argmax-absorption reduces to
   the mode of a `1/outdeg`-weighted source→sink path count — and that
   weighting is topology-dependent: splitting a sink or refactoring one choice
   into nested binaries changes the answer. Ω becomes an artifact of how
   finely the graph was drawn. That is the sand-castle problem (INTUITIONS §8)
   re-entering through the back door.
3. **Deep one: a DAG cannot host an attractor.** Every "telos/attractor from
   dynamics" account needs recurrence + corrective feedback (Milnor basin;
   goal-directedness = negative feedback restoring deviations). A forward
   absorbing walk on a DAG has neither. Calling its terminus an "attractor"
   exports the word while using dynamics structurally incapable of attracting.

**Corroborating context.** In variational physics the endpoint is a *boundary
condition*: Hamilton's principle / Euler–Lagrange fix **both** endpoints
(δq=0 at each end is what makes the derivation valid); the principle is silent
on which endpoint obtains. Feynman's propagator runs between a fixed initial
and fixed final state. Endpoints are *derived* only under genuinely
dissipative/entropic dynamics (2nd law → max-entropy state; free-energy
descent) — which a uniform DAG walk is not. The narrative-AI field agrees from
the other side: branching-story-graph and story-MDP work specify the
destination as a goal/reward **input** (Riedl; reward-shaping for plot gen),
never reads it off a passive walk.

**Resolution — Ω is a boundary condition, not a gap.** The worry "Ω is
author-supplied" was an artifact of lumping Ω with the genuinely-fudged cone
and weights. Now that those are *derived from* Ω (§8.3.2–3), Ω stands revealed
as the lone boundary condition — in the same legitimate class as `initial_state`
and `L`, the problem statement. A boundary condition is not a sand-castle. The
eternal-melody question (why G has *these* termini) is Open-Q1 and is untouched
by this; it was never going to be answered by a graph walk.

**Salvageable, but only as a descriptive author-aid (not "the attractor"):**
a "where storylines structurally converge" metric = unweighted source→sink
**path-count mode** via one topological-order DP sweep (reparametrization-
cleaner than `1/outdeg`; drop the Markov framing — a DAG DP subsumes it).
Always report the **full hitting distribution + its entropy/concentration**,
so a flat plurality is visibly *not* a convergence. Use it to *suggest*
candidate Ω to the author; never to elect one. `open`.

---

## Gap 2 — capability↔influence — framework holds, three corrections

### 2a. Influence = **max-flow vitality** (named; cite; caveats)

`criticality(e) = maxflow(s→Ω) − maxflow(s→Ω \ e)` is **max-flow vitality**,
an instance of the vitality family `V(x)=f(G)−f(G∖x)` (Koschützki et al.,
"Centrality Indices," LNCS 3418, 2005), with an interdiction-theory twin
("most vital edge"; Ratliff 1975, Wood 1993). It is **distinct from
flow-betweenness** (flow *through* vs. drop *when removed*; Freeman–Borgatti–
White 1991; Newman 2005) — and vitality is the correct primitive for a
*throughput/transfer* process (Borgatti 2005, "Centrality and network flow":
the right centrality depends on the flow process). Waist = minimal antichain
s–Ω separator at a local width-minimum; the antichain↔cut↔max-disjoint-paths
chain is Menger + Dilworth (poset width = max antichain). `pathwidth`/`cutwidth`
are FALSE FRIENDS (undirected linear-layout params) — do not borrow those names.

Two caveats now on record:
- **Marginal, not joint.** Vitality is single-edge removal; max-flow is
  submodular in the removed set, so two parallel edges can each show ~0
  vitality yet be jointly critical. Supplement with multi-edge interdiction or
  Shapley-value centrality when redundancy matters. In tree-like /
  bottleneck-dominated DAGs (where waists exist) the marginal↔joint gap closes,
  so vitality is defensible *there*.
- **Cheap to compute (cone.js optimization).** `cone.js` currently does naive
  per-edge `base − maxflow(\e)`. Non-saturated edges have vitality 0 — read
  from a single max-flow; only saturated edges need work. All-edge vitality in
  `2(n−1)` max-flows, not `|E|` (Ausiello et al., "Max flow vitality…,"
  Networks 2019); `O(n)` on st-planar.

### 2b. Capability is TWO axes; do not call accuracy "capability"

The active-inference / info-theory probe flagged a category error in
"capability = predictive accuracy":
- **Epistemic capability = accuracy.** The Free-Energy accuracy term
  (expected log-likelihood; F = complexity − accuracy) equals the log-score /
  cross-entropy, and the right scalar is **−KL(realized ‖ predicted)** (commit
  to *that* direction; it is the proper-scoring-rule generalization measure —
  Good 1952; Gneiting–Raftery 2007; calibration: Dawid 1982). This measures
  *knowing* the cone.
- **Agentic capability = empowerment.** `E = max_{p(a)} I(A_t ; S_{t+n})`,
  the channel capacity from an agent's actions to its own future states
  (Klyubin–Polani–Nehaniv 2005). This measures *being able to steer* the
  future — task-independent *potential* control. Orthogonal to accuracy: a
  perfect predictor of an uncontrollable future has high accuracy, zero
  empowerment.

So three measures, not two:
- **accuracy** (epistemic): does the agent *know* the cone? `−KL(realized‖pred)`
- **empowerment** (agentic, potential): *could* it steer toward Ω? channel cap.
- **vitality / influence** (realized, structural): do its actual transitions
  bear load toward Ω? max-flow vitality.

Natural causal chain: accuracy → (find the waists) → empowerment → (act at
them) → influence, **gated by selection η** (next).

### 2c. η = the capability→influence coupling — a *selection gradient*, novel

η couples capability to realized influence. Honest placement:
- It is **not** the additive Price selection term `Cov(w,z)`. It is the
  **standardized selection gradient** / Robertson–Price identity flavor
  (Lande–Arnold 1983) — a *regression slope / normalized covariance*. And
  **normalizing destroys the additive multilevel partition** that is the Price
  equation's whole point, so "η is the Price selection term" is loose. Use
  "selection gradient," not "Price term."
- **No established field defines a literal corr(capability, power).** η is a
  novel scalarization of a mechanism many literatures share: inclusive vs.
  extractive institutions (Acemoglu–Robinson 2012, Nobel 2024); open- vs.
  limited-access orders (North–Wallis–Weingast 2009); talent *misallocation*
  as a multiplicative wedge (Hsieh–Hurst–Jones–Klenow 2019 — the closest
  formal cousin: a wedge is exactly a weakened ability→position coupling);
  talent→rent-seeking (Murphy–Shleifer–Vishny 1991); the Peter Principle ABM
  (Pluchino–Rapisarda–Garofalo 2010 — η as a function of promotion rule +
  level-to-level competence correlation). Present η as our contribution, and
  defend it against the obvious objection: real institutions are
  typologies/wedges, not one correlation.
- **η is NOT universally → 0.** Dal Bó et al. 2017 ("Who Becomes a
  Politician?") measured Swedish politicians as *more* competent than the
  population: η > 0, "inclusive meritocracy." So η is an institution-dependent
  *variable*, and the **capability−influence gap is its diagnostic** of how
  well selection works at that meta-level — which is exactly the user's
  "failed states" intuition, now a measurable rather than a lament.

**Three holes to keep flagged (`open`):**
1. **Capability ≠ alignment.** A capable agent can point capability at its own
   ends (agency cost, Jensen–Meckling 1976; rent-seeking, Krueger 1974). η
   should arguably be over *goal-aligned* capability, and is only diagnostic
   once the objective (whose Ω?) is fixed.
2. **Reverse causation.** Holding influence confers resources that *raise*
   measured capability — an observed η>0 can be endogenous. Identification is
   the central empirical threat.
3. **Independent measurability of capability.** The ABMs treat it as an
   exogenous draw; empirics lean on proxies. Without an independent capability
   measure, η is not falsifiable.

---

## What this changes in the model (applied this pass)

- **§8.3.3** — name the measure max-flow vitality; cite; add marginal-not-joint
  caveat + single-max-flow computation note.
- **§8.3.4** — RETRACT the dominant-convergence fixed-point; state the
  DAG-has-no-attractor point; reclassify Ω as a boundary condition; keep the
  path-count "structural convergence" metric only as a descriptive author-aid.
- **§8.3.5 (new)** — the three measures (accuracy / empowerment / vitality) and
  η as a selection gradient; all `open`/`partial`, with the three holes.
- **INTUITIONS claim 9 + Open-Q 9** — Ω is a boundary condition (not derivable
  from passive DAG dynamics); capability is two axes; η is institution-
  dependent, gap-as-diagnostic.

## Key citations (verified across sources; paywalled originals not opened)

- Burda, Duda, Łuck, Wacław, "Localization of the Maximal Entropy Random Walk,"
  PRL 102, 160602 (2009). arXiv:0810.4113
- Pressé, Ghosh, Lee, Dill, "Max entropy and max caliber…," Rev Mod Phys 85,
  1115 (2013).
- Koschützki et al., "Centrality Indices," in *Network Analysis*, LNCS 3418
  (2005). Ausiello et al., "Max flow vitality…," Networks (2019), arXiv:1710.01965.
- Borgatti, "Centrality and network flow," Social Networks 27 (2005).
- Good (1952) log score; Gneiting & Raftery, "Strictly Proper Scoring Rules,"
  JASA 102 (2007); Dawid, "The well-calibrated Bayesian," JASA 77 (1982).
- Friston (2010) NRN; Buckley et al. (2017) J Math Psych (FEP accuracy term);
  Klyubin, Polani, Nehaniv, "Empowerment," IEEE CEC (2005).
- Price (1970/1972); Frank, "Natural selection IV: the Price equation," JEB
  (2012); Lande & Arnold, Evolution 37 (1983).
- Acemoglu & Robinson, *Why Nations Fail* (2012); North, Wallis, Weingast,
  *Violence and Social Orders* (2009); Hsieh, Hurst, Jones, Klenow,
  Econometrica 87 (2019); Murphy, Shleifer, Vishny, QJE 106 (1991);
  Pluchino, Rapisarda, Garofalo, Physica A 389 (2010); Dal Bó et al., QJE 132
  (2017); Jensen & Meckling, JFE 3 (1976); Krueger, AER 64 (1974).
