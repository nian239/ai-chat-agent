import type { NextFunction, Request, Response } from 'express'

/** 请求日志：单行打印 method path status 耗时，避免刷屏 */
export function logger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    console.log(`[server] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`)
  })
  next()
}
