<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { useSettingsStore } from '@/stores/settings'
import { sendChat } from '@/api/chat'
import type { ChatMessage, ChatSession } from '@/types/chat'
import { mockMessages, mockSessions } from '@/mock/chatData'
import SessionList from '@/components/chat/SessionList.vue'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import ChatInput from '@/components/chat/ChatInput.vue'

const settings = useSettingsStore()

// 设置弹窗
const settingsVisible = ref(false)
const settingsKeyInput = ref('')

function openSettings() {
  settingsKeyInput.value = settings.userApiKey
  settingsVisible.value = true
}

function saveSettings() {
  const key = settingsKeyInput.value.trim()
  if (key && !key.startsWith('sk-')) {
    ElMessage.warning('Key 需以 sk- 开头，请检查后重试')
    return
  }
  settings.setUserKey(key)
  settingsVisible.value = false
  ElMessage.success(key ? '已保存 API Key' : '已清除 API Key，将使用服务端免费额度')
}

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

const sending = ref(false)

async function handleSend(content: string) {
  const sessionId = activeSessionId.value
  if (!sessionId || sending.value) return

  messagesBySession.value[sessionId].push({
    id: genId('m'),
    role: 'user',
    content,
    timestamp: Date.now(),
  })
  touchSession(sessionId)

  sending.value = true
  try {
    // 携带当前会话全部历史消息请求 AI 回复
    const history = messagesBySession.value[sessionId].map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const { content: reply } = await sendChat(history)
    messagesBySession.value[sessionId].push({
      id: genId('m'),
      role: 'assistant',
      content: reply,
      timestamp: Date.now(),
    })
    touchSession(sessionId)
  } catch {
    // 错误提示已由响应拦截器统一处理，这里仅结束 loading
  } finally {
    sending.value = false
  }
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
        <el-tag :type="settings.hasUserKey ? 'success' : 'info'" effect="light" round>
          {{ settings.hasUserKey ? '自有 Key' : '免费额度' }}
        </el-tag>
        <el-button text circle title="设置" @click="openSettings">
          <el-icon><Setting /></el-icon>
        </el-button>
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

    <!-- 设置弹窗 -->
    <el-dialog v-model="settingsVisible" title="设置" width="480px">
      <el-form label-width="90px">
        <el-form-item label="API Key">
          <el-input
            v-model="settingsKeyInput"
            type="password"
            show-password
            placeholder="sk-开头，留空则使用服务端免费额度（每天 5 次）"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存</el-button>
      </template>
    </el-dialog>
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
