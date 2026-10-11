/**
 * 硅基流动（SiliconFlow）Embedding 客户端
 * - API: POST https://api.siliconflow.cn/v1/embeddings（OpenAI 兼容格式）
 * - 模型: BAAI/bge-m3（免费），输出维度 1024
 * - Key: 服务端 .env.local 中的 SILICONFLOW_API_KEY（由 server/env.ts 加载）
 */

const EMBEDDING_URL = 'https://api.siliconflow.cn/v1/embeddings'
const MODEL = 'BAAI/bge-m3'

/** 分批调用，规避免费 tier 单次 input 条数上限 */
const BATCH_SIZE = 16

/** 单批请求超时（含上行文本与模型计算） */
const TIMEOUT_MS = 30_000

/** 服务端未配置 SILICONFLOW_API_KEY */
export class EmbeddingConfigError extends Error {
  constructor() {
    super('服务端未配置 SILICONFLOW_API_KEY，请在 .env.local 中添加后重启服务')
    this.name = 'EmbeddingConfigError'
  }
}

/** 上游调用失败（网络 / 鉴权 / 限流等） */
export class EmbeddingApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingApiError'
  }
}

interface EmbeddingResponse {
  data?: Array<{ index: number; embedding: number[] }>
}

async function embedBatch(batch: string[], apiKey: string): Promise<number[][]> {
  let res: Response
  try {
    res = await fetch(EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: batch }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new EmbeddingApiError(
      `连接硅基流动 Embedding 服务失败: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { message?: string; error?: { message?: string } }
      detail = body.message ?? body.error?.message ?? detail
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态码
    }
    throw new EmbeddingApiError(`硅基流动 Embedding 调用失败: ${detail}`)
  }

  let data: EmbeddingResponse
  try {
    data = (await res.json()) as EmbeddingResponse
  } catch {
    throw new EmbeddingApiError('硅基流动 Embedding 返回非 JSON 响应体')
  }

  if (!Array.isArray(data.data) || data.data.length !== batch.length) {
    throw new EmbeddingApiError('硅基流动 Embedding 返回的向量数量与输入不一致')
  }

  // 响应按 index 排序，保证与输入顺序一一对应
  return data.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

/**
 * 向量化一批文本（内部按 BATCH_SIZE 串行分批，对免费 tier 限流友好）
 * @returns 与 texts 等长、顺序一致的向量数组
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.SILICONFLOW_API_KEY
  if (!apiKey) throw new EmbeddingConfigError()

  const all: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const vectors = await embedBatch(batch, apiKey)
    all.push(...vectors)
  }
  return all
}
