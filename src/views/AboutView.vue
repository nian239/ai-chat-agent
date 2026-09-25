<script setup lang="ts">
</script>

<template>
  <div class="about">
    <el-container>
      <el-header>
        <el-menu mode="horizontal" router :default-active="$route.path">
          <el-menu-item index="/">首页</el-menu-item>
          <el-menu-item index="/about">关于</el-menu-item>
        </el-menu>
      </el-header>
      <el-main>
        <el-card>
          <template #header>关于</template>
          <p>这是一个 AI 聊天助手项目模板。</p>
          <el-button tag="router-link" to="/">返回首页</el-button>
        </el-card>
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.about {
  height: 100%;
}
</style>
