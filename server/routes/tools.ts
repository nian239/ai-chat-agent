import { Router } from 'express'
import { TOOL_DEFINITIONS, executeTool } from '../services/tools'

export const toolRouter = Router()

/** GET /api/tools —— 工具定义列表（前端启动时拉取，作为聊天的 tools 参数） */
toolRouter.get('/api/tools', (_req, res) => {
  res.json(TOOL_DEFINITIONS)
})

/**
 * POST /api/tools/execute —— 执行工具
 * body: { name: string, arguments: object | string（模型生成的 JSON 字符串） }
 * → { ok: boolean, result: string }（result 为 JSON 字符串，直接回填给模型）
 */
toolRouter.post('/api/tools/execute', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    res.status(400).json({ message: 'name 不能为空' })
    return
  }

  // arguments 兼容两种形态：模型原始 JSON 字符串 / 已解析对象
  let args: unknown = {}
  if (typeof body.arguments === 'string') {
    try {
      args = JSON.parse(body.arguments)
    } catch {
      res.status(400).json({ message: 'arguments 不是合法的 JSON 字符串' })
      return
    }
  } else if (body.arguments !== undefined && body.arguments !== null) {
    args = body.arguments
  }

  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    res.status(400).json({ message: 'arguments 必须是 JSON 对象' })
    return
  }

  const { ok, result } = executeTool(name, args as Record<string, unknown>)
  // 参数不合法 / 未知工具也返回 200：{ error } 结果回填给模型，让其向用户解释
  res.json({ ok, result })
})
