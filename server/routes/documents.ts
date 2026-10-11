import { Router } from 'express'
import { chunkText } from '../services/chunker'
import { EmbeddingApiError, EmbeddingConfigError, embedTexts } from '../services/embedding'
import {
  createDocument,
  deleteDocument,
  listDocuments,
  search,
  type RetrievedChunk,
} from '../services/vectorStore'

export const documentRouter = Router()

/** 单文档字符数上限（2MB 文本） */
const MAX_CONTENT_CHARS = 2 * 1024 * 1024

/** 检索返回的片段数 */
const TOP_K = 3

/** 统一处理 Embedding 相关异常：缺配置 → 500，上游失败 → 502 */
function respondEmbeddingError(err: unknown, res: import('express').Response): boolean {
  if (err instanceof EmbeddingConfigError) {
    res.status(500).json({ message: err.message })
    return true
  }
  if (err instanceof EmbeddingApiError) {
    res.status(502).json({ message: err.message })
    return true
  }
  return false
}

/**
 * POST /api/documents/upload —— 上传 TXT 文档
 * body: { filename: string, content: string }（前端读文件为文本后 JSON 提交）
 * 流程：切分（500 字/段，重叠 50 字）→ 硅基流动 Embedding → 存内存向量库
 */
documentRouter.post('/api/documents/upload', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>

  const filename = typeof body.filename === 'string' ? body.filename.trim().slice(0, 200) : ''
  const content = typeof body.content === 'string' ? body.content : ''

  if (!filename) {
    res.status(400).json({ message: 'filename 不能为空' })
    return
  }
  if (!filename.toLowerCase().endsWith('.txt')) {
    res.status(400).json({ message: '目前仅支持 .txt 文件' })
    return
  }
  if (!content.trim()) {
    res.status(400).json({ message: '文档内容为空' })
    return
  }
  if (content.length > MAX_CONTENT_CHARS) {
    res.status(413).json({ message: '文档过大（超过 2MB），请拆分后上传' })
    return
  }

  const textChunks = chunkText(content)
  if (textChunks.length === 0) {
    res.status(400).json({ message: '文档切分后无有效内容' })
    return
  }

  try {
    const embeddings = await embedTexts(textChunks.map((c) => c.content))
    const doc = createDocument(filename, content.trim().length, textChunks, embeddings)
    console.log(`[documents] 已入库: ${doc.name}（${doc.chunkCount} 段）`)
    res.status(201).json(doc)
  } catch (err) {
    if (!respondEmbeddingError(err, res)) throw err
  }
})

/** GET /api/documents —— 文档列表（按上传时间倒序，不含向量） */
documentRouter.get('/api/documents', (_req, res) => {
  res.json(listDocuments())
})

/** DELETE /api/documents/:id —— 删除文档（级联删除其片段向量） */
documentRouter.delete('/api/documents/:id', (req, res) => {
  if (!deleteDocument(req.params.id)) {
    res.status(404).json({ message: '文档不存在' })
    return
  }
  res.status(204).end()
})

/**
 * POST /api/rag/query —— 知识库检索
 * body: { question: string } → { chunks: RetrievedChunk[] }（top-3）
 * Embedding Key 在服务端，前端无法自行向量化，故检索经由本接口
 */
documentRouter.post('/api/rag/query', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const question = typeof body.question === 'string' ? body.question.trim() : ''

  if (!question) {
    res.status(400).json({ message: 'question 不能为空' })
    return
  }

  // 空库直接返回，省一次 Embedding 调用
  if (listDocuments().length === 0) {
    res.json({ chunks: [] as RetrievedChunk[] })
    return
  }

  try {
    const [queryEmbedding] = await embedTexts([question])
    res.json({ chunks: search(queryEmbedding, TOP_K) })
  } catch (err) {
    if (!respondEmbeddingError(err, res)) throw err
  }
})
