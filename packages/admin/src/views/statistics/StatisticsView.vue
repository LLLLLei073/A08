<template>
  <div class="page-container">
    <div class="page-head">
      <div>
        <span class="ps-section-title">数据统计</span>
        <p class="page-desc">组织学习态势全览 · 支部维度对比分析</p>
      </div>
      <el-select v-model="selectedOrgId" clearable placeholder="全部支部" style="width: 200px" @change="loadData">
        <el-option v-for="o in orgs" :key="o.id" :value="o.id" :label="o.name" />
      </el-select>
    </div>

    <!-- 指标条 -->
    <div class="metrics">
      <div class="metric" v-for="(m, i) in metricList" :key="m.label" :style="{ animationDelay: i * 0.07 + 's' }">
        <div class="metric-icon" :style="{ background: m.bg }">
          <el-icon :size="20" color="#fff"><component :is="m.icon" /></el-icon>
        </div>
        <div class="metric-body">
          <div class="metric-value ps-num" :style="{ color: m.color }">{{ m.value }}</div>
          <div class="metric-label">{{ m.label }}</div>
        </div>
      </div>
    </div>

    <el-row :gutter="18" style="margin-top: 18px">
      <el-col :span="12">
        <el-card>
          <template #header><div class="card-header"><span class="ps-section-title">各支部任务完成率</span><span class="chart-sub">%</span></div></template>
          <div ref="barRef1" style="height: 320px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><div class="card-header"><span class="ps-section-title">各支部测验平均分</span><span class="chart-sub">分</span></div></template>
          <div ref="barRef2" style="height: 320px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="margin-top: 18px">
      <template #header><div class="card-header"><span class="ps-section-title">各支部详细数据</span></div></template>
      <el-table :data="orgStats" border>
        <el-table-column prop="orgName" label="支部" />
        <el-table-column prop="userCount" label="党员数" />
        <el-table-column label="学习时长">
          <template #default="{ row }">{{ formatHours(row.totalLearningSeconds) }}</template>
        </el-table-column>
        <el-table-column label="任务完成率">
          <template #default="{ row }">
            <div class="rate-cell">
              <div class="rate-bar"><span :style="{ width: (row.taskCompletionRate * 100) + '%', background: '#8b1a1a' }"></span></div>
              <span>{{ formatRate(row.taskCompletionRate) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="avgQuizScore" label="测验平均分" />
        <el-table-column label="考试通过率">
          <template #default="{ row }">
            <div class="rate-cell">
              <div class="rate-bar"><span :style="{ width: (row.examPassRate * 100) + '%', background: '#c9a961' }"></span></div>
              <span>{{ formatRate(row.examPassRate) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, markRaw } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { graphic } from 'echarts/core';
const { LinearGradient } = graphic;

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
import { User, Timer, Checked, Files } from '@element-plus/icons-vue';
import { statisticsApi, orgApi } from '@/api';
import type { OrgNode, OrgStats } from '@ai-party-school/shared';

const overview = ref<any>();
const orgStats = ref<OrgStats[]>([]);
const orgs = ref<OrgNode[]>([]);
const selectedOrgId = ref<number | undefined>();

const barRef1 = ref<HTMLElement>();
const barRef2 = ref<HTMLElement>();
let chart1: echarts.ECharts | null = null;
let chart2: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const metricList = computed(() => [
  { label: '党员总数', value: overview.value?.totalUsers ?? 0, icon: markRaw(User), color: '#8b1a1a', bg: 'linear-gradient(135deg,#b22222,#8b1a1a)' },
  { label: '学习总时长', value: formatHours(overview.value?.totalLearningSeconds), icon: markRaw(Timer), color: '#9c1f12', bg: 'linear-gradient(135deg,#c0392b,#7a1209)' },
  { label: '任务完成率', value: formatRate(overview.value?.overallTaskCompletionRate), icon: markRaw(Checked), color: '#a8893e', bg: 'linear-gradient(135deg,#c9a961,#a8893e)' },
  { label: '考试通过率', value: formatRate(overview.value?.overallExamPassRate), icon: markRaw(Files), color: '#5a8a3a', bg: 'linear-gradient(135deg,#7aa84a,#3e6e22)' },
]);

const loadOrgs = async () => {
  const tree = await orgApi.tree();
  const flat: OrgNode[] = [];
  const walk = (nodes: OrgNode[]) => nodes.forEach((n) => { flat.push(n); if (n.children) walk(n.children); });
  walk(tree);
  orgs.value = flat.filter((o) => o.level === 2);
};

const loadData = async () => {
  overview.value = await statisticsApi.overview();
  orgStats.value = await statisticsApi.byOrg(selectedOrgId.value);
  await nextTick();
  renderCharts();
};

const chartBase = (extra: any) => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#ece4d6',
    borderWidth: 1,
    textStyle: { color: '#1c1917', fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif" },
    extraCssText: 'box-shadow:0 8px 24px rgba(94,15,15,0.12);border-radius:10px;',
  },
  grid: { left: 44, right: 20, top: 28, bottom: 40 },
  xAxis: {
    type: 'category',
    data: orgStats.value.map((s) => s.orgName),
    axisLine: { lineStyle: { color: '#ece4d6' } },
    axisTick: { show: false },
    axisLabel: { color: '#8a8276', fontSize: 11, interval: 0, rotate: orgStats.value.length > 5 ? 18 : 0 },
  },
  ...extra,
});

const renderCharts = () => {
  const names = orgStats.value.map((s) => s.orgName);
  const completions = orgStats.value.map((s) => +(s.taskCompletionRate * 100).toFixed(1));
  const scores = orgStats.value.map((s) => s.avgQuizScore);

  if (barRef1.value) {
    chart1 ??= echarts.init(barRef1.value);
    chart1.setOption(
      chartBase({
        xAxis: {
          type: 'category',
          data: names,
          axisLine: { lineStyle: { color: '#ece4d6' } },
          axisTick: { show: false },
          axisLabel: { color: '#8a8276', fontSize: 11, interval: 0, rotate: names.length > 5 ? 18 : 0 },
        },
        yAxis: { type: 'value', max: 100, name: '%', nameTextStyle: { color: '#8a8276', fontSize: 11 }, splitLine: { lineStyle: { color: '#f4eee2', type: 'dashed' } }, axisLabel: { color: '#8a8276', fontSize: 11 } },
        series: [
          {
            data: completions,
            type: 'bar',
            barWidth: '46%',
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: new LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#b22222' },
                { offset: 1, color: '#8b1a1a' },
              ]),
            },
            label: { show: true, position: 'top', color: '#8b1a1a', fontSize: 11, fontWeight: 600, formatter: '{c}%' },
          },
        ],
      }),
      true,
    );
  }
  if (barRef2.value) {
    chart2 ??= echarts.init(barRef2.value);
    chart2.setOption(
      chartBase({
        xAxis: {
          type: 'category',
          data: names,
          axisLine: { lineStyle: { color: '#ece4d6' } },
          axisTick: { show: false },
          axisLabel: { color: '#8a8276', fontSize: 11, interval: 0, rotate: names.length > 5 ? 18 : 0 },
        },
        yAxis: { type: 'value', max: 100, name: '分', nameTextStyle: { color: '#8a8276', fontSize: 11 }, splitLine: { lineStyle: { color: '#f4eee2', type: 'dashed' } }, axisLabel: { color: '#8a8276', fontSize: 11 } },
        series: [
          {
            data: scores,
            type: 'bar',
            barWidth: '46%',
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: new LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#d8b873' },
                { offset: 1, color: '#a8893e' },
              ]),
            },
            label: { show: true, position: 'top', color: '#a8893e', fontSize: 11, fontWeight: 600 },
          },
        ],
      }),
      true,
    );
  }
};

