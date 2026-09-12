// Grading CLI for continue_probe.js output (continuation plan v3).
//
//   node experiments/grade.js <probe.json>
//   node experiments/grade.js <probe.json> --resume <graded.json>
//   node experiments/grade.js <probe.json> --labels <labels.json> --rater claude
//   node experiments/grade.js --compare <a.graded.json> <b.graded.json>
//
// Shows one node's history, then every sample from every arm interleaved in a
// SHUFFLED order, and asks the questions in QUESTIONS below. The grader
// answers y/n only — no significance judgments, no scoring of "how"
// plausible, nothing that asks a human to be a metric.
//
// The shuffle is seeded from the manifest's run seed and recorded, so the
// presentation order replays. It is the one thing between the probe and the
// grade that could bias the result, and an unrecorded shuffle would make the
// bias unauditable.
//
// LIMITATION, recorded not engineered around: the two arms have different
// surface formats ("Then X …, and now Y." vs "expr — state"), so shuffling
// hides WHICH sample came from which arm only partially. A grader who notices
// the format knows the arm. For a MACHINE rater this limitation is total.
//
// ── why possibility and consistency are separate questions (2026-09-10) ─────
//
// v1 asked one plausibility question and one told-story question. Measuring
// two raters against each other on the same 15 samples produced kappa 0.30
// with every single disagreement running one direction: the human said
// plausible, Claude said no, never the reverse. That is not rater noise, it
// is two people answering different questions under one prompt.
//
// The human answered the prompt as written — could this happen next — and
// narratively each rejected sample could. Claude was answering a stricter
// unwritten question: is this well-formed and consistent with the history.
// Both readings are defensible, which makes the INSTRUMENT the problem, not
// either rater. Concretely, these three were accepted under the first reading
// and rejected under the second:
//
//   disregard(trojans, horse) — still standing around, waiting for a
//     decision                                  → advances nothing
//   ignore(trojans, sinon) — heard the warning … leaving the horse in the
//     city                                      → no warning yet; horse not in
//   … the men are inside the horse ready to attack the Greeks when they
//     return                                    → the men inside ARE Greeks
//
// So the questions are split. `possible` is the plan's original question, its
// wording unchanged. `consistent` is the reading that was being applied
// silently. Summaries report both, and their conjunction, rather than picking
// one — the whole finding is that they are not the same measurement.
//
// COST: four y/n per sample instead of two. `--resume` exists so this does
// not mean re-answering questions already answered — see below.
//
// ── non-interactive grading, and why it needs a rater id ────────────────────
//
// `--labels` records a rater's answers from a file instead of a terminal, so
// a NON-HUMAN rater can be scored the same way a human is and the two files
// compared. It is not a shortcut around Gate 0: a model grading a model's
// output, under a prompt and a grammar the same model's collaborator
// authored, is not an independent measurement.
//
// The only sound use is CALIBRATION: rate a batch whose human labels do not
// exist yet, have the human rate a sample of the same batch, and compare.
// Agreement earns the rater; it is not assumed. `experiments/same_state.js`
// is the local precedent — the model can do bounded discrimination, and its
// labels still needed a human pass, and one flipped.
//
// RATER STATUS, 2026-09-10: after the calibration runs the human determined
// the disagreements came from their own misreading of the questions and
// designated Claude's grading the reference. From that date Claude-rated
// files are data, not provisional.

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const R = path.join(__dirname, "..");
const Ids = require(path.join(R, "ids.js"));

