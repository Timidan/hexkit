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
})
