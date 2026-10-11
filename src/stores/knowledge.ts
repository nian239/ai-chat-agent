import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
  type KnowledgeDoc,
} from '@/api/documents'
import { serverStorageEnabled } from '@/api/storage'

/**
 * 知识库（RAG）store
 * - 向量存本地 Express 内存，DEV 专用；PROD（Vercel 无状态）不可用
 * - 上传/删除失败直接抛错，由视图层提示
 */
export const useKnowledgeStore = defineStore('knowledge', () => {
  /** 是否启用知识库（与 chat store 的存储模式对齐：DEV 走本地 Express） */
  const enabled = serverStorageEnabled

  const documents = ref<KnowledgeDoc[]>([])
  const uploading = ref(false)
  const ready = ref(false)

  /** 有文档时聊天自动走 RAG 检索 */
  const hasDocuments = computed(() => documents.value.length > 0)

  /** 异步初始化：拉取服务端文档列表（ChatView onMounted 调用） */
  async function init(): Promise<void> {
    if (!enabled || ready.value) return
    try {
      documents.value = await listDocuments()
    } catch (err) {
      console.warn('[knowledge store] 获取知识库文档列表失败（Express 是否已启动？）:', err)
    } finally {
      ready.value = true
    }
  }

  /** 上传文档（服务端切分 + 向量化，耗时与文档长度相关） */
  async function upload(filename: string, content: string): Promise<void> {
    uploading.value = true
    try {
      const doc = await uploadDocument(filename, content)
      documents.value.unshift(doc)
    } finally {
      uploading.value = false
    }
  }

  /** 删除文档 */
  async function remove(id: string): Promise<void> {
    await deleteDocument(id)
    documents.value = documents.value.filter((d) => d.id !== id)
  }

  return { enabled, documents, uploading, ready, hasDocuments, init, upload, remove }
})
