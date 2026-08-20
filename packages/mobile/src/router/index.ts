import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: RouteRecordRaw[] = [
  { path: '/login', component: () => import('@/views/login/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/home',
    children: [
      { path: 'home', component: () => import('@/views/home/HomeView.vue'), meta: { tab: true, title: '学习' } },
      { path: 'task', component: () => import('@/views/task/TaskView.vue'), meta: { tab: true, title: '任务' } },
      { path: 'quiz', component: () => import('@/views/quiz/QuizView.vue'), meta: { tab: true, title: '测验' } },
      { path: 'message', component: () => import('@/views/message/MessageView.vue'), meta: { tab: true, title: '消息' } },
      { path: 'profile', component: () => import('@/views/profile/ProfileView.vue'), meta: { tab: true, title: '我的' } },
      { path: 'content/:id', component: () => import('@/views/content/ContentView.vue') },
      { path: 'quiz/take/:id', component: () => import('@/views/quiz/TakeQuizView.vue') },
      { path: 'quiz/result/:id', component: () => import('@/views/quiz/ResultView.vue') },
      { path: 'report', component: () => import('@/views/report/ReportView.vue') },
      { path: 'report/history', component: () => import('@/views/report/HistoryView.vue') },
      { path: 'path', component: () => import('@/views/path/LearningPathView.vue'), meta: { title: '我的学习路径' } },
      { path: 'chat/:id', component: () => import('@/views/chat/ChatView.vue') },
      { path: 'notification/:id', component: () => import('@/views/notification/NotificationView.vue') },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // P0-7：登录态由 HttpOnly Cookie 维持，硬刷新后 user 为空，先尝试拉取当前用户再判断
  if (!to.meta.public && !auth.user) {
    await auth.fetchMe();
  }
  if (!to.meta.public && !auth.isLoggedIn) return '/login';
  if (to.path === '/login' && auth.isLoggedIn) return '/';
});

export default router;
