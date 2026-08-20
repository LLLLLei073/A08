import { api } from './http';
import type {
  LoginResult,
  OverviewStats,
  OrgStats,
  AiConfig,
  UpdateAiConfigDto,
  TestAiConfigResult,
  ReportPeriod,
  CreateKnowledgeBindingDto,
  CreateKnowledgeEdgeDto,
  CreateKnowledgeNodeDto,
  LearningPathResultDto,
  UpdateKnowledgeNodeDto,
} from '@ai-party-school/shared';

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResult>('/auth/login', { username, password }),
  me: () => api.get('/auth/me', { cache: 30_000 }),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }),
  setPassword: (newPassword: string) =>
    api.post('/auth/set-password', { newPassword }),
};

export const orgApi = {
  tree: () => api.get('/orgs/tree', { cache: 5 * 60_000 }),
  stats: (id: number) => api.get(`/orgs/${id}/stats`),
  create: (data: any) => api.post('/orgs', data),
  update: (id: number, data: any) => api.patch(`/orgs/${id}`, data),
  remove: (id: number) => api.delete(`/orgs/${id}`),
};

export const userApi = {
  list: (params: any) => api.get('/users', { params }),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.patch(`/users/${id}`, data),
  remove: (id: number) => api.delete(`/users/${id}`),
  importFile: (file: File) => api.upload('/users/import', file),
  templateUrl: '/api/users/template',
};

export const contentApi = {
  list: (params: any) => api.get('/contents', { params }),
  categories: () => api.get('/contents/categories', { cache: 5 * 60_000 }),
  create: (data: any) => api.post('/contents', data),
  update: (id: number, data: any) => api.patch(`/contents/${id}`, data),
  remove: (id: number) => api.delete(`/contents/${id}`),
};

export const taskApi = {
  list: (params: any) => api.get('/tasks', { params }),
  create: (data: any) => api.post('/tasks', data),
  update: (id: number, data: any) => api.patch(`/tasks/${id}`, data),
  remove: (id: number) => api.delete(`/tasks/${id}`),
};

export const questionApi = {
  list: (params: any) => api.get('/questions', { params }),
  categories: () => api.get('/questions/categories', { cache: 5 * 60_000 }),
  create: (data: any) => api.post('/questions', data),
  update: (id: number, data: any) => api.patch(`/questions/${id}`, data),
  remove: (id: number) => api.delete(`/questions/${id}`),
  importFile: (file: File) => api.upload('/questions/import', file),
  templateUrl: '/api/questions/template',
};

export const paperApi = {
  list: (params: any) => api.get('/papers', { params }),
  detail: (id: number) => api.get(`/papers/${id}`),
  create: (data: any) => api.post('/papers', data),
  update: (id: number, data: any) => api.patch(`/papers/${id}`, data),
  remove: (id: number) => api.delete(`/papers/${id}`),
  generateAdaptive: (data: any) => api.post('/papers/adaptive/generate', data),
};

export const quizApi = {
  list: (params: any) => api.get('/quizzes', { params }),
  create: (data: any) => api.post('/quizzes', data),
  update: (id: number, data: any) => api.patch(`/quizzes/${id}`, data),
  remove: (id: number) => api.delete(`/quizzes/${id}`),
};

export const statisticsApi = {
  overview: () => api.get<OverviewStats>('/statistics/overview', { cache: 30_000 }),
  byOrg: (orgId?: number) =>
    api.get<OrgStats[]>('/statistics/by-org', { params: { orgId }, cache: 30_000 }),
  trend: (orgId?: number, days?: number) =>
    api.get('/statistics/trend', { params: { orgId, days }, cache: 30_000 }),
};

export const aiApi = {
  query: (question: string) => api.post('/ai/query', { question }),
};

export const uploadApi = {
  upload: (file: File) => api.upload<{ url: string; filename: string }>('/upload', file),
};

export const settingsApi = {
  /** 获取当前 AI 配置 */
  getAi: () => api.get<AiConfig>('/settings/ai'),
  /** 更新 AI 配置 */
  updateAi: (data: UpdateAiConfigDto) => api.put<AiConfig>('/settings/ai', data),
  /** 测试 AI 连接（可直接用表单中的临时配置） */
  testAi: (data: UpdateAiConfigDto) => api.post<TestAiConfigResult>('/settings/ai/test', data),
  /** 拉取指定服务商的模型列表（OpenAI 兼容 GET /models） */
  listAiModels: (data: Partial<UpdateAiConfigDto>) =>
    api.post<{ models: { id: string; ownedBy?: string }[] }>('/settings/ai/models', data),
};

