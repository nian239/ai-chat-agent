---
name: 多会话管理 + 持久化（Pinia + localStorage）
overview: 新建 src/stores/chat.ts 用 Pinia 管理 sessions/messagesMap/activeSessionId，localStorage 持久化；删除 src/mock/chatData.ts；扩展 ChatSession 增加 createdAt；ChatView 迁移到 store；SessionList 加删除按钮。
todos:
  - id: extend-session-type
    content: 在 src/types/chat.ts 给 ChatSession 增加 createdAt 必填字段
    status: completed
  - id: create-chat-store
    content: 新增 src/stores/chat.ts：Pinia setup-style store 管理 sessions/messagesMap/activeSessionId，localStorage 持久化，暴露 create/select/delete/append/update/touch/ensureSession 等 actions，加载时把 status==='streaming' 归一化为 done
    status: completed
    dependencies:
      - extend-session-type
  - id: add-session-delete-ui
    content: 改造 SessionList.vue：新增删除按钮（el-popconfirm + 图标）与 delete emit，点击阻止冒泡
    status: completed
  - id: migrate-chat-view-to-store
    content: 重构 ChatView.vue：移除 mock 依赖，数据全部来自 store，handleSend 改用 store 的 append/update/touch，持有 streamChat controller 引用以在切换/删除时 abort，新增 handleDelete
    status: completed
    dependencies:
      - extend-session-type
      - create-chat-store
  - id: delete-mock-data
    content: 删除 src/mock/chatData.ts
    status: completed
    dependencies:
      - migrate-chat-view-to-store
  - id: type-check
    content: 运行 vue-tsc --noEmit 确认无类型错误
    status: completed
    dependencies:
      - create-chat-store
      - add-session-delete-ui
      - migrate-chat-view-to-store
      - delete-mock-data
---

src/api/chat.ts（Serverless）