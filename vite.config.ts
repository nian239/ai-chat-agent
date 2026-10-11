import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
    // DEV 统一走本地 Express（server/，端口 3000）：
    // - /api/chat/completions → 复用 api/chat.ts handler（SSE 流式透传）
    // - /api/sessions、/api/sessions/:id/messages → SQLite CRUD
    // 原「直连 DeepSeek + rewrite 去前缀」模式由 Express 统一取代，无需 rewrite
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
