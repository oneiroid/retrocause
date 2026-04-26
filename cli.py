"""Semi-automatic DAG builder REPL.

Usage:
    python cli.py                                      # lineage, defaults
    python cli.py --domain negotiation                 # switch domain
    python cli.py --domain lineage --lineage-max-gen 6

Domains:
    lineage       -- 2 action types (replicate + mutate). Minimal-alphabet
                     case; expected to produce only trivial recurring
                     paths. §10.3 of FORMAL_MODEL_v3.
    negotiation   -- 4 action types (propose, counter, accept, walk). The
                     counter-example domain for §10.3.
    rps           -- Rock-Paper-Scissors with N simultaneous players.
                     Each round-action is a joint profile; many profiles
                     collapse onto the same score-delta at round boundaries.

Commands inside the REPL:
    help                         -- list commands
    info                         -- one-line DAG summary
    list [N]                     -- show first N frontier nodes
    node <id>                    -- show details of a single node
    expand all                   -- expand every frontier node one level
    expand depth <N>             -- BFS expand N levels
    expand <id>                  -- expand a single node
    prune <id>                   -- remove node + orphaned descendants
    label <id> <name>            -- tag a node
    unlabel <id> <name>          -- remove a tag
    pin <id>                     -- mark protected
    unpin <id>                   -- remove protection
    detect                       -- run detectors (convergence + templates)
    save [path]                  -- write JSON (default viz/dag.json)
    quit | exit                  -- leave
"""
from __future__ import annotations

import argparse
import shlex
import sys
import traceback
from pathlib import Path

from builder.dag import DAG
from builder.expand import expand_depth, expand_frontier, expand_one, seed_dag
from builder.export import write_json
from domains.lineage import LineageRules
from domains.negotiation import NegotiationRules
from domains.rps import RpsRules
from domains.rps import RpsRules


# -------------------------- command handlers ---------------------------

def cmd_help(dag: DAG, rules, args) -> str:
    return __doc__.strip().split("Commands inside the REPL:", 1)[1].strip()


def cmd_info(dag: DAG, rules, args) -> str:
    return dag.summary(rules)


def cmd_list(dag: DAG, rules, args) -> str:
    n = int(args[0]) if args else 10
    fr = dag.frontier(rules)
    lines = [f"frontier: {len(fr)} nodes (showing up to {n})"]
    for nid in fr[:n]:
        node = dag.nodes[nid]
        lines.append(
            f"  #{nid:>4}  gen={node.generation}  {node.expr}  "
            f"(in={dag.in_degree(nid)} out={dag.out_degree(nid)})"
        )
    return "\n".join(lines)


def cmd_node(dag: DAG, rules, args) -> str:
    if not args:
        return "usage: node <id>"
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    n = dag.nodes[nid]
    preds = dag.predecessors(nid)
    succs = dag.successors(nid)
    out_edges = [dag.edges[i] for i in dag.out_edges[nid]]
    in_edges = [dag.edges[i] for i in dag.in_edges[nid]]
    lines = [
        f"#{nid}  expr: {n.expr}",
        f"       gen: {n.generation}   expanded: {n.expanded}   terminal: {rules.is_terminal(n.state)}",
        f"       pinned: {n.pinned}   labels: {sorted(n.labels) or '-'}",
        f"       in={len(preds)}  out={len(succs)}",
    ]
    if in_edges:
        lines.append("  predecessors:")
        for e in in_edges[:10]:
            lines.append(f"    #{e.from_id} --{e.action_label}-->")
        if len(in_edges) > 10:
            lines.append(f"    ... and {len(in_edges) - 10} more")
    if out_edges:
        lines.append("  successors:")
        for e in out_edges[:10]:
            lines.append(f"    --{e.action_label}--> #{e.to_id}")
        if len(out_edges) > 10:
            lines.append(f"    ... and {len(out_edges) - 10} more")
    return "\n".join(lines)


def cmd_expand(dag: DAG, rules, args) -> str:
    if not args:
        return "usage: expand all | expand depth <N> | expand <id>"
    if args[0] == "all":
        added = expand_frontier(dag, rules)
        return f"expanded frontier: +{added} edges.  {dag.summary(rules)}"
    if args[0] == "depth":
        if len(args) < 2:
            return "usage: expand depth <N>"
        n = int(args[1])
        added = expand_depth(dag, rules, levels=n)
        return f"expanded {n} levels: +{added} edges.  {dag.summary(rules)}"
    # Otherwise: expand <id>
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    added = expand_one(dag, nid, rules)
    return f"expanded #{nid}: +{len(added)} edges.  {dag.summary(rules)}"


def cmd_prune(dag: DAG, rules, args) -> str:
    if not args:
        return "usage: prune <id>"
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    if dag.nodes[nid].pinned:
        return f"refuse: #{nid} is pinned.  unpin first."
    # Also refuse if any descendant-to-be-removed is pinned.
    candidates = set()
    stack = [nid]
    while stack:
        x = stack.pop()
        if x in candidates:
            continue
        candidates.add(x)
        for s in dag.successors(x):
            stack.append(s)
    pinned_in_scope = [c for c in candidates if dag.nodes[c].pinned]
    if pinned_in_scope:
        return (
            f"refuse: subtree of #{nid} contains pinned nodes: "
            f"{pinned_in_scope}"
        )
    removed = dag.prune(nid)
    return f"pruned {len(removed)} nodes: {sorted(removed)[:10]}{'...' if len(removed) > 10 else ''}"


