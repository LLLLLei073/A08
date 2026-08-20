<template>
  <div class="page take-quiz">
    <van-nav-bar title="测验作答" left-arrow fixed safe-area-inset-top @click-left="$router.back()" />
    <div v-if="quiz" class="quiz-body">
      <van-notice-bar :scrollable="false">
        剩余时间：<van-count-down :time="remainMs" format="mm:ss" @finish="onTimeUp" />
        · 共 {{ quiz.questions.length }} 题
      </van-notice-bar>

      <div v-for="(q, i) in quiz.questions" :key="q.questionId" class="question-card">
        <div class="q-stem">
          <strong>{{ i + 1 }}.</strong> [{{ typeLabel(q.type) }}] {{ q.stem }}
        </div>
        <van-radio-group v-if="q.type === 'SINGLE'" v-model="answers[q.questionId]">
          <van-cell
            v-for="(opt, idx) in q.options"
            :key="idx"
            clickable
            @click="answers[q.questionId] = optionLetter(idx)"
          >
            <template #title>
              <van-radio :name="optionLetter(idx)">{{ opt }}</van-radio>
            </template>
          </van-cell>
        </van-radio-group>
        <van-checkbox-group v-else-if="q.type === 'MULTIPLE'" v-model="multipleAnswers[q.questionId]">
          <van-cell
            v-for="(opt, idx) in q.options"
            :key="idx"
            clickable
            @click="checkboxRefs[q.questionId + '-' + idx]?.toggle()"
          >
            <template #title>
              <van-checkbox :name="optionLetter(idx)" :ref="el => setCheckboxRef(q.questionId, idx, el)" @click.stop>{{ opt }}</van-checkbox>
            </template>
          </van-cell>
        </van-checkbox-group>
        <van-radio-group v-else v-model="answers[q.questionId]">
          <van-cell clickable @click="answers[q.questionId] = 'true'">
            <template #title><van-radio name="true">{{ q.options[0] }}</van-radio></template>
          </van-cell>
          <van-cell clickable @click="answers[q.questionId] = 'false'">
            <template #title><van-radio name="false">{{ q.options[1] }}</van-radio></template>
          </van-cell>
        </van-radio-group>
      </div>

      <div style="padding: 16px">
        <van-button type="primary" block round :loading="submitting" @click="submit" color="#c0392b">
          提交测验
        </van-button>
      </div>
    </div>
    <van-loading v-else style="text-align: center; padding: 40px" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { quizApi } from '@/api';

const route = useRoute();
const router = useRouter();
const quiz = ref<any>();
const answers = reactive<Record<number, string>>({});
const multipleAnswers = reactive<Record<number, string[]>>({});
const submitting = ref(false);
const checkboxRefs = reactive<Record<string, any>>({});

// 剩余时间由服务端基于持久化的个人开始时间计算，刷新页面不会重置倒计时。
const remainMs = ref(0);

const optionLetter = (idx: number) => String.fromCharCode(65 + idx);
const typeLabel = (t: string) => ({ SINGLE: '单选', MULTIPLE: '多选', JUDGE: '判断' } as any)[t] ?? t;

const setCheckboxRef = (qid: number, idx: number, el: any) => {
  checkboxRefs[`${qid}-${idx}`] = el;
};

const load = async () => {
  const id = Number(route.params.id);
  try {
    quiz.value = await quizApi.start(id);
  } catch (e: any) {
    showToast(e?.message || '加载测验失败');
    router.back();
    return;
  }
  remainMs.value = Math.max(0, Number(quiz.value.remainingSeconds ?? 0) * 1000);
  if (remainMs.value <= 0) {
    showToast('该测验未设置时长，请联系管理员设置试卷做题时长');
  }
  quiz.value.questions.forEach((q: any) => {
    if (q.type === 'MULTIPLE') multipleAnswers[q.questionId] = [];
    else answers[q.questionId] = '';
  });
};

const submit = async () => {
  if (submitting.value) return;
  const finalAnswers: Record<number, string> = {};
  quiz.value.questions.forEach((q: any) => {
    if (q.type === 'MULTIPLE') {
      finalAnswers[q.questionId] = (multipleAnswers[q.questionId] ?? []).sort().join('');
    } else {
      finalAnswers[q.questionId] = answers[q.questionId] ?? '';
    }
  });

  const unanswered = Object.values(finalAnswers).filter((v) => !v).length;
  if (unanswered > 0) {
    try {
      await showConfirmDialog({
        title: '提示',
        message: `还有 ${unanswered} 题未作答，确认提交？`,
      });
    } catch {
      return;
    }
  }

  submitting.value = true;
  try {
    const res: any = await quizApi.submit(Number(route.params.id), finalAnswers);
    showToast(`得分: ${res.score}/${res.totalScore} ${res.passed ? '通过' : '未通过'}`);
    router.replace(`/quiz/result/${route.params.id}`);
  } catch {
  } finally {
    submitting.value = false;
  }
};

const onTimeUp = () => {
  showToast('时间到，自动提交');
  submit();
};

onMounted(load);
</script>

<style scoped>
.take-quiz {
  padding-top: var(--van-nav-bar-height);
  padding-top: calc(var(--van-nav-bar-height) + env(safe-area-inset-top));
}
.question-card {
  background: #fff;
  margin: 12px;
  padding: 12px;
  border-radius: 8px;
}
.q-stem {
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1.6;
}
</style>
