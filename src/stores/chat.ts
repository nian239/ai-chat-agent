import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ChatMessage, ChatSession } from '@/types/chat'
import { getStorage, serverStorageEnabled } from '@/api/storage'

const STORAGE_KEY = 'ai_chat_state_v1'

/** 新会话标题：取首条用户消息前 20 字（trim 后），超长加 … */
function deriveTitleFromUserContent(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) return '新会话'
  if (trimmed.length <= 20) return trimmed
  return trimmed.slice(0, 20) + '…'
}

let sessionSeq = 0
function nextSessionId(): string {
  return `s_${Date.now()}_${++sessionSeq}`
}

interface PersistedState {
  sessions: ChatSession[]
  messagesMap: Record<string, ChatMessage[]>
  activeSessionId: string
  sessionSeq: number
}

/** 从 localStorage 读取并归一化（解析失败回退空；streaming → done） */
function loadFromStorage(): {
  sessions: ChatSession[]
  messagesMap: Record<string, ChatMessage[]>
  activeSessionId: string
  sessionSeq: number
} {
  if (typeof localStorage === 'undefined') {
    return { sessions: [], messagesMap: {}, activeSessionId: '', sessionSeq: 0 }
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { sessions: [], messagesMap: {}, activeSessionId: '', sessionSeq: 0 }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
    const messagesMap: Record<string, ChatMessage[]> = {}
    if (parsed.messagesMap && typeof parsed.messagesMap === 'object') {
      for (const [sid, list] of Object.entries(parsed.messagesMap)) {
        if (Array.isArray(list)) {
          messagesMap[sid] = list.map((m) =>
            m.status === 'streaming' ? { ...m, status: 'done' as const } : m,
          )
        }
      }
    }
    // 清理孤儿 messagesMap
    const validIds = new Set(sessions.map((s) => s.id))
    for (const sid of Object.keys(messagesMap)) {
      if (!validIds.has(sid)) delete messagesMap[sid]
    }
    let activeSessionId =
      typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : ''
    if (activeSessionId && !validIds.has(activeSessionId)) {
      activeSessionId = sessions[0]?.id ?? ''
    }
    return {
      sessions,
      messagesMap,
      activeSessionId,
      sessionSeq: typeof parsed.sessionSeq === 'number' ? parsed.sessionSeq : 0,
    }
  } catch (err) {
    console.warn('[chat store] localStorage 解析失败，回退空状态:', err)
    return { sessions: [], messagesMap: {}, activeSessionId: '', sessionSeq: 0 }
  }
}

