<template>
  <div class="page">
    <van-nav-bar title="通知详情" left-arrow @click-left="$router.back()" />
    <div v-if="notif" class="detail">
      <div class="detail-header">
        <van-tag v-if="notif.level === 'URGENT'" type="danger">紧急</van-tag>
        <van-tag v-else-if="notif.level === 'IMPORTANT'" type="warning">重要</van-tag>
        <van-tag v-else type="primary" plain>普通</van-tag>
        <h2 class="detail-title">{{ notif.title }}</h2>
        <div class="detail-meta">
          <span>{{ notif.senderName || '系统通知' }}</span>
          <span>{{ formatTime(notif.createdAt) }}</span>
        </div>
      </div>
      <div class="detail-body">{{ notif.content }}</div>

      <!-- AI 报告通知：附带查看入口 -->
      <div v-if="notif.type === 'REPORT' && notif.refId" class="report-link" @click="$router.push('/report')">
        <van-icon name="chart-trending-o" />
        <span>查看完整 AI 评价报告</span>
        <van-icon name="arrow" />
      </div>
    </div>
    <van-loading v-else style="text-align: center; padding: 40px" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { notificationApi } from '@/api';

const route = useRoute();
const id = Number(route.params.id);
const notif = ref<any>(null);

const formatTime = (s: string) => new Date(s).toLocaleString('zh-CN');

onMounted(async () => {
  notif.value = await notificationApi.detail(id);
  await notificationApi.markRead(id);
});
</script>

<style scoped>
.detail { background: #fff; margin: 0; min-height: 80vh; }
.detail-header { padding: 20px 16px 12px; border-bottom: 1px solid #f0f0f0; }
.detail-title { font-size: 18px; font-weight: 600; margin: 8px 0; line-height: 1.4; }
.detail-meta { display: flex; gap: 16px; font-size: 12px; color: #999; }
.detail-body { padding: 16px; font-size: 15px; line-height: 1.8; white-space: pre-wrap; color: #333; }
.report-link { display: flex; align-items: center; gap: 8px; margin: 16px; padding: 14px 16px; background: linear-gradient(135deg, #8b1a1a, #6e1414); color: #fff; border-radius: 10px; font-size: 14px; }
.report-link span { flex: 1; }
</style>
