# DAG Analysis: Homer's Odyssey

An intermediate-granularity directed acyclic graph analysis of the
Odyssey, following the threaded-DAG formalism of FORMAL_MODEL_v2.

---

## 1. Semantic Lexicon L (Odyssey-Specific)

### 1.1 Entities

| Name | Type | Gloss |
|------|------|-------|
| odysseus | entity | King of Ithaca, protagonist |
| penelope | entity | Wife of Odysseus |
| telemachus | entity | Son of Odysseus |
| athena | entity | Goddess, patron of Odysseus |
| poseidon | entity | God of the sea, antagonist |
| zeus | entity | King of the gods |
| hermes | entity | Messenger god |
| calypso | entity | Nymph who detains Odysseus |
| circe | entity | Sorceress on Aeaea |
| polyphemus | entity | Cyclops, son of Poseidon |
| aeolus | entity | Keeper of the winds |
| tiresias | entity | Blind prophet in the underworld |
| scylla | entity | Six-headed sea monster |
| charybdis | entity | Whirlpool monster |
| helios | entity | Sun god |
| nausicaa | entity | Phaeacian princess |
| alcinous | entity | King of the Phaeacians |
| arete | entity | Queen of the Phaeacians |
| eumaeus | entity | Loyal swineherd |
| eurycleia | entity | Old nurse of Odysseus |
| argos | entity | Odysseus's old dog |
| antinous | entity | Lead suitor |
| eurymachus | entity | Prominent suitor |
| melanthius | entity | Disloyal goatherd |
| philoetius | entity | Loyal cowherd |
| laertes | entity | Father of Odysseus |
| suitors | entity | The 108 suitors as collective |
| crew | entity | Odysseus's sailors |
| ithaca | entity | Odysseus's homeland |
| ogygia | entity | Calypso's island |
| scheria | entity | Land of the Phaeacians |
| aeaea | entity | Circe's island |
| troy | entity | Site of the war |
| underworld | entity | Realm of the dead |
| lotus_land | entity | Island of the Lotus-eaters |
| aeolia | entity | Island of Aeolus |
| thrinacia | entity | Island of Helios's cattle |
| bow | entity | The great bow of Odysseus |

### 1.2 Actions

| Name | Signature | Gloss |
|------|-----------|-------|
| journey | (entity, entity, entity) -> completion | [x] travels from [y] to [z] |
| sail | (entity, entity, entity) -> completion | [x] sails from [y] to [z] |
| arrive | (entity, entity) -> completion | [x] arrives at [y] |
| depart | (entity, entity) -> completion | [x] departs from [y] |
| detain | (entity, entity, entity) -> completion | [x] detains [y] at [z] |
| release | (entity, entity) -> completion | [x] releases [y] |
| disguise | (entity, entity, quality) -> completion | [x] disguises [y] as [q] |
| recognize | (entity, entity) -> completion | [x] recognizes [y] |
| test | (entity, entity, quality) -> completion | [x] tests [y] for [q] |
| slaughter | (entity, entity) -> completion | [x] slaughters [y] |
| punish | (entity, entity) -> completion | [x] punishes [y] |
| curse | (entity, entity) -> completion | [x] curses [y] |
| pray | (entity, entity) -> completion | [x] prays to [y] |
| aid | (entity, entity, mode) -> completion | [x] aids [y] by [mode] |
| transform | (entity, entity, quality) -> completion | [x] transforms [y] into [q] |
| tempt | (entity, entity, quality) -> completion | [x] tempts [y] with [q] |
| resist | (entity, entity) -> completion | [x] resists [y] |
| weep | (entity, quality) -> completion | [x] weeps from [q] |
| narrate | (entity, entity, entity) -> completion | [x] tells [y] the story of [z] |
| scheme | (entity, entity) -> completion | [x] schemes against [y] |
| feast | (entity, entity) -> completion | [x] feasts with/at [y] |
| search | (entity, entity) -> completion | [x] searches for [y] |
| warn | (entity, entity) -> completion | [x] warns [y] |
| devour | (entity, entity) -> completion | [x] devours [y] |
| blind | (entity, entity) -> completion | [x] blinds [y] |
| string | (entity, entity) -> completion | [x] strings [y] (the bow) |
| contest | (entity, entity, mode) -> completion | [x] contests [y] via [mode] |
| restore | (entity, entity) -> completion | [x] restores [y] |
| reunite | (entity, entity) -> completion | [x] reunites with [y] |
| hospitality | (entity, entity) -> completion | [x] hosts [y] |
| violate_hospitality | (entity, entity) -> completion | [x] violates hospitality of [y] |
| mourn | (entity, entity) -> completion | [x] mourns [y] |
| assemble | (entity) -> completion | [x] assembles/gathers |
| prophesy | (entity, entity) -> completion | [x] prophesies to [y] |
| sacrifice | (entity, entity) -> completion | [x] sacrifices [y] |
| enchant | (entity, entity) -> completion | [x] enchants [y] |
| counsel | (entity, entity) -> completion | [x] counsels [y] |
| wreck | (entity, entity) -> completion | [y] is shipwrecked by [x] |
| string_bow | (entity, entity) -> completion | [x] strings [y] (the bow) |
| shoot | (entity, entity, mode) -> completion | [x] shoots [y] via [mode] |
| hang | (entity, entity) -> completion | [x] hangs [y] |
| verify | (entity, entity, mode) -> completion | [x] verifies [y] by [mode] |

### 1.3 Qualities and Modes

| Name | Type | Gloss |
|------|------|-------|
| cunning | quality | Metis, craft, cleverness |
| loyalty | quality | Faithfulness over time |
| nostos | quality | Homecoming, return |
| kleos | quality | Glory, fame |
| xenia | quality | Guest-friendship, hospitality code |
| hubris | quality | Overweening pride |
| endurance | quality | Ability to suffer and persist |
| beggar | quality | Disguised as a beggar |
| old_woman | quality | Disguised as old woman |
| young_man | quality | Disguised as a young man (Mentor/Mentes) |
| with(storm) | mode | By means of storm |
| with(moly) | mode | By means of the herb moly |
| with(wax) | mode | By means of wax in ears |
| with(olive_stake) | mode | By means of a heated olive stake |
| with(bow) | mode | By means of the bow |
| with(bed_secret) | mode | By means of the unmovable bed |
| with(scar) | mode | By means of the scar on the leg |
| with(weaving) | mode | By means of weaving/unweaving the shroud |