// The instrument. Adding or reordering a question here is the only place it
// happens: the ask loop, the label-file format, the summaries and the
// agreement check all derive from this list.
//
// WORDING IS THE INSTRUMENT. Measured per-question agreement on 15 samples,
// human against Claude, after the first split:
//
//     consistent   93%  kappa  0.84   ← works
//     possible     67%  kappa  0.30
//     toldStory    73%  kappa -0.00
//     advances     33%  kappa -0.15   ← worse than chance
//
// `advances` failed because "does it change anything?" is ambiguous between
// "does the world state change" and "does this deviate from the told story".
// The human took the second reading and answered "no change" to six samples
// of the Trojans bringing the horse in — while marking those same samples
// `toldStory = yes`. Under that reading the two questions are the SAME
// question, which is why agreement went negative.
//
// `toldStory` failed the same way: after `th_gift` the told next event is
// Sinon selling the lie, not the horse entering, yet horse-entering samples
// were marked yes — so it was read as "happens in the told story at some
// point" rather than "is the immediate next node".
//
// Both prompts now name their referent explicitly. The general lesson, and it
// has now cost three rounds: a grading question that does not say WHAT it is
// asking about relative to gets answered against whatever referent the reader
// supplies, and two raters supply different ones.
//
// `advances` was added after `consistent`, because splitting plausibility in
// two was not enough. Claude's `consistent` rate on the calibration subset
// came out HIGHER than its `possible` rate (11/15 against 8/15), which is
// only possible if some rejections were neither about possibility nor about
// consistency. They were about a third thing:
//
//   disregard(trojans, horse) — The Trojans are still standing around the
//     abandoned horse, waiting for a decision to be made.
//
// Perfectly consistent with the history, and it advances nothing. The repo
// already names this — `growth.js` refuses NULL TRANSITIONS, a continuation
// matching its source in both `expr` and `state`, as an edge-validity rule.
// A grading instrument that cannot see the distinction the engine enforces is
// measuring something the engine does not use.
//
// `possible` keeps the plan's original wording verbatim, which is also what
// v1 stored under the name `plausible` — so a v1 graded file answers this
// exact question and is readable without remapping anything (see
// LEGACY_KEYS).
const QUESTIONS = [
  { key: "possible", prompt: "could this happen next in this story?" },
  { key: "consistent", prompt: "is it consistent with what the history already established?" },
  { key: "advances", prompt: "does the WORLD change - is anything true after it that was not true before?" },
  { key: "toldStory", prompt: "is this the story's VERY NEXT event (not something it does later)?" },
];

// v1 field name → v2 question key. `plausible` and `possible` are the SAME
// prompt string, so this is a rename, not a reinterpretation. v1 files have
// no answer for `consistent` at all, and nothing here invents one.
const LEGACY_KEYS = { plausible: "possible" };

const SCHEMA_VERSION = 2;

