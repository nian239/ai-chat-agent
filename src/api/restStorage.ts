import type { ChatMessage, ChatSession } from '@/types/chat'
import type { ChatStorage } from './storage'

/**
 * REST 存储实现：走 Vite 代理（dev 下 /api → http://localhost:3000）
 * 错误统一抛出，由调用方（chat store 的 sync 包装）决定降级策略
 */

const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { message?: string }
      if (data?.message) message = data.message
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态码信息
    }
    throw new Error(`[restStorage] ${method} ${path} 失败: ${message}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const restStorage: ChatStorage = {
  listSessions() {
    return request<ChatSession[]>('GET', '/sessions')
  },

  createSession(session: ChatSession) {
    // 服务端使用客户端传入的 id；时间戳以服务端为准（差异仅毫秒级）
    return request<ChatSession>('POST', '/sessions', {
      id: session.id,
      title: session.title,
    })
  },

  renameSession(sessionId: string, title: string) {
    return request<void>('PATCH', `/sessions/${encodeURIComponent(sessionId)}`, { title })
  },

  deleteSession(sessionId: string) {
    return request<void>('DELETE', `/sessions/${encodeURIComponent(sessionId)}`)
  },

  listMessages(sessionId: string) {
    return request<ChatMessage[]>('GET', `/sessions/${encodeURIComponent(sessionId)}/messages`)
  },

  appendMessage(sessionId: string, message: ChatMessage) {
    return request<void>('POST', `/sessions/${encodeURIComponent(sessionId)}/messages`, {
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status,
      timestamp: message.timestamp,
      sources: message.sources,
      toolUses: message.toolUses,
    })
  },

  deleteMessage(sessionId: string, messageId: string) {
    return request<void>(
      'DELETE',
      `/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
    )
  },
}
