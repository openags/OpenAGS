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
          '@openags/app', '@github/copilot-sdk',
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
      port: 3090,
      strictPort: true,
      // Proxy API and WebSocket requests to the Node.js server
      proxy: {
        '/api': 'http://127.0.0.1:19836',
        '/health': 'http://127.0.0.1:19836',
        '/ws': { target: 'ws://127.0.0.1:19836', ws: true },
        '/shell': { target: 'ws://127.0.0.1:19836', ws: true },
        '/chat': { target: 'ws://127.0.0.1:19836', ws: true },
        '/workflow': { target: 'ws://127.0.0.1:19836', ws: true },
      },
    },
  },
})
