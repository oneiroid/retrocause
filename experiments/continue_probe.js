// Stage 0 A/B probe (continuation plan v3): does a structured-frame,
// natural-sentence model boundary beat the JSON-schema boundary on human
// plausibility, at the same node, on the same model, under the same sampler?
//
//   sentence arm  prompts/frames.v1.txt  + frames.js grammar → one sentence
//   json arm      prompts/branch.v2.txt  + grower BRANCH_SCHEMA → JSON object
//
// This is NOT a first continuation generator — grower.js already generates.
// It is a representation experiment, and the only thing it produces is a
// file of candidate continuations for a human to grade with grade.js. It
// writes no graph, inserts nothing, and merges nothing.
//
// Usage:
//   node experiments/continue_probe.js --story red --nodes red_woods,red_tell
//   node experiments/continue_probe.js --story red --nodes red_tell --unconstrained
//
//   --story <key>          seed story (red | criedWolf | trojanHorse)
//   --nodes <id,id,...>    nodes to expand; default: three mid-story nodes
//   --k <n>                distinct samples wanted per arm per node (10)
//   --arms <a,b>           sentence,json (both)
//   --unconstrained        sentence arm without the GBNF grammar. Diagnostic
//                          only, and the only mode in which the parse rate is
//                          a measurement rather than 1.0 by construction.
//   --seed <n>             run seed; every per-sample seed derives from it
//   --per-actor            sentence arm only: distribute K across the story's
//                          entity list, forcing one actor per draw by
//                          restricting the grammar's actor enum. See below.
//   --fill-actors [m]      sentence arm only: draw K unconditioned, then draw
//                          m forced samples (default FILL_PER_MISSING_ACTOR)
//                          for each entity the unconditioned batch never used
//                          as actor. The gated form of --per-actor; see 7.
//   --temp <f>             sampler temperature (default 1.0). Used to tell a
//                          COLLAPSING sampler from a genuinely narrow node:
//                          if raising it broadens the candidate set the node
//                          was sampler-limited, and if it does not the
//                          possibility space really is that narrow.
//   --out <path>           output file (default experiments/out/cont_<...>.json)
//
// ── deliberate deviations from the plan text, flagged not absorbed ─────────
//
// 1. FEW-SHOT SOURCE. The plan says to draw the sentence arm's few-shot from
//    "other seed stories". It is drawn from The Tortoise and the Hare
//    instead — a story outside seeds.js, the same one branch.v2 uses. Two
//    reasons, both load-bearing. (a) branch.v2 moved the few-shot out of the
//    corpus precisely so contamination stays DETECTABLE, and it worked:
//    cross-story entities went to zero. Feeding criedWolf to a red probe
//    reopens that channel, and red and criedWolf deliberately share the
//    `wolf` entity. (b) An A/B on representation needs the arms to differ in
//    representation and nothing else; sharing one few-shot story is part of
//    that.
//
// 2. PATH RULE. The plan specifies a linearizer preferring `kind === "story"`
//    with a shortest tie-break. `grower.ancestorPath` — the pinned
//    lexicographically-first shortest path — is reused instead. On seed
//    graphs the story-kind preference is vacuous (nothing is grown), and
//    reusing the grower's rule means both arms see the identical path, which
//    is the point.
//
// 3. SAMPLER PARITY. The plan pins temperature 1.0 / min_p 0.05 for the
//    sentence arm and leaves the JSON arm's sampler unstated. Both arms run
//    the SAME block here. A JSON arm left on the grower's greedy reference
//    profile would return one completion K times, and the A/B would compare
//    representation against sampling.
//
// 4. JSON ARM FAIRNESS. branch.v2 returns up to three branches per call.
//    Flattening them would give the JSON arm three shots per sample against
//    the sentence arm's one. Only the FIRST branch of each sample is graded;
//    the rest are recorded under `extraBranches` and are not thrown away.
//
// 6. ACTOR-CONDITIONED SAMPLING (`--per-actor`), which the plan does not
//    describe because the finding that motivates it postdates the plan.
//
//    Unconditioned at trojanHorse/th_lie, 30 samples across temperatures 1.0
//    to 1.8 used exactly two of the story's four actors — "the Trojans" 24
//    times, Sinon 6, Cassandra and the Greeks never — and produced one event
//    ("the Trojans bring the horse into the city") in eight or nine of ten.
//    That looked like a narrow possibility space. It is not: the TOLD
//    story's own next event at that node is Cassandra warning, so at least
//    two continuations exist by construction, and forcing the actor enum to
//    one entity at a time recovers coherent alternatives for every actor —
//    Cassandra naming the trick, Sinon asking to address the king, the
//    Greeks leading the Trojans onto the plain. The mass is on one actor,
//    not on one event.
//
//    Distributing K across the entity list therefore enumerates the space
//    the sampler collapses. This is a lever the JSON arm does not have:
//    `expr` is free text with no designated actor slot and no closed
//    vocabulary to condition on. So a `--per-actor` sentence arm is NOT a
//    like-for-like comparison against the JSON arm and must not be reported
//    as one — it is the representation being used the way it affords, which
//    is a different and also interesting question.
//
// 7. GATED ACTOR FILL (`--fill-actors`). Round-robin `--per-actor`, rated by
//    one rater on red, came out 14/30 usable against 15/30 unconditioned —
//    the same yield — while widening the actors behind the usable samples
//    from 2/1/2 to 2/3/4 per node. The waste was concentrated: forced draws
//    for actors the unconditioned batch already covered bought nothing, and
//    forced draws for absent-but-implausible actors were mostly unusable.
//    Filling only the actors that never appeared keeps the unconditioned
//    batch intact and spends extra draws exactly where the mass is missing.
//    Total draws are K + m × (missing actors), so compare per draw, not per
//    batch — otherwise this mode wins on volume.
//
// 5. TRUNCATION. llm_client treats a length-stop as a hard error. Here a
//    truncated sample is data — "the model ran past the one-sentence format"
//    is exactly what the unconstrained batch measures — so it is caught and
//    recorded as an unusable sample with its partial text, not re-raised.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const R = path.join(__dirname, "..");
const Engine = require(path.join(R, "story_builder_engine.js"));
const Frames = require(path.join(R, "frames.js"));
const Ids = require(path.join(R, "ids.js"));
const Grower = require(path.join(R, "grower.js"));
const { createClient } = require(path.join(R, "llm_client.js"));
const { seeds } = require(path.join(R, "seeds.js"));

