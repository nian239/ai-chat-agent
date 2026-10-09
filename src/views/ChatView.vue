<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, watchEffect } from 'vue'
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

/** 是否正在流式生成（用于禁用输入框/发送按钮） */
const sending = ref(false)

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
  // 关键修复：中止后必须归位 sending，否则发送按钮会永久禁用
  sending.value = false
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

/**
 * 启动一次流式回复
 * - 被 handleSend（用户发新消息后）和 regenerate（删最后 AI 消息后）共用
 * - history 自动排除最后一条 streaming 状态的占位消息
 * - finish() 加 status 守卫：stopGeneration 已设 'stopped' 时，abort 触发的 finish('error') 不覆盖
 */
function startStream(sessionId: string) {
  // 流式占位消息
  const aiMsgId = genId('m')
  const placeholder = {
    id: aiMsgId,
    role: 'assistant' as const,
    content: '',
    timestamp: Date.now(),
    status: 'streaming' as const,
  }
  chatStore.appendMessage(sessionId, placeholder)
  // 先写入 streaming 占位再置 sending，保证「sending 为真」与「存在 streaming 消息」始终一致
  sending.value = true

  // history 排除刚 push 的占位
  const history = chatStore
    .getMessages(sessionId)
    .filter((m) => m.id !== aiMsgId)
    .map((m) => ({ role: m.role, content: m.content }))

  /**
   * 收尾：只有流真正结束才会被调用
   * - api 层 settled 标志保证 onDone / onError 合计只通知一次，且主动 abort 不触发
   * - 本层 finished 再做一道保险，防止重复收尾
   */
  let finished = false
  const finish = (status: 'done' | 'error') => {
    if (finished) return
    finished = true
    const list = chatStore.getMessages(sessionId)
    const target = list.find((m) => m.id === aiMsgId)
    // 守卫：若 stopGeneration 已把 status 改为 'stopped'，则不再覆盖
    if (target && target.status === 'streaming') {
      target.status = status
    }
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

  startStream(sessionId)
}

/**
 * 停止生成：先设 stopped，再 abort；finish() 守卫保证最终状态为 stopped
 * - MessageItem 气泡上的停止按钮会传入明确 messageId
 * - 底部输入框的停止按钮不传参，这里自动定位当前 streaming 的消息
 */
function stopGeneration(messageId?: string) {
  const sessionId = activeSessionId.value
  if (!sessionId) return

  const fromCurrentStream =
    currentStreamInfo?.sessionId === sessionId ? currentStreamInfo.messageId : undefined
  const targetId =
    messageId ??
    fromCurrentStream ??
    chatStore.getMessages(sessionId).find((m) => m.status === 'streaming')?.id
  if (!targetId) return

  // 1) 先把消息状态改为 stopped（同步）
  chatStore.updateMessage(sessionId, targetId, { status: 'stopped' })
  // 2) 再中止流（abort 触发的 onError → finish('error') 会被 status 守卫拦截）
  if (currentStreamAbort && currentStreamInfo?.messageId === targetId) {
    currentStreamAbort()
  }
  currentStreamInfo = null
  currentStreamAbort = null
  // 关键修复：无条件归位 sending，避免发送按钮卡在禁用态
  sending.value = false
}

/** 用户点击"重新生成"或"重试"：删除最后一条 AI 消息后重新请求 */
function regenerate() {
  if (sending.value) return
  const sessionId = activeSessionId.value
  if (!sessionId) return
  const list = chatStore.getMessages(sessionId)
  // 找最后一条 assistant 消息
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'assistant') {
      list.splice(i, 1)
      break
    }
  }
  startStream(sessionId)
}

/** 判断某消息是否在当前激活会话中位于最后（用于控制按钮显隐） */
function canRegenerate(messageId: string): boolean {
  const sessionId = activeSessionId.value
  if (!sessionId) return false
  const list = chatStore.getMessages(sessionId)
  return list.length > 0 && list[list.length - 1].id === messageId
}

/**
 * 安全网：当激活会话中已不存在 streaming 消息时，强制把 sending 归位
 * 覆盖 stopGeneration / finish / abortCurrentStream 之外的任何异常路径
 */
watchEffect(() => {
  const list = chatStore.getMessages(activeSessionId.value)
  const hasStreaming = list.some((m) => m.status === 'streaming')
  if (!hasStreaming && sending.value) {
    sending.value = false
  }
})

// 组件卸载前中止未完成的流，避免回调写入已销毁的组件
onBeforeUnmount(() => {
  abortCurrentStream()
})

// 暴露给 MessageItem 的 actions（通过 provide/inject）
provide('chatActions', {
  stopGeneration,
  regenerate,
  canRegenerate,
})
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
        <ChatInput
          :disabled="sending"
          :streaming="sending"
          @send="handleSend"
          @stop="stopGeneration"
        />
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
