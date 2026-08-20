<template>
  <div class="page">
    <!-- 沉浸式头部 -->
    <div class="hero">
      <div class="hero-bg"></div>
      <div class="hero-grain"></div>
      <div class="hero-glow"></div>
      <div class="hero-inner">
        <div class="hero-top">
          <div>
            <div class="hero-greet">你好，{{ userName || '同志' }}</div>
            <div class="hero-slogan">数智党校 · 学思践悟守初心</div>
          </div>
          <div class="hero-seal">学</div>
        </div>
        <div class="hero-tags">
          <span class="hero-tag">理论学习</span>
          <span class="hero-tag">智能推荐</span>
          <span class="hero-tag">以学促干</span>
        </div>
      </div>
      <div class="hero-wave"></div>
    </div>

    <!-- 知识图谱自适应路径 -->
    <div class="block path-block">
      <div class="block-head">
        <div class="head-left">
          <span class="head-dot"></span>
          <span class="block-title">我的学习路径</span>
        </div>
        <button class="path-more" @click="$router.push('/path')">查看完整路径 <van-icon name="arrow" /></button>
      </div>
      <div v-if="pathPreview.length" class="path-preview-list">
        <div v-for="item in pathPreview" :key="item.contentId" class="path-preview-item" @click="$router.push(`/content/${item.contentId}`)">
          <span class="path-order">{{ String(item.rank).padStart(2, '0') }}</span>
          <div class="path-copy"><b>{{ item.title }}</b><small>{{ item.nodeName }} · 掌握度 {{ Math.round(item.mastery * 100) }}%</small></div>
          <van-icon name="arrow" color="#b8aa98" />
        </div>
      </div>
      <div v-else class="rec-empty"><van-icon name="cluster-o" size="28" color="#d8d0c2" /><span>完成测验后生成个性化学习路径</span></div>
    </div>

    <!-- AI 推荐 -->
    <div class="block">
      <div class="block-head">
        <div class="head-left">
          <span class="head-dot"></span>
          <span class="block-title">AI 为你推荐</span>
        </div>
        <span class="block-sub">智能匹配</span>
      </div>
      <div v-if="recommendations.length" class="rec-scroll">
        <div
          v-for="r in recommendations"
          :key="r.contentId"
          class="rec-card"
          @click="$router.push(`/content/${r.contentId}`)"
        >
          <div class="rec-top">
            <span class="rec-cat">{{ r.category }}</span>
            <van-icon name="fire" color="#c9a961" size="14" />
          </div>
          <div class="rec-title">{{ r.title }}</div>
          <div class="rec-reason">{{ r.reason }}</div>
          <div class="rec-go">去学习 <van-icon name="arrow" size="12" /></div>
        </div>
      </div>
      <div v-else class="rec-empty">
        <van-icon name="chat-o" size="28" color="#d8d0c2" />
        <span>暂无推荐，多学习后为你智能推荐</span>
      </div>
    </div>

    <!-- 学习内容 -->
    <div class="block">
      <div class="block-head">
        <div class="head-left">
          <span class="head-dot gold"></span>
          <span class="block-title">学习内容</span>
        </div>
      </div>
      <van-tabs v-model:active="activeTab" shrink color="#8b1a1a" line-width="20" line-height="3" @change="loadContents">
        <van-tab title="全部" />
        <van-tab v-for="c in categories" :key="c" :title="c" />
      </van-tabs>

      <van-list
        v-model:loading="loading"
        :finished="finished"
        :immediate-check="false"
        finished-text="— 已经到底了 —"
        @load="loadMore"
      >
        <div
          v-for="c in contents"
          :key="c.id"
          class="c-card"
          @click="$router.push(`/content/${c.id}`)"
        >
          <div class="c-cover" :class="c.type === 'VIDEO' ? 'is-video' : 'is-article'">
            <van-icon :name="c.type === 'VIDEO' ? 'video-o' : 'description'" size="24" color="#fff" />
          </div>
          <div class="c-body">
            <div class="c-title">{{ c.title }}</div>
            <div class="c-meta">
              <span class="c-type" :class="c.type === 'VIDEO' ? 'is-video' : 'is-article'">
                {{ c.type === 'VIDEO' ? '视频' : '文章' }}
              </span>
              <span class="c-cat">{{ c.category }}</span>
              <span v-for="t in c.tags" :key="t" class="c-tag">{{ t }}</span>
            </div>
          </div>
          <van-icon name="arrow" color="#c8c0b0" size="14" />
        </div>
        <van-empty v-if="!loading && contents.length === 0" description="该分类暂无内容" image-size="90" />
      </van-list>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { contentApi, aiApi, learningPathApi } from '@/api';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