// The sampling block both arms share. Not the reference profile: that one is
// greedy by design, and a greedy client cannot produce K alternatives.
//
//   temperature 1.0 / min_p 0.05  — the plan's pinned pair. min_p rather than
//                                   top_p because it scales the cutoff with
//                                   the top token's own probability, which is
//                                   what keeps a confident position from
//                                   admitting noise.
//   top_k 0                       — off, or it would re-impose greedy
//                                   truncation over min_p.
//   stop ["\n"]                   — one sentence is one line.
//   n_predict                     — see below; it differs per arm and per
//                                   mode, and getting it wrong is not benign.
//   samplers                      — explicit order, same reason as §4.1.
const PROBE_SAMPLING = {
  temperature: 1.0,
  top_k: 0,
  min_p: 0.05,
  samplers: ["top_k", "min_p", "temperature"],
  repeat_penalty: 1.0,
  dry_multiplier: 0,
  cache_prompt: false,
  stop: ["\n"],
};

// The plan's ~40-token cap. It belongs to the UNCONSTRAINED diagnostic only,
// where "the model ran past the one-sentence format" is the measurement and a
// cap is what stops a runaway completion.
const DIAGNOSTIC_N_PREDICT = 40;

// Under the grammar the cap must NEVER bind — the grammar's bounded character
// classes are already the length limit, and a token cap on top of them is a
// second, tighter limit that silently wins.
//
// This was a real confound, not a hypothetical one. The first run had the
// grammar admitting 246-char sentences under a 40-token cap: a fifth of
// sentence-arm draws died as "truncated", and they died NON-RANDOMLY — the
// longest, most elaborate continuations were exactly the ones cut. The
// surviving set was biased short, and it was being compared against a JSON
// arm that had 512 tokens to work with.
//
// So the cap is derived from the grammar rather than chosen. Three chars per
// token is deliberately pessimistic for English (~4 is typical), and the
// doubling on top of that is headroom for a tokenizer that splits worse than
// expected on some name.
const CHARS_PER_TOKEN_FLOOR = 3;
const N_PREDICT_SAFETY_FACTOR = 2;