---

## 2. The DAG at Multiple Scales

### Scale 0: The Whole Poem

```
odyssey = nostos(odysseus, troy, ithaca)
```

One node. The entire poem is the return of Odysseus from Troy to Ithaca.

### Scale 1: Major Structural Acts

The Odyssey divides into five major structural phases:

```
odyssey = slist(
    S1: telemachy(telemachus, athena, suitors),           -- Bk 1-4
    S2: release_and_voyage(odysseus, calypso, scheria),   -- Bk 5-8
    S3: apologoi(odysseus, alcinous),                     -- Bk 9-12
    S4: return_to_ithaca(odysseus, ithaca, eumaeus),      -- Bk 13-16
    S5: vengeance_and_reunion(odysseus, suitors, penelope) -- Bk 17-24
)
```

**Dependencies at Scale 1:**
```
S1 -> S4   (Telemachus's maturation enables cooperation in return)
S2 -> S4   (Odysseus must reach Ithaca)
S3 -> S2   (narratively embedded within S2; causally, S3 events precede S2)
S4 -> S5   (return and reconnaissance enable vengeance)
S1 -> S5   (Telemachus's growth enables him to fight alongside father)
```

Note: S3 (the Apologoi) is a retrospective narration. Its *events* causally
precede S1 and S2, but its *telling* is embedded within S2. This is the
primary threading dislocation (see Section 3).

### Scale 2: Events Within Each Act

---

#### S1: TELEMACHY (Bk 1-4) [subDAG]

```
S1 = telemachy(telemachus, athena, suitors)
```

Interior nodes:

```
S1.1: divine_council(athena, zeus)                                    -- Bk 1.1-95
       "Athena petitions Zeus for Odysseus's return"
S1.2: aid(athena, telemachus, as(young_man))                          -- Bk 1.96-324
       "Athena visits Telemachus disguised as Mentes"
S1.3: counsel(athena, telemachus)                                     -- Bk 1.252-305
       "Athena advises Telemachus to search for news of his father"
S1.4: confront(telemachus, suitors)                                   -- Bk 1.325-424
       "Telemachus rebukes the suitors for the first time"
S1.5: assemble(telemachus, ithaca_assembly)                           -- Bk 2.1-259
       "Telemachus calls assembly, demands suitors leave; they refuse"
S1.6: aid(athena, telemachus, as(mentor))                             -- Bk 2.260-295
       "Athena procures ship and crew for Telemachus"
S1.7: journey(telemachus, ithaca, pylos)                              -- Bk 3
       "Telemachus sails to Pylos"
S1.8: hospitality(nestor, telemachus)                                 -- Bk 3.31-485
       "Nestor hosts Telemachus, tells of returns from Troy"
S1.9: journey(telemachus, pylos, sparta)                              -- Bk 3.486-4.1
       "Telemachus travels overland to Sparta"
S1.10: hospitality(menelaus, telemachus)                              -- Bk 4.1-624
       "Menelaus and Helen host Telemachus, tell of Odysseus"
S1.11: learn(telemachus, alive(odysseus))                             -- Bk 4.555-560
       "Menelaus reports Proteus said Odysseus is alive on Calypso's isle"
S1.12: scheme(suitors, telemachus)                                    -- Bk 4.625-786
       "Suitors plot to ambush Telemachus on his return"
S1.13: mourn(penelope, odysseus)                                      -- Bk 4.787-847
       "Penelope learns of the ambush plot and grieves"
S1.14: aid(athena, penelope, with(dream))                             -- Bk 4.787-841
       "Athena sends a dream to comfort Penelope"
```

**Internal dependencies:**
```
S1.1 -> S1.2 -> S1.3 -> S1.4 -> S1.5
S1.3 -> S1.6 -> S1.7 -> S1.8 -> S1.9 -> S1.10 -> S1.11
S1.4 -> S1.12
S1.12 -> S1.13 -> S1.14
```

---

#### S2: RELEASE AND VOYAGE TO SCHERIA (Bk 5-8) [subDAG]

```
S2 = release_and_voyage(odysseus, calypso, scheria)
```

Interior nodes:

```
S2.1: divine_council(athena, zeus)                                    -- Bk 5.1-42
       "Second divine council; Zeus dispatches Hermes"
S2.2: command(zeus, hermes, release(calypso, odysseus))               -- Bk 5.28-42
       "Zeus orders Calypso to release Odysseus"
S2.3: release(calypso, odysseus)                                      -- Bk 5.43-227
       "Calypso reluctantly obeys; Odysseus builds raft"
S2.4: tempt(calypso, odysseus, immortality)                           -- Bk 5.203-224
       "Calypso offers immortality; Odysseus refuses"
S2.5: depart(odysseus, ogygia)                                        -- Bk 5.228-281
       "Odysseus sails on the raft"
S2.6: wreck(poseidon, odysseus, with(storm))                          -- Bk 5.282-387
       "Poseidon spots Odysseus and sends a storm"
S2.7: aid(athena, odysseus, with(calming_wind))                       -- Bk 5.382-443
       "Athena and Ino help Odysseus survive the storm"
S2.8: arrive(odysseus, scheria)                                       -- Bk 5.441-493
       "Odysseus washes ashore on Phaeacia, naked"
S2.9: encounter(odysseus, nausicaa)                                   -- Bk 6
       "Nausicaa finds Odysseus; he supplicates her"
S2.10: hospitality(alcinous, odysseus)                                -- Bk 7
       "Alcinous receives Odysseus in his palace"
S2.11: feast(alcinous, odysseus)                                      -- Bk 8.1-255
       "Games and feasting among the Phaeacians"
S2.12: weep(odysseus, nostos)                                         -- Bk 8.62-103, 521-534
       "Odysseus weeps hearing Demodocus sing of Troy"
S2.13: reveal(odysseus, identity, to(alcinous))                       -- Bk 9.1-38
       "Odysseus announces his name and begins his tale"
S2.14: [S3 -- the Apologoi are narrated here]                         -- Bk 9-12
S2.15: gift(alcinous, odysseus, treasure)                             -- Bk 13.1-17
       "Phaeacians load gifts and convey Odysseus home"
S2.16: sail(phaeacians, odysseus, ithaca)                             -- Bk 13.18-92
       "Phaeacians transport sleeping Odysseus to Ithaca"
S2.17: punish(poseidon, phaeacians, with(petrified_ship))            -- Bk 13.125-187
       "Poseidon turns Phaeacian ship to stone"
```

