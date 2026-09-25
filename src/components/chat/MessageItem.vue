<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types/chat'

const props = defineProps<{
  message: ChatMessage
}>()

const isUser = computed(() => props.message.role === 'user')

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
        <pre class="content">{{ message.content }}</pre>
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
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  border-radius: 10px;
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

.time {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
