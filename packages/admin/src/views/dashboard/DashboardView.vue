<template>
  <div class="page-container">
    <!-- 问候横幅 -->
    <div class="greet-band">
      <div class="greet-grain"></div>
      <div class="greet-inner">
        <div class="greet-text">
          <span class="greet-tag">工作台</span>
          <h2 class="greet-title">{{ greet }}，{{ userName }}</h2>
          <p class="greet-sub">欢迎回到数智党校管理后台，今日组织学习态势如下</p>
        </div>
        <div class="greet-deco">
          <div class="deco-seal">学</div>
          <div class="deco-ring"></div>
        </div>
      </div>
    </div>

    <!-- 指标卡片 -->
    <el-row :gutter="18" class="stat-row">
      <el-col :span="6" v-for="(card, i) in cards" :key="card.label">
        <div class="stat-card" :style="{ animationDelay: i * 0.08 + 's' }">
          <div class="stat-top">
            <div class="stat-icon" :style="{ background: card.bg }">
              <el-icon :size="22" color="#fff"><component :is="card.icon" /></el-icon>
            </div>
            <span class="stat-trend" :style="{ color: card.color }">{{ card.trend }}</span>
          </div>
          <div class="stat-value ps-num" :style="{ color: card.color }">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-bar"><span :style="{ background: card.color, width: card.bar + '%' }"></span></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="18" style="margin-top: 18px">
      <el-col :span="16">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span class="ps-section-title">学习时长趋势</span>
              <span class="chart-sub">近 30 天 · 单位：分钟</span>
            </div>
          </template>
          <div ref="trendRef" style="height: 320px"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="quick-card">
          <template #header>
            <div class="card-header">
              <span class="ps-section-title">快捷操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <div
              v-for="a in actions"
              :key="a.label"
              class="quick-item"
              @click="onAction(a)"
            >
              <div class="quick-icon" :style="{ background: a.bg }">
                <el-icon :size="18" color="#fff"><component :is="a.icon" /></el-icon>
              </div>
              <div class="quick-body">
                <div class="quick-label">{{ a.label }}</div>
                <div class="quick-desc">{{ a.desc }}</div>
              </div>
              <el-icon color="#c8c0b0"><ArrowRight /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, reactive, markRaw } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { graphic } from 'echarts/core';
const { LinearGradient } = graphic;

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);
import {
  User,
  Share,
  Document,
  Timer,
  EditPen,
  Checked,
  MagicStick,
} from '@element-plus/icons-vue';
import { statisticsApi } from '@/api';
import { useAuthStore } from '@/store/auth';
import { useAiQueryStore } from '@/store/ai-query';
import { useRouter } from 'vue-router';

const router = useRouter();
const aiQuery = useAiQueryStore();

const onAction = (a: any) => {
  if (a.action === 'ai-query') aiQuery.openPanel();
  else if (a.path) router.push(a.path);
};

const auth = useAuthStore();
const userName = computed(() => (auth.user as any)?.name || '管理员');
const greet = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 9) return '早上好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const trendRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const cards = reactive([
  { label: '党员总数', value: 0, icon: markRaw(User), color: '#8b1a1a', bg: 'linear-gradient(135deg,#b22222,#8b1a1a)', trend: '在册', bar: 78 },
  { label: '支部数', value: 0, icon: markRaw(Share), color: '#a8893e', bg: 'linear-gradient(135deg,#c9a961,#a8893e)', trend: '组织', bar: 64 },
  { label: '学习内容数', value: 0, icon: markRaw(Document), color: '#7c5e2e', bg: 'linear-gradient(135deg,#9c7e3e,#5e4520)', trend: '已发布', bar: 52 },
  { label: '累计学习时长(h)', value: 0, icon: markRaw(Timer), color: '#9c1f12', bg: 'linear-gradient(135deg,#c0392b,#7a1209)', trend: '累计', bar: 88 },
]);

const actions = [
  { label: '导入党员', desc: '批量导入组织人员', icon: markRaw(User), path: '/user', bg: 'linear-gradient(135deg,#b22222,#8b1a1a)' },
  { label: '发布内容', desc: '新增学习资料', icon: markRaw(Document), path: '/content', bg: 'linear-gradient(135deg,#5a8a3a,#3e6e22)' },
  { label: '导入题库', desc: '维护试题内容', icon: markRaw(EditPen), path: '/question', bg: 'linear-gradient(135deg,#c9a961,#a8893e)' },
  { label: '发布测验', desc: '组卷并下发', icon: markRaw(Checked), path: '/quiz', bg: 'linear-gradient(135deg,#8b1a1a,#5e0f0f)' },
  { label: 'AI 数据查询', desc: '智能问数分析', icon: markRaw(MagicStick), action: 'ai-query', bg: 'linear-gradient(135deg,#6d4a8e,#4a2e6e)' },
];

const loadOverview = async () => {
  try {
    const res: any = await statisticsApi.overview();
    cards[0].value = res.totalUsers;
    cards[1].value = res.totalOrgs;
    cards[2].value = res.totalContents;
    cards[3].value = Math.round((res.totalLearningSeconds ?? 0) / 3600);
  } catch {}
};

