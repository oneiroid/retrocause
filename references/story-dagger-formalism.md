# StoryDagger Formalism Reference

Condensed from FORMAL_MODEL_v2.md (Lessard & Levison 2013 rebase).
This file contains ONLY what an extraction agent needs.

---

## 1. The Semantic Lexicon L

L is a vocabulary of verbs/actions with argument structure. Each entry:

```
name(arg_1, arg_2, ...) = "informal gloss"
```

### Rules

- L is open and extensible -- add entries as the story requires.
- Use the simplest common verb (eat not devour, kill not slay).
- The formal object is the expression, not the English gloss.
- Two expressions are identical iff same function + same arguments.

---

## 2. Semantic Expressions

A semantic expression is an application of L entries.
Each expression = exactly one DAG node.

```
eat(wolf, grandmother)
build(pig_3, house, with(brick))
rescue(huntsman, grandmother, from(wolf))
```

---

## 3. The DAG

D = (V, E) where:
- V = nodes, each carrying a semantic expression
- E = directed edges e(v, w) meaning "w depends on v"
- Acyclic: no directed path from any node back to itself

### Two scales

- **Scale 0**: Whole story as one node with a one-line gloss.
- **Scale 1**: Events -- individual causal nodes with expressions,
  connected by dependency edges. This is the working level.

There is no imposed grouping. No "acts," no "sequences." If events
cluster, that emerges from the causal topology, not from analyst
declaration.

### Dependency semantics

An edge e(v, w) means: **w could not occur without v having occurred**.
This is causal dependency, not temporal adjacency.

The dependency test: "Could w occur if v had NOT occurred?"
If no, draw edge e(v, w). If yes, no edge.

Do NOT assume events form a total sequence. Only draw edges where
the counterfactual test holds. The event structure is a partial
order (DAG), not a linear order (list).

---

## 4. Parametrized Templates

A **parametrized template** is a pattern of events with typed
parameter slots. Different parameter values = different concrete
event sequences with the same causal structure.

### When to declare a template

- Minimum 2 instantiations in the story
- **Same action verbs** in the same causal structure
- Different parameter values (entities, qualities, modes)
- If the verbs differ, it's contrast, not a template

### Pattern breaks

When a template has N instantiations and one uses a different verb
or produces a structurally different outcome, that is a **pattern
break**. Pattern breaks are often the most structurally meaningful
point in a story. Mark these explicitly.

### Contrast

The meaning of a template lives in what DIFFERS between instantiations.
The contrast between matching instantiations shows parametric variation;
the contrast at a pattern break shows the story's thesis.

---

## 5. Threading (optional annotation)

Threading describes HOW a story is TOLD, not the causal structure.
It is metadata, not core structure.

| Term | Meaning |
|------|---------|
| Fabula | The causal structure = the DAG |
| Sjuzhet | The telling order = a traversal of DAG nodes |

Note telling-order deviations (flashbacks, withholding) only if
they are structurally interesting. When sjuzhet = fabula (as in
most fairy tales), skip this section.
