import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { handleEtherscanLookup } from "./api/explorer/etherscanShared";

/**
 * Injects the EDB bridge origin into the CSP connect-src at build time.
 * Set VITE_SIMULATOR_BRIDGE_URL in your Vercel env vars and the CSP
 * automatically allows connections to that origin.
 */
function injectBridgeCsp(): Plugin {
  return {
    name: "inject-bridge-csp",
    transformIndexHtml(html) {
      const bridgeUrl = process.env.VITE_SIMULATOR_BRIDGE_URL;
      if (!bridgeUrl || bridgeUrl === "disabled") return html;
      try {
        const origin = new URL(bridgeUrl).origin;
        return html.replace(
          /(connect-src\s[^"]*?)(;)/,
          `$1 ${origin} wss://${new URL(bridgeUrl).host}$2`,
        );
      } catch {
        return html;
      }
    },
  };
}

function devExplorerProxy(): Plugin {
  return {
    name: "dev-explorer-proxy",
    configureServer(server) {
      server.middlewares.use("/api/explorer/etherscan", async (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("cache-control", "no-store");
          res.end();
          return;
        }

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("cache-control", "no-store");
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        req.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > 16 * 1024) {
            req.destroy(new Error("body_too_large"));
            return;
          }
          chunks.push(chunk);
        });

        req.on("error", () => {
          if (!res.writableEnded) {
            res.statusCode = 400;
            res.setHeader("cache-control", "no-store");
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "invalid_request" }));
          }
        });

        req.on("end", async () => {
          try {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            const parsedBody = rawBody ? JSON.parse(rawBody) : null;
            const response = await handleEtherscanLookup(parsedBody, process.env);

            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              res.setHeader(key, value);
            });

            const body = Buffer.from(await response.arrayBuffer());
            res.end(body);
          } catch {
            if (!res.writableEnded) {
              res.statusCode = 400;
              res.setHeader("cache-control", "no-store");
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "invalid_request" }));
            }
          }
        });
      });
    },
  };
}

// ── Gemini AI Studio LLM proxy (dev server) ────────────────────────────────

function llmProxyPlugin(envObj: Record<string, string>): Plugin {
  return {
    name: "llm-proxy",
    configureServer(server) {
      server.middlewares.use("/api/llm-recommend", async (req, res) => {
        if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
        if (req.method !== "POST") { res.statusCode = 405; res.end('{"error":"method_not_allowed"}'); return; }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = Buffer.concat(chunks).toString("utf-8");

        const model = envObj.GEMINI_MODEL || "gemini-2.5-flash-lite";
        const apiKey = envObj.GEMINI_API_KEY || "";
        if (!apiKey) { res.statusCode = 500; res.end('{"error":"No GEMINI_API_KEY"}'); return; }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const gemHeaders: Record<string, string> = { "Content-Type": "application/json", "x-goog-api-key": apiKey };

        try {
          const upstream = await fetch(url, { method: "POST", headers: gemHeaders, body, signal: AbortSignal.timeout(55_000) });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Gemini-Model", model);
          res.end(text);
        } catch (err: any) {
          console.error(`[llm-proxy] ${model} failed:`, err?.message);
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Upstream failed" }));
        }
      });
    },
  };
}