function constrainedNPredict(entities) {
  const chars = Frames.maxSentenceChars(entities);
  return Math.ceil(chars / CHARS_PER_TOKEN_FLOOR) * N_PREDICT_SAFETY_FACTOR;
}

// The JSON arm needs room for a whole object (label + expr + state + delta +
// invariants, up to three branches), so its cap stays the reference profile's
// 512. Both arms' caps are now sized so that neither binds in practice: the
// point is to compare representations, not to find out which one the sampler
// budget cut off first.
const JSON_ARM_N_PREDICT = 512;

// Refill rounds after the first: a node that still cannot fill K distinct
// samples is SATURATED, which is a finding (criedWolf is the known case), not
// a reason to keep drawing.
const MAX_REFILL_ROUNDS = 3;

const DEFAULT_K = 10;

// Forced draws per actor absent from the unconditioned batch. Two, because on
// red the productive forced actor (the woodcutter) yielded usable samples in
// 4 of 6 forced draws, and one draw would miss that about a third of the time.
const FILL_PER_MISSING_ACTOR = 2;
const DEFAULT_RUN_SEED = 7;

// Mid-story nodes: far enough in that there is a history to condition on,
// short of the ending, where "what could happen next" is nearly closed.
const DEFAULT_NODES = {
  red: ["red_woods", "red_tell", "red_flowers"],
  criedWolf: ["cw_cry1", "cw_laugh", "cw_doubt"],
  trojanHorse: ["th_gift", "th_lie", "th_seer"],
};

// ── argv ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { story: "red", k: DEFAULT_K, seed: DEFAULT_RUN_SEED, arms: ["sentence", "json"], unconstrained: false, perActor: false, fillActors: 0, temp: PROBE_SAMPLING.temperature };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--story") { args.story = value; i += 1; }
    else if (flag === "--nodes") { args.nodes = value.split(",").map((s) => s.trim()).filter(Boolean); i += 1; }
    else if (flag === "--k") { args.k = Number(value); i += 1; }
    else if (flag === "--arms") { args.arms = value.split(",").map((s) => s.trim()).filter(Boolean); i += 1; }
    else if (flag === "--seed") { args.seed = Number(value); i += 1; }
    else if (flag === "--temp") { args.temp = Number(value); i += 1; }
    else if (flag === "--out") { args.out = value; i += 1; }
    else if (flag === "--base-url") { args.baseUrl = value; i += 1; }
    else if (flag === "--unconstrained") { args.unconstrained = true; }
    else if (flag === "--per-actor") { args.perActor = true; }
    else if (flag === "--fill-actors") {
      const next = Number(value);
      if (Number.isInteger(next) && next > 0) { args.fillActors = next; i += 1; } else { args.fillActors = FILL_PER_MISSING_ACTOR; }
    }
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!seeds[args.story]) throw new Error(`unknown story: ${args.story}`);
  if (args.perActor && args.fillActors) throw new Error("--per-actor and --fill-actors are exclusive");
  args.nodes = args.nodes || DEFAULT_NODES[args.story];
  return args;
}

