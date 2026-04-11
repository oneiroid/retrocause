# StoryDagger Output Template

Use this template for all story-dagger extractions.
Sections 0-5 are your working markdown (reasoning trace).
Section 6 is the structured JSON (the real deliverable for downstream tools).

Code will compute derived fields (node counts) and validate.

---

# DAG Analysis: [Story Title]

## 0. Version Declaration

**Version:** [version string]
**Source:** [brief citation or description]

---

## 1. Semantic Lexicon

### 1.1 Entities

```
[List all entities as snake_case identifiers, grouped by role.]

-- Characters
name_1, name_2, ...

-- Objects
object_1, object_2, ...

-- Places
place_1, place_2, ...
```

### 1.2 Actions

```
[Define each action with argument structure and gloss.]

action_name(x, y) = "informal gloss"
```

---

## 2. Scale 0 (Whole Story)

```
story_name
```

[One sentence: what is this story "about" at the coarsest grain?]

---

## 3. Scale 1 (Events and Causal Edges)

[List ALL events as nodes with unique snake_case IDs and typed expressions.
Then list ALL causal edges with reasons.

Events are a PARTIAL ORDER (DAG), not a sequence. Do not assume total
ordering. Only draw edges where the counterfactual test holds.]

**Nodes:**
```
node_id_1: typed_expression_1
node_id_2: typed_expression_2
node_id_3: typed_expression_3
...
```

**Causal edges:**
```
e(node_id_1, node_id_2)  -- [reason: why does node_2 depend on node_1?]
e(node_id_1, node_id_3)  -- [reason]
...
```

---

## 4. Parametrized Templates (if any)

[Declare templates. Show structure (verb pattern), instantiations,
and contrast. Flag pattern breaks.]

```
template_name($p1, $p2) structure:
    step 1: action_verb($p1, fixed_entity)
    step 2: action_verb(fixed_entity, $p2)
```

**Instantiations:**

| # | Parameters | Outcome | Pattern break? |
|---|-----------|---------|----------------|
| 1 | values | what happens | no |
| 2 | values | what happens | YES: [explain] |

**Contrast:** [What differs and why it matters.]

[If no templates: "No parametrized templates identified.
Key contrasts: [list thematic oppositions]."]

---

## 5. Parallel DAGs and Contrast (if templates exist)

[For each template with >= 2 instantiations, identify the parallel
subDAG pairs and compute their contrast.]

**Parallel pair:** template_name inst #A vs inst #B

| Parameter | Inst #A | Inst #B |
|-----------|---------|---------|
| param_1 | value | value |
| param_2 | value | value |
| outcome | what happens | what happens |

**Contrast meaning:** [What the difference reveals about the story's structure.]

[If a pattern break exists in the pair, note how the break changes
the structural meaning.]

---

## 6. Telling-Order Deviations (optional)

[Only if sjuzhet differs from fabula. Skip for chronological stories.]

---

## 7. JSON Export

[This is the structured deliverable. Contains ONLY your decisions --
entities, nodes, edges, templates, parallel DAGs. Code computes
everything else.]

```json
{
  "meta": {
    "story": "[title]",
    "version": "[version string]"
  },
  "entities": [
    {"id": "name", "type": "character|object|place|collective"}
  ],
  "lexicon": [
    {"action": "name", "gloss": "desc"}
  ],
  "scale_0": {"id": "root_name", "gloss": "one-line"},
  "nodes": [
    {
      "id": "node_id",
      "expression": "typed_expression",
      "template_ref": null,
      "inst_index": null,
      "pattern_break": false
    }
  ],
  "dependencies": [
    {"from": "source_id", "to": "target_id", "reason": "why"}
  ],
  "templates": [
    {
      "name": "template_name",
      "structure": [
        {"step": 1, "action": "verb", "args": ["$param_1", "fixed"]}
      ],
      "instantiations": [
        {"index": 1, "params": {"p1": "val"}, "outcome": "desc",
         "pattern_break": false}
      ],
      "contrast": "what differs"
    }
  ],
  "parallel_dags": [
    {
      "template": "template_name",
      "inst_a": 1,
      "inst_b": 2,
      "contrast": {"param_name": ["val_a", "val_b"]},
      "meaning": "what the contrast reveals"
    }
  ]
}
```
