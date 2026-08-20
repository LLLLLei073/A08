<template>
  <div class="page">
    <van-nav-bar title="历史报告" left-arrow @click-left="$router.back()" />
    <van-empty v-if="reports.length === 0" description="暂无历史报告" />
    <van-cell-group v-else inset style="margin-top: 12px">
      <van-cell
        v-for="r in reports"
        :key="r.id"
        :title="`评分 ${r.score} 分`"
        :label="formatDate(r.generatedAt)"
        is-link
        @click="$router.push('/report')"
      >
        <template #value>
          <van-tag :type="r.score >= 80 ? 'success' : r.score >= 60 ? 'primary' : 'danger'">{{ r.score }}</van-tag>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { aiApi } from '@/api';

const reports = ref<any[]>([]);

const load = async () => {
  try {
    reports.value = await aiApi.reportHistory();
  } catch {
    /* 忽略加载异常 */
  }
};

const formatDate = (s: string) => new Date(s).toLocaleString('zh-CN');

onMounted(load);
</script>
