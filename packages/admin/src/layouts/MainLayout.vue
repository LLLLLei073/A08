<template>
  <el-container class="main-layout">
    <el-aside width="232px" class="sidebar">
      <div class="sidebar-grain"></div>
      <div class="sidebar-glow"></div>

      <!-- 印章式 Logo -->
      <div class="logo">
        <div class="logo-seal">党</div>
        <div class="logo-text">
          <span class="logo-title">数智党校</span>
          <span class="logo-sub">DIGITAL PARTY SCHOOL</span>
        </div>
      </div>

      <div class="nav-label">管理导航</div>
      <el-menu
        :default-active="route.path"
        router
        class="side-menu"
        background-color="transparent"
        text-color="rgba(255, 244, 234, 0.78)"
        active-text-color="#f7e3b0"
      >
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon><span>工作台</span></el-menu-item>
        <el-menu-item index="/org"><el-icon><Share /></el-icon><span>组织架构</span></el-menu-item>
        <el-menu-item index="/user"><el-icon><User /></el-icon><span>人员管理</span></el-menu-item>
        <el-menu-item index="/content"><el-icon><Document /></el-icon><span>学习内容</span></el-menu-item>
        <el-menu-item index="/task"><el-icon><Tickets /></el-icon><span>学习任务</span></el-menu-item>
        <el-menu-item index="/question"><el-icon><EditPen /></el-icon><span>题库管理</span></el-menu-item>
        <el-menu-item index="/paper"><el-icon><Files /></el-icon><span>试卷管理</span></el-menu-item>
        <el-menu-item index="/quiz"><el-icon><Checked /></el-icon><span>测验管理</span></el-menu-item>
        <el-menu-item index="/statistics"><el-icon><DataAnalysis /></el-icon><span>数据统计</span></el-menu-item>
        <el-menu-item index="/knowledge"><el-icon><Connection /></el-icon><span>知识能力图谱</span></el-menu-item>
        <el-menu-item index="/engagement"><el-icon><Bell /></el-icon><span>参与度预警</span></el-menu-item>
        <el-menu-item index="/report"><el-icon><Document /></el-icon><span>AI 报告管理</span></el-menu-item>
        <el-menu-item index="/message"><el-icon><ChatDotRound /></el-icon><span>消息中心</span></el-menu-item>
        <!-- AI 配置仅 ADMIN 可见（与路由 meta.roles 保持一致） -->
        <el-menu-item v-if="auth.role === 'ADMIN'" index="/settings/ai"><el-icon><Setting /></el-icon><span>AI 配置</span></el-menu-item>
      </el-menu>

      <div class="sidebar-foot">
        <div class="foot-line"></div>
        <span>学思践悟 · 守正创新</span>
      </div>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <div class="header-crumb">
            <span class="crumb-tag">管理后台</span>
            <span class="crumb-sep">/</span>
            <span class="header-title">{{ route.meta.title || '工作台' }}</span>
          </div>
        </div>
        <div class="header-right">
          <div class="header-clock">
            <span class="clock-date">{{ dateStr }}</span>
            <span class="clock-week">{{ weekStr }}</span>
          </div>
          <el-dropdown @command="onCommand">
            <span class="user-info">
              <span class="user-avatar">{{ userInitial }}</span>
              <span class="user-name">{{ auth.user?.name }}</span>
              <el-icon style="margin-left: 2px; color: var(--ps-muted)"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <el-dialog v-model="pwdDialog" title="修改密码" width="420px" append-to-body>
      <el-form :model="pwdForm" label-width="80px">
        <el-form-item label="原密码"><el-input v-model="pwdForm.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="pwdForm.newPassword" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPwd">确认</el-button>
      </template>
    </el-dialog>

    <!-- AI 数据查询悬浮球（全站可用） -->
    <AiQueryFab />
  </el-container>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { authApi } from '@/api';
import AiQueryFab from '@/components/ai-query/AiQueryFab.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const userInitial = computed(() => auth.user?.name?.[0] ?? 'U');

const now = ref(new Date());
const dateStr = computed(() => {
  const d = now.value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
});
const weekStr = computed(() => ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.value.getDay()]);
const timer = setInterval(() => (now.value = new Date()), 30000);
onUnmounted(() => clearInterval(timer));

const pwdDialog = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '' });

const onCommand = (cmd: string) => {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning' }).then(() => {
      auth.logout();
      router.push('/login');
    });
  } else if (cmd === 'password') {
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdDialog.value = true;
  }
};

