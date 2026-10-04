#!/usr/bin/env node
// Where should the same-situation judge's threshold sit? (same_judge.js)
//
//   node experiments/judge_calibration.js [--depth 2] [--width 3] [--seed 7]
//   node experiments/judge_calibration.js --labels <file>   # score labelled cases
//
// Grows from mid-story nodes of every seed story with the judge in RECORD
// mode: each merge the surface key proposes is put to the judge, the verdict
// is logged, and the merge goes ahead regardless — so the run is the same run
// the judge-free grower would make, and every case the judge will meet in
// practice is collected. Writes experiments/out/judge_cal.json: one case per
// proposed merge, with both routes as prose and P(yes).
//
// Labels are added by hand (or by the reference rater) as `"same": true|false`
// on each case; `--labels` then prints accuracy and false merges per
// threshold. Ground truth is never the model's own verdict.

"use strict";

const fs = require("fs");
const path = require("path");

const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const { createClient, SAMPLED_SAMPLING } = require(path.join(R, "llm_client.js"));
const { growGraph, formatForPrompt, ancestorPath } = require(path.join(R, "grower.js"));
const { createJudge, telling } = require(path.join(R, "same_judge.js"));
const { seeds } = require(path.join(R, "seeds.js"));
const { DEFAULT_NODES } = require(path.join(R, "experiments", "continue_probe.js"));

const OUT = path.join(R, "experiments", "out", "judge_cal.json");
const GROW_PROMPT = "branch.v4";
const JUDGE_PROMPT = "same.v2";
// Thresholds the --labels report sweeps.
const THRESHOLDS = [0.3, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8];

function parseArgs(argv) {
  const args = { depth: 2, width: 3, seed: 7, maxNodes: 12 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--labels") { args.labels = value; i += 1; }
    else if (flag === "--depth") { args.depth = +value; i += 1; }
    else if (flag === "--width") { args.width = +value; i += 1; }
    else if (flag === "--seed") { args.seed = +value; i += 1; }
    else throw new Error(`unknown flag: ${flag}`);
  }
  return args;
}

const read = (name) => fs.readFileSync(path.join(R, "prompts", `${name}.txt`), "utf8");

async function collect(args) {
  const cacheDir = path.join(R, "cache");
  const growClient = createClient({ cacheDir, sampling: { ...SAMPLED_SAMPLING, seed: args.seed } });
  const judgeClient = createClient({ cacheDir });
  const judge = createJudge({ client: judgeClient, template: read(JUDGE_PROMPT) });

  const cases = [];
  for (const story of Object.keys(DEFAULT_NODES)) {
    const graph = Engine.normalizeGraph(seeds[story]);
    for (const from of DEFAULT_NODES[story]) {
      // Record mode: log the verdict, let the merge happen.
      const recording = async (g, survivorId, fromId, candidate) => {
        const verdict = await judge(g, survivorId, fromId, candidate);
        const byId = new Map(g.nodes.map((n) => [n.id, n]));
        cases.push({
          story, start: from, from: fromId, survivor: survivorId,
          survivorKind: byId.get(survivorId).createdBy === "grown" ? "grown" : "told",
          candidateRoute: telling([...ancestorPath(g, fromId).map((id) => byId.get(id)), candidate]),
          candidateState: candidate.state,
          survivorRoute: telling(ancestorPath(g, survivorId).map((id) => byId.get(id))),
          survivorState: byId.get(survivorId).state,
          pYes: verdict.pYes,
          pYesByOrder: verdict.orders.map((o) => o.pYes),
        });
        return { ...verdict, same: true };
      };
      const { stats } = await growGraph({
        graph, client: growClient, promptTemplate: read(GROW_PROMPT), format: formatForPrompt(GROW_PROMPT),
        from, depth: args.depth, width: args.width, maxNodes: args.maxNodes, judge: recording,
      });
      process.stderr.write(`${story} ${from}: +${stats.created} created, ${stats.mergedDuplicates} merged\n`);
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    manifest: { growPrompt: GROW_PROMPT, judgePrompt: JUDGE_PROMPT, ...args, generatedAt: new Date().toISOString() },
    cases,
  }, null, 2));
  process.stderr.write(`\n${cases.length} proposed merges → ${OUT}\n`);
}

function report(file) {
  const { cases } = JSON.parse(fs.readFileSync(file, "utf8"));
  const labelled = cases.filter((c) => typeof c.same === "boolean" && c.pYes !== null);
  const unanswered = cases.filter((c) => c.pYes === null).length;
  console.log(`${labelled.length} labelled (${labelled.filter((c) => c.same).length} same), ${unanswered} unanswered by the judge`);
  console.log("threshold  kept-true  refused-true  FALSE MERGES  refused-false");
  for (const t of THRESHOLDS) {
    const accept = (c) => c.pYes >= t;
    const row = [
      labelled.filter((c) => c.same && accept(c)).length,
      labelled.filter((c) => c.same && !accept(c)).length,
      labelled.filter((c) => !c.same && accept(c)).length,
      labelled.filter((c) => !c.same && !accept(c)).length,
    ];
    console.log(`  ${t.toFixed(1)}       ${row.map((n) => String(n).padEnd(12)).join(" ")}`);
  }
  // The surface key alone accepts every case.
  console.log(`surface key alone: ${labelled.filter((c) => !c.same).length} false merges of ${labelled.length}`);
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  (args.labels ? Promise.resolve(report(args.labels)) : collect(args))
    .catch((error) => { console.error(error.stack); process.exit(1); });
}