const userName = computed(() => (auth.user as any)?.name || (auth.user as any)?.username || '');

const activeTab = ref(0);
const categories = ref<string[]>([]);
const contents = ref<any[]>([]);
const loading = ref(false);
const finished = ref(false);
const requesting = ref(false);
const page = ref(1);
const pageSize = 20;
const recommendations = ref<any[]>([]);
const pathPreview = ref<any[]>([]);

const loadCategories = async () => {
  categories.value = await contentApi.categories();
};

const loadContents = async () => {
  contents.value = [];
  page.value = 1;
  finished.value = false;
  requesting.value = false;
  await loadMore();
};

const loadMore = async () => {
  if (finished.value || requesting.value) return;
  requesting.value = true;
  try {
    const category = activeTab.value === 0 ? undefined : categories.value[activeTab.value - 1];
    const res: any = await contentApi.visible({ page: page.value, pageSize, category });
    contents.value.push(...res.list);
    if (res.list.length < pageSize) finished.value = true;
    else page.value++;
  } catch {
    // 忽略加载异常，避免死循环
  } finally {
    loading.value = false;
    requesting.value = false;
  }
};

// AI 推荐：加 5s 客户端超时，避免 DeepSeek 未配置/超时拖垮首页（降级为空推荐，不阻塞其它内容）
const loadRecommend = async () => {
  try {
    const data = await Promise.race([
      aiApi.recommend(),
      new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 5000)),
    ]);
    recommendations.value = data ?? [];
  } catch {
    recommendations.value = [];
  }
};

const loadPathPreview = async () => {
  try {
    const result = await learningPathApi.mine(3);
    pathPreview.value = result.items.slice(0, 3);
  } catch {
    pathPreview.value = [];
  }
};

const loadAll = async () => {
  // 首页数据并发加载：用户信息/分类/内容列表/AI 推荐互不影响，谁先回来谁先渲染
  const tasks: Promise<unknown>[] = [];
  if (auth.isLoggedIn && !auth.user) tasks.push(auth.fetchMe());
  tasks.push(loadCategories());
  tasks.push(loadContents()); // 默认 tab=全部，无需等分类返回
  tasks.push(loadRecommend());
  tasks.push(loadPathPreview());
  await Promise.allSettled(tasks);
};

// 首页由 keep-alive 保留；仅首次挂载加载，切换 Tab 时不重复触发 AI 推荐。
onMounted(loadAll);
</script>

