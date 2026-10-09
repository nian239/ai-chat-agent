---
name: 中止生成 + 重新生成 + 错误重试
overview: src/types/chat.ts 增加 'stopped' 状态；ChatView 暴露 provide('chatActions') 包含 stop/retry/regenerate/canRegenerate，handleSend 抽出 startStream 复用，finish() 加 status 守卫；MessageItem 注入 chatActions 在流式中显示停止按钮、完成后显示重新生成/重试按钮（仅最后一条消息时）。
todos:
  - id: extend-message-status
    content: 在 src/types/chat.ts 给 MessageStatus 增加 'stopped' 字面量
    status: completed
  - id: refactor-chat-view-stream
    content: 重构 src/views/ChatView.vue：抽出 startStream(sessionId) 复用函数；finish() 加 status==='streaming' 守卫；新增 stopGeneration / regenerate actions；provide('chatActions')
    status: completed
    dependencies:
      - extend-message-status
  - id: add-message-item-actions
    content: 改造 src/components/chat/MessageItem.vue：inject chatActions；条件渲染 停止 / 重新生成 / 重试 按钮，样式与气泡一致
    status: completed
    dependencies:
      - refactor-chat-view-stream
  - id: type-check
    content: 运行 vue-tsc --noEmit 确认无类型错误
    status: completed
    dependencies:
      - add-message-item-actions
---

## 产品概述
为 AI Chat Agent 增加流式生成的中止、重新生成与错误重试能力。流式输出过程中可主动停止；停止后保留已生成内容，标记为 stopped；AI 回复完成或出错后，可点击按钮重新生成该条回复。

## 核心功能
- 流式中（status==='streaming'）显示"停止"按钮，点击立即停止并保留已生成内容，状态标记为 'stopped'
- AI 回复完成后（status==='done'）显示"重新生成"按钮，删除该条 AI 消息后用相同历史重新请求
- AI 出错后（status==='error'）显示"重试"按钮，行为与重新生成相同
- finish() 增加 status 守卫，区分用户主动停止（'stopped'）与网络错误（'error'），避免覆盖
- 切换/删除会话时若正在流式，走已有 abortCurrentStream 逻辑，标记为 'done'（不区分用户主动停止与切换导致的停止）


## 技术栈
- 状态管理：复用现有 Pinia store（src/stores/chat.ts）
- 类型扩展：src/types/chat.ts 的 MessageStatus 新增 'stopped'
- 组件通信：Vue provide/inject 在 ChatView 暴露 actions 对象，MessageItem 通过 inject 获取
- 流式控制：复用 src/api/chat.ts 的 streamChat（不修改其 AbortError 处理逻辑）
- UI 组件：Element Plus el-button（text 类型 + 小尺寸）

## 实现方案
### 总体策略
ChatView 抽出 startStream(sessionId, history) 复用函数，被 handleSend（用户发新消息）和 regenerate（删最后 AI 消息后重发）调用。MessageItem 通过 inject 拿到 actions 对象 { stop, regenerate, canRegenerate, isStreaming }，根据 message.status 条件渲染按钮。

### 关键改造

1. **src/types/chat.ts**
   - MessageStatus 由 'streaming' | 'done' | 'error' 扩展为 'streaming' | 'done' | 'error' | 'stopped'

2. **src/views/ChatView.vue**
   - 抽出 startStream(sessionId: string) 函数：构造 history（过滤掉最后一条 status==='streaming' 的 AI 消息）、appendMessage(aiPlaceholder, status:'streaming')、streamChat 回调 finish
   - finish(status) 改造：先读当前 status，仅当 ==='streaming' 时才 updateMessage；这样 stop 路径已设的 'stopped' 不会被 abort 触发的 finish('error') 覆盖
   - 添加 regenerate(messageId) action：找到该 messageId 对应的会话和最后一条 AI 消息，deleteLastAssistantMessage → startStream(sessionId)
   - 添加 stopGeneration() action：先 updateMessage('stopped')（同步更新 store），再 controller.abort()（触发 streamChat 内部 onError → finish('error')，但被 status 守卫拦截）
   - defineExpose 或 provide('chatActions', { stop, regenerate, canRegenerate(messageId), isStreaming(sessionId) })
   - 切换/删除会话的 abortCurrentStream 逻辑不变：标 'done'

3. **src/components/chat/MessageItem.vue**
   - inject chatActions（类型 ChatActions | undefined；undefined 时按钮不渲染）
   - 三态按钮渲染：
     - isStreaming：显示 "停止" 按钮（left 气泡下方/右侧，el-button text + size=small）
     - role==='assistant' && canRegenerate(message.id) && status in ('done','error','stopped')：显示 "重新生成"/"重试" 按钮（文案根据 status 区分）
   - 按钮位置：在 .bubble-wrap 内、.time 行，与 time 同行或单独一行（紧贴气泡下方）
   - 样式：el-button text + small；hover 显高亮；与气泡颜色协调（left 用 #3b55e8，right 不显示按钮）

### finish() 守卫逻辑（关键）
```
function finish(status) {
  if (finished) return
  finished = true
  const target = list.find(m => m.id === aiMsgId)
  // 守卫：若 stopGeneration 已把 status 设为 'stopped'，则不再覆盖
  if (target && target.status === 'streaming') {
    target.status = status
  }
  ...
}
```
stopGeneration 调用顺序：
1. updateMessage(sessionId, aiMsgId, { status: 'stopped' })
2. controller.abort()
3. finish('error') 由 streamChat onError 触发 → 被守卫拦截

### 数据流
handleSend(userContent) → ensureSession → appendMessage(user) → renameFromFirstUserMessage → startStream(sessionId) → streamChat → onDelta 增量 / onDone finish('done') / onError finish('error')
stopGeneration(messageId) → updateMessage('stopped') → abort() → onError → finish('error') [被守卫拦截，状态保持 'stopped']
regenerate(messageId) → deleteLastAssistantMessage(sessionId) → startStream(sessionId)
切换/删除会话 → abortCurrentStream() → updateMessage('done') + abort()

## 性能与可靠性
- finish() 守卫用 ==='streaming' 判断，O(1) 开销
- provide/inject 是 Vue 响应式机制，MessageItem 自动响应状态变化
- regenerate 不重复构造 prompt，直接复用 startStream 内的 history 构造逻辑
- 停止按钮在 status==='streaming' 时显示，避免 race condition（停止与完成竞争）

## 目录结构
```
src/
├── types/
│   └── chat.ts                # [MODIFY] MessageStatus 增加 'stopped'
├── views/
│   └── ChatView.vue           # [MODIFY] 抽出 startStream 复用函数；
│                              #       添加 stopGeneration / regenerate / provide('chatActions')
│                              #       finish() 加 status 守卫
└── components/chat/
    └── MessageItem.vue        # [MODIFY] inject chatActions；条件渲染 停止/重新生成/重试 按钮
```