const loadTrend = async () => {
  try {
    const res: any = await statisticsApi.trend();
    const dates = res.map((r: any) => r.date);
    const durations = res.map((r: any) => Math.round(r.duration / 60));
    await nextTick();
    if (!trendRef.value) return;
    chart ??= echarts.init(trendRef.value);
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#ece4d6',
        borderWidth: 1,
        textStyle: { color: '#1c1917', fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif" },
        extraCssText: 'box-shadow:0 8px 24px rgba(94,15,15,0.12);border-radius:10px;',
      },
      grid: { left: 48, right: 24, top: 24, bottom: 36 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#ece4d6' } },
        axisTick: { show: false },
        axisLabel: { color: '#8a8276', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: '分钟',
        nameTextStyle: { color: '#8a8276', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f4eee2', type: 'dashed' } },
        axisLabel: { color: '#8a8276', fontSize: 11 },
      },
      series: [
        {
          data: durations,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { width: 3, color: '#8b1a1a' },
          itemStyle: { color: '#8b1a1a', borderColor: '#fff', borderWidth: 2 },
          areaStyle: {
            color: new LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(139,26,26,0.28)' },
              { offset: 1, color: 'rgba(139,26,26,0.01)' },
            ]),
          },
          emphasis: { focus: 'series' },
        },
      ],
    }, true);
  } catch (error) {
    console.error('学习时长趋势加载失败', error);
  }
};

const onResize = () => chart?.resize();

onActivated(() => {
  nextTick(onResize);
});

onMounted(async () => {
  window.addEventListener('resize', onResize);
  await Promise.all([loadOverview(), loadTrend()]);
  if (trendRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(trendRef.value);
  }
  onResize();
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
/* ============ 问候横幅 ============ */
.greet-band {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(120deg, #8b1a1a 0%, #6e1414 60%, #5e0f0f 100%);
  color: #fff;
  margin-bottom: 18px;
  box-shadow: var(--ps-shadow-red);
}
.greet-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.16;
  mix-blend-mode: overlay;
}
.greet-inner {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26px 32px;
}
.greet-tag {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 2px;
  color: #f7e3b0;
  background: rgba(201, 169, 97, 0.18);
  border: 1px solid rgba(201, 169, 97, 0.4);
  padding: 3px 12px;
  border-radius: 999px;
  font-weight: 500;
}
.greet-title {
  margin: 14px 0 6px;
  font-family: var(--ps-font-serif);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 2px;
}
.greet-sub {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 244, 234, 0.72);
}
.greet-deco {
  position: relative;
  width: 92px;
  height: 92px;
}
.deco-seal {
  position: absolute;
  inset: 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, #d8b873, #a8893e);
  color: #4a0b0b;
  font-family: var(--ps-font-serif);
  font-weight: 900;
  font-size: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
}
.deco-ring {
  position: absolute;
  inset: 0;
  border: 1.5px dashed rgba(201, 169, 97, 0.45);
  border-radius: 50%;
  animation: ps-spin 24s linear infinite;
}
@keyframes ps-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============ 指标卡片 ============ */
.stat-row {
  margin-bottom: 0 !important;
}
.stat-card {
  background: var(--ps-surface);
  border: 1px solid var(--ps-line-soft);
  border-radius: 16px;
  padding: 20px 22px;
  box-shadow: var(--ps-shadow-sm);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  animation: ps-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  position: relative;
  overflow: hidden;
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--ps-red), var(--ps-gold));
  opacity: 0;
  transition: opacity 0.3s ease;
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--ps-shadow-md);
}
.stat-card:hover::before {
  opacity: 1;
}
.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(94, 15, 15, 0.16);
}
.stat-trend {
  font-size: 11px;
  font-weight: 500;
  background: var(--ps-red-soft);
  padding: 2px 8px;
  border-radius: 999px;
}
.stat-value {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.5px;
}
.stat-label {
  margin-top: 6px;
  font-size: 13px;
  color: var(--ps-muted);
}
.stat-bar {
  margin-top: 14px;
  height: 4px;
  background: var(--ps-line-soft);
  border-radius: 999px;
  overflow: hidden;
}
.stat-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

/* ============ 图表卡 ============ */
.chart-card :deep(.el-card__body) {
  padding: 12px 16px 20px !important;
}
.chart-sub {
  font-size: 12px;
  color: var(--ps-muted);
  font-weight: 400;
}

/* ============ 快捷操作 ============ */
.quick-card :deep(.el-card__body) {
  padding: 12px 12px !important;
}
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.quick-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.22s ease, transform 0.22s ease;
}
.quick-item:hover {
  background: var(--ps-red-soft);
  transform: translateX(2px);
}
.quick-icon {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(94, 15, 15, 0.14);
}
.quick-body {
  flex: 1;
}
.quick-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ps-ink);
  font-family: var(--ps-font-serif);
}
.quick-desc {
  font-size: 11.5px;
  color: var(--ps-muted);
  margin-top: 1px;
}
</style>