**Internal dependencies:**
```
S2.1 -> S2.2 -> S2.3
S2.4 is within S2.3 (subDAG)
S2.3 -> S2.5 -> S2.6 -> S2.7 -> S2.8 -> S2.9 -> S2.10 -> S2.11
S2.11 -> S2.12 -> S2.13 -> S2.14 -> S2.15 -> S2.16
S2.16 -> S2.17
```

---

#### S3: APOLOGOI -- Odysseus's Retrospective Narrative (Bk 9-12) [subDAG]

```
S3 = apologoi(odysseus, alcinous)
     = narrate(odysseus, alcinous, set(
         S3.1 ... S3.15
       ))
```

These events are **chronologically prior** to S1 and S2, but are narrated
by Odysseus in his own voice to the Phaeacians. Every node here is
double-framed: it is both an event in the fabula and a speech act in the
sjuzhet (Odysseus telling Alcinous).

Interior nodes:

```
S3.1: sack(odysseus, crew, cicones)                                   -- Bk 9.39-66
       "Raid on the Cicones; disastrous lingering"
S3.2: arrive(odysseus, crew, lotus_land)                              -- Bk 9.82-104
       "Lotus-eaters tempt crew with forgetfulness"
S3.3: tempt(lotus_eaters, crew, with(oblivion))                       -- Bk 9.91-97
       "Some crew eat lotus and lose desire to return"
S3.4: resist(odysseus, lotus_eaters)                                  -- Bk 9.98-104
       "Odysseus drags men back to ships by force"

S3.5: arrive(odysseus, crew, cyclops_island)                          -- Bk 9.105-169
       "Landing on the island of the Cyclopes"
S3.6: violate_hospitality(polyphemus, odysseus)                       -- Bk 9.170-336
       "Polyphemus traps and eats crew members"
S3.7: scheme(odysseus, polyphemus, with(cunning))                     -- Bk 9.345-414
       "Odysseus gives false name 'Nobody'; devises blinding plan"
S3.8: blind(odysseus, polyphemus, with(olive_stake))                  -- Bk 9.375-397
       "Odysseus drives heated stake into the Cyclops's eye"
S3.9: escape(odysseus, crew, polyphemus, with(sheep))                 -- Bk 9.415-467
       "Greeks escape under rams' bellies"
S3.10: boast(odysseus, polyphemus, hubris)                            -- Bk 9.474-505
       "Odysseus reveals his true name in pride"
S3.11: curse(polyphemus, odysseus)                                    -- Bk 9.507-535
       "Polyphemus prays to Poseidon to curse Odysseus"
       [CRITICAL NODE -- source of Poseidon's wrath]

S3.12: hospitality(aeolus, odysseus)                                  -- Bk 10.1-27
       "Aeolus hosts Odysseus, gives bag of winds"
S3.13: gift(aeolus, odysseus, bag_of_winds)                           -- Bk 10.17-27
       "The wind-bag that should guarantee safe passage"
S3.14: betray(crew, odysseus, with(opening_bag))                      -- Bk 10.28-55
       "Crew opens bag near Ithaca; storms blow them back"
S3.15: arrive(odysseus, crew, laestrygonians)                         -- Bk 10.80-132
       "Laestrygonians destroy 11 of 12 ships"

S3.16: arrive(odysseus, crew, aeaea)                                  -- Bk 10.133-175
       "Landing on Circe's island"
S3.17: enchant(circe, crew, with(potion))                             -- Bk 10.210-243
       "Circe transforms scouting party into pigs"
S3.18: aid(hermes, odysseus, with(moly))                              -- Bk 10.274-308
       "Hermes gives Odysseus the herb moly"  [divine intervention]
S3.19: resist(odysseus, circe, with(moly))                            -- Bk 10.310-347
       "Odysseus resists Circe's magic; she submits"
S3.20: restore(circe, crew)                                           -- Bk 10.383-399
       "Circe returns crew to human form"
S3.21: detain(circe, odysseus, aeaea)                                 -- Bk 10.449-474
       "Odysseus stays one year with Circe"
S3.22: counsel(circe, odysseus, visit_underworld)                     -- Bk 10.488-540
       "Circe instructs Odysseus to consult the dead"

S3.23: journey(odysseus, aeaea, underworld)                           -- Bk 11.1-50
       "Voyage to the edge of the world; sacrifices to the dead"
S3.24: prophesy(tiresias, odysseus)                                   -- Bk 11.90-151
       "Tiresias warns: avoid Helios's cattle, suitors infest palace"
S3.25: encounter(odysseus, anticleia)                                 -- Bk 11.152-224
       "Odysseus meets his dead mother, learns of home"
S3.26: encounter(odysseus, agamemnon_shade)                           -- Bk 11.385-464
       "Agamemnon warns of treacherous wives; contrast with Penelope"
S3.27: encounter(odysseus, achilles_shade)                            -- Bk 11.465-540
       "Achilles says he'd rather be a living slave than king of dead"

S3.28: counsel(circe, odysseus, dangers_ahead)                        -- Bk 12.1-110
       "Circe instructs on Sirens, Scylla, Charybdis, Thrinacia"
S3.29: resist(odysseus, sirens, with(wax))                            -- Bk 12.154-200
       "Crew plugs ears; Odysseus hears bound to mast"
S3.30: lose(odysseus, crew_members, to(scylla))                       -- Bk 12.222-259
       "Scylla snatches six men"
S3.31: arrive(odysseus, crew, thrinacia)                              -- Bk 12.260-320
       "Landing on Thrinacia despite Tiresias's warning"
S3.32: sacrifice(crew, helios_cattle)                                 -- Bk 12.340-396
       "Starving crew slaughters sacred cattle"
S3.33: punish(zeus, crew, with(thunderbolt))                          -- Bk 12.399-425
       "Zeus destroys the ship; all crew die"
S3.34: arrive(odysseus, ogygia)                                       -- Bk 12.447-450
       "Odysseus alone washes up on Calypso's island"
S3.35: detain(calypso, odysseus, ogygia)                              -- Bk 12.449 + Bk 5
       "Seven years of captivity on Ogygia"
```

