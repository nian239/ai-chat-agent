import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source'
import { ElMessage } from 'element-plus'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface StreamChatHandlers {
  /** 每个文本分片回调（可能是空字符串，已过滤） */
  onDelta: (delta: string) => void
  /** 服务端发完 [DONE] 或正常结束 */
  onDone: () => void
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
 * - 本地开发：Vite 代理到 https://api.deepseek.com，Authorization 由 .env.local 的 VITE_DEEPSEEK_KEY 注入
 * - 部署后：Vercel Serverless api/chat/completions.ts 同样支持 stream，Authorization 由其处理
 */
export function streamChat(
  messages: ChatMessage[],
  handlers: StreamChatHandlers,
): StreamChatController {
  // 发送新消息前先中止上一段未完成的流
  currentController?.abort()
  const controller = new AbortController()
  currentController = controller

  const apiKey = import.meta.env.VITE_DEEPSEEK_KEY ?? ''
  const url = '/api/chat/completions'

  /**
   * 终止态标志位：保证 onDone / onError 合计只通知调用方一次
   * - finishDone：收到 [DONE]，或服务端没发 [DONE] 直接关流（onclose 兜底）
   * - finishError：网络 / HTTP / 解析异常
   */
  let settled = false
  const finishDone = () => {
    if (settled) return
    settled = true
    handlers.onDone()
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
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      stream: true,
    }),
    // 非 2xx 抛错，避免 401 等错误响应被当成正常流处理
    onopen: async (response) => {
      if (!response.ok) {
        const status = response.status
        let message = `请求失败（${status}）`
        if (status === 401) {
          message = 'API Key 无效，请检查 .env.local 里的 VITE_DEEPSEEK_KEY'
        } else if (status === 429) {
          message = '请求过于频繁，请稍后再试'
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
