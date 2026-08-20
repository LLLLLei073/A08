import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: '工作台' } },
      { path: 'org', component: () => import('@/views/org/OrgView.vue'), meta: { title: '组织架构' } },
      { path: 'user', component: () => import('@/views/user/UserView.vue'), meta: { title: '人员管理' } },
      { path: 'content', component: () => import('@/views/content/ContentView.vue'), meta: { title: '学习内容' } },
      { path: 'task', component: () => import('@/views/task/TaskView.vue'), meta: { title: '学习任务' } },
      { path: 'question', component: () => import('@/views/question/QuestionView.vue'), meta: { title: '题库管理' } },
      { path: 'paper', component: () => import('@/views/paper/PaperView.vue'), meta: { title: '试卷管理' } },
      { path: 'quiz', component: () => import('@/views/quiz/QuizView.vue'), meta: { title: '测验管理' } },
      { path: 'statistics', component: () => import('@/views/statistics/StatisticsView.vue'), meta: { title: '数据统计' } },
      { path: 'knowledge', component: () => import('@/views/knowledge/KnowledgeView.vue'), meta: { title: '知识能力图谱' } },
      { path: 'engagement', component: () => import('@/views/engagement/EngagementView.vue'), meta: { title: '学习参与度预警' } },
      { path: 'report', component: () => import('@/views/report/ReportView.vue'), meta: { title: 'AI 报告管理' } },
      { path: 'message', component: () => import('@/views/message/MessageView.vue'), meta: { title: '消息中心' } },
      // AI 配置仅 ADMIN 可访问
      { path: 'settings/ai', component: () => import('@/views/settings/SettingsView.vue'), meta: { title: 'AI 配置', roles: ['ADMIN'] } },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // P0-7：登录态由 HttpOnly Cookie 维持，硬刷新后 user 为空，先尝试拉取当前用户再判断
  if (!to.meta.public && !auth.user) {
    await auth.fetchMe();
  }
  if (!to.meta.public && !auth.isLoggedIn) {
    return '/login';
  }
  if (to.path === '/login' && auth.isLoggedIn) {
    return '/';
  }
  // 管理后台仅 ADMIN / SECRETARY 可用，MEMBER 一律登出
  if (!to.meta.public && auth.role === 'MEMBER') {
    await auth.logout();
    return '/login';
  }
  // 角色校验：meta.roles 声明的路由仅允许指定角色访问
  const roles = to.meta.roles as string[] | undefined;
  if (roles && roles.length > 0 && (!auth.role || !roles.includes(auth.role))) {
    return '/dashboard';
  }
});

export default router;
