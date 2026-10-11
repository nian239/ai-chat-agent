/**
 * 文本切分：字符级滑窗（适合中文场景）
 * - 每段 chunkSize 字，相邻段重叠 overlap 字
 * - 首尾片段做 trim；末尾不足一段独立成段
 */

export interface TextChunk {
  /** 片段编号，从 0 开始 */
  index: number
  content: string
}

export const DEFAULT_CHUNK_SIZE = 500
export const DEFAULT_CHUNK_OVERLAP = 50

export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP,
): TextChunk[] {
  if (chunkSize <= 0) throw new Error('chunkSize 必须为正数')
  if (overlap < 0 || overlap >= chunkSize) throw new Error('overlap 必须满足 0 <= overlap < chunkSize')

  const content = text.trim()
  if (!content) return []

  if (content.length <= chunkSize) {
    return [{ index: 0, content }]
  }

  const step = chunkSize - overlap
  const chunks: TextChunk[] = []
  for (let start = 0; start < content.length; start += step) {
    const piece = content.slice(start, start + chunkSize).trim()
    if (piece) {
      chunks.push({ index: chunks.length, content: piece })
    }
    // 本窗口已覆盖文本末尾，无需继续滑动
    if (start + chunkSize >= content.length) break
  }
  return chunks
}
