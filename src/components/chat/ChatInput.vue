<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
}>()

const model = defineModel<string>({ default: '' })

const canSend = computed(() => model.value.trim() !== '' && !props.disabled)

function handleSend() {
  if (!canSend.value) return
  emit('send', model.value.trim())
  model.value = ''
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
      <span class="hint">{{ model.length ? `${model.length} 字` : '' }}</span>
      <el-button
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
</style>
