#!/usr/bin/env node
// Grow server — the localhost bridge that lets the page run the grower and
// the continuation probe without ever calling the model itself
// (LOCAL_LLM.md §5.1 amendment).
//
//   npm run grow:serve            # needs ./tools/serve_reference.sh running
//
//   GET  /health   → { ok, model, modelFile }
//   POST /grow     { graph, from, depth?, width?, maxNodes?, seed?,
//                    source?: "model" | "baseline", prompt? }
//                  → { runId, graph, stats, score, baseline?, validation, trace }
//   POST /prompt   { graph, from, prompt? } → { promptVersion, prompt, grammar }
//                  — what a grow/draw from `from` would send; no model call
//   GET  /prompts  → { templates: [{ name, sha256, text }] } — prompts/*.txt
//   POST /continue { graph, from, k?, arms?: [promptVersion…], seed? }
//                  → NDJSON: { type: "progress" }… then { type: "done", file, pool, answers, prompts }
//   POST /grades   { file, answers: { labelKey: { consistent, advances } } }
//                  → { gradedFile, summary, cumulative }
//   GET  /runs     → recorded runs, newest first
//   GET  /runs/:id → { graph, manifest, score, trace } (trace null for runs without trace.json)
//
// The model call stays Node-side. Every UI grow run is provenanced like a CLI
// run (same buildConfig, same manifest, same runs/<runId>/ layout) plus an
// input_graph.json, because a UI graph has no seed name to re-load from.
// Every UI probe batch is a continue_probe.js file under experiments/out/ui/,
// and its grades are a grade.js graded file beside it — so `grade.js
// --compare` reads a UI-graded batch against any other rater's.
//
// CORS is wide open on purpose: the page runs from file:// (Origin: null)
// and the server binds loopback only — the browser's origin check is not
// the security boundary here, the bind address is.

"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const REPO = path.join(__dirname, "..");
const Ids = require(path.join(REPO, "ids.js"));
const Engine = require(path.join(REPO, "story_builder_engine.js"));
const { createClient, SAMPLED_SAMPLING } = require(path.join(REPO, "llm_client.js"));
const { growGraph, formatForPrompt, renderPrompt, promptContext, PROMPT_VERSIONS } = require(path.join(REPO, "grower.js"));
const { scoreGrowth, createBaselineClient, BASELINE_FORMAT } = require(path.join(REPO, "tools", "eval.js"));
const Probe = require(path.join(REPO, "experiments", "continue_probe.js"));
const Grade = require(path.join(REPO, "experiments", "grade.js"));
const {
  buildConfig, runIdOf, sha256, DEFAULT_PROMPT_VERSION, DEFAULTS, GRAPH_FILE, MANIFEST_FILE, createRunJudge, TRACE_FILE,
} = require(path.join(REPO, "tools", "grow.js"));

// One above llama-server's 8080 so both fit in one head. Overridable because
// ports collide, not because the choice is configuration-worthy.
const DEFAULT_PORT = 8081;
const INPUT_GRAPH_FILE = "input_graph.json";
const PROMPT_DIR = path.join(REPO, "prompts");
// A UI click should not fan out into a corpus run; the CLI has no such cap
// because a terminal user asked for exactly what they typed.
const MAX_UI_NODES = 64;
// Same cap logic for a probe batch: K distinct samples per arm, each costing
// up to 1 + MAX_REFILL_ROUNDS draws.
const MAX_UI_K = 20;

const SOURCES = ["model", "baseline"];
// Prompt versions the page may pick, for growing and as probe arms.
const PROMPTS = PROMPT_VERSIONS;
const RUN_ID_PATTERN = /^run_[0-9a-f]+$/;
const PROBE_FILE_PATTERN = /^cont_ui_[0-9a-f]+\.json$/;
const GRADED_SUFFIX = ".graded.json";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// The likely failure is llama-server being down; say so instead of a bare
// ECONNREFUSED.
function errorMessage(error) {
  const hint = /fetch failed|ECONNREFUSED/.test(String(error.message))
    ? " (is ./tools/serve_reference.sh running?)"
    : "";
  return `${error.message}${hint}`;
}

