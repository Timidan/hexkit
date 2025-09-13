import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['ethers', 'buffer'],
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  server: {
    proxy: {
      // Proxy for Sourcify API
      '/api/sourcify': {
        target: 'https://sourcify.dev',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/sourcify/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      // Proxy for Blockscout APIs
      '/api/blockscout': {
        target: 'https://base-mainnet.blockscout.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/blockscout/, ''),
      },
      '/api/polygon-blockscout': {
        target: 'https://polygon.blockscout.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/polygon-blockscout/, ''),
      },
      '/api/arbitrum-blockscout': {
        target: 'https://arbitrum.blockscout.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/arbitrum-blockscout/, ''),
      },
      // Proxy for Etherscan APIs
      '/api/basescan': {
        target: 'https://api.basescan.org',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/basescan/, ''),
      },
      '/api/etherscan': {
        target: 'https://api.etherscan.io',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/etherscan/, ''),
      },
      '/api/polygonscan': {
        target: 'https://api.polygonscan.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/polygonscan/, ''),
      },
      '/api/arbiscan': {
        target: 'https://api.arbiscan.io',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/arbiscan/, ''),
      },
      // Proxy for Sourcify repo
      '/api/repo': {
        target: 'https://repo.sourcify.dev',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/repo/, ''),
      },
    },
  },
})