**Internal dependencies (selected critical paths):**
```
S3.1 -> S3.2 -> S3.5       (sequential voyage)
S3.5 -> S3.6 -> S3.7 -> S3.8 -> S3.9 -> S3.10 -> S3.11
S3.11 -> S2.6              (CROSS-SUBDDAG: curse causes Poseidon's wrath)
S3.9 -> S3.12 -> S3.13 -> S3.14 -> S3.15
S3.15 -> S3.16 -> S3.17
S3.17 -> S3.18 -> S3.19 -> S3.20 -> S3.21 -> S3.22
S3.22 -> S3.23 -> S3.24
S3.23 -> S3.25, S3.26, S3.27     (set: encounters in underworld)
S3.24 -> S3.31                    (Tiresias's warning relevant at Thrinacia)
S3.22 -> S3.28 -> S3.29 -> S3.30 -> S3.31
S3.31 -> S3.32 -> S3.33 -> S3.34 -> S3.35
S3.35 -> S2.3                     (detention leads to release)
```

---

#### S4: RETURN TO ITHACA AND RECONNAISSANCE (Bk 13-16) [subDAG]

```
S4 = return_to_ithaca(odysseus, ithaca, eumaeus)
```

Interior nodes:

```
S4.1: arrive(odysseus, ithaca)                                        -- Bk 13.93-124
       "Odysseus deposited sleeping on Ithaca"
S4.2: disguise(athena, odysseus, beggar)                              -- Bk 13.187-440
       "Athena transforms Odysseus into an old beggar"
S4.3: counsel(athena, odysseus)                                       -- Bk 13.287-440
       "Athena reveals situation: suitors, Penelope, plan needed"
S4.4: hospitality(eumaeus, odysseus)                                  -- Bk 14
       "Eumaeus hosts the disguised Odysseus; proves loyal"
S4.5: test(odysseus, eumaeus, loyalty)                                -- Bk 14.115-408
       "Odysseus tests Eumaeus with false stories"

S4.6: aid(athena, telemachus, with(warning))                          -- Bk 15.1-42
       "Athena warns Telemachus to return and avoid ambush"
S4.7: journey(telemachus, sparta, ithaca)                             -- Bk 15.43-300
       "Telemachus departs Sparta, avoids the suitors' ambush"
S4.8: arrive(telemachus, eumaeus_hut)                                 -- Bk 16.1-29
       "Telemachus goes to Eumaeus's hut"

S4.9: reveal(odysseus, identity, to(telemachus))                      -- Bk 16.155-234
       "Odysseus reveals himself to his son"  [CONVERGENCE NODE]
S4.10: restore(athena, odysseus, appearance)                          -- Bk 16.172-176
       "Athena briefly restores Odysseus's true form"
S4.11: plan(odysseus, telemachus, vengeance)                          -- Bk 16.234-320
       "Father and son plot the slaughter of the suitors"
S4.12: scheme(suitors, telemachus, failed_ambush)                     -- Bk 16.342-408
       "Suitors' ambush fails; they plot murder in the hall"
```

**Internal dependencies:**
```
S4.1 -> S4.2 -> S4.3 -> S4.4 -> S4.5
S4.6 -> S4.7 -> S4.8
S4.5 + S4.8 -> S4.9                  (CONVERGENCE: both paths merge)
S4.9 -> S4.10 -> S4.11
S1.12 -> S4.12                        (cross-subDAG: ambush scheme continues)
S4.7 -> S4.12                         (Telemachus evades, scheme fails)
```

---

#### S5: VENGEANCE AND REUNION (Bk 17-24) [subDAG]

```
S5 = vengeance_and_reunion(odysseus, suitors, penelope)
```

Interior nodes:

```
S5.1: arrive(odysseus, palace, as(beggar))                            -- Bk 17.182-341
       "Odysseus enters his own palace in disguise"
S5.2: recognize(argos, odysseus)                                      -- Bk 17.290-327
       "The old dog Argos recognizes his master; dies"
S5.3: abuse(suitors, odysseus_as_beggar)                              -- Bk 17.345-491
       "Suitors mock and throw things at the 'beggar'"
S5.4: test(odysseus, penelope, loyalty)                               -- Bk 19.53-360
       "Penelope interviews the beggar; he tells lying tales"
S5.5: recognize(eurycleia, odysseus, with(scar))                      -- Bk 19.386-507
       "Eurycleia washes the beggar's feet and finds the scar"
S5.6: silence(odysseus, eurycleia)                                    -- Bk 19.467-502
       "Odysseus swears Eurycleia to secrecy"
S5.7: scheme(penelope, suitors, with(bow_contest))                    -- Bk 19.570-599, 21.1-4
       "Penelope announces the contest of the bow"
S5.8: test(penelope, suitors, with(bow))                              -- Bk 21.1-187
       "Suitors fail to string the bow one by one"
S5.9: reveal(odysseus, identity, to(eumaeus))                         -- Bk 21.188-244
       "Odysseus reveals himself to Eumaeus and Philoetius"
S5.10: prepare(odysseus, eumaeus, philoetius, hall)                   -- Bk 21.229-244
       "Servants instructed to lock doors, remove weapons"
S5.11: string_bow(odysseus, bow)                                      -- Bk 21.245-423
       "Odysseus strings the bow and shoots through the axes"
       [MAJOR CONVERGENCE NODE]
S5.12: shoot(odysseus, antinous, with(bow))                           -- Bk 22.8-21
       "Odysseus kills Antinous first"
S5.13: reveal(odysseus, identity, to(suitors))                        -- Bk 22.35-41
       "Odysseus declares himself"
S5.14: slaughter(odysseus, telemachus, suitors)                       -- Bk 22.42-389
       "The killing of the suitors in the locked hall"
S5.15: aid(athena, odysseus, with(aegis))                             -- Bk 22.205-240, 297-309
       "Athena aids with deflected spears and the aegis"
S5.16: punish(odysseus, melanthius)                                   -- Bk 22.435-477
       "Disloyal servants executed"
S5.17: hang(odysseus, disloyal_maids)                                 -- Bk 22.440-473
       "Twelve disloyal maidservants hanged"
S5.18: purify(odysseus, palace, with(sulfur))                         -- Bk 22.481-501
       "Odysseus fumigates the hall"

S5.19: reunite(odysseus, penelope)                                    -- Bk 23.1-296
       "Penelope tests Odysseus"  [MAJOR CONVERGENCE NODE]
S5.20: test(penelope, odysseus, with(bed_secret))                     -- Bk 23.173-230
       "Penelope's test: she orders the bed moved"
S5.21: verify(penelope, odysseus, with(bed_secret))                   -- Bk 23.205-230
       "Odysseus reveals the bed is built around a living olive tree"
S5.22: recognize(penelope, odysseus)                                  -- Bk 23.205-240
       "Penelope acknowledges her husband"

S5.23: journey(odysseus, ithaca_countryside, laertes)                 -- Bk 24.205-360
       "Odysseus goes to find his father"
S5.24: recognize(laertes, odysseus)                                   -- Bk 24.280-360
       "Laertes recognizes his son by the scar and the orchard"
S5.25: revolt(suitors_kin, odysseus)                                  -- Bk 24.413-530
       "Relatives of dead suitors attack"
S5.26: intervene(athena, peace)                                       -- Bk 24.531-548
       "Athena/Zeus impose peace on Ithaca"
```