// ===== 群聊 =====
export const chatApi = {
  groups: () => api.get('/chat/groups'),
  contacts: (keyword?: string) => api.get('/chat/contacts', { params: { keyword } }),
  createGroup: (data: any) => api.post('/chat/groups', data),
  getGroup: (id: number) => api.get(`/chat/groups/${id}`),
  updateGroup: (id: number, data: any) => api.patch(`/chat/groups/${id}`, data),
  listMembers: (id: number) => api.get(`/chat/groups/${id}/members`),
  addMembers: (id: number, userIds: number[]) => api.post(`/chat/groups/${id}/members`, { userIds }),
  removeMembers: (id: number, userIds: number[]) => api.delete(`/chat/groups/${id}/members`, { data: { userIds } }),
  leaveGroup: (id: number) => api.post(`/chat/groups/${id}/leave`),
  dissolveGroup: (id: number) => api.delete(`/chat/groups/${id}`),
  toggleMute: (id: number, muted: boolean) => api.post(`/chat/groups/${id}/mute`, { muted }),
  messages: (id: number, params: any) => api.get(`/chat/groups/${id}/messages`, { params }),
  sendMessage: (id: number, content: string) => api.post(`/chat/groups/${id}/messages`, { content }),
  markRead: (id: number, messageId?: number) => api.post(`/chat/groups/${id}/read`, { messageId }),
  clearHistory: (id: number) => api.post(`/chat/groups/${id}/clear`),
  recallMessage: (id: number) => api.post(`/chat/messages/${id}/recall`),
  syncGroups: () => api.post('/chat/groups/sync'),
};

// ===== 通知 =====
export const notificationApi = {
  listSent: (page = 1, pageSize = 20) => api.get('/notifications/sent', { params: { page, pageSize } }),
  send: (data: any) => api.post('/notifications', data),
};

// ===== AI 报告 =====
export const reportApi = {
  list: (params: any) => api.get('/ai/reports', { params }),
  detail: (id: number) => api.get(`/ai/reports/${id}`),
  generate: (data: any) => api.post('/ai/reports/generate', data),
  publish: (reportIds: number[]) => api.post('/ai/reports/publish', { reportIds }),
  remove: (id: number) => api.delete(`/ai/reports/${id}`),
  getSchedule: () => api.get('/ai/reports/schedule'),
  updateSchedule: (data: any) => api.post('/ai/reports/schedule', data),
  runSchedule: () => api.post('/ai/reports/schedule/run'),
};

// ===== 知识图谱与自适应学习路径 =====
export const knowledgeApi = {
  graph: () => api.get('/knowledge/graph'),
  createNode: (data: CreateKnowledgeNodeDto) => api.post('/knowledge/nodes', data),
  updateNode: (id: number, data: UpdateKnowledgeNodeDto) => api.patch(`/knowledge/nodes/${id}`, data),
  removeNode: (id: number) => api.delete(`/knowledge/nodes/${id}`),
  createEdge: (data: CreateKnowledgeEdgeDto) => api.post('/knowledge/edges', data),
  removeEdge: (id: number) => api.delete(`/knowledge/edges/${id}`),
  createBinding: (data: CreateKnowledgeBindingDto) => api.post('/knowledge/bindings', data),
  removeBinding: (resourceType: string, resourceId: number, nodeId: number) =>
    api.delete(`/knowledge/bindings/${resourceType}/${resourceId}/${nodeId}`),
};

export const learningPathApi = {
  user: (userId: number, limit = 5) => api.get<LearningPathResultDto>(`/learning-path/users/${userId}`, { params: { limit } }),
};

export const engagementApi = {
  list: (orgId?: number) => api.get('/engagement-risk', { params: { orgId } }),
  evaluate: (orgId?: number) => api.post('/engagement-risk/evaluate', { orgId }),
  remind: (userId: number) => api.post(`/engagement-risk/${userId}/remind`),
};
