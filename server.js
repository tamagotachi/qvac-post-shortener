// Post Shortener - paste text that is too long, and an AI on YOUR machine (QVAC) rewrites it to fit a character limit.
// The server counts every version and only returns ones that really fit. Open http://localhost:3069 after starting.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The QVAC worker can be slow to start on some computers. Wait up to 3 minutes for it.
process.env.QVAC_RPC_INIT_TIMEOUT_MS ??= "180000";
const { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } = await import("@qvac/sdk");

const PORT = 3069;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Step 1: load the AI model (downloads the first time, then it's cached) ----
let modelId = null;
const status = { ready: false, message: "Starting...", percent: null, error: null };
async function startModel() {
  try {
    status.message = "Loading the AI model (first run downloads it)...";
    modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      onProgress: (p) => { const v = typeof p === "number" ? p : p?.percentage; if (typeof v === "number") status.percent = Math.round(v); },
    });
    status.ready = true; status.message = "AI post shortener ready";
    console.log("Model loaded. Open http://localhost:" + PORT);
  } catch (err) { status.error = String(err?.message || err); console.error("Could not load model:", err); }
}

// One AI job at a time
let chain = Promise.resolve();
const enqueue = (job) => { const p = chain.then(job); chain = p.catch(() => {}); return p; };

function readBody(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > limit) { reject(new Error("Too big")); req.destroy(); } });
    req.on("end", () => resolve(data)); req.on("error", reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const clean = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

// QVAC "structured output": three shorter versions.
const SCHEMA = { type: "object", properties: { versions: { type: "array", items: { type: "string" } } }, required: ["versions"], additionalProperties: false };
const prompt = (limit, keepTags) => `You shorten social media posts and messages. Reply with JSON only.
Write 3 different versions, each at most ${limit} characters INCLUDING spaces. Keep the main message, the key facts, names, dates and any links.
Make them punchy and natural. ${keepTags ? "Keep the hashtags." : "You may drop hashtags."} Never add facts that aren't in the original.`;
const count = (s) => [...s].length;   // counts emojis as 1 character, like most apps

async function shorten(text, limit, keepTags) {
  let tries = 0, good = [];
  // Ask again only when needed: once more if fewer than 2 fit, and up to 3 times if none fit (each try takes time)
  while (tries < 3 && (good.length === 0 || (tries < 2 && good.length < 2))) {
    tries++;
    try {
      // This is the QVAC call that runs the AI on-device
      const run = completion({ modelId, stream: true, history: [{ role: "system", content: prompt(tries > 1 ? Math.floor(limit * 0.85) : limit, keepTags) }, { role: "user", content: "Original:\n\"\"\"\n" + text + "\n\"\"\"" }],
        responseFormat: { type: "json_schema", json_schema: { name: "Short", schema: SCHEMA } } });
      let out = "";
      for await (const event of run.events) if (event.type === "contentDelta") out += event.text;
      // The AI can't count reliably, so we check every version ourselves and keep only the ones that fit
      for (const v of JSON.parse(out).versions || []) { const t = String(v).trim().replace(/^["\u201c]|["\u201d]$/g, ""); if (t && count(t) <= limit && !good.includes(t)) good.push(t); }
    } catch (err) { console.error("Shorten attempt failed:", err.message); }
  }
  return good.slice(0, 3);
}

// ---- Step 2: the web server ----
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(path.join(__dirname, "public", "index.html")));
    }
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, status);
    if (req.method === "POST" && req.url === "/api/shorten") {
      if (!status.ready) return json(res, 503, { error: "The AI post shortener is not ready yet." });
      const b = JSON.parse(await readBody(req, 30000)), text = String(b.text || "").trim().slice(0, 5000), limit = Math.max(40, Math.min(2000, parseInt(b.limit, 10) || 280));
      if (count(text) < 10) return json(res, 400, { error: "Paste your text first." });
      const r = await enqueue(() => shorten(text, limit, !!b.keepTags));
      return r.length ? json(res, 200, r) : json(res, 502, { error: "The AI couldn't fit it under " + limit + " characters. Try a higher limit." });
    }
    res.writeHead(404); res.end("Not found");
  } catch (err) { console.error(err); json(res, 500, { error: String(err?.message || err) }); }
});

// "127.0.0.1" means only YOUR computer can reach this app
server.listen(PORT, "127.0.0.1", () => console.log("Server running at http://localhost:" + PORT));
startModel();
