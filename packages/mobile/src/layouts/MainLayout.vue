<template>
  <div class="main-layout">
    <router-view v-slot="{ Component, route }">
      <transition name="page-fade" mode="out-in">
        <!-- keep-alive：切回已访问的 tab 页时不重新挂载、不重新拉数据 -->
        <keep-alive :exclude="/^(Content|Report|Result|TakeQuiz|History|Chat|Notification)/">
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
      </transition>
    </router-view>
    <!-- 仅一级 tab 页显示底部导航；二级页面（聊天/详情/答题等）全屏展示，
         避免固定定位的 tabbar 遮挡页面底部内容（如聊天输入框）。
         placeholder 让 tabbar 在文档流中占位，列表最后一项不会被盖住。 -->
    <van-tabbar
      v-if="isTabPage"
      v-model="active"
      route
      placeholder
      active-color="#8b1a1a"
      inactive-color="#8a8276"
    >
      <van-tabbar-item to="/home" icon="home-o">学习</van-tabbar-item>
      <van-tabbar-item to="/task" icon="orders-o">任务</van-tabbar-item>
      <van-tabbar-item to="/quiz" icon="edit">测验</van-tabbar-item>
      <van-tabbar-item to="/message" :badge="unreadBadge || undefined" icon="chat-o">消息</van-tabbar-item>
      <van-tabbar-item to="/profile" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { chatApi, notificationApi } from '@/api';

const route = useRoute();
/** 只有 meta.tab 的一级页面才显示底部导航 */
const isTabPage = computed(() => route.meta.tab === true);

const active = ref(0);
const unreadBadge = ref(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const pollUnread = async () => {
  if (document.visibilityState !== 'visible') return;
  try {
    const [chat, notif] = await Promise.all([chatApi.groups() as any, notificationApi.unread() as any]);
    const chatUnread = (chat as any[]).reduce((s, g) => s + (g.unread || 0), 0);
    unreadBadge.value = chatUnread + (notif || 0);
  } catch {}
};

onMounted(() => {
  pollUnread();
  pollTimer = setInterval(pollUnread, 15000);
});
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });
</script>

<style scoped>
.main-layout {
  min-height: 100vh;
}
.page-fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.page-fade-leave-active {
  transition: opacity 0.16s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-fade-leave-to {
  opacity: 0;
}
</style>
