"""Process a story-dagger markdown output into validated, enriched JSON.

Usage: python tools/process_dag.py artefacts/dag_some_story.md

1. Extracts the JSON block from Section 6
2. Validates structural consistency
3. Computes derived fields (node count)
4. Writes enriched JSON to artefacts/dag_some_story.json

Exit code 0 = success, 1 = errors found.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path


def extract_json(text):
    """Pull the JSON block from the markdown."""
    matches = list(re.finditer(r'```json\s*\n(.*?)```', text, re.DOTALL))
    if not matches:
        return None, "No ```json block found"
    try:
        return json.loads(matches[-1].group(1)), None
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON: {e}"


def validate(data):
    """Run all structural checks. Returns (errors, warnings)."""
    errors = []
    warnings = []

    # --- Required top-level keys ---
    for key in ("meta", "entities", "lexicon", "scale_0", "nodes",
                "dependencies", "templates"):
        if key not in data:
            errors.append(f"Missing top-level key: '{key}'")
    if errors:
        return errors, warnings  # can't proceed without structure

    # --- Nodes ---
    node_ids = [n["id"] for n in data["nodes"]]
    n = len(node_ids)
    dupes = [nid for nid, cnt in Counter(node_ids).items() if cnt > 1]
    if dupes:
        errors.append(f"Duplicate node IDs: {dupes}")
    node_set = set(node_ids)

    if n < 10:
        warnings.append(f"Node count {n} is low (target 15-30 for fairy tales)")
    elif n > 60:
        warnings.append(f"Node count {n} is high (target 15-30 for fairy tales)")

    # --- Dependencies reference valid nodes ---
    for dep in data["dependencies"]:
        if dep["from"] not in node_set:
            errors.append(f"Dependency source '{dep['from']}' not in nodes")
        if dep["to"] not in node_set:
            errors.append(f"Dependency target '{dep['to']}' not in nodes")

    # --- Acyclicity check ---
    adj = {nid: [] for nid in node_ids}
    for dep in data["dependencies"]:
        if dep["from"] in adj:
            adj[dep["from"]].append(dep["to"])
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {nid: WHITE for nid in node_ids}

    def has_cycle(v):
        color[v] = GRAY
        for w in adj.get(v, []):
            if color.get(w) == GRAY:
                return True
            if color.get(w) == WHITE and has_cycle(w):
                return True
        color[v] = BLACK
        return False

    for nid in node_ids:
        if color[nid] == WHITE:
            if has_cycle(nid):
                errors.append("Dependency graph contains a cycle!")
                break

    # --- Template checks ---
    for tmpl in data["templates"]:
        tname = tmpl.get("name", "?")
        structure = tmpl.get("structure", [])
        if not structure:
            warnings.append(f"Template '{tname}' has no 'structure' field")
            continue

        for inst in tmpl.get("instantiations", []):
            idx = inst.get("index")
            tagged = [n for n in data["nodes"]
                      if n.get("template_ref") == tname
                      and n.get("inst_index") == idx]
            if not tagged:
                warnings.append(
                    f"Template '{tname}' inst {idx}: no nodes tagged "
                    f"template_ref='{tname}', inst_index={idx}")
                continue
            if len(tagged) != len(structure):
                warnings.append(
                    f"Template '{tname}' inst {idx}: {len(tagged)} tagged "
                    f"nodes but structure has {len(structure)} steps")
            # Check verbs match (unless pattern_break)
            for i, step in enumerate(structure):
                if i >= len(tagged):
                    break
                expr = tagged[i].get("expression", "")
                m = re.match(r'([a-z_]+)', expr)
                if m and m.group(1) != step.get("action", ""):
                    if not tagged[i].get("pattern_break"):
                        errors.append(
                            f"Template '{tname}' inst {idx} step {i+1}: "
                            f"node '{tagged[i]['id']}' verb '{m.group(1)}' "
                            f"!= template verb '{step['action']}' "
                            f"(mark pattern_break:true if intentional)")

    # --- Parallel DAGs ---
    for pdg in data.get("parallel_dags", []):
        tname = pdg.get("template", "?")
        tmpl_names = {t.get("name") for t in data["templates"]}
        if tname not in tmpl_names:
            errors.append(
                f"Parallel DAG references template '{tname}' "
                f"which is not in templates")
        inst_a = pdg.get("inst_a")
        inst_b = pdg.get("inst_b")
        # Check that referenced instantiations exist
        for tmpl in data["templates"]:
            if tmpl.get("name") == tname:
                inst_indices = {
                    i.get("index") for i in tmpl.get("instantiations", [])}
                for idx in (inst_a, inst_b):
                    if idx not in inst_indices:
                        errors.append(
                            f"Parallel DAG '{tname}': inst {idx} "
                            f"not in template instantiations")
                break

    # --- Entity consistency ---
    json_entity_ids = {e["id"] for e in data.get("entities", [])}
    expr_entities = set()
    for node in data["nodes"]:
        expr = node.get("expression", "")
        tokens = re.findall(r'[a-z_0-9]+', expr)
        if tokens:
            for t in tokens[1:]:
                if t not in ("with", "by", "from", "to", "of", "in"):
                    expr_entities.add(t)
    for eid in json_entity_ids:
        if eid not in expr_entities:
            warnings.append(f"Entity '{eid}' declared but not in any expression")

    return errors, warnings


def compute_derived(data):
    """Compute node count. Mutates data in place."""
    node_ids = [n["id"] for n in data["nodes"]]
    data["meta"]["node_count"] = len(node_ids)
    return data


def process(filepath):
    path = Path(filepath)
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()

    data, err = extract_json(text)
    if err or data is None:
        print(f"\n  ERROR: {err or 'No JSON data'}")
        return 1

    errors, warnings = validate(data)

    # Compute derived fields
    data = compute_derived(data)

    # Print results
    print(f"\n=== Process: {filepath} ===\n")
    if not errors and not warnings:
        print("  ALL CHECKS PASSED")
    for e in errors:
        print(f"  ERROR: {e}")
    for w in warnings:
        print(f"  WARN:  {w}")

    n = data["meta"]["node_count"]
    tmpl = len(data.get("templates", []))
    deps = len(data.get("dependencies", []))
    pdgs = len(data.get("parallel_dags", []))
    print(f"\n  Nodes: {n} | Deps: {deps} | Templates: {tmpl} | Parallels: {pdgs}")

    if errors:
        print(f"\n  {len(errors)} errors -- JSON NOT written\n")
        return 1

    # Write enriched JSON
    json_path = path.with_suffix('.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\n  -> {json_path}")
    if warnings:
        print(f"  {len(warnings)} warnings (non-blocking)\n")
    else:
        print()
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <dag_file.md>")
        sys.exit(1)
    sys.exit(process(sys.argv[1]))
