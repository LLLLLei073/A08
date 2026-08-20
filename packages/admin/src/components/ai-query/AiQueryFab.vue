<template>
  <div class="ai-fab">
    <!-- 悬浮球按钮 -->
    <transition name="fab-hide">
      <button v-show="!store.open" class="fab-ball" title="AI 数据查询" aria-label="打开 AI 数据查询" @click="store.openPanel()">
        <span class="fab-pulse"></span>
        <span class="fab-icon"><el-icon :size="24"><MagicStick /></el-icon></span>
        <span class="fab-label">AI 问数</span>
      </button>
    </transition>

    <!-- 查询弹窗 -->
    <el-dialog v-model="store.open" width="780px" top="6vh" :close-on-click-modal="false" class="aq-dialog" append-to-body>
      <template #header>
        <div class="aq-header">
          <span class="aq-title">AI 自然语言数据查询</span>
          <el-tag type="success" size="small" effect="light">DeepSeek</el-tag>
          <span class="aq-sub">用大白话问学习数据 · 自动生成文字结论与图表</span>
        </div>
      </template>
      <KeepAlive>
        <AiQueryChat v-if="store.open" />
      </KeepAlive>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { MagicStick } from '@element-plus/icons-vue';
import { useAiQueryStore } from '@/store/ai-query';

// 聊天面板按需加载（首次打开时才拉取 echarts 等重依赖，避免拖慢首屏）
const AiQueryChat = defineAsyncComponent(() => import('./AiQueryChat.vue'));

const store = useAiQueryStore();
</script>

<style scoped>
.ai-fab {
  position: fixed;
  right: 26px;
  bottom: 30px;
  z-index: 60;
}

/* ============ 悬浮球 ============ */
.fab-ball {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #b22222 0%, #8b1a1a 55%, #5e0f0f 100%);
  color: #f7e3b0;
  box-shadow:
    0 10px 28px rgba(139, 26, 26, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 0 0 1px rgba(201, 169, 97, 0.4);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.fab-ball:hover {
  transform: scale(1.08) translateY(-2px);
  box-shadow:
    0 16px 36px rgba(139, 26, 26, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 0 0 1px rgba(201, 169, 97, 0.5);
}
.fab-ball:active {
  transform: scale(0.94);
}
.fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
}

/* 呼吸光环 */
.fab-pulse {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid rgba(201, 169, 97, 0.55);
  animation: fab-pulse 2.6s ease-out infinite;
  pointer-events: none;
}
@keyframes fab-pulse {
  0% { transform: scale(0.86); opacity: 0.9; }
  70% { transform: scale(1.28); opacity: 0; }
  100% { transform: scale(1.28); opacity: 0; }
}

/* 悬停标签 */
.fab-label {
  position: absolute;
  right: 64px;
  white-space: nowrap;
  padding: 5px 13px;
  border-radius: 999px;
  background: rgba(94, 15, 15, 0.94);
  color: #f7e3b0;
  font-size: 12.5px;
  letter-spacing: 1.5px;
  box-shadow: 0 4px 14px rgba(94, 15, 15, 0.28);
  opacity: 0;
  transform: translateX(8px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
}
.fab-ball:hover .fab-label {
  opacity: 1;
  transform: translateX(0);
}

/* 弹窗打开时按钮收起 */
.fab-hide-enter-active,
.fab-hide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.fab-hide-enter-from,
.fab-hide-leave-to {
  opacity: 0;
  transform: scale(0.55);
}

/* ============ 弹窗样式 ============
   注意：必须用裸 :deep() 而不能写 .aq-dialog :deep(...)。
   el-dialog 内部结构把父组件的 data-v 作用域属性落在 el-overlay 上，
   而 .aq-dialog 类挂在 .el-dialog 根元素上不带 data-v，带前缀的选择器永远不会命中。 */
:deep(.el-dialog) {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--ps-shadow-lg);
}
:deep(.el-dialog__header) {
  background: linear-gradient(135deg, #8b1a1a 0%, #6e1414 100%);
  padding: 16px 20px 14px;
  margin-right: 0;
}
:deep(.el-dialog__headerbtn) {
  top: 16px;
}
:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: rgba(255, 244, 234, 0.85);
  font-size: 18px;
}
:deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #fff;
}
:deep(.el-dialog__body) {
  padding: 16px 20px 20px;
}
.aq-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.aq-title {
  font-family: var(--ps-font-serif);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
}
.aq-sub {
  width: 100%;
  font-size: 12px;
  color: rgba(255, 244, 234, 0.9);
}
</style>
