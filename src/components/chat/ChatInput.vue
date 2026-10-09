<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  disabled?: boolean
  /** 是否正在流式生成：底部按钮切换为红色「停止」 */
  streaming?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const model = defineModel<string>({ default: '' })

const canSend = computed(() => model.value.trim() !== '' && !props.disabled)

function handleSend() {
  if (!canSend.value) return
  emit('send', model.value.trim())
  model.value = ''
}

function handleStop() {
  emit('stop')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <el-input
      v-model="model"
      type="textarea"
      :rows="3"
      resize="none"
      placeholder="输入消息，Enter 发送，Shift + Enter 换行"
      :disabled="disabled"
      @keydown="handleKeydown"
    />
    <div class="input-footer">
      <span class="hint">{{
        streaming ? 'AI 正在生成，可随时停止' : model.length ? `${model.length} 字` : ''
      }}</span>

      <!-- 流式中：发送按钮切换为红色「停止」按钮（方形图标） -->
      <el-button
        v-if="streaming"
        class="footer-btn"
        type="danger"
        title="停止生成"
        @click="handleStop"
      >
        <svg class="stop-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" />
        </svg>
        停止
      </el-button>

      <!-- 非流式：发送按钮 -->
      <el-button
        v-else
        class="footer-btn"
        type="primary"
        :disabled="!canSend"
        :loading="disabled"
        @click="handleSend"
      >
        发送
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  flex-shrink: 0;
  padding: 12px 16px;
  background: #ffffff;
  border-top: 1px solid #e4e7ed;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.hint {
  font-size: 12px;
  color: #909399;
}

/* 发送 / 停止 共用：锁定最小宽度，切换时按钮不跳动 */
.footer-btn {
  min-width: 88px;
}

/* 「停止」按钮里的方形图标 */
.stop-icon {
  display: block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
}
</style>
