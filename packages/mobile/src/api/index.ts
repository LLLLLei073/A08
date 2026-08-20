import { api } from './http';
import type { LearningPathResultDto, LoginResult, MasteryStateDto } from '@ai-party-school/shared';

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResult>('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
  setPassword: (newPassword: string) =>
    api.post('/auth/set-password', { newPassword }),
};

export const contentApi = {
  visible: (params: any) => api.get('/contents/visible', { params, cache: 30_000 }),
  detail: (id: number) => api.get(`/contents/${id}`),
  categories: () => api.get('/contents/categories', { cache: 5 * 60_000 }),
  record: (contentId: number, data: any) => api.post(`/contents/${contentId}/record`, data),
  myRecord: (contentId: number) => api.get(`/contents/${contentId}/record`, { cache: 30_000 }),
};

export const taskApi = {
  my: () => api.get('/tasks/my', { cache: 30_000 }),
};

export const quizApi = {
  my: () => api.get('/quizzes/my', { cache: 30_000 }),
  start: (id: number) => api.post(`/quizzes/${id}/start`),
  submit: (id: number, answers: any) => api.post(`/quizzes/${id}/submit`, { answers }),
  result: (id: number) => api.get(`/quizzes/${id}/result`),
};

export const aiApi = {
  recommend: () => api.post('/ai/recommend'),
  report: () => api.get('/ai/report', { cache: 60_000 }),
  reportHistory: () => api.get('/ai/report/history', { cache: 60_000 }),
};

export const learningPathApi = {
  mine: (limit = 5) => api.get<LearningPathResultDto>('/learning-path/me', { params: { limit } }),
  refresh: (limit = 5) => api.post<LearningPathResultDto>('/learning-path/me/refresh', undefined, { params: { limit } }),
  mastery: () => api.get<MasteryStateDto[]>('/learning-path/me/mastery'),
};

// ===== 群聊 =====
export const chatApi = {
  groups: () => api.get('/chat/groups'),
  getGroup: (id: number) => api.get(`/chat/groups/${id}`),
  messages: (id: number, params: any) => api.get(`/chat/groups/${id}/messages`, { params }),
  sendMessage: (id: number, content: string) => api.post(`/chat/groups/${id}/messages`, { content }),
  markRead: (id: number, messageId?: number) => api.post(`/chat/groups/${id}/read`, { messageId }),
  clearHistory: (id: number) => api.post(`/chat/groups/${id}/clear`),
  leaveGroup: (id: number) => api.post(`/chat/groups/${id}/leave`),
  toggleMute: (id: number, muted: boolean) => api.post(`/chat/groups/${id}/mute`, { muted }),
};

// ===== 通知 =====
export const notificationApi = {
  list: (page = 1, pageSize = 20) => api.get('/notifications', { params: { page, pageSize } }),
  unread: () => api.get('/notifications/unread'),
  detail: (id: number) => api.get(`/notifications/${id}`),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};