**Internal dependencies:**
```
S5.1 -> S5.2, S5.3
S5.3 -> S5.4 -> S5.5 -> S5.6
S5.4 -> S5.7 -> S5.8
S5.9 -> S5.10
S4.11 + S5.7 + S5.9 + S5.10 -> S5.11      (CONVERGENCE)
S5.11 -> S5.12 -> S5.13 -> S5.14
S5.14 -> S5.15, S5.16, S5.17, S5.18
S5.18 -> S5.19
S5.19 -> S5.20 -> S5.21 -> S5.22
S5.14 -> S5.23 -> S5.24
S5.14 -> S5.25 -> S5.26
```

---

## 3. Threading: Sjuzhet vs. Fabula

### 3.1 The Core Dislocation

The Odyssey's narrative order (sjuzhet) famously differs from its
chronological order (fabula). The poem begins *in medias res* --
ten years after Troy fell, with Odysseus trapped on Ogygia.

**Fabula order** (chronological):
```
F1:  Troy falls                              (before the poem)
F2:  S3.1  - Raid on Cicones                 (year 1)
F3:  S3.2  - Lotus-eaters                    (year 1)
F4:  S3.5-11 - Cyclops                       (year 1)
F5:  S3.12-14 - Aeolus and wind bag          (year 1)
F6:  S3.15 - Laestrygonians                  (year 1)
F7:  S3.16-22 - Circe (1 year stay)          (year 1-2)
F8:  S3.23-27 - Underworld                   (year 2)
F9:  S3.28-30 - Sirens, Scylla, Charybdis    (year 2)
F10: S3.31-33 - Thrinacia, crew dies          (year 2)
F11: S3.34-35 - Ogygia (7 years)             (years 3-9)
F12: S2.1-8 - Release and voyage             (year 10)
F13: S1.1-14 - Telemachy (concurrent w/ F12)  (year 10)
F14: S2.9-16 - Phaeacia & narration          (year 10)
F15: S4.1-12 - Return to Ithaca              (year 10)
F16: S5.1-26 - Vengeance and reunion         (year 10)
```

**Sjuzhet order** (narrative sequence in the poem):
```
T1:  S1.1-14  - Telemachy                     (Bk 1-4)
T2:  S2.1-12  - Calypso release, voyage       (Bk 5-8)
T3:  S3.1-35  - FLASHBACK: Apologoi           (Bk 9-12)
     [Odysseus narrates events of years 1-9]
T4:  S2.13-17 - Phaeacian departure           (Bk 13 start)
T5:  S4.1-12  - Return and reconnaissance     (Bk 13-16)
T6:  S5.1-26  - Vengeance and reunion         (Bk 17-24)
```

### 3.2 Threading Map

```
Thread     Fabula node        Direction     Notes
segment
-------    -----------        ---------     -----
T1         S1 (year 10)       PRESENT       Poem opens here
T2         S2 (year 10)       PRESENT       Parallel timeline to T1
T3         S3 (years 1-9)     ANALEPSIS     Massive flashback
                                             9 years compressed
                                             into 4 books
T4         S2 cont.           PRESENT       Return to frame
T5         S4 (year 10)       PRESENT       Linear from here
T6         S5 (year 10)       PRESENT       Linear to end
```

### 3.3 Embedded Narrations (Nested Threading)

The Odyssey contains multiple levels of narration:

**Level 0:** Homer's voice (the primary narrator)
- Covers S1, S2, S4, S5

**Level 1:** Odysseus narrating to Alcinous
- Covers S3 (all of Bk 9-12)
- This is the largest embedded narration in ancient epic

**Level 1 (other):** Characters within the poem narrating
- Nestor tells Telemachus of the returns (Bk 3)
- Menelaus tells of Proteus (Bk 4)
- Helen tells an Odysseus anecdote (Bk 4)
- Demodocus sings three songs including the Trojan Horse (Bk 8)
- Odysseus tells Penelope a lying tale (Bk 19)

**Level 2:** Characters within Odysseus's narration
- Tiresias prophesies (within S3.24)
- Circe instructs (within S3.22, S3.28)

### 3.4 Thread Revisitation

Certain events are "visited" multiple times by different narrators
or at different moments:

- **The fall of Troy:** Mentioned by Nestor (Bk 3), Menelaus (Bk 4),
  Demodocus's songs (Bk 8), Odysseus (Bk 9). Never shown directly.
  The fabula event is pre-poem; the thread visits its shadow repeatedly.

- **Odysseus at Troy:** Helen's anecdote (Bk 4.240-264), Demodocus's
  Trojan Horse song (Bk 8.499-520). Multiple thread passes through
  events the DAG does not contain as nodes.

- **The scar:** Origin narrated in flashback during the foot-washing
  scene (Bk 19.392-466). The scar exists as a persistent identifier
  used at S5.5 and S5.24.

### 3.5 Concurrent Timelines

The Telemachy (S1) and Odysseus's release from Ogygia (S2) occur
approximately simultaneously. The sjuzhet presents them sequentially
(S1 then S2), but the fabula has them in parallel. This is a case
where the linear constraint of narration serializes parallel DAG
branches.

---

## 4. Parametrized SubDAGs (Recurring Templates)

### 4.1 Template: HOSPITALITY_SEQUENCE

```
hospitality_sequence :: (host :: entity, guest :: entity,
                         gift :: entity?, revelation :: completion?)
                         -> completion

hospitality_sequence(H, G, gift, rev) = slist(
    arrive(G, home_of(H)),
    welcome(H, G),
    feast(H, G),
    [optional: gift(H, G, gift)],
    [optional: rev],
    depart(G, home_of(H))
)
```

**Instantiations:**

