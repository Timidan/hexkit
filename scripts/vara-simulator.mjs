import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";

const binary = process.env.VARA_SIMULATOR_BINARY || fileURLToPath(new URL("../vara-simulator/target/debug/hexkit-vara-simulator", import.meta.url));
const host = process.env.VARA_SIMULATOR_HOST || "127.0.0.1";
const port = Number(process.env.VARA_SIMULATOR_PORT || 5791);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("VARA_SIMULATOR_PORT must be between 1 and 65535");
const hosts = new Set((process.env.VARA_SIMULATOR_ALLOWED_HOSTS ?? `127.0.0.1:${port},localhost:${port}`).split(",").map((s) => s.trim()).filter(Boolean));
const origins = new Set((process.env.VARA_SIMULATOR_ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173").split(",").map((s) => s.trim()).filter(Boolean));
if (process.env.HEXKIT_ORIGIN) origins.add(new URL(process.env.HEXKIT_ORIGIN).origin);
const apiKey = process.env.VARA_SIMULATOR_API_KEY;
let busy = false;

const server = http.createServer(async (req, res) => {
  const reply = (status, value) => { if (!res.destroyed && !res.writableEnded) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); } };
  if (!hosts.has(req.headers.host) || (req.headers.origin && !origins.has(req.headers.origin))) return reply(403, { error: "Origin is not allowed" });
  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", apiKey ? "Content-Type, X-API-Key" : "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") return reply(204, {});
  if (apiKey) {
    const supplied = Buffer.from(typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : "");
    const expected = Buffer.from(apiKey);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: "Invalid API key" });
  }
  if (req.url === "/health" && req.method === "GET") return reply(200, { runtime: "gtest 2.0.0", ready: existsSync(binary), busy });
  if (req.url !== "/run" || req.method !== "POST") return reply(404, { error: "Not found" });
  if (!req.headers["content-type"]?.startsWith("application/json")) return reply(415, { error: "Use application/json" });
  if (busy) return reply(409, { error: "A local scenario is already running" });
  if (!existsSync(binary)) return reply(503, { error: "Run npm run vara:build first" });
  busy = true;
  let child;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 48 * 1024 * 1024) { reply(413, { error: "Scenario exceeds 48 MiB" }); return; }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    JSON.parse(body.toString());
    const output = await new Promise((resolve, reject) => {
      child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH, RUST_BACKTRACE: "0" } });
      let stdout = "", stderr = "", stopped = false;
      const stop = (message) => { if (!stopped) { stopped = true; child.kill("SIGKILL"); reject(new Error(message)); } };
      const timer = setTimeout(() => stop("Scenario exceeded the 45-second local execution limit"), 45_000);
      const disconnected = () => { if (!res.writableEnded) stop("Request cancelled"); };
      res.on("close", disconnected);
      child.stdout.on("data", (data) => { stdout += data; if (stdout.length > 8 * 1024 * 1024) stop("Scenario output exceeds 8 MiB"); });
      child.stderr.on("data", (data) => { if (stderr.length < 4000) stderr += data.toString().slice(0, 4000 - stderr.length); });
      child.once("error", reject);
      child.stdin.on("error", () => {});
      child.once("close", (code) => {
        clearTimeout(timer); res.off("close", disconnected);
        if (stopped) return;
        try {
          const parsed = JSON.parse(stdout);
          if (code !== 0 || parsed.error) reject(new Error(parsed.error || "Gear runtime failed"));
          else resolve(parsed);
        } catch { reject(new Error(stderr.trim() || "Gear runtime exited without a report")); }
      });
      child.stdin.end(body);
    });
    reply(200, output);
  } catch (error) { reply(400, { error: error instanceof Error ? error.message : "Invalid scenario" }); }
  finally { child?.kill(); busy = false; }
});
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.listen(port, host, () => console.log(`Vara simulator: http://${host}:${port} (gtest 2.0.0)`));
