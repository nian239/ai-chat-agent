export type MessageRole = 'user' | 'assistant'

export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped'

/** RAG 回答的引用来源 */
export interface MessageSource {
  docName: string
  /** 片段编号，从 0 开始（展示时 +1） */
  chunkIndex: number
  /** 余弦相似度，范围 -1 ~ 1 */
  score: number
}

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
  /** RAG 引用来源（仅 assistant 消息，走知识库回答时携带） */
  sources?: MessageSource[]
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
