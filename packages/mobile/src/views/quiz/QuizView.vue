<template>
  <div class="page">
    <van-nav-bar title="测验与考试" />
    <van-empty v-if="quizzes.length === 0" description="暂无测验" />
    <van-cell-group v-else inset style="margin-top: 12px">
      <van-cell
        v-for="q in quizzes"
        :key="q.id"
        :title="q.title"
        :label="`${q.type === 'EXAM' ? '正式考试' : '练习测验'} · ${q.questionCount} 题 · 时长 ${q.duration} 分钟`"
        is-link
        @click="onTap(q)"
      >
        <template #value>
          <van-tag v-if="q.submitted" type="success">{{ q.score }}分</van-tag>
          <van-tag v-else-if="q.status === 'in_progress'" type="primary">进行中</van-tag>
          <van-tag v-else-if="q.status === 'not_started'" plain>未开始</van-tag>
          <van-tag v-else type="danger">已结束</van-tag>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { quizApi } from '@/api';

const router = useRouter();
const quizzes = ref<any[]>([]);

const load = async () => {
  try {
    quizzes.value = await quizApi.my();
  } catch {
    /* 忽略加载异常 */
  }
};

const onTap = (q: any) => {
  if (q.submitted) {
    router.push(`/quiz/result/${q.id}`);
  } else if (q.status === 'in_progress') {
    if (q.type === 'EXAM' && !q.started) {
      showConfirmDialog({
        title: '正式考试',
        message: '正式考试只能提交一次，确认开始？',
      }).then(() => router.push(`/quiz/take/${q.id}`));
    } else {
      router.push(`/quiz/take/${q.id}`);
    }
  } else if (q.status === 'not_started') {
    showToast('测验尚未开始');
  } else {
    showToast('测验已结束');
  }
};

onMounted(load);
</script>