const formatHours = (s?: number) => (s ? Math.round(s / 3600) : 0) + ' 小时';
const formatRate = (r?: number) => (r === undefined ? '-' : (r * 100).toFixed(1) + '%');

const onResize = () => { chart1?.resize(); chart2?.resize(); };

onActivated(() => {
  nextTick(onResize);
});

onMounted(async () => {
  window.addEventListener('resize', onResize);
  await Promise.all([loadOrgs(), loadData()]);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize);
    if (barRef1.value) resizeObserver.observe(barRef1.value);
    if (barRef2.value) resizeObserver.observe(barRef2.value);
  }
  onResize();
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart1?.dispose();
  chart2?.dispose();
  chart1 = null;
  chart2 = null;
});
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 18px;
}
.page-desc {
  margin: 6px 0 0 13px;
  font-size: 12.5px;
  color: var(--ps-muted);
}
.chart-sub {
  font-size: 12px;
  color: var(--ps-muted);
  font-weight: 400;
}

/* 指标条 */
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.metric {
  background: var(--ps-surface);
  border: 1px solid var(--ps-line-soft);
  border-radius: 16px;
  padding: 20px 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--ps-shadow-sm);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  animation: ps-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  position: relative;
  overflow: hidden;
}
.metric::after {
  content: '';
  position: absolute;
  right: -20px;
  top: -20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.08), transparent 70%);
}
.metric:hover {
  transform: translateY(-3px);
  box-shadow: var(--ps-shadow-md);
}
.metric-icon {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(94, 15, 15, 0.16);
}
.metric-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.metric-label {
  margin-top: 5px;
  font-size: 13px;
  color: var(--ps-muted);
}

/* 表格内进度条 */
.rate-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rate-bar {
  flex: 1;
  max-width: 90px;
  height: 6px;
  background: var(--ps-line-soft);
  border-radius: 999px;
  overflow: hidden;
}
.rate-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
}
.rate-cell > span:last-child {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ps-ink-soft);
  min-width: 44px;
}
</style>