| # | Host | Guest | Gift | Revelation | Bk |
|---|------|-------|------|------------|-----|
| 1 | nestor | telemachus | chariot | stories of Troy | 3 |
| 2 | menelaus | telemachus | -- | Proteus account | 4 |
| 3 | alcinous | odysseus | treasure | Odysseus's identity + tale | 7-13 |
| 4 | eumaeus | odysseus (disguised) | -- | lying tales | 14 |
| 5 | circe | odysseus | counsel | route to underworld | 10 |
| 6 | aeolus | odysseus | bag of winds | -- | 10.1-27 |
| 7 | calypso | odysseus (detained) | raft materials | -- | 5 |

**Anti-hospitality** (violated template):

| # | Host/Guest | Violator | Violation | Bk |
|---|-----------|----------|-----------|-----|
| V1 | polyphemus/odysseus | polyphemus | eats guests | 9 |
| V2 | odysseus/suitors | suitors | consume host's wealth | 1-22 |
| V3 | odysseus/crew/helios | crew | eat host's cattle | 12 |

The xenia (hospitality) template is the most pervasive pattern in the
Odyssey. The poem can be read as a systematic exploration of this template
across all its parameter values, including its violation.

### 4.2 Template: RECOGNITION_SCENE

```
recognition_scene :: (recognizer :: entity, recognized :: entity,
                      sign :: mode, emotional_response :: quality)
                      -> completion

recognition_scene(R, O, sign, emotion) = slist(
    encounter(R, O_disguised),
    [trigger: perceive(R, sign)],
    recognize(R, O),
    react(R, emotion)
)
```

**Instantiations:**

| # | Recognizer | Recognized | Sign | Emotion | Bk |
|---|-----------|-----------|------|---------|-----|
| 1 | argos | odysseus | scent/voice | joy, then death | 17.290 |
| 2 | eurycleia | odysseus | scar | shock, silenced | 19.386 |
| 3 | telemachus | odysseus | divine restoration | tears | 16.155 |
| 4 | penelope | odysseus | bed secret | joy, acceptance | 23.173 |
| 5 | laertes | odysseus | scar + orchard | tears | 24.280 |
| 6 | suitors | odysseus | bow strung + arrows | terror | 22.1 |

**Structural note:** These recognitions are carefully ordered by
emotional weight: animal (instinct) -> servant (physical sign) ->
son (divine aid) -> wife (intellectual test) -> father (combined).
The suitors' "recognition" is the anti-pattern: recognition as doom.

### 4.3 Template: DIVINE_INTERVENTION

```
divine_intervention :: (god :: entity, mortal :: entity,
                        method :: mode, purpose :: quality)
                        -> completion

divine_intervention(G, M, method, purpose) = slist(
    observe(G, situation_of(M)),
    act(G, method),
    [result: change(situation_of(M))]
)
```

**Instantiations:**

| # | God | Mortal | Method | Purpose | Bk |
|---|-----|--------|--------|---------|-----|
| 1 | athena | telemachus | disguise as Mentes | inspire search | 1 |
| 2 | athena | telemachus | disguise as Mentor | provide ship | 2 |
| 3 | hermes | odysseus | gives moly | resist Circe | 10 |
| 4 | athena | odysseus | calms wind | survive storm | 5 |
| 5 | athena | odysseus | disguise as beggar | enable plan | 13 |
| 6 | athena | odysseus | restores appearance | reveal to son | 16 |
| 7 | athena | odysseus | aegis | terrify suitors | 22 |
| 8 | athena | ithaca | commands peace | end cycle | 24 |
| 9 | poseidon | odysseus | storm | punish blinding | 5 |
| 10 | zeus | crew | thunderbolt | punish sacrilege | 12 |
| 11 | helios | zeus | demands justice | punish sacrilege | 12 |
| 12 | zeus | hermes | sends messenger | release Odysseus | 5 |

**Contrast:** Athena's interventions are uniformly *enabling* (she
helps Odysseus and Telemachus accomplish their own goals). Poseidon's
are *obstructing*. Zeus's are *judicial* (enforcing cosmic order).

### 4.4 Template: TEMPTATION_AND_RESISTANCE

```
temptation :: (tempter :: entity, tempted :: entity,
               lure :: quality, outcome :: quality)
               -> completion

temptation(T, O, lure, outcome) = slist(
    offer(T, O, lure),
    [choice: resist(O, T) | succumb(O, T)],
    consequence(outcome)
)
```

**Instantiations:**

| # | Tempter | Tempted | Lure | Outcome | Bk |
|---|---------|---------|------|---------|-----|
| 1 | lotus_eaters | crew | oblivion | crew succumbs, Odysseus resists | 9 |
| 2 | circe | crew/odysseus | enchantment | crew succumbs, Odysseus resists | 10 |
| 3 | sirens | odysseus | knowledge | resists (bound to mast) | 12 |
| 4 | calypso | odysseus | immortality | resists (chooses mortality) | 5 |
| 5 | helios_cattle | crew | food | crew succumbs, dies | 12 |
| 6 | suitors | penelope | remarriage | resists (weaving trick) | 2, 19 |

**Pattern:** Odysseus consistently resists; his crew consistently
succumbs. This is the mechanism by which crew is winnowed to zero
and Odysseus returns alone.

### 4.5 Template: MONSTER_ENCOUNTER

```
monster_encounter :: (hero :: entity, monster :: entity,
                      weapon :: mode, loss :: entity?)
                      -> completion

monster_encounter(H, M, weapon, loss) = slist(
    arrive(H, domain_of(M)),
    threat(M, H),
    [combat_or_escape],
    depart(H, domain_of(M)),
    [aftermath: mourn(H, loss)]
)
```

**Instantiations:**

| # | Hero | Monster | Method | Loss | Bk |
|---|------|---------|--------|------|-----|
| 1 | odysseus | polyphemus | olive stake + cunning | 6 men | 9 |
| 2 | odysseus | laestrygonians | flight | 11 ships | 10 |
| 3 | odysseus | scylla | endurance (no weapon) | 6 men | 12 |
| 4 | odysseus | charybdis | cling to fig tree | ship | 12 |

**Structural note:** Monster encounters show escalating loss:
6 men -> 11 ships -> 6 men -> ship. The crew is progressively
stripped away until Odysseus is alone.

### 4.6 Template: PENELOPE'S DECEPTION

