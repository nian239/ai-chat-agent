<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { streamChat } from '@/api/chat'
import SessionList from '@/components/chat/SessionList.vue'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import ChatInput from '@/components/chat/ChatInput.vue'

const settings = useSettingsStore()
const chatStore = useChatStore()
const { sessions, activeSessionId } = storeToRefs(chatStore)

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

let messageSeq = 1000
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${messageSeq++}`
}

const activeMessages = computed(() => chatStore.getMessages(activeSessionId.value))
const activeSessionTitle = computed(
  () => sessions.value.find((s) => s.id === activeSessionId.value)?.title ?? '',
)

/** 模块作用域：当前进行中的流（用于切换/删除时中止并标 done） */
let currentStreamAbort: (() => void) | null = null
let currentStreamInfo: { sessionId: string; messageId: string } | null = null

/**
 * 中止当前流并把流式消息标记为 done（非 error）
 * 切换/删除会话、关闭页面前调用
 */
function abortCurrentStream() {
  if (currentStreamAbort) {
    currentStreamAbort()
    currentStreamAbort = null
  }
  if (currentStreamInfo) {
    chatStore.updateMessage(currentStreamInfo.sessionId, currentStreamInfo.messageId, {
      status: 'done',
    })
    currentStreamInfo = null
  }
}

function handleSelect(id: string) {
  if (id === activeSessionId.value) return
  abortCurrentStream()
  chatStore.selectSession(id)
}

function handleCreate() {
  abortCurrentStream()
  chatStore.createSession()
}

function handleDelete(id: string) {
  abortCurrentStream()
  chatStore.deleteSession(id)
}

const sending = ref(false)

async function handleSend(content: string) {
  if (sending.value) return

  const sessionId = chatStore.ensureSession()
  const now = Date.now()

  // 用户消息：首次时用于自动命名
  const userMsgId = genId('m')
  chatStore.appendMessage(sessionId, {
    id: userMsgId,
    role: 'user',
    content,
    timestamp: now,
  })

  // 首条用户消息 → 自动命名
  const session = sessions.value.find((s) => s.id === sessionId)
  if (session && session.title === '新会话') {
    chatStore.renameFromFirstUserMessage(sessionId, content)
  }

  sending.value = true

  // 流式占位消息
  const aiMsgId = genId('m')
  chatStore.appendMessage(sessionId, {
    id: aiMsgId,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    status: 'streaming',
  })

  // 携带当前会话全部历史消息请求 AI 回复（排除刚 push 的占位）
  const history = chatStore
    .getMessages(sessionId)
    .filter((m) => m.id !== aiMsgId)
    .map((m) => ({ role: m.role, content: m.content }))

  let finished = false
  const finish = (status: 'done' | 'error') => {
    if (finished) return
    finished = true
    chatStore.updateMessage(sessionId, aiMsgId, { status })
    if (currentStreamInfo?.messageId === aiMsgId) {
      currentStreamInfo = null
      currentStreamAbort = null
    }
    if (status === 'done') chatStore.touchSession(sessionId)
    sending.value = false
  }

  currentStreamInfo = { sessionId, messageId: aiMsgId }
  const controller = streamChat(history, {
    onDelta: (delta) => {
      const target = chatStore.getMessages(sessionId).find((m) => m.id === aiMsgId)
      if (target) target.content += delta
    },
    onDone: () => finish('done'),
    onError: () => finish('error'),
  })
  currentStreamAbort = controller.abort
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
        @delete="handleDelete"
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
