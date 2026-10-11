import { Router } from 'express'
import handler from '../../api/chat'

export const chatRouter = Router()

/**
 * POST /api/chat/completions —— 完全复用 Vercel Serverless 函数
 *
 * api/chat.ts 对 @vercel/node 是纯类型导入（import type），运行时零 Vercel 依赖；
 * handler 用到的 req.headers / req.socket / res.status().json() / setHeader / end / pipe
 * 在 Express 的 req/res 上全部可用。上游调用、X-User-Key 优先、Upstash 限流（含内存降级）、
 * 429 文案、SSE 流式透传（Readable.fromWeb + pipe）一行不重写。
 *
 * 前置条件（由 index.ts 保证）：
 * - express.json() 先解析 body（handler 里 req.body 已是对象）
 * - env.ts 先于本模块加载（handler 模块顶层读 UPSTASH env）
 */
chatRouter.post('/api/chat/completions', (req, res) => {
  void handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1],
  )
})
