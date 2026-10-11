<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watchEffect } from 'vue'
import { ElMessage } from 'element-plus'
import { Setting, Collection } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useChatStore } from '@/stores/chat'
import { useKnowledgeStore } from '@/stores/knowledge'
import { streamChat, type ChatMessage, type ToolCall, type ToolDefinition } from '@/api/chat'
import { queryKnowledge, type RetrievedChunk } from '@/api/documents'
import { listTools, executeTool as executeToolApi } from '@/api/tools'
import type { MessageSource, ToolUse } from '@/types/chat'
import SessionList from '@/components/chat/SessionList.vue'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import KnowledgeDrawer from '@/components/knowledge/KnowledgeDrawer.vue'

const settings = useSettingsStore()
const chatStore = useChatStore()
const { sessions, activeSessionId } = storeToRefs(chatStore)

// 知识库（RAG）：DEV 走本地 Express 内存向量库
const knowledge = useKnowledgeStore()
const knowledgeVisible = ref(false)

// Function Calling：工具定义（服务端 server/services/tools.ts 单一来源，启动时拉取）
const tools = ref<ToolDefinition[]>([])

/** 工具调用轮次上限：防模型连续调用形成死循环 */
const MAX_TOOL_ROUNDS = 3

async function loadTools() {
  try {
    tools.value = await listTools()
  } catch (err) {
    // PROD 线上无 /api/tools 端点（Vercel 无状态），降级为不带 tools 的普通聊天
    console.warn('[ChatView] 工具定义拉取失败，本次不带 tools:', err)
  }
}

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

/**
 * DEV：服务端存储（SQLite）加载完成标志
 * - init() 完成前禁用输入，避免 ensureSession 在空状态下重复建会话
 * - PROD 恒为 true（localStorage 同步初始化）
 */
const chatReady = computed(() => chatStore.ready)

onMounted(() => {
  void chatStore.init()
  void knowledge.init()
  void loadTools()
})

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

/** 把检索到的片段拼成带引用编号的 System Prompt */
function buildRagPrompt(chunks: RetrievedChunk[]): string {
  const refs = chunks
    .map((c, i) => `[${i + 1}] 《${c.docName}》片段 ${c.chunkIndex + 1}:\n${c.content}`)
    .join('\n\n')
  return [
    '你是一个配备知识库的助手。请优先依据下面的参考资料回答用户问题，使用资料时标注对应编号（如 [1] [2]）。',
    '如果参考资料不足以回答问题，请明确说明知识库中没有相关信息，再用自己的知识补充回答。',
    '',
    '【参考资料】',
    refs,
  ].join('\n')
}

/** 安全解析模型生成的参数 JSON（失败时返回原始字符串） */
function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** 执行工具（永不抛错）：失败时以 { error } JSON 回填，让模型自行向用户解释 */
async function executeToolSafe(call: ToolCall): Promise<string> {
  try {
    return await executeToolApi(call.function.name, call.function.arguments || '{}')
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) })
  }
}

/** 把工具调用记录同步到消息（UI 立即刷新；消息已终态时附带 status 触发一次落库快照） */
function syncToolUses(sessionId: string, messageId: string, uses: ToolUse[]) {
  const target = chatStore.getMessages(sessionId).find((m) => m.id === messageId)
  if (!target) return
  const patch: Parameters<typeof chatStore.updateMessage>[2] = {
    toolUses: uses.map((u) => ({ ...u })),
  }
  if (target.status && target.status !== 'streaming') {
    patch.status = target.status
  }
  chatStore.updateMessage(sessionId, messageId, patch)
}

/**
 * 启动一次流式回复
 * - 被 handleSend（用户发新消息后）和 regenerate（删最后 AI 消息后）共用
 * - history 自动排除最后一条 streaming 状态的占位消息
 * - finish() 加 status 守卫：stopGeneration 已设 'stopped' 时，abort 触发的 finish('error') 不覆盖
 * - 有知识库文档时先做 RAG 检索（await 期间占位消息已存在，输入保持禁用）
 * - 模型返回 tool_calls 时：执行工具 → 回填上下文 → 下一轮流式（上限 MAX_TOOL_ROUNDS 轮）
 */
