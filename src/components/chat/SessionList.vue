<script setup lang="ts">
import { computed } from 'vue'
import type { ChatSession } from '@/types/chat'

const props = defineProps<{
  sessions: ChatSession[]
  activeId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
}>()

const sortedSessions = computed(() =>
  [...props.sessions].sort((a, b) => b.updatedAt - a.updatedAt),
)

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}
</script>

<template>
  <aside class="session-list">
    <div class="session-header">
      <span class="title">会话</span>
      <el-button type="primary" size="small" @click="emit('create')">+ 新建</el-button>
    </div>

    <div class="session-scroll">
      <div
        v-for="session in sortedSessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === activeId }"
        @click="emit('select', session.id)"
      >
        <div class="session-title">{{ session.title }}</div>
        <div class="session-time">{{ formatTime(session.updatedAt) }}</div>
      </div>
      <div v-if="sortedSessions.length === 0" class="empty-tip">暂无会话</div>
    </div>
  </aside>
</template>

<style scoped>
.session-list {
  display: flex;
  flex-direction: column;
  width: 260px;
  flex-shrink: 0;
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #e4e7ed;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f1f3;
}

.session-header .title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.session-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.session-item:hover {
  background-color: #f5f7fa;
}

.session-item.active {
  background-color: #ecf0fe;
}

.session-title {
  font-size: 14px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-item.active .session-title {
  color: #3b55e8;
  font-weight: 500;
}

.session-time {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.empty-tip {
  padding: 24px 0;
  font-size: 13px;
  color: #909399;
  text-align: center;
}
</style>
