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
- **RAG 知识库**：本地开发模式（DEV）可用，上传 TXT 文档（自动切分 500 字/段、重叠 50 字），调用硅基流动 `BAAI/bge-m3` 生成向量存入内存向量库；有文档时聊天自动检索 top-3 片段拼入 System Prompt，回答下方展示引用来源（文档名、片段号、相似度），来源随消息持久化

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
| Embedding（RAG） | 硅基流动 SiliconFlow · BAAI/bge-m3（1024 维，免费） |
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

# RAG 知识库需要（可选）：硅基流动 API Key，用于 BAAI/bge-m3 向量化
echo "SILICONFLOW_API_KEY=sk-你的硅基流动Key" >> .env.local

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

---

## 📚 RAG 知识库（本地开发模式）

侧栏「知识库」入口：上传 TXT → 切分 → 向量化 → 检索 → 引用来源，全流程由本地 Express 完成。

**处理流程**：

1. 前端上传 TXT（UTF-8 严格解码，失败自动回退 GBK，兼容 Windows 中文记事本）
2. 后端切分：500 字/段，相邻段重叠 50 字
3. 调用硅基流动 Embedding API（`BAAI/bge-m3`，1024 维，分批 16 条/次）生成向量
4. 存入内存向量库（服务重启后丢失，重新上传即可）
5. 用户提问 → 问题向量化 → 余弦相似度检索 top-3 片段 → 拼入 System Prompt
6. AI 回答时标注引用编号（如 `[1] [2]`），消息下方展示引用来源（文档名、片段号、相似度），并随消息持久化到 SQLite

**API 设计**：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/documents/upload` | 上传文档（JSON：`{ filename, content }`），切分 + 向量化 + 入库 |
| GET | `/api/documents` | 文档列表（名称、字数、段数、时间） |
| DELETE | `/api/documents/:id` | 删除文档（级联删除其片段向量） |
| POST | `/api/rag/query` | 知识库检索：`{ question }` → top-3 片段 |

**注意事项**：

- 依赖 `.env.local` 中的 `SILICONFLOW_API_KEY`，未配置时上传/检索返回明确错误提示
- 仅本地开发模式（DEV）可用：向量存 Express 内存，线上 Vercel Serverless 无状态（后续可升级 Upstash Vector）
- 目前仅支持 TXT（单文件 ≤ 4MB），PDF 后续支持
- 检索失败时自动降级为普通聊天，不打断回答