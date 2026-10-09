import request from './request'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export async function sendChat(messages: ChatMessage[]): Promise<{ content: string }> {
  const res: any = await request.post('/chat/completions', {
    model: 'deepseek-chat',
    messages,
    stream: false
  })
  return { content: res.choices[0].message.content }
}