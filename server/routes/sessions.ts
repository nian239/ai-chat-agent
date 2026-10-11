import { Router } from 'express'
import {
  createSession,
  deleteMessage,
  deleteSession,
  getSession,
  listMessages,
  listSessions,
  parseSources,
  renameSession,
  upsertMessage,
  type MessageInput,
} from '../db'

export const sessionRouter = Router()

/** GET /api/sessions —— 会话列表（按 updated_at 倒序） */
sessionRouter.get('/api/sessions', (_req, res) => {
  res.json(listSessions())
})

/** POST /api/sessions { id?: string, title?: string } —— 新建会话（id 可由客户端传入） */
sessionRouter.post('/api/sessions', (req, res) => {
  const rawTitle = req.body?.title
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim().slice(0, 100) : '新会话'
  const rawId = req.body?.id
  const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : undefined
  res.status(201).json(createSession(title, id))
})

/** PATCH /api/sessions/:id { title: string } —— 改标题 */
sessionRouter.patch('/api/sessions/:id', (req, res) => {
  const raw = req.body?.title
  if (typeof raw !== 'string' || !raw.trim()) {
    res.status(400).json({ message: 'title 不能为空' })
    return
  }
  const updated = renameSession(req.params.id, raw.trim().slice(0, 100))
  if (!updated) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  res.json(updated)
})

/** DELETE /api/sessions/:id —— 删除会话（消息由外键 CASCADE 级联删除） */
sessionRouter.delete('/api/sessions/:id', (req, res) => {
  if (!deleteSession(req.params.id)) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  res.status(204).end()
})

/** GET /api/sessions/:id/messages —— 会话消息列表（按 created_at 升序） */
sessionRouter.get('/api/sessions/:id/messages', (req, res) => {
  if (!getSession(req.params.id)) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  res.json(listMessages(req.params.id))
})

/** POST /api/sessions/:id/messages —— upsert 写入消息（regenerate 重复 id 时覆盖） */
sessionRouter.post('/api/sessions/:id/messages', (req, res) => {
  // 校验顺序：先会话存在性（404），再 body 合法性（400）
  if (!getSession(req.params.id)) {
    res.status(404).json({ message: '会话不存在' })
    return
  }

  const body = req.body ?? {}
  const ROLES = ['user', 'assistant', 'system'] as const
  const STATUSES = ['streaming', 'done', 'error', 'stopped'] as const
  const rawStatus = body.status

  if (typeof body.role !== 'string' || !ROLES.includes(body.role)) {
    res.status(400).json({ message: "role 只允许 'user' | 'assistant' | 'system'" })
    return
  }
  if (typeof body.content !== 'string') {
    res.status(400).json({ message: 'content 必须为字符串' })
    return
  }
  if (rawStatus !== undefined && rawStatus !== null &&
      (typeof rawStatus !== 'string' || !(STATUSES as readonly string[]).includes(rawStatus))) {
    res.status(400).json({ message: "status 只允许 'streaming' | 'done' | 'error' | 'stopped'" })
    return
  }

  const rawSources = parseSources(body.sources)
  if (rawSources === null) {
    res.status(400).json({ message: 'sources 必须是 { docName, chunkIndex, score } 数组' })
    return
  }

  const input: MessageInput = {
    // id / timestamp 仅在类型合法时透传，否则置 undefined 交由 db 层生成
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined,
    role: body.role,
    content: body.content,
    ...(rawStatus ? { status: rawStatus as MessageInput['status'] } : {}),
    ...(typeof body.timestamp === 'number' ? { timestamp: body.timestamp } : {}),
    ...(rawSources ? { sources: rawSources } : {}),
  }

  const saved = upsertMessage(req.params.id, input)
  if (!saved) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  res.status(201).json(saved)
})

/** DELETE /api/sessions/:id/messages/:messageId —— 删除单条消息（regenerate 删最后一条 AI 消息用） */
sessionRouter.delete('/api/sessions/:id/messages/:messageId', (req, res) => {
  if (!getSession(req.params.id)) {
    res.status(404).json({ message: '会话不存在' })
    return
  }
  if (!deleteMessage(req.params.id, req.params.messageId)) {
    res.status(404).json({ message: '消息不存在' })
    return
  }
  res.status(204).end()
})
