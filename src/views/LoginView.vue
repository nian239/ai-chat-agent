<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const form = reactive({
  apiKey: '',
})
const loading = ref(false)

const rules: FormRules = {
  apiKey: [{ required: true, message: '请输入 API Key', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    if (!auth.login(form.apiKey)) {
      ElMessage.error('API Key 不能为空')
      return
    }
    ElMessage.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    router.replace(redirect || '/chat')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-icon">AI</div>
        <h1 class="app-title">AI Chat Agent</h1>
        <p class="app-subtitle">输入你的 API Key 开始对话</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="apiKey">
          <el-input
            v-model="form.apiKey"
            type="password"
            placeholder="请输入 API Key"
            show-password
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-button
            class="login-button"
            type="primary"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1d2e 0%, #2b2350 100%);
}

.login-card {
  width: 380px;
  padding: 40px 36px 24px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.login-header {
  margin-bottom: 32px;
  text-align: center;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #4f6ef7 0%, #3b55e8 100%);
  border-radius: 14px;
}

.app-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.app-subtitle {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.login-button {
  width: 100%;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.login-button:hover:not(.is-loading) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(79, 110, 247, 0.4);
}
</style>
