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
| 后端 | Vercel Serverless Function |
| 限流 | Upstash Redis + `@upstash/ratelimit` |
| 部署 | Vercel |

---

## 🚀 本地启动

```bash
# 安装依赖
npm install

# 创建 .env.local，填入你的 DeepSeek API Key
echo "VITE_DEEPSEEK_KEY=sk-你的Key" > .env.local

# 启动开发服务器
npm run dev