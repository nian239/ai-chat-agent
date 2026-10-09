---
name: Markdown 渲染 + 代码高亮 + XSS 防护
overview: 新建 src/utils/markdown.ts 用 markdown-it + highlight.js + DOMPurify 封装 renderMarkdown；改造 MessageItem.vue：用户消息/流式中保持纯文本+光标，AI 完成后用 v-html 渲染 Markdown 视图。
todos:
  - id: create-markdown-util
    content: 新建 src/utils/markdown.ts，导出 renderMarkdown（markdown-it + highlight.js + DOMPurify.sanitize）
    status: completed
  - id: refactor-message-item
    content: 改造 MessageItem.vue：三态分支渲染（user 纯文本 / assistant 流式纯文本+光标 / assistant done v-html），:deep(.markdown-body) 排版样式，引入 highlight.js github.css
    status: completed
    dependencies:
      - create-markdown-util
  - id: type-check
    content: 运行 vue-tsc --noEmit 确认无类型错误
    status: completed
    dependencies:
      - create-markdown-util
      - refactor-message-item
---


## 产品概述
为 AI Chat Agent 增加 AI 回复的 Markdown 渲染能力，包括代码高亮与 XSS 防护，同时保留流式输出的打字机效果。

## 核心功能
- 新建 `src/utils/markdown.ts`，导出 `renderMarkdown(content: string): string`
- 流式输出（`status==='streaming'`）保持纯文本 + 光标 ▍ 闪烁
- AI 回复完成（`status==='done'` 或 `'error'`）用 `v-html` 渲染 Markdown
- 代码块由 highlight.js 高亮
- DOMPurify.sanitize 过滤 XSS（剥离 `javascript:` / `onerror` / `<script>` 等）
- 用户消息（`role==='user'`）始终纯文本



## 技术栈
- 渲染引擎：`markdown-it` ^15.0.2
- 代码高亮：`highlight.js` ^11.12.0（内置常见语言：JS/TS/Python/Go/SQL/JSON/Bash/HTML/CSS/Vue）
- XSS 防护：`dompurify` ^3.4.16
- 主题：highlight.js `github.css`（浅色，匹配 AI 白色气泡）
- 框架：Vue 3 + TypeScript + Vite（既有）

## 实现方案

### `src/utils/markdown.ts`（新建）
- 单例 `MarkdownIt` 实例：配置 `html: false`（防 raw HTML）、`breaks: true`（AI 单换行友好）、`linkify: true`（自动识别 URL）
- `highlight` 选项回调：
  - 尝试 `hljs.highlight(code, { language, ignoreIllegals: true })`
  - 失败/不支持时回退为 `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`，永不抛错
- `renderMarkdown(content)`：先 `md.render(content)`，再用 `DOMPurify.sanitize(html)` 清洗后返回
- 导出 `renderMarkdown`，按需可加 `escapeHtml` 内部工具

### `src/components/chat/MessageItem.vue`（改）
- 顶部 `import 'highlight.js/styles/github.css'` 引入主题
- 新增 `isAssistantDone = computed(() => props.message.role === 'assistant' && (status==='done' || status==='error'))`
- 模板三态：
  - user：`<pre class="content">{{ content }}</pre>`（无光标）
  - assistant streaming：`<pre class="content">{{ content }}<span class="cursor">▍</span></pre>`（保留闪烁）
  - assistant done/error：`<div class="markdown-body" v-html="renderedHtml"></div>`
- `renderedHtml = computed(...)`：仅 assistant done 时调 `renderMarkdown(content)`，其它态返回空串
- 用 `:deep(.markdown-body)` 包裹排版样式（h1/h2/h3/p/ul/ol/code/pre/blockquote/a 等间距、行高、列表缩进、code 块 padding+背景、pre 滚动），不污染组件外

### `src/views/ChatView.vue`
- 不动

## 关键决策与权衡
- **完成态才调 renderMarkdown**：流式纯文本避免每 chunk 都解析+清洗；切到 done 时执行一次，开销可忽略
- **错误态按 done 渲染**：已中断但内容仍可读，对用户友好
- **DOMPurify 默认策略**：足够覆盖常见 XSS 场景，不引入自定义 allowlist 避免越严格
- **v-html + :deep()**：Vue scoped CSS 对 v-html 子元素不生效，必须用深度选择器
- **highlight.js 不额外注册语言**：v11 内置覆盖 DeepSeek 典型回复；后续要加语言用 `hljs.registerLanguage(...)` 增量扩展

## 性能与可靠性
- 性能：renderMarkdown 仅在 done 切换时执行一次；流式 0 开销
- 内存：单例 markdown-it / highlight.js 复用，无重复初始化
- 可靠性：highlight 失败降级为 escapeHtml，永不抛错；DOMPurify 过滤保证安全
- 流式未闭合的 ``` 代码块：按要求纯文本不渲染，符合预期

