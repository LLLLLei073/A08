<template>
  <div class="page">
    <van-nav-bar title="消息" />
    <van-tabs v-model:active="activeTab" sticky>
      <van-tab title="群聊" :badge="chatUnread || undefined">
        <div class="list">
          <div
            v-for="g in groups"
            :key="g.id"
            class="conv-item"
            @click="$router.push(`/chat/${g.id}`)"
          >
            <div class="conv-avatar">
              <van-icon v-if="g.type === 'MANAGE'" name="manager-o" />
              <van-icon v-else-if="g.type === 'ORG'" name="friends-o" />
              <van-icon v-else name="chat-o" />
            </div>
            <div class="conv-main">
              <div class="conv-top">
                <span class="conv-name">
                  <van-tag v-if="g.type === 'MANAGE'" type="danger" plain>管理</van-tag>
                  <van-tag v-else-if="g.type === 'ORG'" type="warning" plain>支部</van-tag>
                  {{ g.name }}
                </span>
                <span class="conv-time">{{ g.lastMessage ? formatTime(g.lastMessage.createdAt) : '' }}</span>
              </div>
              <div class="conv-bottom">
                <span class="conv-last">{{ lastMessageLabel(g.lastMessage) }}</span>
                <van-badge v-if="g.unread > 0" :content="g.unread" :max="99" class="conv-badge" />
              </div>
            </div>
          </div>
          <div v-if="groups.length === 0" class="empty">暂无群聊</div>
        </div>
      </van-tab>
      <van-tab title="通知" :badge="notifUnread || undefined">
        <div class="list">
          <van-cell
            v-for="n in notifications"
            :key="n.id"
            class="notif-cell"
            @click="openNotif(n)"
          >
            <template #title>
              <div class="notif-title-row">
                <van-tag v-if="!n.isRead" type="danger">未读</van-tag>
                <span :class="['notif-title', { unread: !n.isRead }]">{{ n.title }}</span>
              </div>
              <div class="notif-preview">{{ n.content.slice(0, 50) }}{{ n.content.length > 50 ? '...' : '' }}</div>
              <div class="notif-meta">{{ formatTime(n.createdAt) }} · {{ n.senderName || '系统' }}</div>
            </template>
          </van-cell>
          <div v-if="notifications.length === 0" class="empty">暂无通知</div>
        </div>
      </van-tab>
    </van-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { chatApi, notificationApi } from '@/api';

const router = useRouter();
const activeTab = ref('group' as any);
const groups = ref<any[]>([]);
const notifications = ref<any[]>([]);
let timer: ReturnType<typeof setInterval> | null = null;

const chatUnread = computed(() => groups.value.reduce((s, g) => s + (g.unread || 0), 0));
const notifUnread = computed(() => notifications.value.filter((n) => !n.isRead).length);
const lastMessageLabel = (last?: any) => {
  if (!last) return '暂无消息';
  const sender = last.senderName || (last.type === 'SYSTEM' ? '系统' : '未知发送者');
  return `${sender}: ${last.content}`;
};

const formatTime = (s: string) => {
  const d = new Date(s);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const load = async () => {
  if (document.visibilityState !== 'visible') return;
  try {
    const [g, n] = await Promise.all([
      chatApi.groups() as any,
      (async () => { const r: any = await notificationApi.list(1, 20); return r.list; })(),
    ]);
    groups.value = g;
    notifications.value = n;
  } catch {}
};

const openNotif = (n: any) => {
  router.push(`/notification/${n.id}`);
};

onMounted(() => {
  load();
  timer = setInterval(load, 10000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.list { background: #fff; min-height: 60vh; }
.conv-item { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f5f5f5; cursor: pointer; }
.conv-item:active { background: #f9f9f9; }
.conv-avatar { width: 44px; height: 44px; border-radius: 8px; background: var(--ps-red-soft, #fcecec); color: #8b1a1a; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; margin-right: 12px; }
.conv-main { flex: 1; min-width: 0; }
.conv-top { display: flex; justify-content: space-between; align-items: center; }
.conv-name { font-size: 15px; font-weight: 500; display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-time { font-size: 11px; color: #999; flex-shrink: 0; margin-left: 8px; }
.conv-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.conv-last { font-size: 13px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.conv-badge { margin-left: 8px; }
.empty { text-align: center; padding: 60px 0; color: #999; font-size: 14px; }

.notif-cell { padding: 12px 16px; }
.notif-title-row { display: flex; align-items: center; gap: 6px; }
.notif-title { font-size: 15px; color: #333; }
.notif-title.unread { font-weight: 600; }
.notif-preview { font-size: 13px; color: #999; margin-top: 4px; line-height: 1.4; }
.notif-meta { font-size: 11px; color: #bbb; margin-top: 4px; }
</style>
