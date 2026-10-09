<script setup lang="ts">
import { computed } from 'vue'
import 'highlight.js/styles/github.css'
import type { ChatMessage } from '@/types/chat'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  message: ChatMessage
}>()

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.status === 'streaming')
/** AI 完成态（含 done / error）：用 Markdown 渲染 */
const isAssistantDone = computed(
  () => props.message.role === 'assistant' && !isStreaming.value,
)

/** 仅在完成态解析 Markdown；其它态返回空串，模板里用 v-if 走纯文本分支 */
const renderedHtml = computed(() =>
  isAssistantDone.value ? renderMarkdown(props.message.content) : '',
)

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
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

        <!-- 3) AI 完成/错误：渲染 Markdown（含代码高亮，已 DOMPurify 清洗） -->
        <div v-else class="content markdown-body" v-html="renderedHtml"></div>
      </div>
      <div class="time">{{ formatTime(message.timestamp) }}</div>
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

.time {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
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
