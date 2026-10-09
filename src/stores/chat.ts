import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ChatMessage, ChatSession } from '@/types/chat'

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
  const initial = loadFromStorage()
  sessionSeq = initial.sessionSeq

  const sessions = ref<ChatSession[]>(initial.sessions)
  const messagesMap = ref<Record<string, ChatMessage[]>>(initial.messagesMap)
  const activeSessionId = ref<string>(initial.activeSessionId)

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

  watch([sessions, messagesMap, activeSessionId], persist, { deep: true })

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

  /** 新建会话并激活，返回 id */
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
    return activeSessionId.value
  }

  /** 若无激活会话则新建并返回 id；已有则返回当前 id */
  function ensureSession(): string {
    if (activeSessionId.value && sessions.value.some((s) => s.id === activeSessionId.value)) {
      return activeSessionId.value
    }
    return createSession()
  }

  /** 追加消息到指定会话，并 touchSession */
  function appendMessage(sessionId: string, message: ChatMessage) {
    if (!messagesMap.value[sessionId]) {
      messagesMap.value[sessionId] = []
    }
    messagesMap.value[sessionId].push(message)
    touchSession(sessionId)
  }

  /** 增量更新某条消息（如流式 content 拼接 / status 变更） */
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
  }

  return {
    sessions,
    messagesMap,
    activeSessionId,
    getMessages,
    touchSession,
    createSession,
    selectSession,
    deleteSession,
    ensureSession,
    appendMessage,
    updateMessage,
    renameFromFirstUserMessage,
  }
})