const intOr = (value, fallback) => (Number.isFinite(+value) && +value > 0 ? Math.floor(+value) : fallback);

// ── grade-file plumbing ─────────────────────────────────────────────────────

// The pool in grade.js's presentation order: arms in file order, samples in
// arm order, then the seeded shuffle. Same labelKeys, same order, so a
// UI-graded file and a terminal-graded file of one batch are the same rows.
function gradePool(probe) {
  const rows = [];
  for (const entry of probe.results) {
    const pool = [];
    for (const arm of Object.keys(entry.arms)) {
      entry.arms[arm].samples.forEach((sample, index) => {
        pool.push({
          arm, index, display: sample.display, expr: sample.expr, seed: sample.seed,
          labelKey: `${arm}:${entry.nodeId}#${index}`,
        });
      });
    }
    Grade.shuffled(pool, Grade.shuffleSeed(probe.manifest.runSeed, entry.nodeId))
      .forEach((item, i) => rows.push({ nodeId: entry.nodeId, position: i + 1, ...item }));
  }
  return rows;
}

const ASKED = Grade.QUESTIONS.filter((q) => q.ask).map((q) => q.key);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Every human-graded UI batch, pooled per arm — the running answer to the
// open quality question (experiments/NOTES.md "Open", item 1).
function cumulativeSummary(probeDir) {
  if (!fs.existsSync(probeDir)) return {};
  const grades = [];
  let batches = 0;
  for (const name of fs.readdirSync(probeDir)) {
    if (!name.endsWith(GRADED_SUFFIX)) continue;
    grades.push(...readJson(path.join(probeDir, name)).grades);
    batches += 1;
  }
  const arms = [...new Set(grades.map((g) => g.arm))].sort();
  return { batches, arms: Object.fromEntries(arms.map((arm) => [arm, Grade.summarize(grades, arm)])) };
}

// ── handler ─────────────────────────────────────────────────────────────────

