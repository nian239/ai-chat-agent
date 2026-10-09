import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 60000,
})

request.interceptors.request.use(
  (config) => {
    const key = import.meta.env.VITE_DEEPSEEK_KEY
    if (key) {
      config.headers['Authorization'] = `Bearer ${key}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    let message: string
    if (error.response?.status === 401) {
      message = 'API Key 无效，请检查 .env.local 里的 VITE_DEEPSEEK_KEY'
    } else {
      message = error.response?.data?.message ?? error.message ?? '请求失败，请稍后重试'
    }
    ElMessage.error(message)
    return Promise.reject(error)
  },
)

export default request
