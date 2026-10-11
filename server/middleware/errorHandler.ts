import type { NextFunction, Request, Response } from 'express'

/**
 * 统一错误处理（Express 4 参数签名）
 * - 只打错误栈，不打印请求体（可能含 API Key）
 * - headers 已发出（如 SSE 流中断）时不再尝试写响应
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(`[server] ${req.method} ${req.originalUrl} 未捕获错误:`, err)
  if (res.headersSent) return
  const message = err instanceof Error ? err.message : '服务器内部错误'
  res.status(500).json({ message })
}