// `clientFactory` is injectable so tests run the full handler over the
// fixture transport — same seam the grower tests use, no network.
function createHandler({
  clientFactory = (sampling) => createClient({ cacheDir: path.join(REPO, "cache"), sampling }),
  outRoot = path.join(REPO, "runs"),
  probeDir = path.join(REPO, "experiments", "out", "ui"),
} = {}) {
  async function health(res) {
    try {
      const props = await clientFactory({ seed: DEFAULTS.seed }).props();
      return send(res, 200, { ok: true, model: true, modelFile: path.basename(props.model_path || "") });
    } catch {
      return send(res, 200, { ok: true, model: false, modelFile: null });
    }
  }

  // The client per source, plus the manifest's `source` block. The default
  // source's config is unchanged, so its runIds are the ones every earlier
  // run recorded.
  function sourceFor({ source, inputGraph, seed, promptVersion }) {
    if (source === "baseline") {
      return {
        client: createBaselineClient({ inputGraph, seed }), format: BASELINE_FORMAT, source: { name: "baseline" },
      };
    }
    // Model runs confirm every merge with the same-situation judge
    // (same_judge.js). The baseline stays model-free, so it has none.
    return {
      client: clientFactory({ ...SAMPLED_SAMPLING, seed }),
      // The reference client formalizes v5's event sentences.
      format: formatForPrompt(promptVersion, { formalClient: clientFactory({}) }),
      source: null,
      runJudge: createRunJudge({ makeClient: () => clientFactory({}) }),
    };
  }

  async function grow(body, res) {
    const { graph, from } = body;
    if (!graph || !Array.isArray(graph.nodes)) return send(res, 400, { error: "body.graph must be a graph object" });
    if (!from) return send(res, 400, { error: "body.from must name the expansion node" });
    const source = body.source || "model";
    if (!SOURCES.includes(source)) return send(res, 400, { error: `body.source must be one of ${SOURCES.join(", ")}` });
    const depth = intOr(body.depth, DEFAULTS.depth);
    const width = intOr(body.width, DEFAULTS.width);
    const maxNodes = Math.min(intOr(body.maxNodes, DEFAULTS.maxNodes), MAX_UI_NODES);
    const seed = intOr(body.seed, DEFAULTS.seed);
    const promptVersion = body.prompt || DEFAULT_PROMPT_VERSION;
    if (!PROMPTS.includes(promptVersion)) return send(res, 400, { error: `body.prompt must be one of ${PROMPTS.join(", ")}` });

    const picked = sourceFor({ source, inputGraph: Engine.normalizeGraph(graph), seed, promptVersion });
    const { config, promptText, inputGraph } = await buildConfig({
      graph, from, depth, width, maxNodes, client: picked.client, promptVersion, source: picked.source,
      judge: picked.runJudge && picked.runJudge.config,
    });
    const runId = runIdOf(config);
    const budget = {
      graph: inputGraph, promptTemplate: promptText, from, depth, width, runId,
    };

    const { graph: grown, stats, validation, trace } = await growGraph({
      ...budget, maxNodes, client: picked.client, format: picked.format, judge: picked.runJudge && picked.runJudge.judge,
    });
    const score = scoreGrowth({ graph: grown, stats });

    // §6's comparison bar: the model-free recombiner grown to the same node
    // count through the same traversal. Not persisted — it re-derives in
    // milliseconds from the input graph and the seed.
    let baseline;
    if (source !== "baseline" && score.grownNodes > 0) {
      const matched = await growGraph({
        ...budget, runId: undefined,
        maxNodes: score.grownNodes, client: createBaselineClient({ inputGraph, seed }), format: BASELINE_FORMAT,
      });
      baseline = scoreGrowth(matched);
    }

    const outDir = path.join(outRoot, runId);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, INPUT_GRAPH_FILE), Ids.canonicalJson(inputGraph));
    fs.writeFileSync(path.join(outDir, GRAPH_FILE), Ids.canonicalJson(grown));
    fs.writeFileSync(path.join(outDir, TRACE_FILE), JSON.stringify(trace, null, 2));
    fs.writeFileSync(
      path.join(outDir, MANIFEST_FILE),
      JSON.stringify({ runId, createdAt: new Date().toISOString(), ...config, result: stats }, null, 2),
    );
    return send(res, 200, { runId, graph: grown, stats, score, baseline, validation, trace });
  }

  // The continuation probe at one node of the page's graph. Progress streams as
  // counts only: the pool is revealed in grade order once drawing ends, so
  // the order the samples arrived in cannot leak which arm is which.
  async function probe(body, res) {
    const { graph, from } = body;
    if (!graph || !Array.isArray(graph.nodes)) return send(res, 400, { error: "body.graph must be a graph object" });
    if (!from) return send(res, 400, { error: "body.from must name the node to continue" });
    const k = Math.min(intOr(body.k, Probe.DEFAULT_K), MAX_UI_K);
    const arms = (Array.isArray(body.arms) && body.arms.length ? body.arms : Probe.DEFAULT_ARMS)
      .filter((arm) => PROMPTS.includes(arm));
    if (!arms.length) return send(res, 400, { error: `body.arms must name prompt versions: ${PROMPTS.join(", ")}` });
    const runSeed = intOr(body.seed, DEFAULTS.seed);

    const inputGraph = Engine.normalizeGraph(graph);
    const client = Probe.createProbeClient({ create: clientFactory });
    const props = await client.props();

    res.writeHead(200, { "Content-Type": "application/x-ndjson", ...CORS_HEADERS });
    const emit = (event) => res.write(`${JSON.stringify(event)}\n`);
    const counts = Object.fromEntries(arms.map((arm) => [arm, { attempts: 0, samples: 0 }]));
    try {
      const entry = await Probe.probeNode({
        graph: inputGraph, nodeId: from, client, k, arms, runSeed, formalClient: clientFactory({}),
        onAttempt: (record) => {
          const c = counts[record.arm];
          c.attempts += 1;
          if (!record.error && !record.duplicateOf) c.samples += 1;
          emit({ type: "progress", counts });
        },
      });
      const title = inputGraph.title || (inputGraph.meta && inputGraph.meta.title) || "";
      const probeFile = {
        manifest: {
          ...Probe.probeManifest({ story: title, k, runSeed, arms, fast: false, client, props }),
          inputGraphSha256: sha256(Ids.canonicalJson(inputGraph)),
          from,
        },
        results: [entry],
      };
      // Named by configuration, so re-drawing the same batch (cache-served)
      // lands on the same file and finds its grades.
      const name = `cont_ui_${Ids.shortHash(JSON.stringify({
        graph: probeFile.manifest.inputGraphSha256, from, k, arms, runSeed,
        model: probeFile.manifest.model.sha256 || props.model_path || "",
      }))}.json`;
      fs.mkdirSync(probeDir, { recursive: true });
      const file = path.join(probeDir, name);
      fs.writeFileSync(file, JSON.stringify(probeFile, null, 2));

      const gradedPath = file.replace(/\.json$/, GRADED_SUFFIX);
      const answers = {};
      if (fs.existsSync(gradedPath)) {
        for (const g of readJson(gradedPath).grades) {
          answers[g.labelKey] = Object.fromEntries(ASKED.map((key) => [key, g[key]]));
        }
      }
      const arm = (a) => entry.arms[a] || {};
      emit({
        type: "done",
        file: name,
        history: entry.history,
        pool: gradePool(probeFile).map(({ labelKey, arm: armName, index, display }) => ({
          labelKey, arm: armName, display, branch: arm(armName).samples[index].branch,
        })),
        stats: Object.fromEntries(arms.map((a) => [a, {
          attempts: arm(a).attempts, samples: arm(a).samples.length, duplicates: arm(a).duplicates,
          refused: arm(a).refused, truncated: arm(a).truncated, saturated: arm(a).saturated,
          usable: arm(a).usable, toldNext: arm(a).toldNext, toldLater: arm(a).toldLater,
        }])),
        answers,
        // What each arm sent. Shown apart from the pool, so it does not tie
        // a sample to its arm.
        prompts: arms.map((a) => ({
          arm: a, prompt: arm(a).prompt,
          ...(arm(a).grammar ? { grammar: arm(a).grammar } : {}), ...(arm(a).schema ? { schema: arm(a).schema } : {}),
        })),
      });
    } catch (error) {
      emit({ type: "error", error: errorMessage(error) });
    }
    res.end();
  }

  // Writes the batch's grade.js graded file (rater "human"). Only complete
  // rows are kept: a half-answered row would read as a "no" in a summary.
  function grades(body, res) {
    const name = String(body.file || "");
    if (!PROBE_FILE_PATTERN.test(name)) return send(res, 400, { error: "body.file must name a UI probe file" });
    const file = path.join(probeDir, name);
    if (!fs.existsSync(file)) return send(res, 404, { error: `no probe file ${name}` });
    const probeFile = readJson(file);
    const answers = body.answers || {};
    const graded = [];
    for (const row of gradePool(probeFile)) {
      const given = answers[row.labelKey];
      if (!given || !ASKED.every((key) => typeof given[key] === "boolean")) continue;
      graded.push({ ...row, ...Object.fromEntries(ASKED.map((key) => [key, given[key]])) });
    }
    const summary = Object.fromEntries(probeFile.manifest.arms.map((arm) => [arm, Grade.summarize(graded, arm)]));
    const gradedFile = name.replace(/\.json$/, GRADED_SUFFIX);
    fs.writeFileSync(path.join(probeDir, gradedFile), JSON.stringify({
      manifest: {
        ...probeFile.manifest,
        gradedAt: new Date().toISOString(),
        rater: "human",
        gradeSchema: 2,
        questions: Grade.QUESTIONS,
        gradedIn: "ui",
      },
      grades: graded,
      summary,
    }, null, 2));
    return send(res, 200, { gradedFile, graded: graded.length, summary, cumulative: cumulativeSummary(probeDir) });
  }

  function listRuns(res) {
    const runs = [];
    if (fs.existsSync(outRoot)) {
      for (const runId of fs.readdirSync(outRoot)) {
        const manifestPath = path.join(outRoot, runId, MANIFEST_FILE);
        if (!RUN_ID_PATTERN.test(runId) || !fs.existsSync(manifestPath)) continue;
        const m = readJson(manifestPath);
        runs.push({
          runId,
          createdAt: m.createdAt,
          source: (m.source && m.source.name) || "model",
          prompt: m.prompt && m.prompt.template,
          story: m.input && m.input.seed,
          from: m.traversal && m.traversal.from,
          created: m.result && m.result.created,
        });
      }
    }
    runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return send(res, 200, { runs });
  }

  function getRun(runId, res) {
    if (!RUN_ID_PATTERN.test(runId)) return send(res, 400, { error: "bad run id" });
    const dir = path.join(outRoot, runId);
    if (!fs.existsSync(path.join(dir, MANIFEST_FILE))) return send(res, 404, { error: `no run ${runId}` });
    const manifest = readJson(path.join(dir, MANIFEST_FILE));
    const graph = readJson(path.join(dir, GRAPH_FILE));
    const trace = fs.existsSync(path.join(dir, TRACE_FILE)) ? readJson(path.join(dir, TRACE_FILE)) : null;
    return send(res, 200, {
      graph, manifest, trace, score: scoreGrowth({ graph: Engine.normalizeGraph(graph), stats: manifest.result }),
    });
  }

  // The prompt a grow or draw from `from` would send, without calling the
  // model: the rendered template plus its grammar or schema.
  function previewPrompt(body, res) {
    const { graph, from } = body;
    if (!graph || !Array.isArray(graph.nodes)) return send(res, 400, { error: "body.graph must be a graph object" });
    const promptVersion = body.prompt || DEFAULT_PROMPT_VERSION;
    if (!PROMPTS.includes(promptVersion)) return send(res, 400, { error: `body.prompt must be one of ${PROMPTS.join(", ")}` });
    const inputGraph = Engine.normalizeGraph(graph);
    const source = inputGraph.nodes.find((n) => n.id === from);
    if (!source) return send(res, 400, { error: "body.from must name a node in the graph" });
    const template = fs.readFileSync(path.join(PROMPT_DIR, `${promptVersion}.txt`), "utf8");
    return send(res, 200, {
      promptVersion,
      prompt: renderPrompt(template, promptContext(inputGraph, source)),
      ...formatForPrompt(promptVersion, { formalClient: clientFactory({}) }).constrain(inputGraph, source),
    });
  }

  // Every template in prompts/, raw — including the ones the page never
  // sends (the same-state judge, the extractor).
  function listTemplates(res) {
    const templates = fs.readdirSync(PROMPT_DIR)
      .filter((name) => name.endsWith(".txt"))
      .sort()
      .map((name) => {
        const text = fs.readFileSync(path.join(PROMPT_DIR, name), "utf8");
        return { name: name.replace(/\.txt$/, ""), sha256: sha256(text), text };
      });
    return send(res, 200, { templates });
  }

  return async function handle(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }
    try {
      if (req.method === "GET" && req.url === "/health") return await health(res);
      if (req.method === "GET" && req.url === "/runs") return listRuns(res);
      if (req.method === "GET" && req.url === "/prompts") return listTemplates(res);
      if (req.method === "GET" && req.url.startsWith("/runs/")) return getRun(req.url.slice("/runs/".length), res);
      if (req.method === "POST" && ["/grow", "/continue", "/grades", "/prompt"].includes(req.url)) {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (error) {
          return send(res, 400, { error: `invalid JSON body: ${error.message}` });
        }
        if (req.url === "/grow") return await grow(body, res);
        if (req.url === "/continue") return await probe(body, res);
        if (req.url === "/prompt") return previewPrompt(body, res);
        return grades(body, res);
      }
    } catch (error) {
      if (res.headersSent) return res.end();
      return send(res, 502, { error: errorMessage(error) });
    }
    return send(res, 404, { error: `no route: ${req.method} ${req.url}` });
  };
}

if (require.main === module) {
  const port = +(process.env.GROW_PORT || process.argv[2] || DEFAULT_PORT);
  const handler = createHandler();
  http.createServer((req, res) => {
    handler(req, res).catch((error) => send(res, 500, { error: error.message }));
  }).listen(port, "127.0.0.1", () => {
    console.log(`grow server on http://127.0.0.1:${port}`);
    console.log("model calls go to llama-server; start it with ./tools/serve_reference.sh");
  });
}

module.exports = { createHandler, gradePool, DEFAULT_PORT, MAX_UI_NODES, MAX_UI_K };
