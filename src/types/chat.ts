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

/** 工具调用记录（Function Calling） */
export interface ToolUse {
  name: string
  /** 调用参数（模型生成 JSON 解析后的值，以对象为主） */
  args: unknown
  /** 工具返回（JSON 字符串）；空串表示调用中（用于 UI 加载态） */
  result: string
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
  /** 工具调用记录（仅 assistant 消息，Function Calling 时携带） */
  toolUses?: ToolUse[]
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