```
penelope_scheme :: (method :: mode, duration :: quality,
                    discovery :: completion)
                    -> completion

penelope_scheme(method, duration, discovery) = slist(
    devise(penelope, method),
    execute(penelope, method, for(duration)),
    discover(suitors, method),
    [pressure increases]
)
```

**Instantiations:**

| # | Method | Duration | Discovery | Bk |
|---|--------|----------|-----------|-----|
| 1 | weaving/unweaving shroud | 3 years | maid betrays | 2.93-110 |
| 2 | bow contest (impossible task) | 1 day | -- (Odysseus arrives) | 21 |

---

## 5. Convergence Nodes

### 5.1 High In-Degree Nodes

The following nodes have multiple independent causal paths flowing
into them:

#### CONVERGENCE 1: S4.9 -- reveal(odysseus, identity, to(telemachus))

**In-degree: 5**

Paths converging:
```
1. S2 chain: divine_council -> release -> voyage -> Phaeacia -> Ithaca arrival
2. S1 chain: Athena counsels Telemachus -> journey -> Sparta -> return
3. S4.2: Athena's disguise of Odysseus (enables controlled reveal)
4. S3.24: Tiresias's prophecy (Odysseus knows the situation)
5. S4.4-5: Eumaeus proves loyal (safe location for reveal)
```

This is the first reunion -- father and son -- and the pivot point
where Odysseus shifts from solo survivor to leader of a faction.

#### CONVERGENCE 2: S5.11 -- string_bow(odysseus, bow)

**In-degree: 7** [HIGHEST]

Paths converging:
```
1. S4.11: Father-son vengeance plan
2. S5.7: Penelope's bow contest announcement
3. S5.8: All suitors fail to string it
4. S5.9-10: Eumaeus and Philoetius revealed as allies, doors locked
5. S4.2: Odysseus still in disguise (surprise element)
6. S5.6: Eurycleia silenced (secret maintained)
7. Physical: the bow itself, kept unused for 20 years
```

This is the poem's structural climax. Every thread of preparation --
disguise, alliance-building, weapons removal, Penelope's contest,
suitor failure -- converges on this single action. The bow-stringing
IS the moment where hidden identity becomes visible power.

#### CONVERGENCE 3: S5.19 -- reunite(odysseus, penelope)

**In-degree: 5**

Paths converging:
```
1. S5.14: Suitors slain (physical obstacle removed)
2. S5.18: Hall purified (ritual prerequisite)
3. S5.4: Prior interview established emotional ground
4. S1/S5 Penelope thread: 20 years of loyalty and endurance
5. S5.20-21: Bed secret test (intellectual proof of identity)
```

This is the poem's emotional climax. It follows the structural climax
but requires its own convergence -- Penelope's recognition cannot be
forced; it must be earned through a test only the real Odysseus can pass.

#### CONVERGENCE 4: S5.14 -- slaughter(odysseus, telemachus, suitors)

**In-degree: 6**

Paths converging:
```
1. S4.11: Vengeance plan
2. S5.11: Bow strung (weapon acquired)
3. S5.10: Doors locked, weapons removed
4. S5.15: Athena's divine support
5. S5.9: Eumaeus and Philoetius as allies
6. S4.9: Telemachus as ally (from recognition)
```

#### CONVERGENCE 5: S3.11 -- curse(polyphemus, odysseus)

**Out-degree: HIGH (not convergence but critical divergence node)**

This node is notable not for convergence but for being the single
event from which the most consequences radiate:
```
S3.11 -> S2.6 (Poseidon's storm)
S3.11 -> S3.35 (years of wandering)
S3.11 -> S2.17 (Phaeacian ship petrified)
S3.11 -> [implicit: all delays that keep Odysseus from home]
```

The Cyclops curse is the poem's primary causal engine -- one act of
hubris (S3.10, the boast) generates the curse that drives virtually
all subsequent suffering.

### 5.2 Convergence Summary

```
Node                              In-degree    Type
----                              ---------    ----
S5.11 string_bow                  7            Structural climax
S5.14 slaughter_suitors           6            Action climax
S4.9  reveal_to_telemachus        5            Pivot point
S5.19 reunite_penelope            5            Emotional climax
S5.26 athena_peace                4            Resolution
```

---

## 6. Structural Observations

### 6.1 The Funnel Shape

The Odyssey's DAG has a pronounced **funnel** or **hourglass** shape:

- **Wide divergence** at the beginning: Odysseus's adventures spread
  across the Mediterranean, many parallel paths through different
  islands and monsters (S3). Telemachus's journey adds a second
  independent thread (S1).

- **Narrowing** through the middle: paths begin converging toward
  Ithaca. The crew is progressively eliminated until Odysseus is
  alone.

- **Tight convergence** at the climax: everything funnels to the
  bow-stringing (S5.11) and slaughter (S5.14).

- **Brief re-divergence** at the end: aftermath branches to
  Penelope reunion, Laertes recognition, suitors' kin revolt,
  before final convergence at Athena's peace.

### 6.2 The Subtraction Structure

Unlike most adventure narratives where the hero accumulates
resources/allies, the Odyssey is a narrative of **progressive loss**:

```
12 ships, 600+ men (after Troy)
  -> 11 ships lost (Laestrygonians)
  -> 6 men lost (Scylla)
  -> all crew lost (Thrinacia)
  -> alone on Ogygia (7 years)
  -> raft destroyed (Poseidon's storm)
  -> arrives naked on Scheria
  -> arrives sleeping on Ithaca
```

The hero arrives home with literally nothing -- not even consciousness.
He must then rebuild from zero: one ally (Telemachus), then two
(Eumaeus), then three (Philoetius), then the bow. This is an
**anti-accumulation** DAG followed by a **minimal-accumulation** DAG.

### 6.3 The Dual-Thread Architecture

The poem has two protagonist threads that run independently for the
first half and merge:

```
Thread A (Telemachus): S1.1 -----> S1.14 -------> S4.8
                                                      \
                                                       --> S4.9 (MERGE) --> S5
                                                      /
Thread B (Odysseus):   S3.1 -> ... -> S3.35 -> S2 -> S4.1
```

This Y-shaped merge is the poem's structural backbone. The Telemachy
is not a digression -- it is the second arm of the Y, without which
the convergence at S4.9 cannot occur.

### 6.4 The Embedded Narration Paradox

The Apologoi (S3) create a structural paradox: the poem's largest
block of causally prior events is narrated latest in the sjuzhet.
Books 9-12 contain the events of years 1-2, but the audience only
learns them in the poem's second quarter.

