import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const USER_API_KEY_STORAGE_KEY = 'ai_chat_user_api_key'

/**
 * 应用设置 store（替代旧的 auth store）
 * - userApiKey：用户自带的 API Key，可空
 * - 留空时使用服务端代理 Key（受每日限流约束）
 */
export const useSettingsStore = defineStore('settings', () => {
  const userApiKey = ref<string>(
    localStorage.getItem(USER_API_KEY_STORAGE_KEY) ?? '',
  )

  /** 用户是否填写了自己的 Key */
  const hasUserKey = computed(() => userApiKey.value.trim() !== '')

  /** 保存用户 Key（空字符串表示清除），localStorage 持久化 */
  function setUserKey(key: string) {
    const trimmed = key.trim()
    userApiKey.value = trimmed
    if (trimmed) {
      localStorage.setItem(USER_API_KEY_STORAGE_KEY, trimmed)
    } else {
      localStorage.removeItem(USER_API_KEY_STORAGE_KEY)
    }
  }

  /** 清除用户 Key */
  function clearUserKey() {
    setUserKey('')
  }

  /**
   * 获取实际生效的 Key：
   * - 返回用户 Key（非空）
   * - 返回 null 表示走服务端代理（请求不带 X-User-Key 头）
   */
  function getEffectiveKey(): string | null {
    const trimmed = userApiKey.value.trim()
    return trimmed !== '' ? trimmed : null
  }

  return { userApiKey, hasUserKey, setUserKey, clearUserKey, getEffectiveKey }
})
