import type { TextChunk } from './chunker'

/** 文档元信息（返回给前端，不含向量） */
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

interface StoredChunk {
  docId: string
  docName: string
  chunkIndex: number
  content: string
  /** bge-m3 输出，1024 维 */
  embedding: number[]
}

/**
 * 内存向量库（DEV 专用）：
 * - 服务重启后丢失，后续可升级为 Upstash Vector
 * - 规模预期：数千片段内，暴力遍历余弦检索完全够用
 */
const docs = new Map<string, KnowledgeDoc>()
const chunks: StoredChunk[] = []

let docSeq = 0
function nextDocId(): string {
  return `doc_${Date.now()}_${++docSeq}`
}

/** 新建文档入库（片段需已完成向量化，且与 embeddings 顺序一致） */
export function createDocument(
  name: string,
  size: number,
  textChunks: TextChunk[],
  embeddings: number[][],
): KnowledgeDoc {
  const id = nextDocId()
  const doc: KnowledgeDoc = {
    id,
    name,
    size,
    chunkCount: textChunks.length,
    createdAt: Date.now(),
  }
  docs.set(id, doc)
  textChunks.forEach((c, i) => {
    chunks.push({
      docId: id,
      docName: name,
      chunkIndex: c.index,
      content: c.content,
      embedding: embeddings[i],
    })
  })
  return doc
}

/** 文档列表（按上传时间倒序） */
export function listDocuments(): KnowledgeDoc[] {
  return [...docs.values()].sort((a, b) => b.createdAt - a.createdAt)
}

/** 删除文档（级联删除其全部片段向量） */
export function deleteDocument(id: string): boolean {
  if (!docs.delete(id)) return false
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i].docId === id) chunks.splice(i, 1)
  }
  return true
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** 给定查询向量，全量余弦检索 topK */
export function search(queryEmbedding: number[], topK = 3): RetrievedChunk[] {
  return chunks
    .map((c) => ({
      docId: c.docId,
      docName: c.docName,
      chunkIndex: c.chunkIndex,
      content: c.content,
      score: cosineSimilarity(queryEmbedding, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
