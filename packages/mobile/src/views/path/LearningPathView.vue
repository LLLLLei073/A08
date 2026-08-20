<template>
  <div class="path-page">
    <van-nav-bar title="我的学习路径" left-arrow fixed placeholder @click-left="$router.back()" />

    <section class="path-hero">
      <div class="hero-grid"></div>
      <span class="hero-kicker">GRAPH × BKT · {{ result?.algorithmVersion || 'graph-bkt-v1' }}</span>
      <div class="hero-main">
        <div><strong>{{ averageMastery }}<small>%</small></strong><span>综合掌握度</span></div>
        <div class="hero-seal">径</div>
      </div>
      <div class="hero-meta"><span>{{ weakCount }} 个薄弱知识点</span><span>图谱 V{{ result?.graphVersion || 1 }}</span><span>{{ result?.items.length || 0 }} 步建议</span></div>
    </section>

    <section class="path-section">
      <div class="section-title-row"><div><span>今日学习路线</span><small>先修优先 · 动态调整</small></div><button :disabled="refreshing" @click="refreshPath"><van-icon name="replay" /> {{ refreshing ? '生成中' : '重新规划' }}</button></div>
      <div v-if="loading" class="skeleton-wrap"><van-skeleton v-for="i in 3" :key="i" title :row="2" /></div>
      <div v-else-if="result?.items.length" class="journey">
        <article v-for="item in result.items" :key="`${item.rank}-${item.contentId}`" class="journey-card" @click="$router.push(`/content/${item.contentId}`)">
          <div class="rail"><span>{{ String(item.rank).padStart(2, '0') }}</span><i></i></div>
          <div class="card-body">
            <div class="card-flags"><span class="node-tag">{{ item.nodeName }}</span><span :class="['status', item.status.toLowerCase()]">{{ statusText(item.status) }}</span></div>
            <h2>{{ item.title }}</h2>
            <p>{{ item.reason }}</p>
            <div class="score-row"><span>掌握度 {{ percent(item.mastery) }}</span><span>路径匹配 {{ percent(item.score) }}</span><span>难度 {{ item.difficulty }}/5</span></div>
            <div class="score-bar"><i :style="{ width: `${Math.round(item.score * 100)}%` }"></i></div>
          </div>
        </article>
      </div>
      <van-empty v-else description="暂无可生成的学习路径" />
      <div v-if="result?.fallback" class="fallback-note"><van-icon name="info-o" /> 当前图谱尚未覆盖可见内容，已为你展示必修或公开课程。</div>
    </section>

    <section v-if="result?.masterySummary.length" class="mastery-section">
      <div class="section-title-row"><div><span>知识掌握画像</span><small>由答题证据更新，不以浏览时长代替掌握度</small></div></div>
      <div class="mastery-grid">
        <div v-for="state in result.masterySummary" :key="state.nodeId" class="mastery-cell">
          <div><b>{{ state.name }}</b><span>{{ percent(state.mastery) }}</span></div>
          <div class="mastery-bar"><i :class="{ strong: state.mastery >= .65 }" :style="{ width: `${Math.round(state.mastery * 100)}%` }"></i></div>
          <small>{{ state.attempts ? `${state.attempts} 次答题证据` : '采用初始掌握度' }}</small>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import type { LearningPathResultDto } from '@ai-party-school/shared';
import { learningPathApi } from '@/api';

const result = ref<LearningPathResultDto>();
const loading = ref(true);
const refreshing = ref(false);
const averageMastery = computed(() => result.value?.masterySummary.length ? Math.round(result.value.masterySummary.reduce((sum, state) => sum + state.mastery, 0) / result.value.masterySummary.length * 100) : 0);
const weakCount = computed(() => result.value?.masterySummary.filter((state) => state.mastery < .65).length ?? 0);
const percent = (value: number) => `${Math.round(value * 100)}%`;
const statusText = (status: string) => ({ PENDING: '待学习', IN_PROGRESS: '进行中', COMPLETED: '复习' }[status] || status);
const loadPath = async () => { loading.value = true; try { result.value = await learningPathApi.mine(5); } finally { loading.value = false; } };
const refreshPath = async () => { refreshing.value = true; try { result.value = await learningPathApi.refresh(5); showToast('路径已根据最新掌握度更新'); } finally { refreshing.value = false; } };
onMounted(loadPath);
</script>