<style scoped>
/* ============ 头部 ============ */
.hero {
  position: relative;
  overflow: hidden;
  padding: 28px 20px 40px;
  color: #fff;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(150deg, #8b1a1a 0%, #6e1414 60%, #4a0b0b 100%);
}
.hero-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.16;
  mix-blend-mode: overlay;
}
.hero-glow {
  position: absolute;
  top: -50px;
  right: -40px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.26), transparent 70%);
}
.hero-inner {
  position: relative;
  z-index: 1;
  animation: ps-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.hero-greet {
  font-family: var(--ps-font-serif);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1px;
}
.hero-slogan {
  margin-top: 6px;
  font-size: 12.5px;
  opacity: 0.86;
  letter-spacing: 0.5px;
}
.hero-seal {
  width: 44px;
  height: 44px;
  border-radius: 9px;
  background: linear-gradient(135deg, #d8b873, #a8893e);
  color: #4a0b0b;
  font-family: var(--ps-font-serif);
  font-weight: 900;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.26), inset 0 0 0 1.5px rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}
.hero-tags {
  margin-top: 18px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hero-tag {
  font-size: 11px;
  padding: 3px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(201, 169, 97, 0.35);
  color: #f7e3b0;
  letter-spacing: 0.5px;
}
.hero-wave {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 18px;
  background: var(--ps-bg);
  border-radius: 18px 18px 0 0;
}

/* ============ 区块 ============ */
.block {
  margin: 14px 14px 0;
  background: var(--ps-surface);
  border-radius: 14px;
  padding: 14px 0 6px;
  box-shadow: var(--ps-shadow-sm);
  border: 1px solid var(--ps-line-soft);
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 12px;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.head-dot {
  width: 6px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--ps-red), var(--ps-gold));
}
.head-dot.gold {
  background: linear-gradient(180deg, var(--ps-gold), var(--ps-gold-deep));
}
.block-title {
  font-family: var(--ps-font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--ps-ink);
  letter-spacing: 0.5px;
}
.block-sub {
  font-size: 10.5px;
  color: var(--ps-red);
  background: var(--ps-red-soft);
  padding: 2px 9px;
  border-radius: 999px;
  font-weight: 500;
}

/* 知识路径：以编号轴体现先修顺序 */
.path-block { padding-bottom: 10px; }
.path-more { border: 0; background: transparent; color: var(--ps-red); font-size: 10.5px; padding: 4px 0; }
.path-preview-list { padding: 0 16px 4px; }
.path-preview-item { display: flex; align-items: center; gap: 11px; padding: 11px 0; border-bottom: 1px dashed var(--ps-line); }
.path-preview-item:last-child { border-bottom: none; }
.path-order { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 50%; display: grid; place-items: center; background: var(--ps-red); color: #f2dba8; font: 700 10px Georgia, serif; box-shadow: 0 0 0 4px var(--ps-red-soft); }
.path-copy { min-width: 0; flex: 1; }
.path-copy b { display: block; color: var(--ps-ink); font-family: var(--ps-font-serif); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.path-copy small { display: block; margin-top: 4px; color: var(--ps-muted); font-size: 10px; }

/* AI 推荐 */
.rec-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 0 16px 14px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.rec-scroll::-webkit-scrollbar {
  display: none;
}
.rec-card {
  flex: 0 0 190px;
  scroll-snap-align: start;
  background: linear-gradient(180deg, #fdf8ef 0%, #fff 60%);
  border: 1px solid var(--ps-gold-light);
  border-radius: 12px;
  padding: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.25s ease;
}
.rec-card:active {
  transform: scale(0.97);
}
.rec-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rec-cat {
  font-size: 10.5px;
  color: var(--ps-gold-deep);
  background: var(--ps-gold-light);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.rec-title {
  font-family: var(--ps-font-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--ps-ink);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 38px;
}
.rec-reason {
  font-size: 11.5px;
  color: var(--ps-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.rec-go {
  margin-top: auto;
  font-size: 11.5px;
  color: var(--ps-red);
  display: flex;
  align-items: center;
  gap: 2px;
  font-weight: 500;
}
.rec-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 22px 0 18px;
  font-size: 12.5px;
  color: #c8c0b0;
}

/* 内容列表 */
.block :deep(.van-tabs) {
  margin: 0 16px;
}
.c-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 16px;
  padding: 13px 4px;
  border-bottom: 1px solid var(--ps-line-soft);
  transition: background 0.2s ease;
}
.c-card:active {
  background: var(--ps-red-soft);
}
.c-card:last-child {
  border-bottom: none;
}
.c-cover {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.c-cover.is-video {
  background: linear-gradient(135deg, #b22222, #8b1a1a);
  box-shadow: 0 4px 10px rgba(139, 26, 26, 0.22);
}
.c-cover.is-article {
  background: linear-gradient(135deg, #c9a961, #a8893e);
  box-shadow: 0 4px 10px rgba(168, 137, 62, 0.22);
}
.c-body {
  flex: 1;
  min-width: 0;
}
.c-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ps-ink);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.c-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.c-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-weight: 500;
}
.c-type.is-video {
  background: var(--ps-red);
}
.c-type.is-article {
  background: var(--ps-gold-deep);
}
.c-cat {
  font-size: 10.5px;
  color: var(--ps-ink-soft);
  background: var(--ps-line-soft);
  padding: 1px 7px;
  border-radius: 4px;
}
.c-tag {
  font-size: 10.5px;
  color: var(--ps-muted);
  padding: 1px 6px;
  border: 1px solid var(--ps-line);
  border-radius: 4px;
}
</style>
