# DAG Analysis: The Iliad

Using the FORMAL_MODEL formalism.
Intermediate granularity -- act-level subDAGs expanded to key events,
not every single speech or combat blow.

---

## 1. Semantic Lexicon (Iliad-specific)

### Entities

```
-- Mortals
achilles, agamemnon, hector, patroclus, priam,
odysseus, ajax, diomedes, paris, helen,
briseis, chryseis, chryses, andromache, nestor

-- Gods
zeus, athena, apollo, aphrodite, ares, hera,
thetis, poseidon, hephaestus

-- Collectives
achaeans, trojans

-- Objects / Places
troy, ships, armor_of_achilles, armor_of_hephaestus,
body_of_patroclus, body_of_hector, ransom
```

### Actions

```
quarrel    :: (entity, entity, entity)    -> completion
             -- quarrel(X, Y, over(Z))
withdraw   :: (entity, entity)            -> completion
             -- withdraw(X, from(Y))
supplicate :: (entity, entity, for(entity)) -> completion
petition   :: (entity, entity, for(entity)) -> completion
intervene  :: (entity, in(completion))    -> completion
rage       :: (entity)                    -> completion
aristeia   :: (entity)                    -> completion
             -- a hero's peak combat sequence
kill       :: (entity, entity)            -> completion
lament     :: (entity, entity)            -> completion
ransom     :: (entity, entity, entity)    -> completion
             -- ransom(X, Y, for(Z)) = X ransoms Z from Y
arm        :: (entity, entity)            -> completion
             -- arm(X, with(Y))
rout       :: (entity, entity)            -> completion
duel       :: (entity, entity)            -> completion
funeral    :: (entity)                    -> completion
embassy    :: (entity, to(entity), for(entity)) -> completion
```

### Qualities

```
wrathful, grieving, proud, desperate, compassionate,
reluctant, fated, impersonating, triumphant, humbled
```

---

## 2. The DAG -- Scale 0 (Whole Poem)

```
wrath_of_achilles
```

One node. Homer tells you this in line 1.

---

## 3. The DAG -- Scale 1 (Five Acts)

```
wrath_of_achilles = slist(
    cause,          -- the quarrel and withdrawal
    consequence,    -- Achaeans suffer without Achilles
    substitution,   -- Patroclus fights as Achilles' proxy
    return,         -- Achilles re-enters the war
    resolution      -- from Hector's death to his funeral
)
```

Dependencies:

```
cause -> consequence
cause -> substitution       (withdrawal enables the proxy)
consequence -> substitution (suffering motivates Patroclus)
substitution -> return      (Patroclus' death triggers return)
return -> resolution
```

Note: this is NOT a linear chain. `cause` feeds BOTH `consequence`
and `substitution` independently. The DAG branches and reconverges.

---

## 4. The DAG -- Scale 2 (Major Events)

### 4.1 CAUSE

```
cause = slist(
    quarrel(achilles, agamemnon, over(briseis)),
    withdraw(achilles, from(achaeans))
)
```

Interior subDAGs:

```
quarrel(achilles, agamemnon, over(briseis)) = slist(
    supplicate(chryses, agamemnon, for(chryseis)),     -- [Bk 1]
    refuse(agamemnon, chryses),
    petition(chryses, apollo, for(vengeance)),
    intervene(apollo, plague(achaeans)),
    demand(achilles, agamemnon, return(chryseis)),
    seize(agamemnon, briseis, from(achilles)),
    rage(achilles)
)
```

Dependency structure:
```
supplicate -> refuse -> petition -> intervene(apollo)
intervene(apollo) -> demand(achilles) -> seize(agamemnon) -> rage
```

This is nearly linear -- a causal domino chain.
The only branching: `rage` has two outgoing edges --
`withdraw` (what Achilles does) and `petition(thetis, zeus)` (backup plan).

```
withdraw(achilles, from(achaeans)) = slist(
    refuse_combat(achilles),
    petition(thetis, zeus, for(trojan_victory))
)
```

### 4.2 CONSEQUENCE

```
consequence = slist(
    trojan_advance,
    achaean_suffering,
    embassy_to_achilles
)
```

Interior:

```
trojan_advance = slist(
    intervene(zeus, embolden(trojans)),             -- [Bk 8, 11-12]
    aristeia(hector),
    rout(trojans, achaeans),
    breach(hector, achaean_wall),                   -- [Bk 12]
    assault(trojans, ships)                         -- [Bk 15-16]
)

achaean_suffering = set(
    wound(paris, diomedes),                         -- the heroes fall
    wound(trojans, odysseus),
    wound(trojans, agamemnon),
    wound(trojans, ajax)
)

embassy_to_achilles = slist(                        -- [Bk 9]
    embassy(achaeans, to(achilles), for(return)),
    offer(agamemnon, gifts, to(achilles)),
    refuse(achilles, embassy)
)
```

