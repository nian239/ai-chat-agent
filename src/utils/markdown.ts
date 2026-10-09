import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

/**
 * 单例 markdown-it 实例
 * - html: false：禁止 raw HTML 标签（输入里的 <script> 等会被转义）
 * - breaks: true：单换行 → <br>，对 AI 输出友好
 * - linkify: true：自动识别 URL 生成链接
 */
// markdown-it 用 `export =` 导出，命名空间（内含 type MarkdownIt）在 esModuleInterop
// 合成的默认导入上访问不到。用 InstanceType<typeof MarkdownIt> 从构造函数值推出实例类型，
// 绕开命名空间问题，同时满足 noImplicitAny。
const md: InstanceType<typeof MarkdownIt> = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const out = hljs.highlight(str, { language: lang, ignoreIllegals: true })
        return `<pre class="hljs"><code class="language-${lang}">${out.value}</code></pre>`
      } catch {
        // 忽略，降级为转义文本
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

/**
 * 把 Markdown 文本渲染为安全的 HTML 字符串
 * - 先经 markdown-it 解析
 * - 再经 DOMPurify.sanitize 过滤 XSS（剥 <script>、javascript:、onerror 等）
 * - 用于 v-html 绑定
 */
export function renderMarkdown(content: string): string {
  const raw = md.render(content ?? '')
  return DOMPurify.sanitize(raw)
}
