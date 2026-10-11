/**
 * 知识库 API（走 Vite 代理 → 本地 Express）
 * - 上传为 JSON（前端读 TXT 为文本后提交），不引入 multipart
 * - Embedding Key 在服务端，检索经由 /api/rag/query
 */

const BASE = '/api'

/** 文档元信息（与 server/services/vectorStore.ts 的 KnowledgeDoc 对齐） */
export interface KnowledgeDoc {
  id: string
  name: string
  /** 字符数（trim 后） */
  size: number
  chunkCount: number
  createdAt: number
}

/** 检索命中的片段 */
export interface RetrievedChunk {
  docId: string
  docName: string
  chunkIndex: number
  content: string
  /** 余弦相似度，范围 -1 ~ 1 */
  score: number
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { message?: string }
      if (data?.message) message = data.message
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态码信息
    }
    throw new Error(`[documents] ${method} ${path} 失败: ${message}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** 上传 TXT 文档（服务端切分 + 向量化 + 入库） */
export function uploadDocument(filename: string, content: string): Promise<KnowledgeDoc> {
  return request<KnowledgeDoc>('POST', '/documents/upload', { filename, content })
}

/** 文档列表（按上传时间倒序） */
export function listDocuments(): Promise<KnowledgeDoc[]> {
  return request<KnowledgeDoc[]>('GET', '/documents')
}

/** 删除文档（服务端级联删除其片段向量） */
export function deleteDocument(id: string): Promise<void> {
  return request<void>('DELETE', `/documents/${encodeURIComponent(id)}`)
}

/** 知识库检索：问题 → top-3 片段 */
export function queryKnowledge(question: string): Promise<RetrievedChunk[]> {
  return request<{ chunks: RetrievedChunk[] }>('POST', '/rag/query', { question }).then(
    (data) => data.chunks,
  )
}
