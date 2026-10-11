// 顺序敏感：env 必须最先 import
// api/chat.ts 在模块顶层读 UPSTASH env，若晚于它加载会静默降级为内存限流
import './env'
import express from 'express'
import cors from 'cors'
import { closeDb } from './db'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './middleware/logger'
import { sessionRouter } from './routes/sessions'
import { messageRouter } from './routes/messages'
import { chatRouter } from './routes/chat'
import { documentRouter } from './routes/documents'

const app = express()

app.use(cors())
app.use(express.json())
app.use(logger)

app.use(sessionRouter)
app.use(messageRouter)
app.use(chatRouter)
app.use(documentRouter)

app.use(errorHandler)

const PORT = Number(process.env.PORT ?? 3000)
const server = app.listen(PORT, () => {
  console.log(
    `[server] Express 已启动: http://localhost:${PORT}（SQLite 持久化 + /api/chat/completions 流式透传）`,
  )
})

// 优雅退出：先关 HTTP 再关 DB；5s 兜底强制退出避免句柄卡住
function shutdown(): void {
  console.log('[server] 正在关闭…')
  server.close(() => {
    closeDb()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
