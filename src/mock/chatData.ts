import type { ChatMessage, ChatSession } from '@/types/chat'

export const mockSessions: ChatSession[] = [
  { id: 's1', title: 'Vue 3 组合式 API 用法', updatedAt: Date.now() - 1000 * 60 * 5 },
  { id: 's2', title: '帮我写一个防抖函数', updatedAt: Date.now() - 1000 * 60 * 60 * 2 },
  { id: 's3', title: ' TypeScript 泛型入门', updatedAt: Date.now() - 1000 * 60 * 60 * 26 },
]

export const mockMessages: Record<string, ChatMessage[]> = {
  s1: [
    {
      id: 'm1',
      role: 'user',
      content: 'Vue 3 的组合式 API 和选项式 API 有什么区别？',
      timestamp: Date.now() - 1000 * 60 * 10,
    },
    {
      id: 'm2',
      role: 'assistant',
      content:
        '组合式 API 通过 setup 函数（或 <script setup>）组织代码，按逻辑功能聚合，便于复用和提取；选项式 API 按 data/methods/computed 选项分块。组合式 API 更适合大型组件和逻辑复用场景（组合式函数），选项式 API 对小项目上手更简单。',
      timestamp: Date.now() - 1000 * 60 * 9,
    },
    {
      id: 'm3',
      role: 'user',
      content: '那 ref 和 reactive 该怎么选？',
      timestamp: Date.now() - 1000 * 60 * 8,
    },
    {
      id: 'm4',
      role: 'assistant',
      content:
        '一般建议：基础类型用 ref，对象/数组二选一保持团队一致。ref 通过 .value 访问但整体替换更方便，reactive 解构会失去响应性，需要小心。日常开发用 ref 更不容易踩坑。',
      timestamp: Date.now() - 1000 * 60 * 7,
    },
  ],
  s2: [
    {
      id: 'm5',
      role: 'user',
      content: '帮我写一个防抖函数，用 TypeScript。',
      timestamp: Date.now() - 1000 * 60 * 60 * 3,
    },
    {
      id: 'm6',
      role: 'assistant',
      content:
        'function debounce<T extends (...args: never[]) => void>(fn: T, delay = 300) {\n  let timer: ReturnType<typeof setTimeout> | undefined\n  return (...args: Parameters<T>) => {\n    clearTimeout(timer)\n    timer = setTimeout(() => fn(...args), delay)\n  }\n}',
      timestamp: Date.now() - 1000 * 60 * 60 * 3 + 5000,
    },
  ],
  s3: [
    {
      id: 'm7',
      role: 'user',
      content: '泛型里的 T extends unknown 是什么意思？',
      timestamp: Date.now() - 1000 * 60 * 60 * 26,
    },
    {
      id: 'm8',
      role: 'assistant',
      content:
        'T extends unknown 表示约束 T 为任意类型（几乎无约束），常用于让编译器推断更宽松的场景；相对地 T extends any 会禁用一些类型检查。多数情况下直接写 <T> 就够了。',
      timestamp: Date.now() - 1000 * 60 * 60 * 26 + 4000,
    },
  ],
}
