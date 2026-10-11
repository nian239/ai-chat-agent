<script setup lang="ts">
import { computed, inject } from 'vue'
import { CircleCheck, CircleClose, Loading } from '@element-plus/icons-vue'
import 'highlight.js/styles/github.css'
import type { ChatMessage } from '@/types/chat'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  message: ChatMessage
}>()

interface ChatActions {
  stopGeneration: (messageId: string) => void
  regenerate: () => void
  canRegenerate: (messageId: string) => boolean
}

const actions = inject<ChatActions>('chatActions')

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.status === 'streaming')
const isStopped = computed(() => props.message.status === 'stopped')
const isError = computed(() => props.message.status === 'error')
const isDone = computed(() => props.message.status === 'done' || props.message.status === undefined)
/** AI 完成态（含 done / error / stopped）：用 Markdown 渲染 */
const isAssistantRendered = computed(
  () => props.message.role === 'assistant' && !isStreaming.value,
)

/** 极简 HTML 转义：Markdown 渲染失败时降级为纯文本，配合 v-html 使用必须转义 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 仅在完成态解析 Markdown；其它态返回空串，模板里用 v-if 走纯文本分支
 * try/catch 兜底：渲染函数内抛错会让 .bubble 之后的整行操作按钮（重新生成/重试）一起不渲染
 */
const renderedHtml = computed(() => {
  if (!isAssistantRendered.value) return ''
  try {
    return renderMarkdown(props.message.content)
  } catch (err) {
    console.warn('[MessageItem] Markdown 渲染失败，降级为纯文本:', err)
    return escapeHtml(props.message.content)
  }
})

/** 是否能对此消息操作（重新生成 / 重试）。停止按钮已统一收到底部输入区，见 ChatInput */
const showRegenerate = computed(
  () => props.message.role === 'assistant' && !isStreaming.value &&
    (isDone.value || isStopped.value) && (actions?.canRegenerate(props.message.id) ?? false),
)
const showRetry = computed(
  () => props.message.role === 'assistant' && isError.value &&
    (actions?.canRegenerate(props.message.id) ?? false),
)

function handleRegenerate() {
  actions?.regenerate()
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 相似度格式化为百分比（余弦 -1 ~ 1，展示时截断为 0 ~ 100%） */
function formatScore(score: number): string {
  return `${Math.max(0, Math.round(score * 100))}%`
}

/** JSON 值格式化展示：字符串先尝试解析再美化，失败时原样展示 */
function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '(空)'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 工具结果是否为错误（执行失败时以 { error } JSON 回填） */
function isToolError(result: string): boolean {
  if (!result) return false
  try {
    const parsed = JSON.parse(result) as unknown
    return typeof parsed === 'object' && parsed !== null && 'error' in parsed
  } catch {
    return false
  }
}
</script>

<template>
  <div class="message-item" :class="isUser ? 'right' : 'left'">
    <div class="avatar" :class="isUser ? 'avatar-user' : 'avatar-ai'">
      {{ isUser ? '我' : 'AI' }}
    </div>
    <div class="bubble-wrap">
      <div class="bubble">
        <!-- 1) 用户消息：纯文本 -->
        <pre v-if="isUser" class="content">{{ message.content }}</pre>

        <!-- 2) AI 流式中：纯文本 + 光标 ▍ -->
        <pre v-else-if="isStreaming" class="content"
          >{{ message.content }}<span class="cursor">▍</span></pre
        >

        <!-- 3) AI 完成/错误/停止：渲染 Markdown（含代码高亮，已 DOMPurify 清洗） -->
        <div v-else class="content markdown-body" v-html="renderedHtml"></div>
      </div>

      <!-- 工具调用卡片（Function Calling）：result 为空串表示调用中 -->
      <div v-if="message.toolUses && message.toolUses.length > 0" class="tool-uses">
        <div v-for="(use, i) in message.toolUses" :key="i" class="tool-item">
          <div class="tool-head">
            <el-icon v-if="!use.result" class="tool-icon is-loading"><Loading /></el-icon>
            <el-icon v-else-if="isToolError(use.result)" class="tool-icon error"><CircleClose /></el-icon>
            <el-icon v-else class="tool-icon success"><CircleCheck /></el-icon>
            <span class="tool-name">{{ use.name }}</span>
            <span v-if="!use.result" class="tool-status pending">正在调用工具…</span>
            <span
              v-else
              class="tool-status"
              :class="isToolError(use.result) ? 'failed' : 'ok'"
            >
              {{ isToolError(use.result) ? '调用失败' : '调用完成' }}
            </span>
          </div>
          <el-collapse class="tool-collapse">
            <el-collapse-item title="参数与结果">
              <div class="tool-detail">
                <div class="tool-row">
                  <span class="tool-label">参数</span>
                  <pre class="tool-json">{{ formatJson(use.args) }}</pre>
                </div>
                <div v-if="use.result" class="tool-row">
                  <span class="tool-label">结果</span>
                  <pre
                    class="tool-json"
                    :class="{ 'tool-json-error': isToolError(use.result) }"
                  >{{ formatJson(use.result) }}</pre>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>

      <!-- RAG 引用来源（仅走知识库回答的 assistant 消息携带） -->
      <div v-if="message.sources && message.sources.length > 0" class="sources">
        <div class="sources-title">引用来源</div>
        <div
          v-for="(source, i) in message.sources"
          :key="i"
          class="source-item"
          :title="source.docName"
        >
          <span class="source-index">[{{ i + 1 }}]</span>
          <span class="source-name">{{ source.docName }}</span>
          <span class="source-meta">片段 {{ source.chunkIndex + 1 }} · 相似度 {{ formatScore(source.score) }}</span>
        </div>
      </div>

      <!-- 操作行：time + 重新生成 / 重试 -->
      <div class="meta-row">
        <span class="time">{{ formatTime(message.timestamp) }}</span>
        <el-button
          v-if="showRegenerate"
          link
          size="small"
          class="action-btn"
          @click="handleRegenerate"
        >
          重新生成
        </el-button>
        <el-button
          v-else-if="showRetry"
          link
          size="small"
          class="action-btn retry"
          @click="handleRegenerate"
        >
          重试
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.message-item.left {
  flex-direction: row;
}

