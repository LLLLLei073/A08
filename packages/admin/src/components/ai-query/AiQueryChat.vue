<template>
  <div class="aq-chat">
    <div class="aq-history" ref="historyRef">
      <div v-for="(msg, i) in history" :key="i" :class="['chat-msg', msg.role]">
        <div class="bubble">
          <div v-if="msg.text">{{ msg.text }}</div>
          <div v-if="msg.chartOption" ref="chartRefs" :data-index="i" class="chart-box"></div>
        </div>
      </div>
      <el-empty v-if="history.length === 0" description="尝试问我：「今年三支部学习完成率」「各支部测验平均分对比」" />
    </div>

    <div class="aq-input">
      <el-input v-model="question" placeholder="请输入问题，如：今年三支部学习完成率" @keyup.enter="ask" :disabled="loading" size="large">
        <template #append>
          <el-button type="primary" @click="ask" :loading="loading">发送</el-button>
        </template>
      </el-input>
      <div class="suggestions">
        <el-button size="small" round v-for="s in suggestions" :key="s" @click="question = s; ask()">{{ s }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, GaugeChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  RadarComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// AI 查询图表类型由后端动态返回，这里注册一份较全的白名单覆盖常见类型；
// 若返回未注册的类型，setOption 会被外层 try 捕获，不会白屏。
echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  RadarComponent,
  CanvasRenderer,
]);
import { aiApi } from '@/api';

interface ChatMsg {
  role: 'user' | 'assistant';
  text?: string;
  chartOption?: any;
}

const history = ref<ChatMsg[]>([]);
const question = ref('');
const loading = ref(false);
const historyRef = ref<HTMLElement>();
const chartRefs = ref<HTMLElement[]>([]);
const chartInstances: echarts.ECharts[] = [];

const suggestions = [
  '今年三支部学习完成率',
  '各支部测验平均分对比',
  '全部支部党员数',
  '各支部考试通过率',
];

const ask = async () => {
  if (!question.value.trim() || loading.value) return;
  const q = question.value;
  history.value.push({ role: 'user', text: q });
  question.value = '';
  loading.value = true;

  try {
    const res: any = await aiApi.query(q);
    history.value.push({
      role: 'assistant',
      text: res.text,
      chartOption: res.chartOption,
    });
    await nextTick();
    // 渲染最新图表
    const lastIdx = history.value.length - 1;
    const target = document.querySelector(`[data-index="${lastIdx}"]`) as HTMLElement;
    if (target && res.chartOption) {
      const c = echarts.init(target);
      // 先铺一层深色文字默认值（后端未指定时），保证白底上坐标轴/标题/图例清晰
      c.setOption({ textStyle: { color: '#1c1917' } });
      c.setOption(res.chartOption);
      chartInstances.push(c);
    }
    scrollToBottom();
  } catch (e: any) {
    ElMessage.error('查询失败');
  } finally {
    loading.value = false;
  }
};

const scrollToBottom = () => {
  if (historyRef.value) {
    historyRef.value.scrollTop = historyRef.value.scrollHeight;
  }
};

onUnmounted(() => {
  chartInstances.forEach((c) => c.dispose());
  chartInstances.length = 0;
});
</script>

<style scoped>
.aq-chat {
  display: flex;
  flex-direction: column;
  height: 60vh;
  min-height: 420px;
}
.aq-history {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  background: #f5f7fa;
  border-radius: 10px;
  border: 1px solid var(--ps-line-soft);
}
.chat-msg {
  margin-bottom: 12px;
  display: flex;
}
.chat-msg.user {
  justify-content: flex-end;
}
.chat-msg.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 82%;
  padding: 10px 14px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--ps-line);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  font-size: 14px;
  line-height: 1.7;
  color: var(--ps-ink);
}
.chat-msg.user .bubble {
  background: linear-gradient(135deg, #b22222, #8b1a1a);
  color: #fff;
}
.chart-box {
  height: 300px;
  margin-top: 8px;
}
.aq-input {
  margin-top: 12px;
}
.suggestions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 发送区：红色主按钮，避免灰字灰底看不清 */
.aq-input :deep(.el-input-group__append) {
  background: linear-gradient(135deg, #b22222, #8b1a1a);
  border: none;
  box-shadow: none;
  border-radius: 0 6px 6px 0;
  overflow: hidden;
}
.aq-input :deep(.el-input-group__append .el-button) {
  margin: 0;
  border: none;
  background: transparent;
  color: #fff;
  font-weight: 600;
  letter-spacing: 3px;
}
.aq-input :deep(.el-input-group__append .el-button:hover),
.aq-input :deep(.el-input-group__append .el-button.is-loading) {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}
.aq-input :deep(.el-input-group__append .el-button .el-icon) {
  color: #fff;
}

/* 空状态提示加深，避免灰字融进浅灰底 */
.aq-history :deep(.el-empty__description p) {
  color: #3f3a33;
  font-weight: 500;
}
</style>
