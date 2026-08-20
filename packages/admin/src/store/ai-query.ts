import { defineStore } from 'pinia';

/**
 * AI 数据查询悬浮球面板开关。
 * 悬浮球按钮（MainLayout 内全局渲染）与工作台「AI 数据查询」快捷入口共享同一面板状态。
 */
export const useAiQueryStore = defineStore('ai-query', {
  state: () => ({ open: false }),
  actions: {
    openPanel() {
      this.open = true;
    },
    closePanel() {
      this.open = false;
    },
    togglePanel() {
      this.open = !this.open;
    },
  },
});