.message-item.right {
  flex-direction: row-reverse;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  border-radius: 10px;
  flex-shrink: 0;
}

.avatar-user {
  background: linear-gradient(135deg, #4f6ef7 0%, #3b55e8 100%);
}

.avatar-ai {
  background: linear-gradient(135deg, #67c23a 0%, #4faf2f 100%);
}

.bubble-wrap {
  max-width: 68%;
  display: flex;
  flex-direction: column;
}

.message-item.right .bubble-wrap {
  align-items: flex-end;
}

.bubble {
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  border-radius: 12px;
  word-break: break-word;
}

.message-item.left .bubble {
  color: #303133;
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-top-left-radius: 4px;
}

.message-item.right .bubble {
  color: #ffffff;
  background: linear-gradient(135deg, #4f6ef7 0%, #3b55e8 100%);
  border-top-right-radius: 4px;
}

.content {
  margin: 0;
  font-family: inherit;
  white-space: pre-wrap;
}

.cursor {
  display: inline-block;
  margin-left: 2px;
  color: #909399;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink {
  to {
    visibility: hidden;
  }
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  min-height: 20px;
}

/* ========== 工具调用卡片（Function Calling） ========== */
.tool-uses {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.tool-item {
  padding: 8px 12px;
  font-size: 12px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.tool-icon.success {
  color: #67c23a;
}

.tool-icon.error {
  color: #f56c6c;
}

.tool-name {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-weight: 600;
  color: #303133;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-status {
  flex-shrink: 0;
  color: #909399;
}

.tool-status.pending {
  color: #3b55e8;
}

.tool-status.ok {
  color: #67c23a;
}

.tool-status.failed {
  color: #f56c6c;
}

.tool-collapse {
  margin-top: 2px;
  border-top: none;
}

.tool-collapse :deep(.el-collapse-item__header) {
  height: 26px;
  line-height: 26px;
  font-size: 12px;
  color: #909399;
  background: transparent;
  border-bottom: none;
}

.tool-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom: none;
}

.tool-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 4px;
}

.tool-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-label {
  color: #909399;
}

.tool-json {
  margin: 0;
  padding: 6px 8px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background: #ffffff;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.tool-json-error {
  color: #f56c6c;
}

/* ========== RAG 引用来源 ========== */
.sources {
  margin-top: 6px;
  padding: 8px 12px;
  font-size: 12px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  max-width: 100%;
}

.sources-title {
  margin-bottom: 4px;
  font-weight: 600;
  color: #909399;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
}

.source-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #303133;
}

.source-meta {
  flex-shrink: 0;
  color: #909399;
}

.time {
  font-size: 12px;
  color: #909399;
}

.action-btn {
  font-size: 12px;
  padding: 0 4px;
  height: 20px;
  color: #909399;
}

.action-btn:hover {
  color: #3b55e8;
}

.action-btn.retry {
  color: #f56c6c;
}

.action-btn.retry:hover {
  color: #f89898;
}

/* ========== Markdown 排版（深度选择器作用于 v-html 子元素） ========== */
:deep(.markdown-body) {
  font-size: 14px;
  line-height: 1.6;
  color: inherit;
}

:deep(.markdown-body > *:first-child) {
  margin-top: 0;
}

:deep(.markdown-body > *:last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3),
:deep(.markdown-body h4) {
  margin: 16px 0 8px;
  font-weight: 600;
  line-height: 1.4;
}

:deep(.markdown-body h1) {
  font-size: 20px;
}
:deep(.markdown-body h2) {
  font-size: 18px;
}
:deep(.markdown-body h3) {
  font-size: 16px;
}
:deep(.markdown-body h4) {
  font-size: 15px;
}

:deep(.markdown-body p) {
  margin: 8px 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 8px 0;
  padding-left: 24px;
}

:deep(.markdown-body li) {
  margin: 4px 0;
}

:deep(.markdown-body li > p) {
  margin: 4px 0;
}

:deep(.markdown-body blockquote) {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid #dcdfe6;
  color: #606266;
  background: #f5f7fa;
}

:deep(.markdown-body a) {
  color: #3b55e8;
  text-decoration: none;
}

:deep(.markdown-body a:hover) {
  text-decoration: underline;
}

:deep(.markdown-body table) {
  border-collapse: collapse;
  margin: 8px 0;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid #e4e7ed;
  padding: 6px 10px;
}

:deep(.markdown-body code) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.92em;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(27, 31, 35, 0.06);
}

:deep(.markdown-body pre) {
  margin: 10px 0;
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  line-height: 1.5;
  background: #f6f8fa;
}

:deep(.markdown-body pre code) {
  padding: 0;
  background: transparent;
  font-size: 13px;
  white-space: pre;
}

:deep(.markdown-body hr) {
  margin: 16px 0;
  border: none;
  border-top: 1px solid #e4e7ed;
}

:deep(.markdown-body img) {
  max-width: 100%;
  border-radius: 4px;
}
</style>
