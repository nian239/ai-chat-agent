// 环境变量加载：必须最先被 import（见 index.ts 首行）
// 原因：api/chat.ts 在模块顶层就读 UPSTASH_REDIS_REST_URL/TOKEN，
// 若晚于它加载，线上正常、本地却会静默降级为内存限流且毫无报错。
import dotenv from 'dotenv'
import { existsSync } from 'node:fs'

// .env.local 覆盖 .env，与 Vite 的优先级约定一致（*.local 已被 gitignore）
dotenv.config({ path: '.env' })
if (existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true })
}
