<template>
  <div class="page">
    <van-nav-bar title="我的任务" />
    <van-empty v-if="tasks.length === 0" description="暂无学习任务" />
    <van-collapse v-model="activeNames">
      <van-collapse-item v-for="t in tasks" :key="t.id" :name="String(t.id)">
        <template #title>
          <div class="task-title">
            <div>{{ t.title }}</div>
            <van-tag :type="t.progress >= 100 ? 'success' : 'primary'">{{ t.progress }}%</van-tag>
          </div>
        </template>
        <div class="task-detail">
          <van-progress :percentage="t.progress" color="#c0392b" />
          <div style="margin-top: 8px; color: #969799; font-size: 12px">
            截止时间：{{ formatDate(t.deadline) }}
          </div>
          <div style="margin-top: 8px">
            <div v-for="c in t.contents" :key="c.contentId" class="task-content-item" @click="$router.push(`/content/${c.contentId}`)">
              <van-icon :name="c.type === 'VIDEO' ? 'video-o' : 'description'" />
              <span style="flex: 1; margin: 0 8px">{{ c.title }}</span>
              <van-tag v-if="c.completed" type="success">已完成</van-tag>
              <van-tag v-else plain>{{ c.progress }}%</van-tag>
            </div>
          </div>
        </div>
      </van-collapse-item>
    </van-collapse>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { taskApi } from '@/api';

const tasks = ref<any[]>([]);
const activeNames = ref<string[]>([]);

const load = async () => {
  try {
    tasks.value = await taskApi.my();
    if (tasks.value.length > 0) activeNames.value = [String(tasks.value[0].id)];
  } catch {
    /* 忽略加载异常 */
  }
};

const formatDate = (s: string) => new Date(s).toLocaleString('zh-CN');

onMounted(load);
</script>

<style scoped>
.task-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.task-detail {
  padding: 4px 0;
}
.task-content-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #ebedf0;
}
.task-content-item:last-child {
  border-bottom: none;
}
</style>