function llmInvokeProxyPlugin(env: Record<string, string>): Plugin {
  const PROCESS_ENV_KEYS = [
    "GEMINI_API_KEY",
    "GEMINI_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "PROXY_SECRET",
    "ALLOWED_ORIGINS",
    "LLM_GUARD_CONFIG",
  ];
  for (const k of PROCESS_ENV_KEYS) {
    if (env[k] !== undefined && process.env[k] === undefined) {
      process.env[k] = env[k];
    }
  }
  return {
    name: "llm-invoke-proxy",
    configureServer(server) {
      server.middlewares.use("/api/llm-invoke", async (req, res) => {
        if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
        if (req.method !== "POST") { res.statusCode = 405; res.end('{"error":"method_not_allowed"}'); return; }

        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: any = {};
        try { body = JSON.parse(raw || "{}"); }
        catch { res.statusCode = 400; res.end('{"error":"bad_json"}'); return; }

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === "string") headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v[0] ?? "";
        }

        if (!headers["x-user-api-key"]) {
          const provider = typeof body?.provider === "string" ? body.provider : "";
          const fallback =
            provider === "gemini" ? env.GEMINI_API_KEY :
            provider === "anthropic" ? env.ANTHROPIC_API_KEY :
            provider === "openai" ? env.OPENAI_API_KEY :
            undefined;
          if (fallback) headers["x-user-api-key"] = fallback;
        }

        const fakeReq = { method: req.method, headers, body };
        const fakeRes = {
          statusCode: 200,
          headersSent: false,
          _headers: {} as Record<string, string>,
          _body: "" as string,
          status(code: number) { this.statusCode = code; this.headersSent = true; return this; },
          setHeader(k: string, v: string) { this._headers[k] = v; return this; },
          json(body: unknown) { this._body = JSON.stringify(body); this._headers["content-type"] = "application/json"; this.headersSent = true; return this; },
          send(body: unknown) { this._body = typeof body === "string" ? body : JSON.stringify(body); this.headersSent = true; return this; },
          write(chunk: Buffer | string) {
            this._body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
            this.headersSent = true;
            return true;
          },
          end(body?: unknown) {
            if (body !== undefined) {
              this._body += typeof body === "string" ? body : Buffer.isBuffer(body) ? body.toString("utf8") : JSON.stringify(body);
            }
            return this;
          },
        };

        try {
          const mod = await server.ssrLoadModule("/api/llm-invoke.ts");
          await mod.default(fakeReq, fakeRes);
        } catch (err) {
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: "dev_shim_failed", detail: (err as Error).message }));
          }
          return;
        }

        res.statusCode = fakeRes.statusCode;
        for (const [k, v] of Object.entries(fakeRes._headers)) res.setHeader(k, v);
        res.end(fakeRes._body);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite does NOT auto-populate process.env with .env files at config time.
  // We load non-VITE_ server-side vars (e.g. LIFI_API_KEY) manually so the
  // dev proxies below can inject them as upstream headers.
  const env = loadEnv(mode, process.cwd(), "");
  const LIFI_API_KEY = env.LIFI_API_KEY || process.env.LIFI_API_KEY || "";

  return {
    plugins: [
      react({
        include: "**/*.{jsx,tsx}",
      }),
      tailwindcss(),
      injectBridgeCsp(),
      devExplorerProxy(),
      llmProxyPlugin(env),
      llmInvokeProxyPlugin(env),
    ],
    esbuild: {
      logOverride: { "this-is-undefined-in-esm": "silent" },
    },
    define: {
      global: "globalThis",
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
      "process.env": "{}",
    },
    optimizeDeps: {
      include: [
        "ethers",
        "buffer",
        "iframe-shared-storage",
        "@cofhe/sdk",
        "@cofhe/sdk/web",
        "@cofhe/sdk/chains",
      ],
      exclude: ["tfhe"],
    },
    worker: {
      format: "es",
    },
    test: {
      globals: true,
      environmentMatchGlobs: [
        ["tests/llm/llmConfig*.test.ts*", "jsdom"],
        ["tests/llm/useLlmInvocation*.test.ts*", "jsdom"],
        ["tests/llm/consent*.test.ts*", "jsdom"],
        ["tests/llm/settings*.test.ts*", "jsdom"],
        ["tests/llm/llmSettings*.test.ts*", "jsdom"],
        ["tests/llm/destination*.test.ts*", "jsdom"],
      ],
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            wagmi: ["wagmi", "@wagmi/core", "@wagmi/connectors"],
            walletconnect: [
              "@walletconnect/ethereum-provider",
              "@reown/appkit",
              "@reown/appkit-controllers",
            ],
            ethers: ["ethers"],
          },
        },
      },
    },
    resolve: {
      alias: {
        buffer: "buffer",
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      hmr: {
        overlay: false,
        port: 24678,
        host: "localhost",
      },
      watch: {
        usePolling: false,
        interval: 100,
        ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
      },
      proxy: {
        // Proxy for EDB bridge (strips /api/edb prefix, forwards to bridge)
        // Reads EDB_BRIDGE_URL from .env; falls back to localhost for local bridge dev.
        // Injects X-API-Key server-side so the browser never sees the secret —
        // mirrors api/edb-proxy.ts behavior for local dev.
        "/api/edb": {
          target: env.EDB_BRIDGE_URL || "http://127.0.0.1:5789",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/edb/, ""),
          configure: (proxy) => {
            const apiKey = env.EDB_API_KEY || "";
            proxy.on("proxyReq", (proxyReq) => {
              if (apiKey) proxyReq.setHeader("X-API-Key", apiKey);
            });
          },
        },
        // Proxy for Sourcify Repository API (must be BEFORE the general /api/sourcify)
        // repo.sourcify.dev now 307-redirects to sourcify.dev/server/repository,
        // so target the new location directly to avoid redirect/CORS issues.
        "/api/sourcify/repository": {
          target: "https://sourcify.dev",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/sourcify\/repository/, "/server/repository"),
        },
        // Proxy for Sourcify Server API
        "/api/sourcify/server": {
          target: "https://sourcify.dev",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/sourcify\/server/, "/server"),
        },
        // Legacy Sourcify proxy (fallback for other paths)
        "/api/sourcify": {
          target: "https://sourcify.dev",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/sourcify/, ""),
        },
        // Proxy for Blockscout APIs - Ethereum mainnet
        // Blockscout API lives at /api/v2/... so rewrite must preserve the /api prefix
        "/api/eth-blockscout": {
          target: "https://eth.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/eth-blockscout/, "/api"),
        },
        // Base Blockscout (also default for many chains)
        "/api/blockscout": {
          target: "https://base.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/blockscout/, "/api"),
        },
        "/api/polygon-blockscout": {
          target: "https://polygon.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/polygon-blockscout/, "/api"),
        },
        "/api/arbitrum-blockscout": {
          target: "https://arbitrum.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/arbitrum-blockscout/, "/api"),
        },
        "/api/base-sepolia-blockscout": {
          target: "https://base-sepolia.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/base-sepolia-blockscout/, "/api"),
        },
        "/api/lisk-sepolia-blockscout": {
          target: "https://sepolia-blockscout.lisk.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/lisk-sepolia-blockscout/, "/api"),
        },
        "/api/lisk-blockscout": {
          target: "https://blockscout.lisk.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/lisk-blockscout/, "/api"),
        },
        "/api/optimism-blockscout": {
          target: "https://optimism.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/optimism-blockscout/, "/api"),
        },
        "/api/sepolia-blockscout": {
          target: "https://eth-sepolia.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/sepolia-blockscout/, "/api"),
        },
        "/api/gnosis-blockscout": {
          target: "https://gnosis.blockscout.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) =>
            path.replace(/^\/api\/gnosis-blockscout/, "/api"),
        },
        // Proxy for LI.FI Earn Data API (API key now mandatory — same key as Composer)
        "/api/lifi-earn": {
          target: "https://earn.li.fi",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/lifi-earn/, ""),
          headers: {
            "x-lifi-api-key": LIFI_API_KEY,
          },
        },
        // Proxy for LI.FI Composer API (needs API key — handled by serverless fn in prod)
        "/api/lifi-composer": {
          target: "https://li.quest",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/lifi-composer/, ""),
          headers: {
            "x-lifi-api-key": LIFI_API_KEY,
          },
        },
        // Gemini is handled by llmProxyPlugin() below — not a static proxy
        // Proxy for Sourcify repo
        "/api/repo": {
          target: "https://repo.sourcify.dev",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/repo/, ""),
        },
      },
      allowedHosts: [".devtunnels.ms"],
    },
  };
});
