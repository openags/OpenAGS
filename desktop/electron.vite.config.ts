import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        external: [
          'electron', 'node-pty', 'express', 'ws', 'http-proxy-middleware',
          'cross-spawn', '@anthropic-ai/claude-agent-sdk', '@openai/codex-sdk',
        ],
      },
    },
    resolve: {
      // Prevent resolving 'electron' to the npm package
      browserField: false,
      conditions: ['node'],
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        external: ['electron'],
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    server: {
      // Proxy API and WebSocket requests to the Node.js server (port 3001)
      // which in turn proxies /api to Python backend (port 19836)
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
        '/shell': { target: 'ws://127.0.0.1:3001', ws: true },
        '/chat': { target: 'ws://127.0.0.1:3001', ws: true },
      },
    },
  },
})
