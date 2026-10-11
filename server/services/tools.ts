/**
 * Function Calling 工具注册表与实现
 * - TOOL_DEFINITIONS：OpenAI tools 格式（JSON Schema 描述参数），随聊天请求发给 DeepSeek
 * - executeTool：服务端执行（本文件为唯一实现源，前端经 POST /api/tools/execute 调用）
 *
 * 当前工具：get_current_time（当前时间）、get_weather（Mock 天气）
 */

/** OpenAI / DeepSeek tools 格式的工具定义 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    /** JSON Schema 参数描述 */
    parameters: Record<string, unknown>
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前的日期和时间。当用户询问现在几点、今天几号、当前日期等时间问题时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        '查询指定城市的实时天气（演示数据）。当用户询问天气、气温、要不要带伞、穿什么衣服等问题时调用。',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称，如「北京」、「上海」、「Shanghai」',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: '温度单位：celsius（摄氏度，默认）/ fahrenheit（华氏度）',
          },
        },
        required: ['city'],
      },
    },
  },
]

/** 执行结果：result 为 JSON 字符串，可直接作为 role: 'tool' 消息的 content 回填给模型 */
export interface ToolExecution {
  ok: boolean
  result: string
}

// ---------- get_current_time ----------

function executeGetCurrentTime(): ToolExecution {
  const now = new Date()
  const formatted = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' })
  return {
    ok: true,
    result: JSON.stringify({
      datetime: now.toISOString(),
      timestamp: now.getTime(),
      formatted: `${formatted}（${weekday}）`,
      timezone: 'Asia/Shanghai（服务器本地时区）',
    }),
  }
}

// ---------- get_weather（Mock：城市 hash + 日期 确定性伪随机） ----------

const WEATHER_CONDITIONS = ['晴', '多云', '阴', '小雨', '中雨', '雷阵雨', '小雪', '雾'] as const
const WIND_LEVELS = ['无风', '微风', '3-4 级', '5-6 级'] as const

/** djb2 字符串哈希：同一城市名结果稳定 */
function hashString(text: string): number {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function executeGetWeather(args: Record<string, unknown>): ToolExecution {
  const city = typeof args.city === 'string' ? args.city.trim() : ''
  if (!city) {
    return {
      ok: false,
      result: JSON.stringify({ error: '参数 city 不能为空' }),
    }
  }
  const unit = args.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius'

  // 种子 = 城市名 hash 组合当天日期：同一天同城市稳定，跨天/跨城市有差异
  const today = new Date().toISOString().slice(0, 10)
  const seed = hashString(`${city}|${today}`)

  const condition = WEATHER_CONDITIONS[seed % WEATHER_CONDITIONS.length]
  const wind = WIND_LEVELS[(seed >>> 3) % WIND_LEVELS.length]
  const humidity = 30 + ((seed >>> 5) % 61) // 30% ~ 90%

  let temperature = -10 + ((seed >>> 7) % 46) // -10 ~ 35 ℃
  let unitLabel = '℃'
  if (unit === 'fahrenheit') {
    temperature = Math.round(temperature * 1.8 + 32)
    unitLabel = '℉'
  }

  return {
    ok: true,
    result: JSON.stringify({
      city,
      condition,
      temperature: `${temperature}${unitLabel}`,
      humidity: `${humidity}%`,
      wind,
      updated_at: new Date().toISOString(),
      note: '演示数据（Mock），非真实天气',
    }),
  }
}

// ---------- 统一入口 ----------

/**
 * 按名称执行工具
 * - 未知工具 / 参数不合法 → ok: false，result 为 { error } JSON（回填给模型自行解释）
 */
export function executeTool(name: string, args: Record<string, unknown>): ToolExecution {
  switch (name) {
    case 'get_current_time':
      return executeGetCurrentTime()
    case 'get_weather':
      return executeGetWeather(args)
    default:
      return {
        ok: false,
        result: JSON.stringify({ error: `未知工具: ${name}` }),
      }
  }
}
