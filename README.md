# AI Chat Agent

一个基于 Vue 3 + Vercel Serverless 的 AI 对话应用，支持 SSE 流式输出、多会话管理、Markdown 渲染和 IP 限流。

🔗 **在线演示**：https://ai-chat-agent-fdk5.vercel.app

> 演示站点每 IP 每天免费 5 次对话，也可在设置中填入自己的 DeepSeek API Key 无限使用。

---

## ✨ 功能特性

- **SSE 流式对话**：基于 `@microsoft/fetch-event-source`，实现 POST + 流式分片解析和打字机效果
- **中止生成与重新生成**：基于 `AbortController`，支持中途停止、保留已生成内容、错误重试
- **多会话管理**：新建 / 切换 / 删除会话，消息本地持久化，刷新不丢
- **Markdown 渲染**：`markdown-it` + `highlight.js` + `DOMPurify`，支持代码块高亮和 XSS 过滤
- **Serverless 代理**：Vercel Function 持有 API Key，前端不暴露密钥
- **IP 限流**：`@upstash/ratelimit` 实现每 IP 每天 5 次，超限返回 429
- **双模式切换**：默认使用演示额度，用户也可在设置中填入自己的 API Key，不受限流
- **本地 Express + SQLite 模式**：开发环境走 `server/`（Express + better-sqlite3），会话与消息持久化到 SQLite，与线上 Vercel Serverless 共存

---

## 🛠 技术栈

| 分类 | 技术 |
|---|---|
| 前端框架 | Vue 3 + Vite + TypeScript |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| UI 组件 | Element Plus |
| HTTP | Axios + `@microsoft/fetch-event-source` |
| Markdown | markdown-it + highlight.js + DOMPurify |
| 后端 | Vercel Serverless Function（线上）/ Express + better-sqlite3（本地） |
| 限流 | Upstash Redis + `@upstash/ratelimit` |
| 部署 | Vercel |

---

## 🚀 本地启动

本地开发走 **Express + SQLite**（`server/` 目录，端口 3000）：Vite 把 `/api` 代理到 Express，
会话与消息持久化在 `server/data/ai-chat.db`（已 gitignore）；`POST /api/chat/completions`
直接复用 `api/chat.ts` 的上游调用、X-User-Key 与限流逻辑，SSE 流式透传。

```bash
# 安装依赖
npm install

# 创建 .env.local，填入服务端使用的 DeepSeek API Key
# （本地不再直连上游，VITE_DEEPSEEK_KEY 直连模式已由 Express 取代）
echo "DEEPSEEK_API_KEY=sk-你的Key" > .env.local

# 一键并发启动：Express(:3000) + Vite(:5173)，浏览器自动打开
npm run dev

# 也可以分开跑
npm run server   # 仅 Express（tsx watch 热重载）
npm run dev:web  # 仅前端（依赖 Express 已在跑）
```

说明：
- 前端通过 `import.meta.env.DEV` 切换存储：开发走 SQLite，生产构建走 localStorage，线上行为不变
- 未配置 `DEEPSEEK_API_KEY` 时，可在页面「设置」中填入自己的 Key（走 `X-User-Key` 头，不限流）
- 限流同线上：配置了 `UPSTASH_REDIS_REST_URL/TOKEN` 用 Upstash，否则内存降级
- 数据库位置 `server/data/ai-chat.db`，删掉该目录即可重置本地数据

```bash
# 类型检查（前端 / 服务端）
npm run typecheck:server
npx vue-tsc -b
```