Key structural feature: `embassy_to_achilles` is a FAILED convergence
attempt. The achaeans try to re-merge the Achilles branch with the
main war branch. The refusal keeps the branches separate.

### 4.3 SUBSTITUTION

This is the structural pivot of the entire poem.

```
substitution = slist(
    desperation(patroclus, seeing(achaean_suffering)),
    petition(patroclus, achilles, for(permission)),
    grant(achilles, patroclus, conditional(limited_action)),
    arm(patroclus, with(armor_of_achilles)),        -- [Bk 16]
    aristeia(patroclus),
    exceed_limit(patroclus),
    intervene(apollo, stun(patroclus)),
    kill(hector, patroclus)                         -- [Bk 16]
)
```

Dependencies:
```
desperation -> petition -> grant -> arm
arm -> aristeia -> exceed_limit -> intervene(apollo) -> kill
```

CRITICAL NODE: `kill(hector, patroclus)` is the poem's primary
convergence node. Everything before it flows into it; everything
after flows from it. In-degree: at least 4 independent paths
(Achilles' withdrawal, Trojan advance, Patroclus' character,
Apollo's agenda). Out-degree: 2 (Achilles' return, Hector's doom).

### 4.4 RETURN

```
return = slist(
    lament(achilles, patroclus),                    -- [Bk 18]
    rage(achilles),                                 -- wrath redirected
    reconcile(achilles, agamemnon),                 -- [Bk 19]
    arm(achilles, with(armor_of_hephaestus)),       -- [Bk 18-19]
    aristeia(achilles),                             -- [Bk 20-21]
    rout(achilles, trojans)
)
```

Parametric note: `arm(achilles, with(armor_of_hephaestus))` is
parallel to `arm(patroclus, with(armor_of_achilles))` in 4.3.
Template: `arm(X, with(Y))` -- the arming scene is a parametrized
subDAG. Homer uses the SAME structure (detailed arming sequence)
with different parameters each time. See Section 6.

### 4.5 RESOLUTION

```
resolution = slist(
    duel(achilles, hector),                         -- [Bk 22]
    kill(achilles, hector),
    defile(achilles, body_of_hector),
    funeral(patroclus),                             -- [Bk 23]
    supplicate(priam, achilles, for(body_of_hector)), -- [Bk 24]
    compassion(achilles, priam),
    ransom(priam, achilles, for(body_of_hector)),
    funeral(hector)                                 -- [Bk 24]
)
```

STRUCTURAL MIRROR: The poem ends with two funerals and an act of
compassion. `supplicate(priam, achilles)` echoes
`supplicate(chryses, agamemnon)` from the opening. But the
RESPONSE differs: Agamemnon refuses, Achilles grants. The
template `supplicate(X, Y, for(Z))` recurs with contrasting
outcomes -- this IS the poem's moral arc encoded as parametric contrast.

---

## 5. Threading

### 5.1 The Iliad's Threading Is Nearly Chronological

Unlike the Odyssey, the Iliad's sjuzhet closely follows the fabula.
The thread moves forward through the DAG with few jumps.

Exceptions:
- **Backstory insertions**: Nestor's reminiscences, the Catalog of Ships
  (threading jumps backward to pre-DAG nodes)
- **Simultaneous action**: the thread alternates between Trojan and
  Achaean subDAGs (interleaved threading of parallel branches)
- **Divine and mortal planes**: the thread jumps between Olympus
  subDAGs and battlefield subDAGs

### 5.2 Thread Segment Sketch (by Book)

```
t1-t3:    cause (Bk 1)
t4-t5:    [backstory: catalog of forces, Bk 2]
t6-t10:   consequence.trojan_advance interleaved with
          aristeiai(diomedes, ajax) (Bk 3-7)
t11-t13:  embassy_to_achilles (Bk 9)
t14-t18:  consequence.achaean_suffering (Bk 10-12)
t19-t21:  consequence.assault_on_ships (Bk 13-15)
t22-t26:  substitution (Bk 16)
t27-t30:  return (Bk 17-21)
t31-t33:  resolution.duel_and_kill (Bk 22)
t34-t36:  resolution.funeral_and_ransom (Bk 23-24)
```

### 5.3 Divine Interleaving

The gods operate on a parallel subDAG that the thread visits
repeatedly. Key divine thread-jumps:

```
t_olympus_1: petition(thetis, zeus)           -- after t3
t_olympus_2: intervene(zeus, trojan_victory)  -- during t14
t_olympus_3: intervene(apollo, stun_patroclus)-- during t25
t_olympus_4: duel(gods, gods)                 -- during t29 [Bk 20-21]
t_olympus_5: intervene(apollo, protect_hector) then
             intervene(athena, doom_hector)    -- during t31 [Bk 22]
```

The thread alternates between mortal and divine planes.
The divine subDAG runs IN PARALLEL with the mortal one --
they share dependency edges (divine actions cause mortal outcomes)
but have their own internal structure.

---

## 6. Parametrized SubDAGs (Recurring Templates)

### 6.1 The Aristeia

```
aristeia(X) = slist(
    arm(X, with(equipment(X))),
    enter_battle(X),
    kill_sequence(X, set(minor_enemies)),
    encounter(X, major_opponent),
    climax(X, outcome)
)
```

Instances:
| X | Major Opponent | Outcome | Book |
|---|---------------|---------|------|
| diomedes | ares | wounds a god | 5 |
| patroclus | hector | killed | 16 |
| achilles | hector | kills him | 20-22 |
| hector | ajax/patroclus | triumphs, then falls | 12,16 |

The template is the SAME. The parameters (who, against whom,
how it ends) change. The contrast between instances carries
the meaning: Patroclus' aristeia mirrors Achilles' but ends
in death instead of triumph. That parametric contrast IS the
tragedy.

### 6.2 The Supplication

```
supplicate(X, Y, for(Z)) = slist(
    approach(X, Y, as(humble)),
    appeal(X, to(Y), invoking(bond)),
    decision(Y, grant_or_refuse)
)
```

Instances:
| X | Y | Z | Bond Invoked | Decision | Location |
|---|---|---|-------------|----------|----------|
| chryses | agamemnon | chryseis | priestly office | refuse | Bk 1 (opening) |
| patroclus | achilles | permission | friendship | grant (conditional) | Bk 16 |
| priam | achilles | body_of_hector | shared mortality | grant | Bk 24 (closing) |

The poem is FRAMED by supplications. First refused, last granted.
The template recurs with the critical parameter `decision` flipping
from refuse to grant -- that flip IS the poem's emotional arc.

### 6.3 The Arming Scene

```
arm(X, with(Y)) = slist(
    greaves(X),
    corselet(X),
    sword(X),
    shield(X, description(Y)),
    helmet(X)
)
```

Instances: Paris (Bk 3), Agamemnon (Bk 11), Patroclus (Bk 16),
Achilles (Bk 19). Same sequence each time. The SHIELD DESCRIPTION
parameter varies -- Achilles' shield (Hephaestus-forged, Bk 18)
gets an enormous expansion of the subDAG (the famous ekphrasis),
while others get brief treatment. This is a thread detail-level
difference on the same template.

### 6.4 The Lament

```
lament(X, Y) = slist(
    discover(X, death_of(Y)),
    grieve(X, with(gesture)),
    speak(X, eulogy(Y)),
    respond(community, with(mourning))
)
```

Instances:
| X | Y | Gesture | Book |
|---|---|---------|------|
| achilles | patroclus | ash on head, thetis rises | 18 |
| andromache | hector | faints on wall | 22 |
| priam | hector | rolls in dung | 22 |
| hecuba | hector | tears hair | 24 |

### 6.5 The Divine Intervention

```
intervene(god, in(mortal_event)) = slist(
    observe(god, mortal_event),
    decide(god, agenda),
    act(god, method),
    mortal_outcome_altered
)
```

This template recurs dozens of times. The parameter `method` ranges
from direct combat (Ares) to deception (Athena disguised as Deiphobus)
to environmental manipulation (Apollo's plague, Poseidon's waves).

---

## 7. Convergence Nodes

The Iliad has three major convergence nodes -- points where
multiple independent causal paths merge:

### 7.1 kill(hector, patroclus) -- THE pivot

In-paths:
1. achilles' withdrawal (leaves a gap)
2. zeus' promise to thetis (Trojans must win for now)
3. patroclus' compassion (volunteers as substitute)
4. achilles' conditional grant (go, but come back)
5. apollo's agenda (protects Troy, dooms Patroclus)
6. hector's aristeia (empowered by Zeus/Apollo)

Six independent causal threads converge on one event.
This is the highest-convergence node in the poem.

### 7.2 duel(achilles, hector) -- structural inevitability

In-paths:
1. kill(hector, patroclus) -> rage(achilles) (personal motive)
2. arm(achilles, armor_of_hephaestus) (material readiness)
3. rout(achilles, trojans) (tactical setup: isolate Hector)
4. intervene(athena, doom(hector)) (divine sanction)
5. fate(hector) established early in poem

### 7.3 ransom(priam, achilles, body_of_hector) -- resolution

In-paths:
1. kill(achilles, hector) (creates the body to ransom)
2. defile(achilles, body) (creates the moral urgency)
3. funeral(patroclus) (Achilles' grief partly discharged)
4. intervene(zeus, via(thetis)) (divine instruction to release)
5. priam's courage (mortal action independent of gods)

---

## 8. Structural Observations

### 8.1 The Wrath Transfer

The poem's deepest structure is a PARAMETER CHANGE on `rage`:

```
rage(achilles, at(agamemnon))   -- Books 1-18
   |
   v  [kill(hector, patroclus)]
   |
rage(achilles, at(hector))      -- Books 18-24
   |
   v  [supplicate(priam, achilles)]
   |
compassion(achilles)            -- Book 24
```

The object of wrath shifts. This is not a template recurrence --
it's the SAME node `rage(achilles)` being RE-PARAMETERIZED by
a convergence event. The kill doesn't create new rage; it
redirects existing rage to a new target.

### 8.2 The Substitution Structure

Patroclus is structurally a PARAMETER of Achilles:

```
arm(patroclus, with(armor_of_achilles))
aristeia(patroclus)
kill(hector, patroclus)
```

This is `arm(achilles, ...); aristeia(achilles); ...` with
`achilles` replaced by `patroclus`. The Trojans literally mistake
Patroclus for Achilles. The narrative ENACTS parametric substitution
as a plot device. When the substitution fails (Patroclus dies),
the original parameter must return -- Achilles re-enters.

### 8.3 Ring Composition

The poem's large-scale structure is a ring (chiastic):

```
A  supplicate(chryses, agamemnon) -- REFUSED     [Bk 1]
 B  quarrel(achilles, agamemnon)                 [Bk 1]
  C  trojan_advance                              [Bk 2-15]
   D  kill(hector, patroclus)   -- PIVOT         [Bk 16]
  C' achilles_advance                            [Bk 17-21]
 B' reconcile(achilles, agamemnon)               [Bk 19]
A' supplicate(priam, achilles) -- GRANTED        [Bk 24]
```

A/A', B/B', C/C' are PARALLEL subDAGs. Same template, contrasting
parameters. The ring IS the set of parametric mirrors around a
central convergence node.

---

## 9. DAG Diagram (ASCII)

```
[supplicate(chryses,agam)]
         |
    [refuse(agam)]
         |
   [plague(apollo)]
         |
[quarrel(achilles,agam)]--->[petition(thetis,zeus)]
         |                          |
   [withdraw(achilles)]      [zeus_favors_trojans]
         |                          |
         +--------+---------+------+
                  |         |
          [trojan_advance] [achaean_suffering]
                  |         |
          [embassy(achilles)]--REFUSED
                  |
          [assault_on_ships]
                  |         \
     [desperation(patroclus)] \
                  |            \
     [arm(patroclus,achilles_armor)]
                  |
        [aristeia(patroclus)]
                  |
     [intervene(apollo,stun)]
                  |
  ==> [KILL(HECTOR,PATROCLUS)] <==  *** PIVOT ***
                  |
      +----------+-----------+
      |                      |
[lament(achilles)]    [fate(hector)]
      |                      |
[reconcile(achilles,agam)]   |
      |                      |
[arm(achilles,new_armor)]    |
      |                      |
[aristeia(achilles)]         |
      |                      |
[rout(achilles,trojans)]-----+
      |
[DUEL(ACHILLES,HECTOR)]
      |
[kill(achilles,hector)]
      |
[defile(achilles,body)]
      |          \
[funeral(patroclus)] \
      |               \
[supplicate(priam,achilles)]
      |
[ransom(body_of_hector)]
      |
[funeral(hector)]
```

---

## 10. Open Questions for Odyssey Comparison

1. Does the Odyssey share the `supplicate` template as framing device?
2. The aristeia template is Iliad-specific -- what is the Odyssey's
   equivalent recurring action template?
3. Ring composition: does the Odyssey have the same chiastic structure?
4. Threading: the Odyssey is famous for non-chronological telling --
   the fabula/sjuzhet gap will be much larger.
5. Convergence nodes: the Iliad has one dominant pivot. Does the
   Odyssey have one, or several?
