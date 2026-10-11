<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Document, UploadFilled } from '@element-plus/icons-vue'
import { useKnowledgeStore } from '@/stores/knowledge'

/** 双向绑定抽屉显隐 */
const visible = defineModel<boolean>({ default: false })

const knowledge = useKnowledgeStore()
const fileInput = ref<HTMLInputElement | null>(null)

/** 文件字节上限（UTF-8/GBK 中文最多 3 字节/字，4MB 文件 ≈ 上限 2MB 字符的 6 倍冗余） */
const MAX_FILE_BYTES = 4 * 1024 * 1024

function pickFile() {
  if (knowledge.uploading) return
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 重置 value，确保再次选择同一文件也能触发 change
  input.value = ''
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.txt')) {
    ElMessage.warning('目前仅支持 .txt 文件，PDF 后续支持')
    return
  }
  if (file.size > MAX_FILE_BYTES) {
    ElMessage.warning('文件过大（超过 4MB），请拆分后上传')
    return
  }

  try {
    const content = await readFileText(file)
    await knowledge.upload(file.name, content)
    ElMessage.success(`「${file.name}」已入库`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '上传失败')
  }
}

/**
 * 读取 TXT 文本：UTF-8 严格解码失败时回退 GBK
 * Windows 中文记事本保存的 TXT 常为 GBK 编码，直接 readAsText 会乱码
 */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer)
    } catch {
      // GBK 解码也失败（极少见）：非严格 UTF-8 兜底
      return new TextDecoder('utf-8').decode(buffer)
    }
  }
}

async function handleDelete(id: string) {
  try {
    await knowledge.remove(id)
    ElMessage.success('已删除')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '删除失败')
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <el-drawer v-model="visible" title="知识库" size="420px">
    <div class="knowledge-drawer">
      <!-- 上传区 -->
      <div class="upload-area" :class="{ uploading: knowledge.uploading }" @click="pickFile">
        <el-icon :size="28" class="upload-icon"><UploadFilled /></el-icon>
        <div class="upload-text">
          {{ knowledge.uploading ? '正在切分并向量化，请稍候…' : '点击上传 TXT 文档' }}
        </div>
        <div class="upload-tip">单文件 ≤ 4MB；上传后切分为 500 字/段（重叠 50 字）建立向量索引</div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".txt"
        class="hidden-input"
        @change="onFileChange"
      />

      <!-- 文档列表 -->
      <div v-if="knowledge.documents.length > 0" class="doc-list">
        <div v-for="doc in knowledge.documents" :key="doc.id" class="doc-item">
          <el-icon class="doc-icon"><Document /></el-icon>
          <div class="doc-main">
            <div class="doc-name" :title="doc.name">{{ doc.name }}</div>
            <div class="doc-meta">{{ doc.size }} 字 · {{ doc.chunkCount }} 段 · {{ formatTime(doc.createdAt) }}</div>
          </div>
          <el-popconfirm
            title="确定删除该文档？"
            confirm-button-text="删除"
            cancel-button-text="取消"
            @confirm="handleDelete(doc.id)"
          >
            <template #reference>
              <el-button text circle :icon="Delete" class="doc-delete" title="删除文档" />
            </template>
          </el-popconfirm>
        </div>
      </div>
      <div v-else class="empty-tip">
        {{ knowledge.ready ? '暂无文档，上传后聊天将自动结合知识库回答' : '正在加载…' }}
      </div>
    </div>

    <template #footer>
      <div class="drawer-footer-tip">
        向量存储在服务内存中，服务重启后需重新上传（后续可升级持久化向量库）
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.knowledge-drawer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px 16px;
  border: 1px dashed #c0c4cc;
  border-radius: 10px;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.upload-area:hover {
  border-color: #3b55e8;
  background-color: #f5f7fa;
}

.upload-area.uploading {
  cursor: wait;
  opacity: 0.7;
}

.upload-icon {
  color: #909399;
}

.upload-area:hover .upload-icon {
  color: #3b55e8;
}

.upload-text {
  font-size: 14px;
  color: #303133;
}

.upload-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.hidden-input {
  display: none;
}

.doc-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px 10px 10px;
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.doc-item:hover {
  background-color: #f5f7fa;
}

.doc-icon {
  color: #3b55e8;
  flex-shrink: 0;
}

.doc-main {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.doc-delete {
  color: #909399;
}

.doc-delete:hover {
  color: #f56c6c;
}

.empty-tip {
  padding: 32px 0;
  font-size: 13px;
  color: #909399;
  text-align: center;
}

.drawer-footer-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
</style>