export const useChatStore = defineStore('chat', () => {
  /**
   * 存储模式：
   * - DEV：Express + SQLite（serverStorageEnabled = true），init() 异步加载，
   *   写操作同步改内存态后 fire-and-forget 同步到服务端
   * - PROD：内置 localStorage 持久化，旧逻辑逐字保留（loadFromStorage + watch persist）
   */
  const useServer = serverStorageEnabled

  const initial = useServer
    ? { sessions: [] as ChatSession[], messagesMap: {} as Record<string, ChatMessage[]>, activeSessionId: '', sessionSeq: 0 }
    : loadFromStorage()
  sessionSeq = initial.sessionSeq

  const sessions = ref<ChatSession[]>(initial.sessions)
  const messagesMap = ref<Record<string, ChatMessage[]>>(initial.messagesMap)
  const activeSessionId = ref<string>(initial.activeSessionId)

  /**
   * DEV：服务端数据加载完成标志
   * - ChatView 在 init() 完成前禁用输入，避免 ensureSession 在空状态重复建会话
   * - PROD 恒为 true（同步初始化，无需等待）
   */
  const ready = ref(!useServer)

  // ---------- PROD：localStorage 持久化（旧逻辑，逐字保留） ----------

  function persist() {
    if (typeof localStorage === 'undefined') return
    const payload: PersistedState = {
      sessions: sessions.value,
      messagesMap: messagesMap.value,
      activeSessionId: activeSessionId.value,
      sessionSeq,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      console.warn('[chat store] localStorage 写入失败:', err)
    }
  }

  if (!useServer) {
    watch([sessions, messagesMap, activeSessionId], persist, { deep: true })
  }

  // ---------- DEV：服务端读写 ----------

  /** fire-and-forget：写服务端失败只告警，不打断 UI */
  function sync(fn: () => Promise<unknown>, label: string): void {
    fn().catch((err) => {
      console.warn(`[chat store] ${label} 同步到服务端失败:`, err)
    })
  }

  /** DEV：异步初始化——从 SQLite 拉取全部会话与消息（ChatView onMounted 调用） */
  async function init(): Promise<void> {
    if (!useServer || ready.value) return
    const storage = getStorage()
    try {
      const remoteSessions = await storage.listSessions()
      const messageLists = await Promise.all(
        remoteSessions.map((s) =>
          storage.listMessages(s.id).catch(() => [] as ChatMessage[]),
        ),
      )
      sessions.value = remoteSessions
      const map: Record<string, ChatMessage[]> = {}
      remoteSessions.forEach((s, i) => {
        map[s.id] = messageLists[i] ?? []
      })
      messagesMap.value = map
      // 服务端按 updated_at 倒序，默认激活最近活跃的会话
      activeSessionId.value = remoteSessions[0]?.id ?? ''
      ready.value = true
    } catch (err) {
      // Express 未启动等情况：置 ready 放开 UI（后续写操作会继续尝试并告警）
      console.warn('[chat store] 服务端存储初始化失败（Express 是否已启动？）:', err)
      ready.value = true
    }
  }

  // ---------- 通用内存态操作（两种模式共用） ----------

  /** 读取某会话消息（返回响应式引用，不存在返回空数组） */
  function getMessages(sessionId: string): ChatMessage[] {
    if (!messagesMap.value[sessionId]) {
      messagesMap.value[sessionId] = []
    }
    return messagesMap.value[sessionId]
  }

  function touchSession(id: string) {
    const session = sessions.value.find((s) => s.id === id)
    if (!session) return
    session.updatedAt = Date.now()
  }

  /** 新建会话并激活，返回 id（id 客户端生成，DEV 下随 POST 传给服务端） */
  function createSession(): string {
    const now = Date.now()
    const id = nextSessionId()
    const session: ChatSession = {
      id,
      title: '新会话',
      createdAt: now,
      updatedAt: now,
    }
    sessions.value.push(session)
    messagesMap.value[id] = []
    activeSessionId.value = id
    if (useServer) {
      sync(() => getStorage().createSession(session), 'createSession')
    }
    return id
  }

  /** 切换激活会话（不做 abort 动作，abort 由视图层负责） */
  function selectSession(id: string) {
    if (!sessions.value.some((s) => s.id === id)) return
    activeSessionId.value = id
  }

  /**
   * 删除会话
   * - 若删除的是当前激活会话，自动切到剩余列表的第一条；空则 activeSessionId=''
   * - 不负责 abort 流（由视图层处理）
   */
  function deleteSession(id: string): string {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx === -1) return activeSessionId.value
    sessions.value.splice(idx, 1)
    delete messagesMap.value[id]
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value[0]?.id ?? ''
    }
    if (useServer) {
      sync(() => getStorage().deleteSession(id), 'deleteSession')
    }
    return activeSessionId.value
  }

  /** 若无激活会话则新建并返回 id；已有则返回当前 id */
  function ensureSession(): string {
    if (activeSessionId.value && sessions.value.some((s) => s.id === activeSessionId.value)) {
      return activeSessionId.value
    }
    return createSession()
  }

  /**
   * 追加消息到指定会话，并 touchSession
   * DEV 落库时机：终态消息（用户消息 / 无 streaming 状态）立即 POST；
   * streaming 占位不落库——流结束后由 updateMessage 一次性 upsert
   */
  function appendMessage(sessionId: string, message: ChatMessage) {
    if (!messagesMap.value[sessionId]) {
      messagesMap.value[sessionId] = []
    }
    messagesMap.value[sessionId].push(message)
    touchSession(sessionId)
    if (useServer && message.status !== 'streaming') {
      sync(() => getStorage().appendMessage(sessionId, message), 'appendMessage')
    }
  }

  /**
   * 增量更新某条消息（如流式 status 变更）
   * DEV：patch 带终态 status（done/error/stopped）时，把完整消息一次性 upsert 到服务端
   * （onDelta 的 content 拼接不走这里，流式期间零请求）
   */
  function updateMessage(
    sessionId: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ): boolean {
    const list = messagesMap.value[sessionId]
    if (!list) return false
    const target = list.find((m) => m.id === messageId)
    if (!target) return false
    Object.assign(target, patch)
    if (useServer && patch.status && patch.status !== 'streaming') {
      // 快照后发送，避免后续内存变更影响请求体
      sync(() => getStorage().appendMessage(sessionId, { ...target }), 'upsertMessage')
    }
    return true
  }

  /** 删除单条消息（regenerate 删最后一条 AI 消息用） */
  function deleteMessage(sessionId: string, messageId: string): boolean {
    const list = messagesMap.value[sessionId]
    if (!list) return false
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx === -1) return false
    list.splice(idx, 1)
    if (useServer) {
      sync(() => getStorage().deleteMessage(sessionId, messageId), 'deleteMessage')
    }
    return true
  }

  /**
   * 用首条用户消息内容给会话命名
   * - 仅在「标题为默认 '新会话'」或「当前还没有任何用户消息」时调用
   * - 取前 20 字，超长加 …
   */
  function renameFromFirstUserMessage(sessionId: string, content: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    session.title = deriveTitleFromUserContent(content)
    if (useServer) {
      sync(() => getStorage().renameSession(sessionId, session.title), 'renameSession')
    }
  }

  return {
    sessions,
    messagesMap,
    activeSessionId,
    ready,
    init,
    getMessages,
    touchSession,
    createSession,
    selectSession,
    deleteSession,
    ensureSession,
    appendMessage,
    updateMessage,
    deleteMessage,
    renameFromFirstUserMessage,
  }
})