This means the audience experiences the *effects* before the *causes*:
- We see Poseidon's wrath (S2.6) before learning its origin (S3.11)
- We see Odysseus alone on Ogygia before learning how his crew died
- We hear of suitors before understanding why Odysseus is delayed

The DAG makes this visible: the sjuzhet threading jumps backward
across the DAG's dependency structure, creating dramatic irony and
suspense from causal inversion.

### 6.5 Divine Framing

The DAG begins and ends with divine council scenes:
- S1.1 / S2.1: Athena petitions Zeus (opens both halves)
- S5.26: Athena imposes peace (closes)

These form a **divine bracket** around the human action. The DAG's
source and sink nodes are divine, while the interior is human.
This suggests the Odyssey's implicit cosmology: human agency
operates within a space opened and closed by divine decision.

### 6.6 The Recognition Cascade

The recognition scenes (Section 4.2) form a carefully ordered
sequence that is itself a subDAG:

```
argos (involuntary, animal)
  -> eurycleia (involuntary, physical sign)
    -> telemachus (controlled, divine aid)
      -> eumaeus/philoetius (controlled, by choice)
        -> suitors (forced, by violence)
          -> penelope (voluntary, intellectual test)
            -> laertes (combined signs)
```

Each recognition increases the circle of knowledge. The DAG is shaped
so that each recognition enables the next stage of the plan. This
is not mere literary patterning -- it is causal necessity. The
disguise must hold until enough allies are revealed.

---

## 7. ASCII DAG Diagram

```
                    DIVINE COUNCIL (S1.1/S2.1)
                   /                           \
                  /                             \
    TELEMACHY (S1)                        RELEASE FROM OGYGIA (S2)
         |                                       |
    Athena visits                          Calypso frees Odysseus
         |                                       |
    Telemachus to                          Poseidon's storm
    Pylos & Sparta                               |
         |                                 Phaeacia (S2.9-12)
    Learns father                                |
    is alive                               Odysseus narrates
         |                                 APOLOGOI (S3)
    Returns to                             [chronologically first]
    Ithaca                                       |
         |                                    Cicones
    Arrives at                                   |
    Eumaeus's hut                          Lotus-eaters
         |                                       |
         |                                  Cyclops --> CURSE
         |                                       |        |
         |                                    Aeolus   Poseidon's
         |                                       |     wrath
         |                                 Laestrygonians  |
         |                                       |         |
         |                                    Circe        |
         |                                       |         |
         |                                  Underworld     |
         |                                  (Tiresias)     |
         |                                       |         |
         |                                Sirens/Scylla    |
         |                                       |         |
         |                                  Thrinacia      |
         |                                  (crew dies)    |
         |                                       |         |
         |                                  Ogygia (7yr)---+
         |                                       |
         |                                  Released (S2.3)
         |                                       |
         |                              Phaeacians convey home
         |                                       |
         |                              ARRIVES ITHACA (S4.1)
         |                                       |
         |                              Disguised as beggar
         |                                       |
         |                              Eumaeus's hut (S4.4)
         |                                       |
          \                                     /
           \                                   /
            +-----> REVEAL TO SON (S4.9) <----+
                           |
                    Plan vengeance (S4.11)
                           |
              +------------+-------------+
              |            |             |
         Enters palace  Allies      Penelope's
         as beggar      revealed    bow contest
              |            |             |
              |       Doors locked       |
              |       Weapons out        |
              |            |             |
              +-----+------+------+------+
                    |             |
              STRINGS BOW (S5.11)
                    |
              Kills Antinous (S5.12)
                    |
              SLAUGHTER (S5.14)
                    |
           +--------+--------+
           |        |        |
       Purifies  Meets    Suitors'
        hall    Penelope   kin revolt
           |        |        |
           |   BED TEST      |
           |   (S5.20)       |
           |        |        |
           | REUNION (S5.22) |
           |        |        |
           |   Meets Laertes |
           |        |        |
           +--------+--------+
                    |
            ATHENA'S PEACE (S5.26)
```

---

## 8. Open Questions for Cross-Epic Comparison

### Q1: Funnel vs. Braid
The Odyssey's DAG is a funnel: wide divergence narrowing to tight
convergence. Is this shape characteristic of nostos (homecoming)
narratives? Do war narratives (e.g., the Iliad) show a different
shape -- perhaps braided parallel threads that never fully converge?

### Q2: Single-Hero Convergence
The Odyssey has one protagonist whose thread absorbs all others.
Every path leads to Odysseus. Do multi-protagonist epics show
multiple convergence nodes of comparable weight, or does one
always dominate?

### Q3: The Subtraction Pattern
The progressive loss of crew/ships creates a downward slope in the
"resource" dimension. Is this anti-accumulation structure specific
to the Odyssey, or is it a common DAG shape for return narratives
(the hero must be stripped to nothing before arriving home)?

### Q4: Threading Depth
The Odyssey has two levels of narration (Homer -> Odysseus -> characters).
How does threading depth correlate with narrative complexity? Do more
deeply nested embeddings create more complex DAG/sjuzhet divergence?

### Q5: Divine Bracket
The Odyssey's divine framing (divine council opens, divine peace closes)
creates a containing structure. Do other epics show similar source/sink
patterns, or does divine action distribute more evenly through the DAG?

### Q6: Recognition Cascade as Template
The ordered sequence of recognitions is one of the Odyssey's most
distinctive structural features. Do other epics have comparable
cascading-revelation structures? If so, is the ordering similarly
motivated by causal necessity (each recognition enabling the next)?

### Q7: Hospitality Template Density
The hospitality template recurs more than any other in the Odyssey.
Is there a comparable "dominant template" in other epics -- a single
interaction pattern that is instantiated across a majority of episodes?

### Q8: Embedded Causality
The Apologoi present causes-told-after-effects. Is this temporal
inversion in the sjuzhet correlated with the DAG's depth? That is,
do the events with the most downstream consequences tend to be the
ones narrated out of order?

### Q9: Width-at-Resolution
At Scale 2, how many independent parallel threads exist at the
poem's widest point? Compare this "maximum width" across epics
as a measure of narrative parallelism.

### Q10: Curse-Node Centrality
The Cyclops curse (S3.11) has exceptionally high downstream influence
despite being a relatively early event. In DAG terms, its
betweenness centrality should be very high. Do other epics have
comparable single-event nodes with outsized causal reach?
