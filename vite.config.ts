import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

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

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      react({
        include: "**/*.{jsx,tsx}",
      }),
      tailwindcss(),
      injectBridgeCsp(),
    ],
    esbuild: {
      logOverride: { "this-is-undefined-in-esm": "silent" },
    },
    define: {
      global: "globalThis",
      "process.env": JSON.stringify({}),
    },
    optimizeDeps: {
      include: ["ethers", "buffer"],
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
        // Reads EDB_BRIDGE_URL from .env; falls back to localhost for local bridge dev
        "/api/edb": {
          target: process.env.EDB_BRIDGE_URL || "http://127.0.0.1:5789",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/edb/, ""),
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
        // Proxy for Etherscan APIs
        "/api/basescan": {
          target: "https://api.basescan.org",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/basescan/, ""),
        },
        "/api/base-sepolia-basescan": {
          target: "https://api-sepolia.basescan.org",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/base-sepolia-basescan/, ""),
        },
        "/api/etherscan": {
          target: "https://api.etherscan.io",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/etherscan/, ""),
        },
        "/api/sepolia-etherscan": {
          target: "https://api-sepolia.etherscan.io",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/sepolia-etherscan/, ""),
        },
        "/api/holesky-etherscan": {
          target: "https://api-holesky.etherscan.io",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/holesky-etherscan/, ""),
        },
        "/api/polygonscan": {
          target: "https://api.polygonscan.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/polygonscan/, ""),
        },
        "/api/amoy-polygonscan": {
          target: "https://api-amoy.polygonscan.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/amoy-polygonscan/, ""),
        },
        "/api/arbiscan": {
          target: "https://api.arbiscan.io",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/arbiscan/, ""),
        },
        // Proxy for Sourcify repo
        "/api/repo": {
          target: "https://repo.sourcify.dev",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/repo/, ""),
        },
      },
      allowedHosts: ["https://spt2wbxn-5173.uks1.devtunnels.ms"],
    },
  };
});
