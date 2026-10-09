---
name: SSE 流式对话（DeepSeek 直连，本地开发）
overview: 用 @microsoft/fetch-event-source 替换 sendChat 的非流式调用，实现 DeepSeek SSE 流式输出，前端逐字 append 到 AI 消息气泡，支持中止上一段流和 [DONE] 收尾。
todos:
  - id: extend-chat-message-type
    content: 在 src/types/chat.ts 给 ChatMessage 增加可选 status 字段
    status: completed
---

## 产品概述
为 AI Chat Agent 增加服务器发送事件（SSE）流式对话能力。本地开发直连 DeepSeek，AI 回复逐字显示，实现打字机效果。

## 核心功能
- 用 `@microsoft/fetch-event-source` 替换 axios 非流式请求，请求 `POST /api/chat/completions`，body `stream: true`
- 解析 SSE 分片 `data: {"choices":[{"delta":{"content":"..."}}]}`，增量追加到 AI 消息内容
- 识别 `[DONE]` 信号结束流，标记消息 `status: 'done'`
- JSON 解析异常 try/catch 容错，忽略坏分片不中断流
- ChatView 在用户消息后立即 push 一条 `status: 'streaming'` 的 AI 占位消息，逐字 append content
- 401 / 网络错误统一提示，已写入的内容保留，消息标 `status: 'error'`
- 发送新消息时自动中止上一段未完成的流
- 流式过程与完成态统一用纯文本渲染（不引入 Markdown）


## 技术栈
- 框架：Vue 3 + TypeScript + Vite
- 流式客户端：`@microsoft/fetch-event-source` ^2.0.1
- 现有 axios 实例：保留（用于非流式场景），本次不调用
- 状态：组件本地 `ref`（无 Pinia 变更）
- 类型：`src/types/chat.ts` 的 `ChatMessage` 增加可选 `status` 字段
- 代理：Vite dev server `/api` → `https://api.deepseek.com`（已就绪，rewrite 去掉 `/api` 前缀）
- 环境变量：`VITE_DEEPSEEK_KEY`（已就绪）

## 实现方案
### 总体策略
在 `src/api/chat.ts` 暴露一个 `streamChat(messages, handlers)` 函数，封装 `fetchEventSource` 调用与 SSE 解析。`ChatView` 改写 `handleSend`：先 push 用户消息 → 立即 push AI 占位消息（status: 'streaming'）→ 调用 `streamChat`，在 `onDelta` 回调里直接 `messagesBySession[sessionId][aiIndex].content += delta`，最后由 `onDone`/`onError` 标记 status。AbortController 存于模块作用域，发送新消息前先 `abort()` 上一段。

### SSE 协议处理
- 帧格式：`data: {json}\n\n` 与 `data: [DONE]\n\n`，逐行处理
- 移除每行 `data: ` 前缀（最多前导空格），`trim()` 后若为 `[DONE]` 触发 `onDone` 结束
- JSON 解析：`JSON.parse(payload)`，`try/catch` 吞掉 `SyntaxError`，记录 warn 继续
- 增量提取：`payload.choices?.[0]?.delta?.content`（注意 `delta` 可能为 `{}`、含 `role` 首帧、含 `finish_reason` 末帧），仅在 content 存在时回调 `onDelta`
- 首部：`fetchEventSource` 的 `onopen` 校验 `response.ok`（非 2xx 抛错），401 在 `onerror` 捕获并 `ElMessage.error`

### 中止与并发
- 模块级 `let currentController: AbortController | null = null`
- `streamChat` 进入时 `currentController?.abort()`，再创建新的 `AbortController` 传入 `fetchEventSource({ signal })`
- 完成后置空 `currentController`

### 类型扩展
- `ChatMessage` 新增 `status?: 'streaming' | 'done' | 'error'`，无值视为 `done`
- 现有 mockData 兼容（无需改 mock 文件）
- `MessageItem.vue` 在 `status === 'streaming'` 时在 content 末尾追加闪烁光标 `▍`（CSS `@keyframes blink`）

### 关键决策与权衡
- **不引入 Markdown 库**：题目第 7 条要求纯文本，与现状一致；如未来要 Markdown，可在 `status === 'done'` 时切换为 `v-md-editor` / `markdown-it` 渲染
- **Authorization 注入位置**：`fetchEventSource` 不走 axios 拦截器，必须在 `chat.ts` 的 `headers` 显式注入 `Bearer ${import.meta.env.VITE_DEEPSEEK_KEY}`，避免与现有 `request.ts` 耦合
- **增量更新粒度**：SSE 每个分片回调直接修改 `messagesBySession.value[sessionId][aiIndex].content += delta`。Vue 3 响应式追踪整个数组项，频繁拼接字符串触发整消息重渲染；分片粒度天然小（< 50 字符/帧），无需节流；如需进一步优化可 `nextTick` 批量合并，但本题不做
- **错误恢复策略**：网络中断时已 append 的内容保留，标 `error` 状态由用户决定是否重发，不自动重试

## 性能与可靠性
- 时间复杂度：单次请求 O(N) 个分片，每分片 O(L) 字符串拼接
- 内存：消息内容线性增长，无中间缓存
- 瓶颈与缓解：长回复时 MessageItem 整段 `<pre>` 重渲染；可通过将长文本分块 + `<div>` 替换 `<pre>` 优化（本题不做）
- 可靠性：AbortController 保障旧流及时释放；JSON 解析容错避免单分片异常中断整流；401 在 onopen 立即返回

## 架构设计
### 模块划分
- **API 层** `src/api/chat.ts`：封装 `fetchEventSource`、SSE 解析、Authorization 注入
- **类型层** `src/types/chat.ts`：`ChatMessage.status` 字段
- **视图层** `src/views/ChatView.vue`：状态机（idle → streaming → done/error），占位消息管理
- **组件层** `src/components/chat/MessageItem.vue`：流式光标渲染

### 数据流
用户输入 → ChatView push user msg → push assistant 占位(streaming) → streamChat 开始（abort 旧流）→ onDelta: content += delta → [DONE] → onDone: status = done / onError: status = error + ElMessage → finally: sending = false

## 目录结构
```
src/
├── api/
│   └── chat.ts                # [MODIFY] 替换 sendChat，新增 streamChat(messages, handlers)，
│                              #       headers 注入 Authorization，SSE 解析与回调
├── types/
│   └── chat.ts                # [MODIFY] ChatMessage 增加 status?: 'streaming'|'done'|'error'
├── views/
│   └── ChatView.vue           # [MODIFY] handleSend 重构：占位 + 增量 append + status 标记，
│                              #       移除 await sendChat，引入 AbortController
└── components/chat/
    └── MessageItem.vue        # [MODIFY] status==='streaming' 时显示 ▍ 光标 + blink 动画
```

