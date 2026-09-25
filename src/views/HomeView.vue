<script setup lang="ts">
import { useCounterStore } from '@/stores/counter'

const counter = useCounterStore()
</script>

<template>
  <div class="home">
    <el-container>
      <el-header>
        <el-menu mode="horizontal" router :default-active="$route.path">
          <el-menu-item index="/">首页</el-menu-item>
          <el-menu-item index="/about">关于</el-menu-item>
        </el-menu>
      </el-header>
      <el-main>
        <el-card>
          <template #header>AI Chat Agent</template>
          <p>Vue3 + Vite + TypeScript + Element Plus + Pinia + Vue Router + Axios</p>
          <el-space>
            <el-button type="primary" @click="counter.increment">
              count: {{ counter.count }}
            </el-button>
          </el-space>
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.home {
  height: 100%;
}
</style>
