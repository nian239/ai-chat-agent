import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 数据库文件：server/data/ai-chat.db（目录已 .gitignore） */
export const DB_PATH = join(__dirname, 'data', 'ai-chat.db')
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

// WAL：本地单进程读写并发足够；外键：messages.session_id 级联删除
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '新会话',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT NOT NULL DEFAULT '',
    status     TEXT CHECK (status IN ('streaming', 'done', 'error', 'stopped')),
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
`)

// ---------- DTO（与前端 src/types/chat.ts 结构对齐） ----------

export interface SessionDTO {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface MessageInput {
  /** 缺省时服务端生成 */
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: 'streaming' | 'done' | 'error' | 'stopped'
  /** 缺省时取当前时间 */
  timestamp?: number
}

export interface MessageDTO {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** 与前端约定：无值视为 done */
  status?: 'streaming' | 'done' | 'error' | 'stopped'
}

// ---------- 内部行类型 ----------

interface SessionRow {
  id: string
  title: string
  created_at: number
  updated_at: number
}

interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  status: string | null
  created_at: number
}

// ---------- 预编译语句（better-sqlite3 同步 API，全部语句复用） ----------

const listSessionsStmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
const getSessionStmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
const insertSessionStmt = db.prepare(
  'INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
)
const renameSessionStmt = db.prepare('UPDATE sessions SET title = ? WHERE id = ?')
const touchSessionStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE id = ?')

const listMessagesStmt = db.prepare(
  'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC',
)
const getMessageStmt = db.prepare('SELECT * FROM messages WHERE session_id = ? AND id = ?')
const upsertMessageStmt = db.prepare(`
  INSERT INTO messages (id, session_id, role, content, status, created_at)
  VALUES (@id, @session_id, @role, @content, @status, @created_at)
  ON CONFLICT (id) DO UPDATE SET
    session_id = excluded.session_id,
    role       = excluded.role,
    content    = excluded.content,
    status     = excluded.status
`)
const deleteMessageStmt = db.prepare('DELETE FROM messages WHERE session_id = ? AND id = ?')

// ---------- ID 生成（沿用前端现有格式） ----------

let sessionSeq = 0
let messageSeq = 0
function nextSessionId(): string {
  return `s_${Date.now()}_${++sessionSeq}`
}
function nextMessageId(): string {
  return `m_${Date.now()}_${++messageSeq}`
}

// ---------- 映射 ----------

function toSessionDTO(row: SessionRow): SessionDTO {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }
}

function toMessageDTO(row: MessageRow): MessageDTO {
  return {
    id: row.id,
    role: row.role as MessageDTO['role'],
    content: row.content,
    timestamp: row.created_at,
    ...(row.status ? { status: row.status as MessageDTO['status'] } : {}),
  }
}

// ---------- CRUD（供路由调用） ----------

export function listSessions(): SessionDTO[] {
  return (listSessionsStmt.all() as SessionRow[]).map(toSessionDTO)
}

export function getSession(id: string): SessionDTO | undefined {
  const row = getSessionStmt.get(id) as SessionRow | undefined
  return row ? toSessionDTO(row) : undefined
}

/**
 * 新建会话
 * @param id 可选：客户端生成的 id（store 同步 API 需要立即可用）；缺省时服务端生成
 */
export function createSession(title = '新会话', id?: string): SessionDTO {
  const now = Date.now()
  const sessionId = id ?? nextSessionId()
  insertSessionStmt.run(sessionId, title, now, now)
  return { id: sessionId, title, createdAt: now, updatedAt: now }
}

/** 改标题（不动 updated_at，避免纯重命名打乱会话排序） */
export function renameSession(id: string, title: string): SessionDTO | undefined {
  const info = renameSessionStmt.run(title, id)
  if (info.changes === 0) return undefined
  return getSession(id)
}

/** 删除会话（messages 由外键 ON DELETE CASCADE 级联清理） */
export function deleteSession(id: string): boolean {
  return deleteSessionStmt.run(id).changes > 0
}

export function touchSession(id: string): void {
  touchSessionStmt.run(Date.now(), id)
}

export function listMessages(sessionId: string): MessageDTO[] {
  return (listMessagesStmt.all(sessionId) as MessageRow[]).map(toMessageDTO)
}

export function getMessage(sessionId: string, messageId: string): MessageDTO | undefined {
  const row = getMessageStmt.get(sessionId, messageId) as MessageRow | undefined
  return row ? toMessageDTO(row) : undefined
}

/**
 * 新增或覆盖消息（upsert 语义）
 * - 前端流式期间不落库，只在终态（done/error/stopped）一次性写入完整内容
 * - 事务内顺带 touch 会话 updated_at，替代独立的 touch 接口
 * - 会话不存在返回 undefined（路由层转 404）
 */
export function upsertMessage(sessionId: string, msg: MessageInput): MessageDTO | undefined {
  if (!getSession(sessionId)) return undefined
  const now = Date.now()
  const id = msg.id ?? nextMessageId()
  const createdAt = msg.timestamp ?? now

  const writeMessage = db.transaction(() => {
    upsertMessageStmt.run({
      id,
      session_id: sessionId,
      role: msg.role,
      content: msg.content,
      status: msg.status ?? null,
      created_at: createdAt,
    })
    touchSessionStmt.run(now, sessionId)
  })
  writeMessage()

  return getMessage(sessionId, id)
}

/** 删除单条消息（regenerate 删最后一条 AI 消息用） */
export function deleteMessage(sessionId: string, messageId: string): boolean {
  return deleteMessageStmt.run(sessionId, messageId).changes > 0
}

export function closeDb(): void {
  db.close()
}
