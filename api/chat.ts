import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Readable } from 'node:stream'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const UPSTREAM_URL = 'https://token.sensenova.cn/v1/chat/completions'
const MODEL = 'sensenova-6.7-flash-lite'
const DAILY_LIMIT = 5
const RATE_LIMIT_PREFIX = 'ai-chat:server-key:daily'

/** 从 x-forwarded-for 提取客户端 IP */
function getClientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim()
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? '127.0.0.1'
}

/** 从 X-User-Key 头提取用户自带 Key（须以 sk- 开头），无效则返回 null */
function getUserKey(req: VercelRequest): string | null {
  const raw = req.headers['x-user-key']
  const key = Array.isArray(raw) ? String(raw[0]) : String(raw ?? '')
  const trimmed = key.trim()
  if (trimmed.startsWith('sk-') && trimmed.length > 3) {
    return trimmed
  }
  return null
}

// ---------- 限流器：优先 Upstash Redis，本地无配置时降级内存 Map ----------

const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)

const redisRatelimit: Ratelimit | null = hasUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(DAILY_LIMIT, '1 d'),
      prefix: RATE_LIMIT_PREFIX,
      analytics: false,
    })
  : null

if (!hasUpstash) {
  console.log(
    '[api/chat] 未配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN，降级为内存 Map 限流（仅适用于本地开发，多实例/重启不生效）',
  )
}

/** 内存限流（固定窗口）：key -> 剩余次数与重置时间 */
const memoryBuckets = new Map<string, { count: number; resetAt: number }>()

interface LimitResult {
  success: boolean
  remaining: number
  /** 重置时间戳（ms） */
  reset: number
}

function memoryLimit(key: string): LimitResult {
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const bucket = memoryBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + DAY_MS })
    return { success: true, remaining: DAILY_LIMIT - 1, reset: now + DAY_MS }
  }

  if (bucket.count >= DAILY_LIMIT) {
    return { success: false, remaining: 0, reset: bucket.resetAt }
  }

  bucket.count += 1
  return { success: true, remaining: DAILY_LIMIT - bucket.count, reset: bucket.resetAt }
}

async function checkRateLimit(key: string): Promise<LimitResult> {
  if (redisRatelimit) {
    const result = await redisRatelimit.limit(key)
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    }
  }
  return memoryLimit(key)
}

// ---------- 主处理函数 ----------

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Key')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' })
    return
  }

  const userKey = getUserKey(req)
  const ip = getClientIp(req)

  let apiKey: string
  if (userKey) {
    // 用户自带 Key：不限流
    apiKey = userKey
  } else {
    // 服务端 Key：每 IP 每天 5 次
    const serverKey = process.env.SENSENOVA_API_KEY
    if (!serverKey) {
      res.status(500).json({
        message: '服务端未配置 SENSENOVA_API_KEY，请在设置中填写自己的 API Key',
      })
      return
    }

    const limit = await checkRateLimit(ip)
    if (!limit.success) {
      res.setHeader('X-RateLimit-Remaining', '0')
      res.setHeader('X-RateLimit-Reset', String(limit.reset))
      res.status(429).json({
        message: `今日免费额度（${DAILY_LIMIT} 次）已用完，请填写自己的 API Key 或明天再试`,
        reset: limit.reset,
      })
      return
    }
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining))

    apiKey = serverKey
  }

  // 透传请求体（覆盖模型，防止客户端指定其他模型滥用服务端 Key）
  const body =
    typeof req.body === 'string' ? req.body : JSON.stringify({ ...req.body, model: MODEL })

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: req.headers.accept ?? 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    })
  } catch (error) {
    console.error('[api/chat] 上游请求失败:', error)
    res.status(502).json({ message: '上游服务请求失败，请稍后重试' })
    return
  }

  // 透传状态码与关键响应头，支持 SSE 流式
  res.status(upstream.status)
  const contentType = upstream.headers.get('content-type')
  if (contentType) res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  if (!upstream.ok && !upstream.body) {
    res.json({ message: `上游返回错误 ${upstream.status}` })
    return
  }

  if (upstream.body) {
    const nodeStream = Readable.fromWeb(
      upstream.body as unknown as import('node:stream/web').ReadableStream,
    )
    nodeStream.pipe(res)
  } else {
    res.end()
  }
}
