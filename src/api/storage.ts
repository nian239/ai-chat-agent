import type { ChatMessage, ChatSession } from '@/types/chat'
import { restStorage } from './restStorage'

/**
 * 存储抽象：本地开发（DEV）走 Express + SQLite 的 REST 实现
 *
 * 线上（PROD）不走此契约——chat store 内置的 localStorage 持久化
 * （loadFromStorage 归一化 + watch 深度写入）逐字保留，行为与旧版完全一致。
 */
export interface ChatStorage {
  /** 会话列表（服务端按 updated_at 倒序返回） */
  listSessions(): Promise<ChatSession[]>
  /** 新建会话。id 由客户端生成并传入（store 的同步 API 需要立即可用的 id） */
  createSession(session: ChatSession): Promise<ChatSession>
  renameSession(sessionId: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  listMessages(sessionId: string): Promise<ChatMessage[]>
  /** upsert 语义：终态消息一次性写入（流式期间不落库） */
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>
  deleteMessage(sessionId: string, messageId: string): Promise<void>
}

/**
 * 是否启用服务端存储
 * - Vite dev（npm run dev / vite）→ true，走 Express（localhost:3000，Vite 代理）
 * - 生产构建时被静态替换为 false → localStorage
 */
export const serverStorageEnabled = import.meta.env.DEV

/** 获取服务端存储实现（仅在 serverStorageEnabled 为 true 时调用） */
export function getStorage(): ChatStorage {
  return restStorage
}