async function startStream(sessionId: string) {
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

  // history 排除刚 push 的占位（显式标注 api/chat 的 ChatMessage 类型，便于插入 system 消息）
  const history: ChatMessage[] = chatStore
    .getMessages(sessionId)
    .filter((m) => m.id !== aiMsgId)
    .map((m) => ({ role: m.role, content: m.content }))

  // ---------- RAG：有知识库文档时，检索 top-3 并拼 System Prompt ----------
  let ragSources: MessageSource[] | null = null
  if (knowledge.enabled && knowledge.hasDocuments) {
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) {
      try {
        const chunks = await queryKnowledge(lastUserMsg.content)
        if (chunks.length > 0) {
          history.unshift({ role: 'system', content: buildRagPrompt(chunks) })
          ragSources = chunks.map((c) => ({
            docName: c.docName,
            chunkIndex: c.chunkIndex,
            score: c.score,
          }))
        }
      } catch (err) {
        // 检索失败降级为普通聊天，不打断回答
        console.warn('[ChatView] 知识库检索失败，本次直接回答:', err)
        ElMessage.warning('知识库检索失败，本次直接回答')
      }
    }
  }

  // ---------- Function Calling：工具调用记录（随终态一起落库） ----------
  let toolUses: ToolUse[] | null = null

  /**
   * 收尾：只有流真正结束才会被调用
   * - api 层 settled 标志保证 onDone / onToolCalls / onError 合计只通知一次，且主动 abort 不触发
   * - 本层 finished 再做一道保险，防止重复收尾
   */
  let finished = false
  const finish = (status: 'done' | 'error') => {
    if (finished) return
    finished = true
    const list = chatStore.getMessages(sessionId)
    const target = list.find((m) => m.id === aiMsgId)
    // 守卫：若 stopGeneration 已把 status 改为 'stopped'，则不再覆盖
    // 走 updateMessage（而非直接改字段）：DEV 下终态 patch 是 AI 消息落库的唯一触发点
    if (target && target.status === 'streaming') {
      chatStore.updateMessage(sessionId, aiMsgId, {
        status,
        // RAG 引用来源随终态一起写入（DEV 落库 / PROD 随 localStorage 持久化）
        ...(status === 'done' && ragSources ? { sources: ragSources } : {}),
        // 工具调用记录（含参数与结果）随终态一起写入
        ...(toolUses && toolUses.length > 0
          ? { toolUses: toolUses.map((u) => ({ ...u })) }
          : {}),
      })
    }
    if (currentStreamInfo?.messageId === aiMsgId) {
      currentStreamInfo = null
      currentStreamAbort = null
    }
    if (status === 'done') chatStore.touchSession(sessionId)
    sending.value = false
  }

  currentStreamInfo = { sessionId, messageId: aiMsgId }

  // ---------- Function Calling：工具循环 ----------
  // workingMessages 在轮次间累积：assistant(tool_calls) + tool(result) 回填给模型
  const workingMessages = [...history]
  let rounds = 0

  /** 发起一轮流式请求；forceNoTools 为 true 时不带工具（达到轮次上限后强制模型给出最终回答） */
  const runRound = (forceNoTools = false) => {
    const controller = streamChat(
      workingMessages,
      {
        onDelta: (delta) => {
          const target = chatStore.getMessages(sessionId).find((m) => m.id === aiMsgId)
          if (target) target.content += delta
        },
        // 模型请求调用工具：执行 → 回填 → 下一轮（fire-and-forget，流本身已结束）
        onToolCalls: (toolCalls) => {
          void handleToolCalls(toolCalls)
        },
        onDone: () => finish('done'),
        onError: () => finish('error'),
      },
      !forceNoTools && tools.value.length > 0 ? tools.value : undefined,
    )
    currentStreamAbort = controller.abort
  }

  /** 处理模型的工具调用请求：执行全部工具后回填上下文并发起下一轮 */
  const handleToolCalls = async (toolCalls: ToolCall[]) => {
    // 1) 先写入「调用中」记录（result 为空串），UI 立即展示加载态
    if (!toolUses) toolUses = []
    const uses: ToolUse[] = toolCalls.map((c) => ({
      name: c.function.name,
      args: safeParseJson(c.function.arguments || '{}'),
      result: '',
    }))
    toolUses.push(...uses)
    syncToolUses(sessionId, aiMsgId, toolUses)

    // 2) 逐个执行并回填结果（串行，避免同会话并发写）
    for (let i = 0; i < toolCalls.length; i++) {
      uses[i].result = await executeToolSafe(toolCalls[i])
      syncToolUses(sessionId, aiMsgId, toolUses)
    }

    // 3) 停止守卫：用户在工具执行期间点了停止 → 终止，不再发下一轮
    const target = chatStore.getMessages(sessionId).find((m) => m.id === aiMsgId)
    if (!target || target.status !== 'streaming') return

    // 4) 回填上下文：assistant(tool_calls) + 每个调用的 tool(result)
    workingMessages.push({ role: 'assistant', content: '', tool_calls: toolCalls })
    for (let i = 0; i < toolCalls.length; i++) {
      workingMessages.push({
        role: 'tool',
        tool_call_id: toolCalls[i].id,
        content: uses[i].result,
      })
    }

    // 5) 轮次上限：最后不带 tools 请求一次，强制模型给出最终回答
    rounds += 1
    if (rounds >= MAX_TOOL_ROUNDS) {
      console.warn(`[ChatView] 工具调用达到 ${MAX_TOOL_ROUNDS} 轮上限，最后一轮不带工具`)
      runRound(true)
      return
    }
    runRound()
  }

  runRound()
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
      // 走 store action：DEV 下同步删除 SQLite 里的对应消息
      chatStore.deleteMessage(sessionId, list[i].id)
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
        <el-tag v-if="knowledge.hasDocuments" type="warning" effect="light" round>
          知识库 × {{ knowledge.documents.length }}
        </el-tag>
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
      >
        <template #footer>
          <div class="knowledge-entry" title="知识库（RAG）" @click="knowledgeVisible = true">
            <el-icon><Collection /></el-icon>
            <span class="knowledge-label">知识库</span>
            <span v-if="knowledge.documents.length > 0" class="knowledge-badge">
              {{ knowledge.documents.length }}
            </span>
          </div>
        </template>
      </SessionList>
      <ChatWindow :messages="activeMessages" :session-title="activeSessionTitle">
        <ChatInput
          :disabled="sending || !chatReady"
          :streaming="sending"
          @send="handleSend"
          @stop="stopGeneration"
        />
      </ChatWindow>
    </div>

    <!-- 知识库抽屉 -->
    <KnowledgeDrawer v-model="knowledgeVisible" />

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

/* ========== 侧栏知识库入口（SessionList footer 插槽内容） ========== */
.knowledge-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 16px;
  padding: 12px 8px;
  border-top: 1px solid #f0f1f3;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
  transition: color 0.15s ease;
}

.knowledge-entry:hover {
  color: #3b55e8;
}

.knowledge-label {
  flex: 1;
}

.knowledge-badge {
  min-width: 18px;
  padding: 0 5px;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  color: #ffffff;
  background: #3b55e8;
  border-radius: 9px;
}
</style>
