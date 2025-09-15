import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    define: {
      global: "globalThis",
      "import.meta.env.API_KEY": JSON.stringify(env.API_KEY),
      "import.meta.env.VITE_API_KEY": JSON.stringify(env.VITE_API_KEY),
    },
    optimizeDeps: {
      include: ["ethers", "buffer"],
    },
    resolve: {
      alias: {
        buffer: "buffer",
      },
    },
    server: {
      proxy: {
        // Proxy for Sourcify API
        "/api/sourcify": {
          target: "https://sourcify.dev",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/sourcify/, ""),
          configure: (proxy) => {
            proxy.on("error", (err) => {
              console.log("proxy error", err);
            });
            proxy.on("proxyReq", (_proxyReq, req) => {
              console.log(
                "Sending Request to the Target:",
                req.method,
                req.url
              );
            });
            proxy.on("proxyRes", (proxyRes, req) => {
              console.log(
                "Received Response from the Target:",
                proxyRes.statusCode,
                req.url
              );
            });
          },
        },
        // Proxy for Blockscout APIs
        "/api/blockscout": {
          target: "https://base-mainnet.blockscout.com",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/blockscout/, ""),
        },
        "/api/polygon-blockscout": {
          target: "https://polygon.blockscout.com",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/polygon-blockscout/, ""),
        },
        "/api/arbitrum-blockscout": {
          target: "https://arbitrum.blockscout.com",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/arbitrum-blockscout/, ""),
        },
        // Proxy for Etherscan APIs
        "/api/basescan": {
          target: "https://api.basescan.org",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/basescan/, ""),
        },
        "/api/etherscan": {
          target: "https://api.etherscan.io",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/etherscan/, ""),
        },
        "/api/polygonscan": {
          target: "https://api.polygonscan.com",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/polygonscan/, ""),
        },
        "/api/arbiscan": {
          target: "https://api.arbiscan.io",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/arbiscan/, ""),
        },
        // Proxy for Sourcify repo
        "/api/repo": {
          target: "https://repo.sourcify.dev",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/repo/, ""),
        },
      },
    },
  };
});
