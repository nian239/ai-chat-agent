<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

function handleLogout() {
  auth.logout()
  ElMessage.success('已退出登录')
  router.replace('/login')
}
</script>

<template>
  <div class="chat-page">
    <header class="chat-header">
      <div class="header-left">
        <span class="logo-icon">AI</span>
        <span class="app-name">AI Chat Agent</span>
      </div>
      <div class="header-right">
        <el-tag type="success" effect="light" round>已登录</el-tag>
        <el-button text type="danger" @click="handleLogout">退出登录</el-button>
      </div>
    </header>

    <main class="chat-main">
      <div class="placeholder">
        <h2>聊天功能开发中</h2>
        <p>已成功登录，聊天界面将在后续版本中提供。</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f7fa;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 24px;
  background: #ffffff;
  border-bottom: 1px solid #e4e7ed;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #4f6ef7 0%, #3b55e8 100%);
  border-radius: 10px;
}

.app-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-main {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.placeholder {
  text-align: center;
}

.placeholder h2 {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.placeholder p {
  margin: 0;
  font-size: 14px;
  color: #909399;
}
</style>
