import request from './request'

// 示例 API，按需修改
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function sendMessage(data: ChatMessage) {
  return request.post<ChatMessage[]>('/chat', data)
}