// Which actor each of the K draws is forced to. Round-robin rather than
// K/|actors| per actor, so the total stays K — the point is to compare
// against an unconditioned K=10 batch, and a mode that quietly sampled more
// would win on volume.
function actorSchedule(entities, k) {
  return Array.from({ length: k }, (_, i) => entities[i % entities.length]);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Streamed, not readFileSync: `fs.readFileSync` allocates one Buffer and
// Node caps those at 2 GiB. The 1.7B GGUF (1.8 GB) slid under that and the
// 4B Q5_K_M (2.9 GB) does not, so the whole-file read threw before writing
// the manifest — after the sampling was already done.
function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const CHUNK = 8 * 1024 * 1024;
  const buffer = Buffer.allocUnsafe(CHUNK);
  const fd = fs.openSync(file, "r");
  try {
    for (let read = 0; (read = fs.readSync(fd, buffer, 0, CHUNK, null)) > 0;) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

// Per-sample seeds are derived, not drawn: (run seed, arm, node, index) must
// give the same integer on a rerun or the file does not replay. `shortHash`
// is the repo's one hash, so the derivation stays in one place.
function sampleSeed(runSeed, arm, nodeId, index) {
  const digest = Ids.shortHash(`${runSeed}|${arm}|${nodeId}|${index}`);
  return parseInt(digest.slice(0, 8), 16);
}

// ── prompts ─────────────────────────────────────────────────────────────────

// The template ends at the `NEXT EVENT:` cue; the trailing space is added
// here rather than left in the file, where an editor would strip it. The
// grammar (and the few-shot) supply the "Then " that follows — the same
// deviation branch.v2 records for its missing open brace: a cue the sampler
// is about to emit must not also be in the prompt.
function sentencePrompt(template, story, historyFrames) {
  return Frames.historyPrompt(template, { title: story.title, frames: historyFrames });
}

// ── arms ────────────────────────────────────────────────────────────────────

// One draw. Returns a record that is ALWAYS written: a refusal, a truncation
// and a good sample are all outcomes of the same measurement, and a probe
// that only records successes measures nothing.
async function drawSentence({ client, prompt, grammar, entities, seed, forcedActor = null }) {
  const record = { arm: "sentence", seed, ...(forcedActor ? { forcedActor } : {}) };
  try {
    const { content, stopType, cached, cacheKey } = await client.complete(prompt, null, { seed, grammar });
    Object.assign(record, { raw: content, stopType, cached, cacheKey });
  } catch (error) {
    if (!error.truncated) throw error;
    Object.assign(record, { raw: error.content, stopType: "limit", truncated: true, cacheKey: error.cacheKey });
    record.error = "truncated at n_predict";
    return record;
  }

  // The grammar emits the sentence without the leading "Then " only if the
  // prompt carried it; it does not, so `raw` is the whole sentence. Trim is
  // for the unconstrained arm, which may lead with whitespace.
  const sentence = record.raw.trim();
  record.sentence = sentence;
  const parsed = Frames.parse(sentence, entities);
  if (parsed.error) { record.error = parsed.error; return record; }
  record.frame = parsed;
  record.expr = Frames.frameExpr(parsed);
  record.display = sentence;
  return record;
}

async function drawJson({ client, prompt, seed }) {
  const record = { arm: "json", seed };
  try {
    const { content, stopType, cached, cacheKey } = await client.complete(prompt, Grower.BRANCH_SCHEMA, { seed });
    Object.assign(record, { raw: content, stopType, cached, cacheKey });
  } catch (error) {
    if (!error.truncated) throw error;
    Object.assign(record, { raw: error.content, stopType: "limit", truncated: true, cacheKey: error.cacheKey });
    record.error = "truncated at n_predict";
    return record;
  }

  let payload;
  try { payload = JSON.parse(record.raw); } catch (error) { record.error = `unparseable JSON: ${error.message}`; return record; }
  const branches = Array.isArray(payload.branches) ? payload.branches : [];
  if (branches.length === 0) { record.error = "no branches"; return record; }

  const [first, ...rest] = branches;
  record.branch = first;
  if (rest.length) record.extraBranches = rest;
  record.expr = String(first.expr || "");
  // The grader sees one next-event line per sample in both arms. The format
  // still differs, and that partially reveals the arm — recorded as a
  // limitation of this design, not engineered around.
  record.display = `${record.expr} — ${String(first.state || "")}`;
  return record;
}

// Draw until `k` DISTINCT usable samples exist or the refill budget is spent.
// Distinctness is on normalized expr, the repo's one content key, so the two
// arms are deduped by the same rule despite different surface forms.
async function drawDistinct(draw, k) {
  const samples = [];
  const attempts = [];
  const seen = new Set();
  const budget = k * (1 + MAX_REFILL_ROUNDS);

  for (let index = 0; index < budget && samples.length < k; index += 1) {
    const record = await draw(index);
    attempts.push(record);
    if (record.error) continue;
    const key = Ids.normalizedContent(record.expr);
    if (seen.has(key)) { record.duplicateOf = key; continue; }
    seen.add(key);
    samples.push(record);
  }

  return {
    samples,
    attempts: attempts.length,
    refused: attempts.filter((a) => a.error && !a.truncated).length,
    truncated: attempts.filter((a) => a.truncated).length,
    duplicates: attempts.filter((a) => a.duplicateOf).length,
    // Truncation is NOT a parse failure and must not be averaged into one.
    // A completion cut off at the token cap never got the chance to be
    // well-formed; counting it as unparseable blames the representation for
    // the sampler's budget. `parseRate` is therefore over completions that
    // actually finished, and truncation is reported on its own.
    parseRate: (() => {
      const finished = attempts.filter((a) => !a.truncated);
      if (finished.length === 0) return null;
      return (finished.length - finished.filter((a) => a.error).length) / finished.length;
    })(),
    truncationRate: attempts.length ? attempts.filter((a) => a.truncated).length / attempts.length : 0,
    saturated: samples.length < k,
    allAttempts: attempts,
  };
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const story = seeds[args.story];
  const graph = Engine.normalizeGraph(story);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const entities = story.entities;

  const framesTemplatePath = path.join(R, "prompts", "frames.v1.txt");
  const branchTemplatePath = path.join(R, "prompts", "branch.v2.txt");
  const framesTemplate = fs.readFileSync(framesTemplatePath, "utf8");
  const branchTemplate = fs.readFileSync(branchTemplatePath, "utf8");
  const grammar = Frames.grammar(entities);

  // Unconstrained: the plan's diagnostic cap, where truncation is the point.
  // Constrained: derived so the grammar binds and the cap never does.
  const sentenceNPredict = args.unconstrained
    ? DIAGNOSTIC_N_PREDICT
    : constrainedNPredict(entities);
  const sentenceClient = createClient({
    baseUrl: args.baseUrl,
    cacheDir: path.join(R, "cache"),
    sampling: { ...PROBE_SAMPLING, temperature: args.temp, n_predict: sentenceNPredict },
  });
  const jsonClient = createClient({
    baseUrl: args.baseUrl,
    cacheDir: path.join(R, "cache"),
    sampling: { ...PROBE_SAMPLING, temperature: args.temp, n_predict: JSON_ARM_N_PREDICT, stop: undefined },
  });

  const props = await sentenceClient.props();
  const results = [];

  for (const nodeId of args.nodes) {
    const node = byId.get(nodeId);
    if (!node) throw new Error(`no node ${nodeId} in ${args.story}`);

    const pathIds = Grower.ancestorPath(graph, nodeId);
    const historyFrames = pathIds.map((id) => (byId.get(id) || {}).frame).filter(Boolean);
    if (historyFrames.length !== pathIds.length) {
      throw new Error(`${nodeId}: some node on the path has no frame`);
    }

    const entry = { nodeId, path: pathIds, history: historyFrames.map((f) => Frames.render(f)), arms: {} };

    if (args.arms.includes("sentence")) {
      const prompt = sentencePrompt(framesTemplate, story, historyFrames);
      const schedule = args.perActor ? actorSchedule(entities, args.k) : null;
      const result = await drawDistinct(
        (index) => {
          const forced = schedule ? schedule[index % schedule.length] : null;
          return drawSentence({
            client: sentenceClient,
            prompt,
            // Restricting the enum to one entity is the whole mechanism; every
            // other part of the grammar is unchanged.
            grammar: args.unconstrained ? null : (forced ? Frames.grammar([forced]) : grammar),
            entities: forced ? [forced] : entities,
            seed: sampleSeed(args.seed, `sentence${forced ? `:${forced}` : ""}`, nodeId, index),
            forcedActor: forced,
          });
        },
        args.k,
      );
      entry.arms.sentence = {
        prompt, promptSha256: sha256(prompt), constrained: !args.unconstrained,
        perActor: args.perActor,
      fillActors: args.fillActors, ...(schedule ? { actorSchedule: schedule } : {}), ...result,
      };

      if (args.fillActors && !args.unconstrained) {
        const present = new Set(result.samples.map((s) => s.frame.actor));
        const missing = entities.filter((e) => !present.has(e));
        const filled = [];
        let fillAttempts = 0;
        for (const actor of missing) {
          const fill = await drawDistinct(
            (index) => drawSentence({
              client: sentenceClient,
              prompt,
              grammar: Frames.grammar([actor]),
              entities: [actor],
              seed: sampleSeed(args.seed, `fill:${actor}`, nodeId, index),
              forcedActor: actor,
            }),
            args.fillActors,
          );
          fillAttempts += fill.attempts;
          filled.push(...fill.samples);
        }
        entry.arms.sentence.samples = [...result.samples, ...filled];
        entry.arms.sentence.fill = {
          perMissingActor: args.fillActors, missing, added: filled.length,
          attempts: fillAttempts, totalDraws: result.attempts + fillAttempts,
        };
      }
    }

    if (args.arms.includes("json")) {
      const context = Grower.promptContext(graph, node);
      const prompt = Grower.renderPrompt(branchTemplate, node, context);
      const result = await drawDistinct(
        (index) => drawJson({
          client: jsonClient,
          prompt,
          seed: sampleSeed(args.seed, "json", nodeId, index),
        }),
        args.k,
      );
      entry.arms.json = { prompt, promptSha256: sha256(prompt), constrained: true, ...result };
    }

    results.push(entry);
    const line = args.arms
      .map((arm) => {
        const a = entry.arms[arm];
        const parse = a.parseRate === null ? "n/a" : a.parseRate.toFixed(2);
        return `${arm} ${a.samples.length}/${args.k}` +
          ` (parse ${parse}, trunc ${a.truncated}, dup ${a.duplicates})`;
      })
      .join("  |  ");
    process.stderr.write(`${nodeId}: ${line}\n`);
  }

  const modelPath = props.model_path || "";
  const output = {
    manifest: {
      probe: "continue_probe v1 (continuation plan v3, Stage 0)",
      story: args.story,
      k: args.k,
      runSeed: args.seed,
      arms: args.arms,
      unconstrained: args.unconstrained,
      perActor: args.perActor,
      fillActors: args.fillActors,
      grammarBounds: {
        actionMaxChars: Frames.ACTION_MAX_CHARS,
        outcomeMaxChars: Frames.OUTCOME_MAX_CHARS,
        maxSentenceChars: Frames.maxSentenceChars(entities),
      },
      sampling: { sentence: sentenceClient.sampling, json: jsonClient.sampling },
      model: {
        props,
        sha256: modelPath && fs.existsSync(modelPath) && process.env.SKIP_SHA256 !== "1"
          ? sha256File(modelPath)
          : null,
      },
      templates: {
        sentence: { name: "frames.v1", sha256: sha256File(framesTemplatePath) },
        json: { name: "branch.v2", sha256: sha256File(branchTemplatePath) },
      },
      entities,
      entitiesSha256: sha256(JSON.stringify(entities)),
      grammar,
      grammarSha256: sha256(grammar),
      generatedAt: new Date().toISOString(),
    },
    results,
  };

  const outDir = path.join(R, "experiments", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const suffix = `${args.unconstrained ? "_unconstrained" : ""}${args.perActor ? "_peractor" : ""}${args.fillActors ? "_fill" : ""}`;
  const out = args.out || path.join(outDir, `cont_${args.story}_${args.nodes.join("-")}${suffix}.json`);
  fs.writeFileSync(out, JSON.stringify(output, null, 2));
  process.stderr.write(`\nwrote ${out}\n`);
}

if (require.main === module) {
  main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exit(1); });
}

module.exports = { PROBE_SAMPLING, sentencePrompt, sampleSeed, drawDistinct, actorSchedule, DEFAULT_NODES };
