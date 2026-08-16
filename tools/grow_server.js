#!/usr/bin/env node
// Grow server — the localhost bridge that lets the page TRIGGER the grower
// without ever calling the model itself (LOCAL_LLM.md §5.1 amendment).
//
//   npm run grow:serve            # needs ./tools/serve_reference.sh running
//
//   POST /grow   { graph, from, depth?, width?, maxNodes?, seed? }
//                → { runId, graph, stats, validation }
//   GET  /health → { ok, model }  — whether llama-server answers /props
//
// The model call stays Node-side: the page POSTs "grow from this node" and
// receives a grown graph — the same artifact `npm run grow` writes, over a
// different transport. Every UI run is provenanced exactly like a CLI run
// (same buildConfig, same manifest, same runs/<runId>/ layout) plus an
// input_graph.json, because a UI graph has no seed name to re-load from.
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
const { createClient } = require(path.join(REPO, "llm_client.js"));
const { growGraph } = require(path.join(REPO, "grower.js"));
const { buildConfig, runIdOf, DEFAULTS, GRAPH_FILE, MANIFEST_FILE } = require(path.join(REPO, "tools", "grow.js"));

// One above llama-server's 8080 so both fit in one head. Overridable because
// ports collide, not because the choice is configuration-worthy.
const DEFAULT_PORT = 8081;
const INPUT_GRAPH_FILE = "input_graph.json";
// A UI click should not fan out into a corpus run; the CLI has no such cap
// because a terminal user asked for exactly what they typed.
const MAX_UI_NODES = 64;

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

// `clientFactory` is injectable so tests run the full handler over the
// fixture transport — same seam the grower tests use, no network.
function createHandler({
  clientFactory = (sampling) => createClient({ cacheDir: path.join(REPO, "cache"), sampling }),
  outRoot = path.join(REPO, "runs"),
} = {}) {
  return async function handle(req, res) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    if (req.method === "GET" && req.url === "/health") {
      try {
        await clientFactory({ seed: DEFAULTS.seed }).props();
        return send(res, 200, { ok: true, model: true });
      } catch {
        return send(res, 200, { ok: true, model: false });
      }
    }

    if (req.method === "POST" && req.url === "/grow") {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (error) {
        return send(res, 400, { error: `invalid JSON body: ${error.message}` });
      }
      const { graph, from } = body;
      if (!graph || !Array.isArray(graph.nodes)) return send(res, 400, { error: "body.graph must be a graph object" });
      if (!from) return send(res, 400, { error: "body.from must name the expansion node" });
      const depth = +(body.depth || DEFAULTS.depth);
      const width = +(body.width || DEFAULTS.width);
      const maxNodes = Math.min(+(body.maxNodes || DEFAULTS.maxNodes), MAX_UI_NODES);
      const seed = +(body.seed || DEFAULTS.seed);

      try {
        const client = clientFactory({ seed });
        const { config, promptText, inputGraph } = await buildConfig({
          graph, from, depth, width, maxNodes, client,
        });
        const runId = runIdOf(config);

        const { graph: grown, stats, validation } = await growGraph({
          graph: inputGraph, client, promptTemplate: promptText, from, depth, width, maxNodes, runId,
        });

        const outDir = path.join(outRoot, runId);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, INPUT_GRAPH_FILE), Ids.canonicalJson(inputGraph));
        fs.writeFileSync(path.join(outDir, GRAPH_FILE), Ids.canonicalJson(grown));
        fs.writeFileSync(
          path.join(outDir, MANIFEST_FILE),
          JSON.stringify({ runId, createdAt: new Date().toISOString(), ...config, result: stats }, null, 2),
        );

        return send(res, 200, { runId, graph: grown, stats, validation });
      } catch (error) {
        // The likely failure is llama-server being down; say so instead of a
        // bare ECONNREFUSED.
        const hint = /fetch failed|ECONNREFUSED/.test(String(error.message))
          ? " (is ./tools/serve_reference.sh running?)"
          : "";
        return send(res, 502, { error: `${error.message}${hint}` });
      }
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
    console.log(`grow server on http://127.0.0.1:${port} — POST /grow, GET /health`);
    console.log("model calls go to llama-server; start it with ./tools/serve_reference.sh");
  });
}

module.exports = { createHandler, DEFAULT_PORT, MAX_UI_NODES };
