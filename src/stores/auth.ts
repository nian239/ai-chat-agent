import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const API_KEY_STORAGE_KEY = 'ai_chat_api_key'

export const useAuthStore = defineStore('auth', () => {
  const apiKey = ref<string>(localStorage.getItem(API_KEY_STORAGE_KEY) ?? '')

  const isAuthenticated = computed(() => apiKey.value.trim() !== '')

  function login(key: string): boolean {
    const trimmed = key.trim()
    if (!trimmed) return false
    apiKey.value = trimmed
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed)
    return true
  }

  function logout() {
    apiKey.value = ''
    localStorage.removeItem(API_KEY_STORAGE_KEY)
  }

  return { apiKey, isAuthenticated, login, logout }
})
