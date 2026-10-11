import type { ToolDefinition } from './chat'

/**
 * 工具（Function Calling）API：走 Vite 代理 → 本地 Express
 * - 定义由服务端 server/services/tools.ts 单一维护，前端启动时拉取
 * - 执行也发生在服务端（工具实现不放前端）
 */

const BASE = '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { message?: string }
      if (data?.message) message = data.message
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态码信息
    }
    throw new Error(`[tools] ${method} ${path} 失败: ${message}`)
  }
  return (await res.json()) as T
}

/** 拉取工具定义列表（PROD 无此端点，失败由调用方降级为不带 tools 的普通聊天） */
export function listTools(): Promise<ToolDefinition[]> {
  return request<ToolDefinition[]>('GET', '/tools')
}

/**
 * 执行工具：把模型生成的参数交给服务端执行
 * @param name 工具名
 * @param argumentsJson 模型生成的参数 JSON 字符串（原样透传，服务端解析校验）
 * @returns 工具结果（JSON 字符串，可直接作为 role: 'tool' 消息的 content）
 */
export function executeTool(name: string, argumentsJson: string): Promise<string> {
  return request<{ ok: boolean; result: string }>('POST', '/tools/execute', {
    name,
    arguments: argumentsJson,
  }).then((data) => data.result)
}