const submitPwd = async () => {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) {
    ElMessage.warning('请填写完整');
    return;
  }
  try {
    await authApi.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    ElMessage.success('密码已修改');
    pwdDialog.value = false;
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || '修改失败');
  }
};
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

/* ============ 侧边栏：深红渐变 + 纸纹 + 暗角 ============ */
.sidebar {
  position: relative;
  background: linear-gradient(180deg, #8b1a1a 0%, #6e1414 60%, #5e0f0f 100%);
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sidebar-grain {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.16;
  mix-blend-mode: overlay;
  pointer-events: none;
}
.sidebar-glow {
  position: absolute;
  top: -80px;
  right: -60px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(201, 169, 97, 0.22), transparent 70%);
  pointer-events: none;
}

/* ============ 印章式 Logo ============ */
.logo {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 22px 20px;
  border-bottom: 1px solid rgba(201, 169, 97, 0.18);
}
.logo-seal {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  background: linear-gradient(135deg, #c9a961, #a8893e);
  color: #5e0f0f;
  font-family: var(--ps-font-serif);
  font-weight: 900;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.logo-title {
  font-family: var(--ps-font-serif);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 3px;
  color: #fff;
}
.logo-sub {
  font-size: 8.5px;
  letter-spacing: 1.6px;
  color: rgba(201, 169, 97, 0.85);
  margin-top: 3px;
  font-weight: 500;
}

/* ============ 导航 ============ */
.nav-label {
  position: relative;
  z-index: 2;
  padding: 18px 24px 8px;
  font-size: 10.5px;
  letter-spacing: 3px;
  color: rgba(201, 169, 97, 0.7);
  font-weight: 500;
}
.side-menu {
  position: relative;
  z-index: 2;
  border-right: none;
  padding: 0 12px;
  flex: 1;
}
:deep(.side-menu .el-menu-item) {
  border-radius: 8px;
  margin: 2px 0;
  height: 44px;
  line-height: 44px;
  font-size: 14px;
  transition: all 0.25s ease;
}
:deep(.side-menu .el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.07) !important;
  color: #fff !important;
}
:deep(.side-menu .el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(201, 169, 97, 0.22), rgba(201, 169, 97, 0.04)) !important;
  color: #f7e3b0 !important;
  box-shadow: inset 2px 0 0 #c9a961;
}
:deep(.side-menu .el-menu-item.is-active .el-icon) {
  color: #c9a961;
}

.sidebar-foot {
  position: relative;
  z-index: 2;
  padding: 16px 24px 22px;
  text-align: center;
}
.foot-line {
  width: 36px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(201, 169, 97, 0.6), transparent);
  margin: 0 auto 10px;
}
.sidebar-foot span {
  font-family: var(--ps-font-serif);
  font-size: 11px;
  letter-spacing: 4px;
  color: rgba(201, 169, 97, 0.6);
}

/* ============ 顶栏 ============ */
.header {
  position: relative;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--ps-line);
  padding: 0 28px;
  height: 62px !important;
  z-index: 5;
}
.header-left {
  display: flex;
  align-items: center;
}
.header-crumb {
  display: flex;
  align-items: center;
  gap: 10px;
}
.crumb-tag {
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--ps-red);
  background: var(--ps-red-soft);
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 500;
}
.crumb-sep {
  color: var(--ps-line);
  font-size: 13px;
}
.header-title {
  font-family: var(--ps-font-serif);
  font-size: 19px;
  font-weight: 600;
  color: var(--ps-ink);
  letter-spacing: 1px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 22px;
}
.header-clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}
.clock-date {
  font-family: var(--ps-font-num);
  font-size: 15px;
  color: var(--ps-ink);
}
.clock-week {
  font-size: 11px;
  color: var(--ps-muted);
}
.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 6px 4px 4px;
  border-radius: 999px;
  transition: background 0.25s ease;
}
.user-info:hover {
  background: var(--ps-red-soft);
}
.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ps-red-bright), var(--ps-red));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ps-font-serif);
  font-weight: 700;
  font-size: 15px;
  box-shadow: 0 3px 10px rgba(139, 26, 26, 0.3);
}
.user-name {
  margin: 0 6px 0 8px;
  font-size: 14px;
  color: var(--ps-ink);
  font-weight: 500;
}

/* ============ 主体 ============ */
.main {
  background: transparent;
  padding: 0;
  overflow-y: auto;
}

/* 页面切换过渡 */
.page-fade-enter-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.page-fade-leave-active {
  transition: opacity 0.18s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.page-fade-leave-to {
  opacity: 0;
}
</style>
