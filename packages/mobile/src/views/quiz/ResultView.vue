<template>
  <div class="page">
    <van-nav-bar title="测验结果" left-arrow @click-left="$router.back()" />
    <div v-if="result">
      <div class="score-card">
        <div class="score">{{ result.score }}</div>
        <div class="total">/ {{ result.totalScore }}</div>
        <van-tag :type="result.passed ? 'success' : 'danger'" size="large" style="margin-top: 8px">
          {{ result.passed ? '通过' : '未通过' }}
        </van-tag>
      </div>
      <div class="section-title">题目解析</div>
      <div v-for="(q, i) in result.detail" :key="q.questionId" class="q-card">
        <div class="q-stem">
          <strong>{{ i + 1 }}.</strong>
          <van-icon :name="q.isCorrect ? 'success' : 'cross'" :color="q.isCorrect ? '#07c160' : '#ee0a24'" />
          {{ q.stem }}
        </div>
        <div class="q-options">
          <div v-for="opt in q.options" :key="opt" class="q-option">{{ opt }}</div>
        </div>
        <div class="q-ans">
          <div>正确答案: <strong style="color: #07c160">{{ q.correctAnswer }}</strong></div>
          <div>你的答案: <strong :style="q.isCorrect ? 'color:#07c160' : 'color:#ee0a24'">{{ q.userAnswer || '未作答' }}</strong></div>
        </div>
        <div v-if="q.analysis" class="q-analysis">解析: {{ q.analysis }}</div>
      </div>
    </div>
    <van-loading v-else style="text-align: center; padding: 40px" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { quizApi } from '@/api';

const route = useRoute();
const result = ref<any>();

const load = async () => {
  try {
    result.value = await quizApi.result(Number(route.params.id));
  } catch {
    /* 忽略加载异常 */
  }
};

onMounted(load);
</script>

<style scoped>
.score-card {
  background: linear-gradient(135deg, #c0392b 0%, #8e1a1a 100%);
  color: #fff;
  text-align: center;
  padding: 24px;
}
.score {
  font-size: 56px;
  font-weight: bold;
  line-height: 1;
}
.total {
  font-size: 16px;
  opacity: 0.9;
}
.q-card {
  background: #fff;
  margin: 12px;
  padding: 12px;
  border-radius: 8px;
}
.q-stem {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.6;
}
.q-options {
  padding-left: 16px;
  font-size: 13px;
  color: #646566;
}
.q-option {
  padding: 2px 0;
}
.q-ans {
  margin-top: 8px;
  font-size: 13px;
  display: flex;
  gap: 16px;
}
.q-analysis {
  margin-top: 8px;
  padding: 8px;
  background: #f7f8fa;
  border-radius: 4px;
  font-size: 12px;
  color: #646566;
}
</style>