def cmd_label(dag: DAG, rules, args) -> str:
    if len(args) < 2:
        return "usage: label <id> <name>"
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    name = " ".join(args[1:])
    dag.nodes[nid].labels.add(name)
    return f"#{nid} labels now: {sorted(dag.nodes[nid].labels)}"


def cmd_unlabel(dag: DAG, rules, args) -> str:
    if len(args) < 2:
        return "usage: unlabel <id> <name>"
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    name = " ".join(args[1:])
    dag.nodes[nid].labels.discard(name)
    return f"#{nid} labels now: {sorted(dag.nodes[nid].labels)}"


def cmd_pin(dag: DAG, rules, args) -> str:
    if not args:
        return "usage: pin <id>"
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    dag.nodes[nid].pinned = True
    return f"#{nid} pinned"


def cmd_unpin(dag: DAG, rules, args) -> str:
    if not args:
        return "usage: unpin <id>"
    nid = int(args[0])
    if nid not in dag.nodes:
        return f"no such node: #{nid}"
    dag.nodes[nid].pinned = False
    return f"#{nid} unpinned"


def cmd_detect(dag: DAG, rules, args) -> str:
    # Lazy import so the CLI still works before detect.py is written.
    try:
        from builder import detect
    except ImportError:
        return "detect.py not available yet"
    return detect.report(dag, rules)


def cmd_save(dag: DAG, rules, args) -> str:
    default = Path(__file__).parent / "viz" / "dag.json"
    path = Path(args[0]) if args else default
    written = write_json(dag, rules, path)
    return f"wrote {written}  ({dag.summary(rules)})"


COMMANDS = {
    "help": cmd_help,
    "info": cmd_info,
    "list": cmd_list,
    "node": cmd_node,
    "expand": cmd_expand,
    "prune": cmd_prune,
    "label": cmd_label,
    "unlabel": cmd_unlabel,
    "pin": cmd_pin,
    "unpin": cmd_unpin,
    "detect": cmd_detect,
    "save": cmd_save,
}


# -------------------------- main loop ----------------------------------

def build_lineage_rules(args: argparse.Namespace) -> LineageRules:
    return LineageRules(
        n_sites=args.lineage_n_sites,
        n_alleles=args.lineage_n_alleles,
        alive_threshold=args.lineage_threshold,
        max_generation=args.lineage_max_gen,
        target=tuple([0] * args.lineage_n_sites),
    )


def build_negotiation_rules(args: argparse.Namespace) -> NegotiationRules:
    return NegotiationRules(
        value_max=args.neg_value_max,
        max_turn=args.neg_max_turn,
        opener=args.neg_opener,
    )


def build_rps_rules(args: argparse.Namespace) -> RpsRules:
    return RpsRules(
        n_players=args.rps_n_players,
        max_round=args.rps_max_round,
        min_score=args.rps_min_score,
    )


DOMAIN_BUILDERS = {
    "lineage": build_lineage_rules,
    "negotiation": build_negotiation_rules,
    "rps": build_rps_rules,
}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Semi-automatic DAG builder.")
    p.add_argument("--domain", choices=sorted(DOMAIN_BUILDERS),
                   default="lineage")

    # lineage knobs
    p.add_argument("--lineage-n-sites", type=int, default=5)
    p.add_argument("--lineage-n-alleles", type=int, default=3)
    p.add_argument("--lineage-threshold", type=int, default=2,
                   help="alive_threshold: genomes with fitness below this are dead")
    p.add_argument("--lineage-max-gen", type=int, default=10)

    # negotiation knobs
    p.add_argument("--neg-value-max", type=int, default=5,
                   help="offers range over 0..value_max inclusive")
    p.add_argument("--neg-max-turn", type=int, default=8)
    p.add_argument("--neg-opener", choices=("a", "b"), default="a")

    # rps knobs
    p.add_argument("--rps-n-players", type=int, default=3)
    p.add_argument("--rps-max-round", type=int, default=5)
    p.add_argument("--rps-min-score", type=int, default=-3,
                   help="a player is eliminated when score drops below this")

    p.add_argument("--script", type=str, default=None,
                   help="file of commands to run then exit")
    args = p.parse_args(argv)

    builder = DOMAIN_BUILDERS[args.domain]
    rules = builder(args)
    dag = seed_dag(rules)
    print(f"domain: {args.domain}")
    print(f"rules:  {rules}")
    print(dag.summary(rules))
    print("type 'help' for commands.")

    lines: list[str] = []
    if args.script:
        lines = Path(args.script).read_text(encoding="utf-8").splitlines()

    while True:
        if lines:
            line = lines.pop(0)
            print(f"> {line}")
        else:
            try:
                line = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0
        if not line or line.startswith("#"):
            continue
        if line in ("quit", "exit"):
            return 0

        try:
            tokens = shlex.split(line)
        except ValueError as e:
            print(f"parse error: {e}")
            continue
        cmd, cargs = tokens[0], tokens[1:]
        handler = COMMANDS.get(cmd)
        if handler is None:
            print(f"unknown command: {cmd}  (try 'help')")
            continue
        try:
            out = handler(dag, rules, cargs)
        except Exception:
            print("command failed:")
            traceback.print_exc()
            continue
        if out:
            print(out)


if __name__ == "__main__":
    sys.exit(main())
