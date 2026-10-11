import { Router } from 'express'
import {
  deleteMessage,
  getSession,
  listMessages,
  parseSources,
  upsertMessage,
  type MessageInput,
} from '../db'

export const messageRouter = Router()

const ROLES = new Set(['user', 'assistant', 'system'])
const STATUSES = new Set(['streaming', 'done', 'error', 'stopped'])

function parseMessageBody(
  body: unknown,
): { ok: true; value: MessageInput } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: '请求体必须是 JSON 对象' }
  }
  const b = body as Record<string, unknown>
  if (b.role === undefined || !ROLES.has(String(b.role))) {
    return { ok: false, message: "role 必须是 'user' | 'assistant' | 'system'" }
  }
  if (typeof b.content !== 'string') {
    return { ok: false, message: 'content 必须是字符串' }
  }
  if (b.status !== undefined && !STATUSES.has(String(b.status))) {
    return { ok: false, message: "status 必须是 'streaming' | 'done' | 'error' | 'stopped'" }
  }
  if (b.id !== undefined && typeof b.id !== 'string') {
    return { ok: false, message: 'id 必须是字符串' }
  }
  if (b.timestamp !== undefined && typeof b.timestamp !== 'number') {
    return { ok: false, message: 'timestamp 必须是数字' }
  }
  const sources = parseSources(b.sources)
  if (sources === null) {
    return { ok: false, message: 'sources 必须是 { docName, chunkIndex, score } 数组' }
  }

  return {
    ok: true,
    value: {
      id: typeof b.id === 'string' ? b.id : undefined,
      role: String(b.role) as MessageInput['role'],
      content: b.content,
      status: b.status === undefined ? undefined : (String(b.status) as MessageInput['status']),
      timestamp: typeof b.timestamp === 'number' ? b.timestamp : undefined,
      ...(sources ? { sources } : {}),
    },
  }
}

/** GET /api/sessions/:id/messages —— 消息列表（created_at 升序） */
messageRouter.get('/api/sessions/:id/messages', (req, res) => {
  if (!getSession(req.params.id)) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  res.json(listMessages(req.params.id))
})

/** POST /api/sessions/:id/messages —— 新增/覆盖消息（upsert；事务内 touch 会话） */
messageRouter.post('/api/sessions/:id/messages', (req, res) => {
  const parsed = parseMessageBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message })
    return
  }
  const saved = upsertMessage(req.params.id, parsed.value)
  if (!saved) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  res.status(201).json(saved)
})

/** DELETE /api/sessions/:id/messages/:mid —— 删除单条消息（regenerate 用） */
messageRouter.delete('/api/sessions/:id/messages/:mid', (req, res) => {
  if (!deleteMessage(req.params.id, req.params.mid)) {
    res.status(404).json({ message: '消息不存在' })
    return
  }
  res.status(204).end()
})
