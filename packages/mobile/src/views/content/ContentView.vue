<template>
  <div class="page">
    <van-nav-bar title="学习内容" left-arrow @click-left="$router.back()" fixed placeholder />
    <div v-if="content">
      <!-- 沉浸式头部 -->
      <div class="hero">
        <div class="hero-bg"></div>
        <div class="hero-inner">
          <div class="hero-badges">
            <span class="badge type-badge" :class="content.type === 'VIDEO' ? 'is-video' : 'is-article'">
              {{ content.type === 'VIDEO' ? '视频' : '文章' }}
            </span>
            <span class="badge cat-badge">{{ content.category }}</span>
            <span v-for="t in content.tags" :key="t" class="badge tag-badge">{{ t }}</span>
          </div>
          <h1 class="hero-title">{{ content.title }}</h1>
          <div class="hero-meta">
            <template v-if="content.type === 'ARTICLE'">
              <span>约 {{ wordCount }} 字</span>
              <span class="dot">·</span>
              <span>预计阅读 {{ formatDuration(needReadTime) }}</span>
            </template>
            <template v-else>
              <span v-if="videoDuration">时长 {{ formatDuration(videoDuration) }}</span>
              <span v-else-if="content.duration">时长 {{ formatDuration(content.duration) }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 视频 -->
      <div v-if="content.type === 'VIDEO' && content.mediaUrl" class="video-wrap">
        <video
          :src="content.mediaUrl"
          controls
          class="video-player"
          playsinline
          webkit-playsinline
          @timeupdate="onVideoTime"
          @loadedmetadata="onVideoMeta"
        ></video>
      </div>

      <!-- 文章正文 -->
      <div v-if="content.type === 'ARTICLE' && content.body" class="article-body">
        <MdPreview
          :modelValue="content.body"
          code-theme="atom"
          :no-iconfont="true"
          :no-katex="true"
          :no-mermaid="true"
        />
      </div>

      <!-- 学习进度操作卡 -->
      <div class="action-card">
        <div class="action-row">
          <div class="action-label">
            <van-icon name="bookmark-o" /> 学习进度
          </div>
          <div class="action-pct">{{ progress }}%</div>
        </div>
        <van-progress :percentage="progress" color="#c0392b" :show-pivot="false" stroke-width="6" />
        <div class="action-status">
          <span v-if="!canComplete && content.type === 'ARTICLE'">
            <van-icon name="clock-o" /> 已阅读 {{ readSeconds }}s / {{ needReadTime }}s
          </span>
          <span v-else-if="content.type === 'ARTICLE'" style="color: #07c160">
            <van-icon name="passed" /> 已满足最短阅读时长
          </span>
          <span v-else-if="content.type === 'VIDEO'">
            <van-icon name="play-circle-o" /> 观看进度 {{ progress }}%
          </span>
        </div>
        <van-button
          block
          round
          :disabled="!canComplete"
          @click="markComplete"
          color="linear-gradient(135deg, #c0392b, #9c1f12)"
        >
          {{ progress >= 100 ? '已完成学习' : (canComplete ? '标记完成' : (content.type === 'VIDEO' ? '需看完视频' : '阅读时长不足')) }}
        </van-button>
      </div>
    </div>
    <van-loading v-else style="text-align: center; padding: 40px" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import 'md-editor-v3/lib/preview.css';
import { contentApi } from '@/api';

// 文章「预览」运行时（md-editor-v3 预览，约 129KB gz）改为动态加载：
// 仅当打开「文章正文」详情时才拉取，视频内容 / 列表页不加载该 chunk。
const MdPreview = defineAsyncComponent(async () => {
  const [m, hljs, atomCss, screenfull] = await Promise.all([
    import('md-editor-v3'),
    import('highlight.js/lib/common'),
    import('highlight.js/styles/atom-one-dark.css?url'),
    import('screenfull'),
  ]);
  m.config({
    editorExtensions: {
      highlight: {
        instance: hljs.default,
        css: { atom: { light: atomCss.default, dark: atomCss.default } },
      },
      screenfull: { instance: screenfull.default },
    },
    // 安全：禁用 Markdown 中的原始 HTML 标签，防止存储型 XSS
    markdownItConfig(md) {
      md.set({ html: false });
    },
  });
  return m.MdPreview;
});

const route = useRoute();
const router = useRouter();
const content = ref<any>();
const progress = ref(0);
const lastReport = ref(0);

// 当前学习内容的 id（在 load 时缓存，避免路由切换后 route.params.id 变 undefined）
// 修复：onUnmounted 触发 reportProgress 时，route 可能已切到新页面（如 /quiz），
// 此时 route.params.id 为 undefined → Number(undefined) = NaN → 请求 /api/contents/NaN/record → 400
const contentId = ref<number>(0);

// 阅读速度：约 5 字/秒（300 字/分钟），最短阅读时长与字数正比
const READ_SPEED = 5;
const MIN_READ_SECONDS = 20;
const wordCount = ref(0);
const needReadTime = ref(MIN_READ_SECONDS);
const readSeconds = ref(0);
let readTimer: ReturnType<typeof setInterval> | null = null;

// 视频真实时长（秒）
const videoDuration = ref(0);
let lastVideoTime = 0;

const formatDuration = (sec: number) => {
  const s = Math.round(sec || 0);
  if (!s) return '0 秒';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} 分 ${r} 秒` : `${r} 秒`;
};

const countWords = (body: string): number => {
  const plain = (body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_~`\-+|=]/g, ' ')
    .replace(/\s/g, '');
  return plain.length;
};

