import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** assistant 消息携带的工具调用请求（Function Calling 回传给模型用） */
  tool_calls?: ToolCall[]
  /** tool 消息对应的调用 id（与 assistant.tool_calls[].id 配对） */
  tool_call_id?: string
}

/** OpenAI / DeepSeek 格式的工具调用（流式分片已在 streamChat 内拼接完整） */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    /** JSON 字符串（模型生成，可能为空串） */
    arguments: string
  }
}

/** OpenAI tools 格式的工具定义（与 server/services/tools.ts 的定义对齐） */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    /** JSON Schema 参数描述 */
    parameters: Record<string, unknown>
  }
}

export interface StreamChatHandlers {
  /** 每个文本分片回调（可能是空字符串，已过滤） */
  onDelta: (delta: string) => void
  /** 服务端发完 [DONE] 或正常结束（未触发工具调用时） */
  onDone: () => void
  /**
   * 流结束时模型请求了工具调用（与 onDone 互斥，二者合计恰好一次）
   * 调用方应执行工具并把 assistant(tool_calls) + tool(result) 回填后再次发起请求
   */
  onToolCalls?: (toolCalls: ToolCall[]) => void
  /** 网络/HTTP/解析异常；流已中断，已收到的内容由调用方自行保留 */
  onError: (error: unknown) => void
}

export interface StreamChatController {
  /** 主动中止当前流；下次调用 streamChat 也会自动 abort 旧流 */
  abort: () => void
}

/** 暴露的 AbortController：发送新消息时由 streamChat 内部 abort 旧实例 */
let currentController: AbortController | null = null

/** 是否为主动中止（用于区分「用户停止 / 切换会话」与真实网络错误） */
function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError'
}

/**
 * 通过 SSE 流式调用 /api/chat/completions
 * - 自有 Key：X-User-Key 头传给服务端，由其转发上游（不限流）
 * - 本地开发：Vite 代理到 https://api.deepseek.com，Authorization 由 .env.local 的 VITE_DEEPSEEK_KEY 注入
 * - 免费额度：两者都不带，服务端用自己的 Key 并按 IP 限流
 */
export function streamChat(
  messages: ChatMessage[],
  handlers: StreamChatHandlers,
  tools?: ToolDefinition[],
): StreamChatController {
  // 发送新消息前先中止上一段未完成的流
  currentController?.abort()
  const controller = new AbortController()
  currentController = controller

  // 用户自带 Key（settings store 的 ref，实时读取：改完设置立即生效）
  // 注意：streamChat 总在用户交互时调用，此时 pinia 已激活，可安全取 store
  const settings = useSettingsStore()
  const userKey = settings.userApiKey.trim()

  const apiKey = import.meta.env.VITE_DEEPSEEK_KEY ?? ''
  const url = '/api/chat/completions'

  /**
   * 流式 tool_calls 累积缓冲：index → { id, name, arguments }
   * DeepSeek 流式返回时 id / name 在首片到达，arguments 按分片追加，须按 index 拼接
   */
  const toolCallBuffer: Array<{ id: string; name: string; arguments: string } | undefined> = []

  /**
   * 终止态标志位：保证 onDone / onToolCalls / onError 合计只通知调用方一次
   * - finishDone：收到 [DONE]，或服务端没发 [DONE] 直接关流（onclose 兜底）
   * - finishError：网络 / HTTP / 解析异常
   */
  let settled = false
  const finishDone = () => {
    if (settled) return
    settled = true
    // 有工具调用请求时分流到 onToolCalls（未注册则按普通结束处理）
    const toolCalls: ToolCall[] = toolCallBuffer
      .filter((tc): tc is { id: string; name: string; arguments: string } => Boolean(tc?.name))
      .map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments || '{}' },
      }))
    if (toolCalls.length > 0 && handlers.onToolCalls) {
      handlers.onToolCalls(toolCalls)
    } else {
      handlers.onDone()
    }
  }
  const finishError = (err: unknown) => {
    if (settled) return
    settled = true
    handlers.onError(err)
  }

  fetchEventSource(url, {
    method: 'POST',
    signal: controller.signal,
    // 页面切到后台/隐藏时不中断流。
    // 默认值 false 会 abort 当前请求，并在页面重新可见后 create() 重发整个请求，
    // 结果是同一段内容被重复推送、流被提前收尾（停止按钮一闪而过）
    openWhenHidden: true,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      // 自有 Key：服务端 getUserKey() 优先读此头，命中则不限流、直接透传上游
      ...(userKey ? { 'X-User-Key': userKey } : {}),
      // 本地直连 DeepSeek 的 Vite 代理场景（线上服务端会忽略/覆盖它）
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
      // Function Calling：工具定义随请求透传给 DeepSeek（服务端代理只覆盖 model，其余原样转发）
      ...(tools && tools.length > 0 ? { tools } : {}),
    }),
    // 非 2xx 抛错，避免 401 等错误响应被当成正常流处理
    onopen: async (response) => {
      if (!response.ok) {
        const status = response.status
        let message = `请求失败（${status}）`
        if (status === 401) {
          message = 'API Key 无效，请检查 .env.local 里的 VITE_DEEPSEEK_KEY'
        } else if (status === 429) {
          // 优先读后端返回的 message（如「演示额度已用完…」）
          const body = await response.json().catch(() => ({}))
          message = body.message ?? '请求过于频繁，请稍后再试'
        }
        ElMessage.error(message)
        throw new Error(message)
      }
    },
    onmessage: (event: EventSourceMessage) => {
      const payload = event.data?.trim() ?? ''
      if (!payload) return
      // 结束信号：先通知调用方结束，连接随后由服务端关闭（onclose 不会再重复通知）
      if (payload === '[DONE]') {
        finishDone()
        return
      }
      // JSON 解析容错：单分片坏掉不影响整流
      let data: any
      try {
        data = JSON.parse(payload)
      } catch (err) {
        console.warn('[streamChat] 忽略无法解析的 SSE 分片:', payload, err)
        return
      }
      const delta: string | undefined =
        data?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        handlers.onDelta(delta)
      }
      // Function Calling：按 index 累积 tool_calls 分片
      const rawToolCalls = data?.choices?.[0]?.delta?.tool_calls
      if (Array.isArray(rawToolCalls)) {
        for (const tc of rawToolCalls) {
          const idx = typeof tc?.index === 'number' ? tc.index : 0
          const slot =
            toolCallBuffer[idx] ?? (toolCallBuffer[idx] = { id: '', name: '', arguments: '' })
          if (typeof tc?.id === 'string' && tc.id) slot.id = tc.id
          if (typeof tc?.function?.name === 'string' && tc.function.name) {
            slot.name = tc.function.name
          }
          if (typeof tc?.function?.arguments === 'string') {
            slot.arguments += tc.function.arguments
          }
        }
      }
    },
    onerror: (err) => {
      // 主动 abort 触发的中止不算错误，不通知调用方
      if (!isAbortError(err)) finishError(err)
      // 必须 throw 才能阻止 fetchEventSource 自动重连（return 会被当作重试间隔）
      throw err
    },
    onclose: () => {
      // 兜底：服务端没发 [DONE] 就直接关流时才算正常结束。
      // 已 [DONE] 或已出错时 finishDone 内部直接返回，不会重复通知
      finishDone()
    },
  }).catch((err) => {
    // 主动 abort 不当作错误提示
    if (isAbortError(err)) return
    finishError(err)
  }).finally(() => {
    if (currentController === controller) {
      currentController = null
    }
  })

  return {
    abort: () => controller.abort(),
  }
}
