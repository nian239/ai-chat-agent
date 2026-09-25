<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ChatMessage } from '@/types/chat'
import MessageItem from './MessageItem.vue'

const props = defineProps<{
  messages: ChatMessage[]
  sessionTitle: string
}>()

const scrollRef = ref<HTMLElement>()

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
}

watch(
  () => props.messages.length,
  () => scrollToBottom(),
  { immediate: true },
)
</script>

<template>
  <div class="chat-window">
    <div class="window-header">
      <span class="window-title">{{ sessionTitle || '新会话' }}</span>
    </div>

    <div ref="scrollRef" class="message-scroll">
      <div v-if="messages.length === 0" class="empty-chat">
        <h3>开始新的对话</h3>
        <p>在下方输入消息，AI 将为你解答</p>
      </div>
      <MessageItem v-for="message in messages" :key="message.id" :message="message" />
    </div>

    <slot />
  </div>
</template>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.window-header {
  display: flex;
  align-items: center;
  height: 56px;
  flex-shrink: 0;
  padding: 0 20px;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
}

.window-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-chat {
  padding: 80px 0;
  text-align: center;
}

.empty-chat h3 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.empty-chat p {
  margin: 0;
  font-size: 14px;
  color: #909399;
}
</style>
