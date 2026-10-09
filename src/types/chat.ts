export type MessageRole = 'user' | 'assistant'

export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  /**
   * 流式状态：
   * - streaming：追加中
   * - done：完成
   * - error：网络/HTTP 异常中断（已生成内容保留）
   * - stopped：用户主动停止（已生成内容保留）
   * 老消息无值视为 done
   */
  status?: MessageStatus
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