<style scoped>
.path-page{min-height:100vh;padding-bottom:30px;background:#f7f1e7}.path-hero{position:relative;overflow:hidden;margin:14px;border-radius:18px;padding:22px 20px;color:#fff;background:linear-gradient(145deg,#7f1616 0%,#4c0b0b 100%);box-shadow:0 16px 34px rgba(85,13,13,.22)}.hero-grid{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(239,216,171,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(239,216,171,.35) 1px,transparent 1px);background-size:28px 28px;transform:perspective(260px) rotateX(56deg) scale(1.4);transform-origin:center bottom}.hero-kicker{position:relative;font-size:9px;letter-spacing:2px;color:#e8c77f}.hero-main{position:relative;display:flex;align-items:center;justify-content:space-between;margin-top:12px}.hero-main strong{display:block;font:700 48px/1 Georgia,serif;color:#f4deb0}.hero-main strong small{font-size:18px}.hero-main span{display:block;margin-top:4px;font-size:12px;opacity:.74}.hero-seal{width:54px;height:54px;border:1px solid rgba(244,222,176,.58);display:grid;place-items:center;font:700 28px var(--ps-font-serif);transform:rotate(3deg);box-shadow:inset 0 0 0 4px rgba(244,222,176,.1)}.hero-meta{position:relative;display:flex;gap:8px;margin-top:17px}.hero-meta span{padding:4px 8px;border:1px solid rgba(255,255,255,.16);border-radius:999px;font-size:10px;color:#f3dfb7;background:rgba(255,255,255,.06)}.path-section,.mastery-section{margin:14px;background:#fff;border:1px solid #eadfce;border-radius:18px;padding:18px 16px;box-shadow:0 7px 20px rgba(87,47,22,.05)}.section-title-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}.section-title-row span{display:block;font:700 17px var(--ps-font-serif);letter-spacing:.5px}.section-title-row small{display:block;margin-top:4px;font-size:10px;color:#9a8e7d}.section-title-row button{border:0;background:#f8ede4;color:#8b1a1a;border-radius:999px;padding:7px 10px;font-size:11px}.skeleton-wrap{display:grid;gap:20px}.journey-card{display:grid;grid-template-columns:43px 1fr;gap:9px;min-height:150px}.journey-card:last-child{min-height:auto}.rail{display:flex;flex-direction:column;align-items:center}.rail span{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#7c1515;color:#efd59e;font:700 12px Georgia;box-shadow:0 0 0 5px #f8eee2}.rail i{width:1px;flex:1;margin:8px 0;background:linear-gradient(#c9a961,#e9ddcb)}.journey-card:last-child .rail i{display:none}.card-body{padding:0 0 23px;border-bottom:1px dashed #e8ddce}.journey-card:last-child .card-body{border:0;padding-bottom:0}.card-flags{display:flex;justify-content:space-between;align-items:center}.node-tag{font-size:10px;color:#a0793f;letter-spacing:.5px}.status{font-size:9px;padding:2px 7px;border-radius:999px;background:#f3eee6;color:#766b5d}.status.in_progress{background:#fff0d7;color:#a56508}.status.completed{background:#eaf4ea;color:#4a7b4a}.card-body h2{margin:7px 0 6px;font:600 15px/1.45 var(--ps-font-serif);color:#2a201b}.card-body p{margin:0;color:#7e7468;font-size:11px;line-height:1.6}.score-row{display:flex;gap:10px;margin-top:11px;color:#9b8d7c;font-size:9px}.score-bar,.mastery-bar{height:3px;background:#eee5d8;border-radius:10px;margin-top:7px;overflow:hidden}.score-bar i{display:block;height:100%;background:linear-gradient(90deg,#8b1a1a,#c9a961)}.fallback-note{margin-top:12px;padding:10px;border-radius:9px;background:#faf3e9;color:#9a7144;font-size:10px;line-height:1.5}.mastery-grid{display:grid;gap:14px}.mastery-cell>div:first-child{display:flex;justify-content:space-between;align-items:center}.mastery-cell b{font-size:12px}.mastery-cell span{font:700 11px Georgia;color:#8b1a1a}.mastery-cell small{display:block;margin-top:5px;color:#aaa095;font-size:9px}.mastery-bar{height:5px}.mastery-bar i{display:block;height:100%;background:#b98055}.mastery-bar i.strong{background:#8a9e65}
</style>
