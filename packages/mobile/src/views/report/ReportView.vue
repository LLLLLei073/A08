<template>
  <div class="page">
    <van-nav-bar title="AI 综合评价报告" left-arrow @click-left="$router.back()">
      <template #right>
        <van-icon name="clock-o" size="20" @click="$router.push('/report/history')" />
      </template>
    </van-nav-bar>
    <div v-if="report">
      <div class="score-section">
        <div class="score">{{ report.score }}</div>
        <div class="label">综合评分</div>
        <div class="badge">{{ periodLabel }} · {{ formatDate(report.generatedAt) }}</div>
      </div>

      <div class="section-title">能力雷达</div>
      <div ref="radarRef" class="chart"></div>

      <div class="section-title">总体评语</div>
      <div class="card">{{ report.comment }}</div>

      <div class="section-title">优势</div>
      <div class="card">
        <div v-for="(s, i) in report.strengths" :key="i" class="list-item">
          <van-icon name="checked" color="#07c160" />{{ s }}
        </div>
      </div>

      <div class="section-title">待改进</div>
      <div class="card">
        <div v-for="(w, i) in report.weaknesses" :key="i" class="list-item">
          <van-icon name="warning-o" color="#ee0a24" />{{ w }}
        </div>
      </div>

      <div class="section-title">改进建议</div>
      <div class="card">
        <div v-for="(s, i) in report.suggestions" :key="i" class="list-item">
          <van-tag type="primary" round>{{ i + 1 }}</van-tag>
          <span style="margin-left: 8px">{{ s }}</span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <van-icon name="comment-o" size="48" color="#ddd" />
      <p>暂无已下发的报告</p>
      <p class="sub-hint">报告由管理端生成后通过消息通知发送</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, computed } from 'vue';
import { init, use } from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { RadarComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { aiApi } from '@/api';

use([RadarChart, RadarComponent, CanvasRenderer]);

const report = ref<any>();
const radarRef = ref<HTMLElement>();
let chartInstance: ReturnType<typeof init> | null = null;

const periodLabel = computed(() => {
  const m: any = { DAILY: '日报', WEEKLY: '周报', MONTHLY: '月报', QUARTERLY: '季报' };
  return m[report.value?.periodType] ?? '报告';
});

const load = async () => {
  try {
    report.value = await aiApi.report();
    if (report.value) {
      await nextTick();
      renderRadar();
    }
  } catch {
    // 错误已提示
  }
};

const renderRadar = () => {
  if (!radarRef.value || !report.value) return;
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  chartInstance = init(radarRef.value);
  chartInstance.setOption({
    radar: {
      indicator: report.value.dimensions.map((d: any) => ({ name: d.name, max: 100 })),
      radius: 80,
    },
    series: [{
      type: 'radar',
      data: [{ value: report.value.dimensions.map((d: any) => d.value), areaStyle: { color: 'rgba(192,57,43,0.3)' }, lineStyle: { color: '#c0392b' } }],
    }],
  });
};

const formatDate = (s: string) => new Date(s).toLocaleDateString('zh-CN');

onMounted(load);
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
});
</script>

<style scoped>
.score-section {
  background: linear-gradient(135deg, #c0392b 0%, #8e1a1a 100%);
  color: #fff;
  text-align: center;
  padding: 24px;
}
.score {
  font-size: 60px;
  font-weight: bold;
  line-height: 1;
}
.label {
  margin-top: 8px;
  font-size: 14px;
  opacity: 0.9;
}
.badge {
  margin-top: 12px;
  font-size: 12px;
  opacity: 0.8;
}
.chart {
  height: 280px;
  background: #fff;
  margin: 0 12px;
  border-radius: 8px;
}
.card {
  background: #fff;
  margin: 0 12px 12px;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.6;
}
.list-item {
  display: flex;
  align-items: center;
  padding: 6px 0;
  gap: 6px;
}
.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #999;
}
.empty-state p {
  margin: 12px 0 4px;
  font-size: 15px;
}
.sub-hint {
  font-size: 12px !important;
  color: #bbb !important;
}
</style>