const canComplete = computed(() => {
  if (!content.value) return false;
  if (progress.value >= 100) return true;
  if (content.value.type === 'VIDEO') return false;
  return readSeconds.value >= needReadTime.value;
});

const load = async () => {
  const id = Number(route.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    showToast('内容 ID 无效');
    return;
  }
  contentId.value = id;
  content.value = await contentApi.detail(id);

  if (content.value.type === 'ARTICLE') {
    const words = countWords(content.value.body ?? '');
    wordCount.value = words;
    needReadTime.value = Math.max(MIN_READ_SECONDS, Math.ceil(words / READ_SPEED));
  } else {
    needReadTime.value = 0;
  }

  try {
    const rec: any = await contentApi.myRecord(id);
    if (rec) {
      progress.value = rec.progress ?? 0;
      readSeconds.value = content.value.type === 'ARTICLE'
        ? Math.min(rec.duration ?? 0, needReadTime.value)
        : Math.max(0, rec.duration ?? 0);
    }
  } catch {}

  if (content.value.type === 'ARTICLE' && progress.value < 100) {
    startReadTimer();
  }
};

const startReadTimer = () => {
  if (readTimer) clearInterval(readTimer);
  readTimer = setInterval(() => {
    readSeconds.value += 1;
    const now = Date.now();
    if (now - lastReport.value > 5000) {
      lastReport.value = now;
      reportProgress(
        Math.max(progress.value, Math.min(99, Math.round((readSeconds.value / needReadTime.value) * 100))),
        readSeconds.value,
      );
    }
  }, 1000);
};

const stopTimerAndReport = () => {
  if (readTimer) {
    clearInterval(readTimer);
    readTimer = null;
  }
  // 仅在还有有效内容 id 且进度未完成时才补报一次进度，
  // 且用闭包内缓存的 id，避免 route 已切走后拿到 undefined → NaN
  if (contentId.value > 0 && content.value && progress.value < 100) {
    reportProgress(progress.value, readSeconds.value);
  }
};

const onVideoMeta = (e: any) => {
  videoDuration.value = Number(e.target.duration) || 0;
  lastVideoTime = Number(e.target.currentTime) || 0;
};

const onVideoTime = (e: any) => {
  const v = e.target;
  const total = v.duration || videoDuration.value || 0;
  const current = Number(v.currentTime) || 0;
  const watchedDelta = current - lastVideoTime;
  // 浏览器 timeupdate 正常间隔很短；忽略跳播/回退造成的大幅 currentTime 变化。
  if (watchedDelta > 0 && watchedDelta <= 3) readSeconds.value += watchedDelta;
  lastVideoTime = current;
  const p = total ? Math.round((v.currentTime / total) * 100) : 0;
  progress.value = Math.max(progress.value, p);
  const now = Date.now();
  if (now - lastReport.value > 5000) {
    lastReport.value = now;
    reportProgress(p, readSeconds.value);
  }
};

const reportProgress = async (p: number, seconds: number) => {
  // 用缓存的 contentId，不依赖 route.params.id（路由切换后 params 可能已变）
  const id = contentId.value;
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    await contentApi.record(id, {
      duration: Math.round(seconds),
      progress: p,
      completed: p >= 100,
    });
  } catch {}
};

