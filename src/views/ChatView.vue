<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import type { ChatMessage, ChatSession } from '@/types/chat'
import { mockMessages, mockSessions } from '@/mock/chatData'
import SessionList from '@/components/chat/SessionList.vue'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import ChatInput from '@/components/chat/ChatInput.vue'

const router = useRouter()
const auth = useAuthStore()

const sessions = ref<ChatSession[]>([...mockSessions])
const messagesBySession = ref<Record<string, ChatMessage[]>>(
  JSON.parse(JSON.stringify(mockMessages)),
)
const activeSessionId = ref(sessions.value[0]?.id ?? '')

const activeMessages = computed(
  () => messagesBySession.value[activeSessionId.value] ?? [],
)
const activeSessionTitle = computed(
  () => sessions.value.find((s) => s.id === activeSessionId.value)?.title ?? '',
)

let messageSeq = 1000
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${messageSeq++}`
}

function touchSession(id: string) {
  const session = sessions.value.find((s) => s.id === id)
  if (session) session.updatedAt = Date.now()
}

function handleSelect(id: string) {
  activeSessionId.value = id
}

function handleCreate() {
  const session: ChatSession = {
    id: genId('s'),
    title: '新会话',
    updatedAt: Date.now(),
  }
  sessions.value.push(session)
  messagesBySession.value[session.id] = []
  activeSessionId.value = session.id
}

function handleSend(content: string) {
  const sessionId = activeSessionId.value
  if (!sessionId) return

  messagesBySession.value[sessionId].push({
    id: genId('m'),
    role: 'user',
    content,
    timestamp: Date.now(),
  })
  touchSession(sessionId)

  // TODO: 接入真实 API，先用假数据模拟 AI 回复
  setTimeout(() => {
    messagesBySession.value[sessionId].push({
      id: genId('m'),
      role: 'assistant',
      content: `（模拟回复）收到你的消息：「${content}」。真实 AI 接口将在后续接入。`,
      timestamp: Date.now(),
    })
    touchSession(sessionId)
  }, 600)
}

function handleLogout() {
  auth.logout()
  ElMessage.success('已退出登录')
  router.replace('/login')
}
</script>

<template>
  <div class="chat-page">
    <header class="chat-header">
      <div class="header-left">
        <span class="logo-icon">AI</span>
        <span class="app-name">AI Chat Agent</span>
      </div>
      <div class="header-right">
        <el-tag type="success" effect="light" round>已登录</el-tag>
        <el-button text type="danger" @click="handleLogout">退出登录</el-button>
      </div>
    </header>

    <div class="chat-layout">
      <SessionList
        :sessions="sessions"
        :active-id="activeSessionId"
        @select="handleSelect"
        @create="handleCreate"
      />
      <ChatWindow :messages="activeMessages" :session-title="activeSessionTitle">
        <ChatInput @send="handleSend" />
      </ChatWindow>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  flex-shrink: 0;
  padding: 0 24px;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #4f6ef7 0%, #3b55e8 100%);
  border-radius: 10px;
}

.app-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}
</style>
