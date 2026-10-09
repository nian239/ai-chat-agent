export type MessageRole = 'user' | 'assistant'

export type MessageStatus = 'streaming' | 'done' | 'error'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  /** 流式状态：streaming 追加中 / done 完成 / error 中断；老消息无值视为 done */
  status?: MessageStatus
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