const markComplete = async () => {
  if (!canComplete.value) {
    if (content.value?.type === 'ARTICLE') {
      showToast(`请继续阅读 ${needReadTime.value - readSeconds.value} 秒`);
    }
    return;
  }
  progress.value = 100;
  await reportProgress(100, Math.max(readSeconds.value, videoDuration.value));
  showToast('已标记完成');
};

onMounted(load);
onActivated(() => {
  // keep-alive 重新激活时，若定时器已停且文章未完成，则恢复计时
  if (!readTimer && content.value?.type === 'ARTICLE' && progress.value < 100) {
    startReadTimer();
  }
});
onDeactivated(stopTimerAndReport);
onUnmounted(stopTimerAndReport);
</script>

<style scoped>
/* 沉浸式头部 */
.hero {
  position: relative;
  overflow: hidden;
  color: #fff;
  padding: 20px 18px 26px;
}
.hero-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #c0392b 0%, #9c1f12 100%);
}
.hero-bg::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -50px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.hero-inner {
  position: relative;
  z-index: 1;
}
.hero-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.badge {
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 999px;
}
.type-badge.is-video {
  background: rgba(255, 255, 255, 0.95);
  color: #c0392b;
}
.type-badge.is-article {
  background: rgba(255, 255, 255, 0.95);
  color: #b8860b;
}
.cat-badge {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.tag-badge {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.hero-title {
  margin: 12px 0 10px;
  font-size: 21px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.5px;
}
.hero-meta {
  font-size: 12px;
  opacity: 0.92;
  display: flex;
  align-items: center;
  gap: 6px;
}
.hero-meta .dot {
  opacity: 0.6;
}

/* 视频播放器 */
.video-wrap {
  margin: 14px 12px 0;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.video-player {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  background: #000;
}

/* 文章正文 */
.article-body {
  background: #fff;
  margin: 14px 12px 0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.article-body :deep(.md-editor) {
  border: none;
  border-radius: 12px;
  box-shadow: none;
}
.article-body :deep(.md-editor-preview) {
  padding: 14px 16px 18px;
  font-size: 15px;
  line-height: 1.85;
  color: #2c3e50;
  width: 100%;
  overflow-wrap: break-word;
  word-break: break-word;
}
.article-body :deep(.md-editor-preview) h1,
.article-body :deep(.md-editor-preview) h2,
.article-body :deep(.md-editor-preview) h3,
.article-body :deep(.md-editor-preview) h4 {
  margin: 22px 0 10px;
  font-weight: 600;
  line-height: 1.4;
  color: #1a1a1a;
}
.article-body :deep(.md-editor-preview) h1 { font-size: 20px; }
.article-body :deep(.md-editor-preview) h2 { font-size: 18px; }
.article-body :deep(.md-editor-preview) h3 { font-size: 16px; }
.article-body :deep(.md-editor-preview) p {
  margin: 12px 0;
}
.article-body :deep(.md-editor-preview) img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  margin: 10px 0;
}
.article-body :deep(.md-editor-preview) a {
  color: #c0392b;
  word-break: break-all;
}
.article-body :deep(.md-editor-preview) blockquote {
  margin: 14px 0;
  padding: 10px 14px;
  border-left: 4px solid #c0392b;
  background: #fdf3f1;
  color: #7f8c8d;
  border-radius: 0 6px 6px 0;
}
.article-body :deep(.md-editor-preview) pre {
  max-width: 100%;
  overflow-x: auto;
  background: #f6f8fa;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
}
.article-body :deep(.md-editor-preview) code {
  background: #f6f8fa;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 13px;
  word-break: break-all;
}
.article-body :deep(.md-editor-preview) pre code {
  padding: 0;
  background: transparent;
}
.article-body :deep(.md-editor-preview) table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  display: block;
  overflow-x: auto;
}
.article-body :deep(.md-editor-preview) th,
.article-body :deep(.md-editor-preview) td {
  border: 1px solid #ebedf0;
  padding: 6px 10px;
  text-align: left;
}
.article-body :deep(.md-editor-preview) ul,
.article-body :deep(.md-editor-preview) ol {
  padding-left: 22px;
}
.article-body :deep(.md-editor-preview) li {
  margin: 4px 0;
}

/* 进度操作卡 */
.action-card {
  margin: 14px 12px 20px;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.action-label {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 4px;
}
.action-pct {
  font-size: 16px;
  font-weight: 600;
  color: #c0392b;
}
.action-status {
  margin: 10px 0 14px;
  font-size: 12px;
  color: #969799;
  min-height: 18px;
}
</style>
