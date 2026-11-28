#!/usr/bin/env node
// Grow server: the localhost bridge between the page and the model. The page
// never calls llama-server itself.
//
//   npm run grow:serve            # needs ./tools/serve_model.sh running
//
//   GET  /health   → { ok, model, modelFile, slots }
//   POST /grow     { graph, from, depth?, width?, beam?, maxNodes?, merge? (facts|routes|off), prune?, temperature? }
//                  → NDJSON: start, then node | merge | pruned | expansion | progress
//                    as they happen, then done { runId, graph, stats, validation }
//                    or error { error, runId?, graph?, stats? }.
//                    Closing the request stops the run; what grew so far is kept.
//   POST /propose  { graph, from, width?, temperature? }
//                  → NDJSON: progress { tokens, text }…, then done { alternatives, system, user, completion }
//   POST /prompt   { graph, from, width? } → { system, user } — no model call
//   GET  /prompts  → { templates: [{ name, sha256, text }] } — prompts/*.txt
//   GET  /runs     → recorded runs, newest first
//   GET  /runs/:id → { graph, manifest, trace }
//
// CORS is wide open on purpose: the page runs from file:// (Origin: null) and
// the server binds loopback only. The bind address is the security boundary.

"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const REPO = path.join(__dirname, "..");
const Engine = require(path.join(REPO, "story_builder_engine.js"));
const { createClient } = require(path.join(REPO, "llm_client.js"));
const { proposeAlternatives, expansionRequest, mergeMode, DEFAULTS } = require(path.join(REPO, "grower.js"));
const {
  runGrow, loadTemplates, serverInfo, sha256, PROMPT_DIR, GRAPH_FILE, MANIFEST_FILE, TRACE_FILE,
} = require(path.join(REPO, "tools", "grow.js"));

const DEFAULT_PORT = 8081;
// A click should not be able to queue a night of generation by a typo.
const MAX_UI_NODES = 1000;
const RUN_ID_PATTERN = /^run_[0-9a-f]+$/;

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

// The likely failure is llama-server being down; say so.
function errorMessage(error) {
  const hint = /fetch failed|ECONNREFUSED/.test(String(error.message)) ? " (is ./tools/serve_model.sh running?)" : "";
  return `${error.message}${hint}`;
}

const positiveInt = (value, fallback) => (Number.isFinite(+value) && +value > 0 ? Math.floor(+value) : fallback);
const positiveNumber = (value, fallback) => (Number.isFinite(+value) && +value >= 0 ? +value : fallback);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function growParams(body) {
  return {
    depth: positiveInt(body.depth, DEFAULTS.depth),
    width: positiveInt(body.width, DEFAULTS.width),
    beam: positiveInt(body.beam, DEFAULTS.beam),
    maxNodes: Math.min(positiveInt(body.maxNodes, DEFAULTS.maxNodes), MAX_UI_NODES),
    merge: mergeMode(body.merge === undefined ? DEFAULTS.merge : body.merge),
    prune: body.prune === undefined ? DEFAULTS.prune : !!body.prune,
    temperature: positiveNumber(body.temperature, DEFAULTS.temperature),
  };
}

// The NDJSON response both streaming routes write, and the abort its close sets.
function openStream(res) {
  const controller = new AbortController();
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  res.writeHead(200, { "Content-Type": "application/x-ndjson", ...CORS_HEADERS });
  return { signal: controller.signal, emit: (event) => { if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`); } };
}

// `clientFactory` is injectable so tests run the handler with no network.
function createHandler({
  clientFactory = () => createClient(),
  outRoot = path.join(REPO, "runs"),
} = {}) {
  async function health(res) {
    try {
      return send(res, 200, { ok: true, model: true, ...(await serverInfo(clientFactory())) });
    } catch {
      return send(res, 200, { ok: true, model: false, modelFile: null, slots: 0 });
    }
  }

  function targetOf(body, res) {
    const { graph, from } = body;
    if (!graph || !Array.isArray(graph.nodes)) return send(res, 400, { error: "body.graph must be a graph object" });
    if (!graph.nodes.some((n) => n.id === from)) return send(res, 400, { error: "body.from must name a node in the graph" });
    return { graph, from };
  }

  async function grow(body, res) {
    const target = targetOf(body, res);
    if (!target) return undefined;
    const { signal, emit } = openStream(res);
    try {
      const { runId, graph, stats, validation, error } = await runGrow({
        ...target, params: growParams(body), client: clientFactory(), outRoot, signal, onEvent: emit,
      });
      if (error) emit({ type: "error", error: errorMessage(error), runId, graph, stats });
      else emit({ type: "done", runId, graph, stats, validation });
    } catch (error) {
      emit({ type: "error", error: errorMessage(error) });
    }
    return res.end();
  }

  // One expansion, not inserted: the page lists the alternatives and the user
  // adds the ones they want.
  async function propose(body, res) {
    const target = targetOf(body, res);
    if (!target) return undefined;
    const { signal, emit } = openStream(res);
    try {
      const graph = Engine.normalizeGraph(target.graph);
      let tokens = 0;
      const result = await proposeAlternatives({
        graph,
        source: graph.nodes.find((n) => n.id === target.from),
        width: positiveInt(body.width, DEFAULTS.width),
        temperature: positiveNumber(body.temperature, DEFAULTS.temperature),
        client: clientFactory(),
        template: loadTemplates().branch,
        signal,
        onToken: (piece, text) => {
          tokens += 1;
          emit({ type: "progress", tokens, text });
        },
      });
      emit({
        type: "done",
        alternatives: result.alternatives,
        system: result.system,
        user: result.user,
        completion: result.content,
      });
    } catch (error) {
      if (!signal.aborted) emit({ type: "error", error: errorMessage(error) });
    }
    return res.end();
  }

  function previewPrompt(body, res) {
    const target = targetOf(body, res);
    if (!target) return undefined;
    const graph = Engine.normalizeGraph(target.graph);
    const source = graph.nodes.find((n) => n.id === target.from);
    const { system, user } = expansionRequest(graph, source, positiveInt(body.width, DEFAULTS.width), loadTemplates().branch);
    return send(res, 200, { system, user });
  }

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
          story: m.story || (m.input && m.input.seed) || null,
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
    const tracePath = path.join(dir, TRACE_FILE);
    return send(res, 200, {
      graph: readJson(path.join(dir, GRAPH_FILE)),
      manifest: readJson(path.join(dir, MANIFEST_FILE)),
      trace: fs.existsSync(tracePath) ? readJson(tracePath) : null,
    });
  }

  const POST_ROUTES = { "/grow": grow, "/propose": propose, "/prompt": previewPrompt };

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
      if (req.method === "POST" && POST_ROUTES[req.url]) {
        let body;
        try {
          body = JSON.parse(await readBody(req));
        } catch (error) {
          return send(res, 400, { error: `invalid JSON body: ${error.message}` });
        }
        return await POST_ROUTES[req.url](body, res);
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
    console.log("model calls go to llama-server; start it with ./tools/serve_model.sh");
  });
}

module.exports = { createHandler, DEFAULT_PORT, MAX_UI_NODES };