// mulberry32, the same seeded RNG experiments/gen_probe.js uses. One RNG in
// the repo, so a "seeded shuffle" means the same thing everywhere.
function mulberry32(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, seed) {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffleSeed(runSeed, nodeId) {
  return parseInt(Ids.shortHash(`grade|${runSeed}|${nodeId}`).slice(0, 8), 16);
}

// Sample identity for joining across raters and across runs. Never position:
// the shuffle differs per rater, and a positional join would silently compare
// different samples.
function sampleKey(g) {
  return `${g.nodeId}|${g.arm}|${Ids.normalizedContent(g.expr)}`;
}

// The prompts v1 files were asked under. v1 did not write its questions into
// the graded file, so they are recorded here — the only place they can be.
const V1_PROMPTS = {
  possible: "could this happen next in this story?",
  toldStory: "is this the told story's own next event?",
};

// The prompt each question in a graded file was actually ASKED under.
function promptsOf(graded) {
  const questions = graded.manifest && graded.manifest.questions;
  if (Array.isArray(questions)) return Object.fromEntries(questions.map((q) => [q.key, q.prompt]));
  return { ...V1_PROMPTS };
}

// Reads a graded file of either schema into
//   key → { question → { value, prompt } }
// An answer means nothing without the prompt it answered. The same key has
// been asked under three wordings in this work, and treating those answers
// as interchangeable is exactly how a graded file got corrupted — see the
// resume note in main().
function answersByKey(graded) {
  const prompts = promptsOf(graded);
  const out = new Map();
  for (const g of graded.grades || []) {
    const answers = {};
    for (const q of QUESTIONS) {
      if (typeof g[q.key] === "boolean") answers[q.key] = { value: g[q.key], prompt: prompts[q.key] };
    }
    for (const [legacy, key] of Object.entries(LEGACY_KEYS)) {
      if (answers[key] === undefined && typeof g[legacy] === "boolean") {
        answers[key] = { value: g[legacy], prompt: prompts[key] };
      }
    }
    out.set(sampleKey(g), answers);
  }
  return out;
}

// Which prior answers a resumed row may reuse. An answer carries only if it
// was given to the CURRENT prompt for its key; one given to an older wording
// is returned as `superseded` — kept on the row as history, never reused.
function carryForward(priorAnswers = {}) {
  const carried = {};
  const superseded = {};
  for (const { key, prompt } of QUESTIONS) {
    const previous = priorAnswers[key];
    if (!previous) continue;
    if (previous.prompt === prompt) carried[key] = previous.value;
    else superseded[key] = previous;
  }
  return { carried, superseded };
}

function ask(rl, question) {
  return new Promise((resolve) => {
    const prompt = () => rl.question(`${question} [y/n] `, (answer) => {
      const value = String(answer).trim().toLowerCase();
      if (value === "y" || value === "yes") return resolve(true);
      if (value === "n" || value === "no") return resolve(false);
      process.stdout.write("  answer y or n\n");
      prompt();
    });
    prompt();
  });
}

// Both readings are reported, and so is their conjunction. Picking one would
// re-commit the error that split the questions in the first place.
function summarize(graded, arm) {
  const rows = graded.filter((g) => g.arm === arm);
  if (rows.length === 0) return null;
  const count = (pick) => rows.filter(pick).length;
  const has = (key) => rows.some((g) => typeof g[key] === "boolean");
  return {
    n: rows.length,
    possible: count((g) => g.possible),
    consistent: has("consistent") ? count((g) => g.consistent) : null,
    advances: has("advances") ? count((g) => g.advances) : null,
    // All three at once: possible, non-contradicting, and non-null. This is
    // the strictest reading and the one closest to what growth.js will accept.
    usable: has("consistent") && has("advances")
      ? count((g) => g.possible && g.consistent && g.advances) : null,
    repeats: count((g) => g.toldStory),
    // "plausible and not already the told story's own next event" — the
    // number a saturated story cannot inflate by regurgitation.
    possibleAndNew: count((g) => g.possible && !g.toldStory),
  };
}

function formatSummary(label, s) {
  if (!s) return `  ${label}: no samples`;
  const parts = [`possible ${s.possible}/${s.n}`];
  if (s.consistent !== null) parts.push(`consistent ${s.consistent}/${s.n}`);
  if (s.advances !== null) parts.push(`advances ${s.advances}/${s.n}`);
  if (s.usable !== null) parts.push(`usable ${s.usable}/${s.n}`);
  parts.push(`repeats ${s.repeats}`, `possible-and-new ${s.possibleAndNew}`);
  return `  ${label}: ${parts.join("  ")}`;
}

// Cohen's kappa. Raw agreement alone is not readable when one label dominates
// — 90% agreement on a set that is 90% "yes" is chance — and the v1
// calibration run was exactly that shape (human 87% yes).
function kappa(rows) {
  const n = rows.length;
  if (n === 0) return null;
  const po = rows.filter((r) => r.a === r.b).length / n;
  const pa = rows.filter((r) => r.a).length / n;
  const pb = rows.filter((r) => r.b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return { n, po, pa, pb, pe, k: pe === 1 ? null : (po - pe) / (1 - pe) };
}

function compare(aPath, bPath) {
  const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const a = load(aPath); const b = load(bPath);
  const aName = path.basename(aPath); const bName = path.basename(bPath);
  const aAns = answersByKey(a); const bAns = answersByKey(b);

  const sharedKeys = [...aAns.keys()].filter((k) => bAns.has(k));
  if (sharedKeys.length === 0) { process.stdout.write("no shared samples\n"); return; }
  process.stdout.write(`shared samples: ${sharedKeys.length}\n`);

  const display = new Map((a.grades || []).map((g) => [sampleKey(g), g]));

  for (const q of QUESTIONS) {
    const answered = sharedKeys.filter((k) => aAns.get(k)[q.key] && bAns.get(k)[q.key]);
    if (answered.length === 0) {
      process.stdout.write(`\n${q.key}\n  not answered in both files — skipped\n`);
      continue;
    }
    // Agreement between answers to two DIFFERENT wordings is not agreement.
    // Prompts are recorded per file, so one row speaks for all of them.
    const aPrompt = aAns.get(answered[0])[q.key].prompt;
    const bPrompt = bAns.get(answered[0])[q.key].prompt;
    if (aPrompt !== bPrompt) {
      process.stdout.write(`\n${q.key}\n  asked under different wording — not comparable\n` +
        `    ${aName}: "${aPrompt}"\n    ${bName}: "${bPrompt}"\n`);
      continue;
    }
    const rows = answered.map((k) => ({ k, a: aAns.get(k)[q.key].value, b: bAns.get(k)[q.key].value }));
    const s = kappa(rows);
    process.stdout.write(`\n"${aPrompt}"\n`);
    process.stdout.write(`  agreement ${rows.filter((r) => r.a === r.b).length}/${s.n}` +
      ` (${(100 * s.po).toFixed(0)}%)   chance ${(100 * s.pe).toFixed(0)}%` +
      `   kappa ${s.k === null ? "n/a" : s.k.toFixed(2)}\n`);
    process.stdout.write(`  yes-rate — ${aName}: ${(100 * s.pa).toFixed(0)}%` +
      `   ${bName}: ${(100 * s.pb).toFixed(0)}%\n`);

    const aOnly = rows.filter((r) => r.a && !r.b);
    const bOnly = rows.filter((r) => !r.a && r.b);
    // A one-directional split is a threshold difference, not noise, and it
    // means the two raters are answering different questions. Naming it here
    // is the whole reason this tool exists.
    if (aOnly.length && bOnly.length === 0) {
      process.stdout.write(`  ONE-DIRECTIONAL: ${aName} said yes ${aOnly.length}x where ${bName} said no; never the reverse\n`);
    } else if (bOnly.length && aOnly.length === 0) {
      process.stdout.write(`  ONE-DIRECTIONAL: ${bName} said yes ${bOnly.length}x where ${aName} said no; never the reverse\n`);
    }
    for (const r of [...aOnly, ...bOnly]) {
      const g = display.get(r.k);
      process.stdout.write(`    ${aName}=${r.a ? "y" : "n"} ${bName}=${r.b ? "y" : "n"}` +
        `  [${g.nodeId}/${g.arm}]\n      ${g.display}\n`);
    }
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
}

async function main() {
  if (process.argv[2] === "--compare") {
    if (!process.argv[3] || !process.argv[4]) {
      process.stderr.write("usage: node experiments/grade.js --compare <a.graded.json> <b.graded.json>\n");
      process.exit(1);
    }
    return compare(process.argv[3], process.argv[4]);
  }

  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: node experiments/grade.js <probe.json> [--resume <graded.json>] [--labels <f> --rater <name>]\n");
    process.stderr.write("       node experiments/grade.js --compare <a.graded.json> <b.graded.json>\n");
    process.exit(1);
  }

  const labelsPath = argValue("--labels");
  const rater = argValue("--rater") || "human";
  // { "<arm>:<nodeId>#<index>": [possible, consistent, toldStory] } in
  // QUESTIONS order. The index is the sample's position in its arm, not in
  // the shuffle, so a label file is written against the probe output and does
  // not depend on any shuffle.
  const labels = labelsPath ? JSON.parse(fs.readFileSync(labelsPath, "utf8")) : null;

  // Prior answers carry over so re-scoring costs only the delta — but ONLY
  // answers given to the current wording of their question (carryForward).
  //
  // The first version carried by key alone. After `advances` and `toldStory`
  // were reworded, a resume carried the old answers under the new prompts,
  // asked nothing, and — because the output path is the resume path —
  // overwrote its own source stamped with the new wording. Answers to an old
  // wording are now kept on the row under `superseded` and the question is
  // asked again. A v1 file supplies `possible` only: its `toldStory` was
  // asked as "the told story's own next event", which is not today's question.
  const resumePath = argValue("--resume");
  const priorGraded = resumePath ? JSON.parse(fs.readFileSync(resumePath, "utf8")) : null;
  const prior = priorGraded ? answersByKey(priorGraded) : null;
  // History already on the prior file rides along, so a second rewording does
  // not drop the answers to the first.
  const priorHistory = priorGraded
    ? new Map((priorGraded.grades || []).filter((g) => g.superseded).map((g) => [sampleKey(g), g.superseded]))
    : null;

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const runSeed = data.manifest.runSeed;
  const rl = labels ? null : readline.createInterface({ input: process.stdin, output: process.stdout });

  const graded = [];
  let carried = 0;
  let supersededCount = 0;
  for (const entry of data.results) {
    process.stdout.write(`\n${"═".repeat(72)}\n`);
    process.stdout.write(`${data.manifest.story} — history up to ${entry.nodeId}\n\n`);
    entry.history.forEach((line, i) => process.stdout.write(`  ${String(i + 1).padStart(2)}. ${line}\n`));

    const pool = [];
    for (const arm of Object.keys(entry.arms)) {
      entry.arms[arm].samples.forEach((sample, index) => {
        pool.push({
          arm, index, display: sample.display, expr: sample.expr, seed: sample.seed,
          ...(sample.forcedActor ? { forcedActor: sample.forcedActor } : {}),
          labelKey: `${arm}:${entry.nodeId}#${index}`,
        });
      });
    }
    const order = shuffled(pool, shuffleSeed(runSeed, entry.nodeId));

    process.stdout.write(`\n  ── ${order.length} candidate continuations ──\n`);
    for (let i = 0; i < order.length; i += 1) {
      const item = order[i];
      const row = { nodeId: entry.nodeId, position: i + 1, ...item };
      const { carried: carriedOver, superseded } = carryForward(prior ? prior.get(sampleKey(row)) : undefined);
      const history = { ...((priorHistory && priorHistory.get(sampleKey(row))) || {}) };
      for (const [key, answer] of Object.entries(superseded)) {
        history[key] = [...(history[key] || []), answer];
        supersededCount += 1;
      }
      if (Object.keys(history).length) row.superseded = history;

      const fromLabels = labels ? labels[item.labelKey] : null;
      if (labels && !Array.isArray(fromLabels)) {
        throw new Error(`labels file has no entry for ${item.labelKey}`);
      }

      let printedHeader = false;
      for (let q = 0; q < QUESTIONS.length; q += 1) {
        const { key, prompt } = QUESTIONS[q];
        if (carriedOver[key] !== undefined) { row[key] = carriedOver[key]; carried += 1; continue; }
        if (labels) {
          // null is a placeholder for an answer expected to carry over. If it
          // did not carry (the prompt was reworded), it must fail loudly —
          // Boolean(null) would silently record it as "no".
          if (fromLabels[q] === undefined || fromLabels[q] === null) {
            throw new Error(`labels for ${item.labelKey} have no answer for "${key}" and none carried over`);
          }
          row[key] = Boolean(fromLabels[q]);
          continue;
        }
        if (!printedHeader) {
          process.stdout.write(`\n[${i + 1}/${order.length}] ${item.display}\n`);
          printedHeader = true;
        }
        row[key] = await ask(rl, `  ${prompt}`);
      }
      graded.push(row);
    }
  }
  if (rl) rl.close();
  if (carried) process.stdout.write(`\ncarried ${carried} prior answers from ${path.basename(resumePath)}\n`);
  if (supersededCount) {
    process.stdout.write(`kept ${supersededCount} answers to older wordings under \`superseded\` — not reused\n`);
  }

  process.stdout.write(`\n${"═".repeat(72)}\nGate 0 tally\n`);
  for (const entry of data.results) {
    const rows = graded.filter((g) => g.nodeId === entry.nodeId);
    process.stdout.write(`\n${entry.nodeId}\n`);
    for (const arm of Object.keys(entry.arms)) {
      process.stdout.write(`${formatSummary(arm, summarize(rows, arm))}\n`);
    }
  }
  process.stdout.write("\nacross all nodes\n");
  for (const arm of data.manifest.arms) {
    process.stdout.write(`${formatSummary(arm, summarize(graded, arm))}\n`);
  }
  // The verdict is the human's. This prints the counts the gate is written in
  // terms of and stops there.
  process.stdout.write("\nGate 0 asks: sentence arm plausibility >= 7/10, told-story repeats reported\n");
  process.stdout.write("alongside; and if the json arm matches or beats it, the natural-prose\n");
  process.stdout.write("hypothesis is rejected. Which column answers 'plausibility' is now an\n");
  process.stdout.write("open question — possible, consistent and both are different measurements.\n");
  process.stdout.write("That call is yours, not this script's.\n");

  const out = `${file.replace(/\.json$/, "")}.graded${rater === "human" ? "" : `.${rater}`}.json`;
  fs.writeFileSync(out, JSON.stringify({
    manifest: {
      ...data.manifest,
      gradedAt: new Date().toISOString(),
      rater,
      gradeSchema: SCHEMA_VERSION,
      questions: QUESTIONS,
      ...(resumePath ? { resumedFrom: path.basename(resumePath), supersededAnswers: supersededCount } : {}),
    },
    grades: graded,
    summary: Object.fromEntries(data.manifest.arms.map((arm) => [arm, summarize(graded, arm)])),
  }, null, 2));
  process.stdout.write(`\nwrote ${out}\n`);
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exit(1); });
}

module.exports = {
  QUESTIONS, V1_PROMPTS, shuffled, shuffleSeed, summarize, compare, kappa,
  answersByKey, carryForward, promptsOf, sampleKey,
};
