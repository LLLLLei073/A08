// 共享类型与常量定义
// 注意：所有 DTO（请求体）必须是 class 并加 class-validator 装饰器，
// 否则 NestJS 全局 ValidationPipe 无法校验（interface 不携带运行时元数据）。
import 'reflect-metadata';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsEnum,
  ValidateNested,
  IsObject,
  Matches,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

// ===== 枚举 =====
export enum Role {
  ADMIN = 'ADMIN',
  SECRETARY = 'SECRETARY',
  MEMBER = 'MEMBER',
}

export enum ContentType {
  ARTICLE = 'ARTICLE',
  VIDEO = 'VIDEO',
}

export enum QType {
  SINGLE = 'SINGLE',
  MULTIPLE = 'MULTIPLE',
  JUDGE = 'JUDGE',
}

export enum QuizType {
  PRACTICE = 'PRACTICE',
  EXAM = 'EXAM',
}

/** 群聊类型 */
export enum GroupType {
  /** 支部群：本支部成员自动加入，不可退出 */
  ORG = 'ORG',
  /** 管理群：所有支部书记 + 系统管理员，自动加入 */
  MANAGE = 'MANAGE',
  /** 自建小组群 */
  CUSTOM = 'CUSTOM',
}

/** 群内身份 */
export enum GroupRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

/** 聊天消息类型 */
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  /** 系统提示（入群/退群等） */
  SYSTEM = 'SYSTEM',
  /** 通知同步到群 */
  NOTICE = 'NOTICE',
  /** AI 报告下发 */
  REPORT = 'REPORT',
}

/** 通知类型 */
export enum NotifyType {
  ANNOUNCE = 'ANNOUNCE',
  REPORT = 'REPORT',
  TASK = 'TASK',
  QUIZ = 'QUIZ',
  SYSTEM = 'SYSTEM',
}

/** 通知重要级别 */
export enum NotifyLevel {
  NORMAL = 'NORMAL',
  IMPORTANT = 'IMPORTANT',
  URGENT = 'URGENT',
}

/** 通知发送范围 */
export enum NotifyScope {
  /** 全体人员（仅 ADMIN） */
  ALL = 'ALL',
  /** 指定支部 */
  ORG = 'ORG',
  /** 指定人员 */
  USER = 'USER',
}

/** AI 报告统计周期 */
export enum ReportPeriod {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
}

// ===== 通用响应（interface，仅类型） =====
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface Paginated<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ===== 实体类型（interface，仅类型） =====
export interface OrgNode {
  id: number;
  name: string;
  parentId: number | null;
  level: number;
  createdAt: string;
  children?: OrgNode[];
  userCount?: number;
}

export interface UserEntity {
  id: number;
  username: string;
  name: string;
  phone: string | null;
  orgId: number;
  orgName?: string;
  role: Role;
  /** 首次登录或密码重置后是否必须设置新密码 */
  forceChangePassword: boolean;
  createdAt: string;
}

export interface ContentEntity {
  id: number;
  title: string;
  type: ContentType;
  body?: string | null;
  mediaUrl?: string | null;
  cover?: string | null;
  category: string;
  tags: string[];
  isPublic: boolean;
  duration?: number | null;
  createdAt: string;
}

export interface QuestionEntity {
  id: number;
  type: QType;
  stem: string;
  options: string[];
  answer: string;
  analysis?: string | null;
  category: string;
}

export interface PaperEntity {
  id: number;
  title: string;
  totalScore: number;
  passScore: number;
  duration: number;
  questions: Array<{ questionId: number; score: number; question?: QuestionEntity }>;
}

export interface QuizEntity {
  id: number;
  paperId: number;
  orgId: number;
  type: QuizType;
  startTime: string;
  endTime: string;
  duration: number;
  paper?: PaperEntity;
  org?: OrgNode;
}

// ===== DTO（class + class-validator，用于请求体校验） =====

/** 登录 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(2, { message: '用户名至少 2 个字符' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(1, { message: '密码不能为空' })
  password: string;
}

export interface LoginResult {
  user: UserEntity;
  /** 首次登录或密码重置后，强制要求修改密码 */
  forceChangePassword: boolean;
}

/** 试卷题目项（嵌套） */
export class PaperQuestionItemDto {
  @IsInt({ message: 'questionId 必须是整数' })
  @Min(1, { message: 'questionId 不合法' })
  questionId: number;

  @IsInt({ message: '分值必须是整数' })
  @Min(0, { message: '分值不能为负' })
  score: number;
}

/** 创建用户 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(2, { message: '用户名至少 2 个字符' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsInt({ message: '支部 ID 必须是整数' })
  @Min(1, { message: '支部 ID 不合法' })
  orgId: number;

  @IsEnum(Role, { message: '角色不合法' })
  role: Role;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  password?: string;
}

/** 更新用户（PATCH，仅校验实际传入字段） */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt({ message: '支部 ID 必须是整数' })
  @Min(1, { message: '支部 ID 不合法' })
  orgId?: number;

  @IsOptional()
  @IsEnum(Role, { message: '角色不合法' })
  role?: Role;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  password?: string;
}

/** 创建组织 */
export class CreateOrgDto {
  @IsString()
  @IsNotEmpty({ message: '组织名称不能为空' })
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @IsInt({ message: '层级必须是整数' })
  @Min(1, { message: '层级不合法' })
  level: number;
}

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '组织名称不能为空' })
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @IsOptional()
  @IsInt({ message: '层级必须是整数' })
  @Min(1, { message: '层级不合法' })
  level?: number;
}

/** 创建学习内容 */
export class CreateContentDto {
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  title: string;

  @IsEnum(ContentType, { message: '内容类型不合法' })
  type: ContentType;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsString()
  @IsNotEmpty({ message: '分类不能为空' })
  category: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;
}

export class UpdateContentDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: '标题不能为空' }) title?: string;
  @IsOptional() @IsEnum(ContentType, { message: '内容类型不合法' }) type?: ContentType;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsString() cover?: string;
  @IsOptional() @IsString() @IsNotEmpty({ message: '分类不能为空' }) category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() @Min(0) duration?: number;
}

/** 创建学习任务 */
export class CreateTaskDto {
  @IsInt({ message: '支部 ID 必须是整数' })
  @Min(1, { message: '支部 ID 不合法' })
  orgId: number;

  @IsString()
  @IsNotEmpty({ message: '任务标题不能为空' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '截止时间不能为空' })
  @IsDateString()
  deadline: string;

  @IsArray({ message: '内容 ID 列表必须是数组' })
  @IsInt({ each: true, message: '内容 ID 必须是整数' })
  contentIds: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  participantUserIds?: number[];
}

export class UpdateTaskDto {
  @IsOptional() @IsInt() @Min(1) orgId?: number;
  @IsOptional() @IsString() @IsNotEmpty({ message: '任务标题不能为空' }) title?: string;
  @IsOptional() @IsString() @IsDateString() deadline?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) contentIds?: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) participantUserIds?: number[];
}

/** 创建题目 */
export class CreateQuestionDto {
  @IsEnum(QType, { message: '题型不合法' })
  type: QType;

  @IsString()
  @IsNotEmpty({ message: '题干不能为空' })
  stem: string;

  @IsArray({ message: '选项必须是数组' })
  @IsString({ each: true, message: '选项必须是字符串' })
  options: string[];

  @IsString()
  @IsNotEmpty({ message: '答案不能为空' })
  answer: string;

  @IsOptional()
  @IsString()
  analysis?: string;

  @IsString()
  @IsNotEmpty({ message: '分类不能为空' })
  category: string;
}

export class UpdateQuestionDto {
  @IsOptional() @IsEnum(QType, { message: '题型不合法' }) type?: QType;
  @IsOptional() @IsString() @IsNotEmpty({ message: '题干不能为空' }) stem?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsString() @IsNotEmpty({ message: '答案不能为空' }) answer?: string;
  @IsOptional() @IsString() analysis?: string;
  @IsOptional() @IsString() @IsNotEmpty({ message: '分类不能为空' }) category?: string;
}

/** 创建试卷 */
export class CreatePaperDto {
  @IsString()
  @IsNotEmpty({ message: '试卷标题不能为空' })
  title: string;

  @IsInt({ message: '及格分必须是整数' })
  @Min(0, { message: '及格分不能为负' })
  passScore: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsArray({ message: '题目列表必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => PaperQuestionItemDto)
  questions: PaperQuestionItemDto[];
}

export class UpdatePaperDto {
  @IsOptional() @IsString() @IsNotEmpty({ message: '试卷标题不能为空' }) title?: string;
  @IsOptional() @IsInt() @Min(0) passScore?: number;
  @IsOptional() @IsInt() @Min(1) duration?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaperQuestionItemDto)
  questions?: PaperQuestionItemDto[];
}

export class GenerateAdaptivePaperDto {
  @IsInt() @Min(1) userId: number;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsInt() @Min(5) @Max(50) questionCount: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) passScore?: number;
  @IsOptional() @IsInt() @Min(5) @Max(180) duration?: number;
}

/** 创建测验/考试 */
export class CreateQuizDto {
  @IsInt({ message: '试卷 ID 必须是整数' })
  @Min(1, { message: '试卷 ID 不合法' })
  paperId: number;

  @IsInt({ message: '支部 ID 必须是整数' })
  @Min(1, { message: '支部 ID 不合法' })
  orgId: number;

  @IsEnum(QuizType, { message: '测验类型不合法' })
  type: QuizType;

  @IsString()
  @IsNotEmpty({ message: '开始时间不能为空' })
  @IsDateString()
  startTime: string;

  @IsString()
  @IsNotEmpty({ message: '结束时间不能为空' })
  @IsDateString()
  endTime: string;

  @IsInt({ message: '时长必须是整数' })
  @Min(1)
  duration: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  participantUserIds?: number[];
}

export class UpdateQuizDto {
  @IsOptional() @IsInt() @Min(1) paperId?: number;
  @IsOptional() @IsInt() @Min(1) orgId?: number;
  @IsOptional() @IsEnum(QuizType, { message: '测验类型不合法' }) type?: QuizType;
  @IsOptional() @IsString() @IsDateString() startTime?: string;
  @IsOptional() @IsString() @IsDateString() endTime?: string;
  @IsOptional() @IsInt() @Min(1) duration?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) participantUserIds?: number[];
}

/** 提交测验答案 */
export class SubmitQuizDto {
  @IsObject({ message: 'answers 必须是对象' })
  answers: Record<number, string>;
}

export class AiQueryDto {
  @IsString()
  @IsNotEmpty({ message: '查询问题不能为空' })
  @MaxLength(500, { message: '查询问题不能超过 500 字' })
  question: string;
}

/** 学习记录上报 */
export class LearningRecordDto {
  @IsInt({ message: '学习时长必须是整数' })
  @Min(0, { message: '学习时长不能为负' })
  duration: number;

  @IsInt({ message: '进度必须是整数' })
  @Min(0, { message: '进度不能为负' })
  @Max(100, { message: '进度不能超过 100' })
  progress: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

// ===== AI 相关（interface，仅类型） =====
export interface AiRecommendation {
  contentId: number;
  title: string;
  category: string;
  reason: string;
}

export interface AiQueryResult {
  text: string;
  chartOption?: Record<string, unknown>;
  data?: unknown;
  queryPlan?: AnalyticsQueryPlan;
}

export type AnalyticsMetric = 'learning_duration' | 'task_completion_rate' | 'avg_quiz_score' | 'exam_pass_rate' | 'user_count';
export interface AnalyticsDateRange { start: string; end: string; label: string; }
export interface AnalyticsQueryPlan {
  metric: AnalyticsMetric;
  aggregation: 'SUM' | 'AVG' | 'COUNT' | 'RATE';
  groupBy: 'ORG' | 'TOTAL';
  range: AnalyticsDateRange;
  compareRange?: AnalyticsDateRange;
  chartType: 'bar' | 'line' | 'gauge';
  orgIds?: number[];
}

export interface AiReport {
  id: number;
  userId: number;
  score: number;
  comment: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  dimensions: Array<{ name: string; value: number }>;
  generatedAt: string;
  /** 统计周期类型 */
  periodType?: ReportPeriod;
  /** 统计周期起点 */
  periodStart?: string;
  /** 统计周期终点 */
  periodEnd?: string | null;
  /** MANUAL=手动生成 / AUTO=定时生成 */
  source?: 'MANUAL' | 'AUTO';
  /** 下发时间，为空表示未下发 */
  publishedAt?: string | null;
  /** 管理端列表用 */
  userName?: string;
  orgId?: number;
  orgName?: string;
}

// ===== 统计（interface，仅类型） =====
export interface OrgStats {
  orgId: number;
  orgName: string;
  userCount: number;
  totalLearningSeconds: number;
  avgLearningSeconds: number;
  taskCompletionRate: number;
  avgQuizScore: number;
  examPassRate: number;
}

export interface OverviewStats {
  totalUsers: number;
  totalOrgs: number;
  totalContents: number;
  totalLearningSeconds: number;
  overallTaskCompletionRate: number;
  overallAvgQuizScore: number;
  overallExamPassRate: number;
}

// ===== 系统设置 / AI 配置 =====

/** 支持的模型服务商标识（均为 OpenAI 兼容接口） */
export type AiProviderKey =
  | 'deepseek'
  | 'qwen'
  | 'zhipu'
  | 'kimi'
  | 'doubao'
  | 'ernie'
  | 'minimax'
  | 'spark'
  | 'custom';

/** 国内主流大模型服务商预设。baseUrl / 模型名可在后台按需修改。 */
export const AI_PROVIDER_PRESETS: Array<{
  key: AiProviderKey;
  label: string;
  baseUrl: string;
  chatModel: string;
  reasonerModel: string;
  note?: string;
}> = [
  { key: 'deepseek', label: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com/v1', chatModel: 'deepseek-chat', reasonerModel: 'deepseek-reasoner' },
  { key: 'qwen', label: '通义千问 Qwen（阿里云）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', chatModel: 'qwen-plus', reasonerModel: 'qwen-max' },
  { key: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', chatModel: 'glm-4-flash', reasonerModel: 'glm-4-plus' },
  { key: 'kimi', label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', chatModel: 'moonshot-v1-8k', reasonerModel: 'kimi-k2-turbo-preview' },
  { key: 'doubao', label: '豆包 Doubao（火山引擎）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', chatModel: 'doubao-1-5-pro-32k-250115', reasonerModel: 'doubao-1-5-thinking-pro-32k-250115', note: '模型名也可填方舟接入点（ep-xxx）；推理模型需在控制台开通' },
  { key: 'ernie', label: '文心一言 ERNIE（百度千帆）', baseUrl: 'https://qianfan.baidubce.com/v2', chatModel: 'ernie-4.0-8k', reasonerModel: 'ernie-4.0-turbo-8k' },
  { key: 'minimax', label: 'MiniMax 海螺', baseUrl: 'https://api.minimax.chat/v1', chatModel: 'MiniMax-Text-01', reasonerModel: 'MiniMax-M2' },
  { key: 'spark', label: '讯飞星火 Spark', baseUrl: 'https://spark-api-open.xf-yun.com/v1', chatModel: 'generalv3.5', reasonerModel: '4.0Ultra', note: '需在讯飞开放平台开通「OpenAI 兼容」接口权限' },
  { key: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', chatModel: '', reasonerModel: '' },
];

/** 按 key 查找预设 */
export function aiProviderPreset(key?: string) {
  return AI_PROVIDER_PRESETS.find((p) => p.key === key) ?? AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1];
}

/**
 * 各服务商的免费模型清单（基于公开信息整理，随厂商策略变化，仅作标注提示，以实际计费为准）。
 * 匹配规则：模型 ID 完全相等或以清单项开头（如 qwen-turbo 命中 qwen-turbo-latest）。
 */
export const FREE_MODELS: Partial<Record<AiProviderKey, string[]>> = {
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen3-turbo', 'qwen3-flash'],
  zhipu: ['glm-4-flash', 'glm-4-flashx', 'glm-4v-flash', 'glm-4v-plus', 'glm-4.5-flash', 'glm-4.5v-flash'],
  ernie: ['ernie-speed', 'ernie-lite'],
  spark: ['lite'],
};

/** 判断模型是否为该服务商的免费模型 */
export function isFreeModel(provider?: string, modelId?: string): boolean {
  if (!provider || !modelId) return false;
  const list = FREE_MODELS[provider as AiProviderKey] ?? [];
  return list.includes(modelId) || list.some((id) => modelId.startsWith(id));
}

/** 服务商返回的模型信息 */
export interface AiModelInfo {
  id: string;
  ownedBy?: string;
}

export interface AiConfig {
  /** 服务商标识（对应 AI_PROVIDER_PRESETS 的 key，custom 表示手动配置） */
  provider: AiProviderKey;
  /** API Key */
  apiKey: string;
  /** API 基础地址，如 https://api.deepseek.com/v1 */
  baseUrl: string;
  /** 普通对话模型名 */
  chatModel: string;
  /** 推理模型名（可留空，留空时自动回退到对话模型） */
  reasonerModel?: string;
}

/** 更新 AI 配置（请求体） */
export class UpdateAiConfigDto {
  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsNotEmpty({ message: 'apiKey 不能为空' })
  apiKey: string;

  @IsString()
  @IsNotEmpty({ message: 'baseUrl 不能为空' })
  baseUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'chatModel 不能为空' })
  chatModel: string;

  @IsString()
  @IsOptional()
  reasonerModel?: string;
}

/** 修改密码（请求体） */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '原密码不能为空' })
  oldPassword: string;

  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '新密码至少 6 位' })
  /** 至少 6 位，且字母/数字/特殊字符三类中满足任意两类 */
  @Matches(/^(?:(?=.*[a-zA-Z])(?=.*\d)|(?=.*[a-zA-Z])(?=.*[^\w\s])|(?=.*\d)(?=.*[^\w\s])).{6,}$/, {
    message: '密码至少 6 位，且需包含字母、数字、特殊字符中的任意两类',
  })
  newPassword: string;
}

/** 首次登录/重置后强制设置新密码（请求体） */
export class SetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(6, { message: '新密码至少 6 位' })
  @Matches(/^(?:(?=.*[a-zA-Z])(?=.*\d)|(?=.*[a-zA-Z])(?=.*[^\w\s])|(?=.*\d)(?=.*[^\w\s])).{6,}$/, {
    message: '密码至少 6 位，且需包含字母、数字、特殊字符中的任意两类',
  })
  newPassword: string;
}

export interface TestAiConfigResult {
  /** 连接是否成功 */
  ok: boolean;
  /** 实际使用的模型标识 */
  model?: string;
  /** 失败原因 */
  error?: string;
}

// ===== 群聊 =====
export interface ChatMessageEntity {
  id: number;
  groupId: number;
  senderId: number | null;
  senderName?: string;
  senderRole?: Role;
  type: MessageType;
  content: string;
  extra?: Record<string, unknown> | null;
  recalled: boolean;
  createdAt: string;
  /** 是否本人发送（服务端计算，便于前端渲染气泡方向） */
  mine?: boolean;
}

export interface ChatGroupEntity {
  id: number;
  name: string;
  type: GroupType;
  orgId: number | null;
  ownerId: number | null;
  notice?: string | null;
  memberCount: number;
  /** 当前用户在群内的身份 */
  myRole: GroupRole;
  muted: boolean;
  unread: number;
  lastMessage?: {
    content: string;
    senderName?: string;
    type: MessageType;
    createdAt: string;
  } | null;
  createdAt: string;
}

export interface ChatMemberEntity {
  userId: number;
  name: string;
  role: Role;
  orgName?: string;
  groupRole: GroupRole;
  joinedAt: string;
}

/** 创建自建群聊 */
export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: '群名称不能为空' })
  @MinLength(2, { message: '群名称至少 2 个字符' })
  name: string;

  @IsArray({ message: '成员列表必须是数组' })
  @IsInt({ each: true, message: '成员 ID 必须是整数' })
  memberIds: number[];

  @IsOptional()
  @IsString()
  notice?: string;
}

/** 更新群信息 */
export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: '群名称至少 2 个字符' })
  name?: string;

  @IsOptional()
  @IsString()
  notice?: string;
}

/** 发送群消息 */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty({ message: '消息内容不能为空' })
  @MaxLength(2000, { message: '单条消息不能超过 2000 字' })
  content: string;

  @IsOptional()
  @IsEnum(MessageType, { message: '消息类型不合法' })
  type?: MessageType;
}

/** 群成员增减 */
export class GroupMembersDto {
  @IsArray({ message: '成员列表必须是数组' })
  @IsInt({ each: true, message: '成员 ID 必须是整数' })
  userIds: number[];
}

// ===== 消息通知 =====
export interface NotificationEntity {
  id: number;
  title: string;
  content: string;
  type: NotifyType;
  level: NotifyLevel;
  senderId: number | null;
  senderName?: string;
  scope: NotifyScope;
  refId?: number | null;
  groupId?: number | null;
  createdAt: string;
  /** 收件人视角字段 */
  isRead?: boolean;
  readAt?: string | null;
  /** 发送者视角字段 */
  recipientCount?: number;
  readCount?: number;
}

/** 发布通知 */
export class SendNotificationDto {
  @IsString()
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(120, { message: '标题不能超过 120 字' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: '内容不能为空' })
  @MaxLength(5000, { message: '内容不能超过 5000 字' })
  content: string;

  @IsOptional()
  @IsEnum(NotifyLevel, { message: '级别不合法' })
  level?: NotifyLevel;

  @IsEnum(NotifyScope, { message: '发送范围不合法' })
  scope: NotifyScope;

  /** scope=ORG 时必填 */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  orgIds?: number[];

  /** scope=USER 时必填 */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  /** 是否同步推送一条消息到对应支部群 */
  @IsOptional()
  @IsBoolean()
  syncToGroup?: boolean;
}

// ===== AI 报告：管理端生成与下发 =====
/** 管理端批量生成报告 */
export class GenerateReportDto {
  @IsEnum(ReportPeriod, { message: '统计周期不合法' })
  period: ReportPeriod;

  /** 指定支部；为空且 userIds 为空时表示全部（ADMIN）或本支部（SECRETARY） */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  orgIds?: number[];

  /** 指定人员，优先于 orgIds */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  /** 生成后立即下发通知 */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  /** 已存在同周期报告时是否覆盖重算 */
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

/** 下发指定报告 */
export class PublishReportDto {
  @IsArray({ message: '报告 ID 列表必须是数组' })
  @IsInt({ each: true })
  reportIds: number[];
}

/** 报告自动生成配置 */
export interface ReportSchedule {
  /** 是否开启定时自动生成 */
  enabled: boolean;
  /** 统计周期 */
  period: ReportPeriod;
  /** 自动生成间隔（小时）；例如 168 = 每周一次 */
  intervalHours: number;
  /** 生成后是否自动下发 */
  autoPublish: boolean;
  /** 限定支部；空数组=全部 */
  orgIds: number[];
  /** 上次执行时间（只读） */
  lastRunAt?: string | null;
  /** 下次预计执行时间（只读） */
  nextRunAt?: string | null;
  /** 上次执行结果摘要（只读） */
  lastResult?: string | null;
}

export class UpdateReportScheduleDto {
  @IsBoolean({ message: 'enabled 必须是布尔值' })
  enabled: boolean;

  @IsEnum(ReportPeriod, { message: '统计周期不合法' })
  period: ReportPeriod;

  @IsInt({ message: '间隔必须是整数小时' })
  @Min(1, { message: '间隔至少 1 小时' })
  @Max(24 * 90, { message: '间隔最多 90 天' })
  intervalHours: number;

  @IsBoolean({ message: 'autoPublish 必须是布尔值' })
  autoPublish: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  orgIds?: number[];
}

export interface GenerateReportResult {
  /** 成功生成数量 */
  generated: number;
  /** 跳过数量（已存在同周期报告） */
  skipped: number;
  /** 失败数量 */
  failed: number;
  /** 已下发数量 */
  published: number;
  /** 失败明细 */
  errors?: Array<{ userId: number; name: string; error: string }>;
}

/** 未读汇总（红点） */
export interface UnreadSummary {
  /** 群聊未读总数 */
  chat: number;
  /** 通知未读数 */
  notification: number;
  total: number;
}

// ===== 知识图谱与自适应学习路径 =====
export enum KnowledgeResourceType {
  CONTENT = 'CONTENT',
  QUESTION = 'QUESTION',
}

export class CreateKnowledgeNodeDto {
  @IsString() @IsNotEmpty({ message: '知识点编码不能为空' }) @MaxLength(64) code: string;
  @IsString() @IsNotEmpty({ message: '知识点名称不能为空' }) @MaxLength(128) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @IsNotEmpty({ message: '知识点分类不能为空' }) @MaxLength(64) category: string;
  @IsInt() @Min(1) @Max(5) difficulty: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) pInit?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) pLearn?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) pSlip?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateKnowledgeNodeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(128) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) pInit?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) pLearn?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) pSlip?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateKnowledgeEdgeDto {
  @IsInt() @Min(1) fromNodeId: number;
  @IsInt() @Min(1) toNodeId: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) weight?: number;
}

export class CreateKnowledgeBindingDto {
  @IsEnum(KnowledgeResourceType, { message: '资源类型不合法' }) resourceType: KnowledgeResourceType;
  @IsInt() @Min(1) resourceId: number;
  @IsInt() @Min(1) nodeId: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) weight?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
}

export interface KnowledgeNodeDto {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  category: string;
  difficulty: number;
  pInit: number;
  pLearn: number;
  pSlip: number;
  active: boolean;
}

export interface KnowledgeEdgeDto {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  type: 'PREREQUISITE';
  weight: number;
}

export interface KnowledgeBindingDto {
  resourceType: KnowledgeResourceType;
  resourceId: number;
  nodeId: number;
  weight: number;
  difficulty: number;
  resourceTitle?: string;
}

export interface MasteryStateDto {
  nodeId: number;
  code: string;
  name: string;
  category: string;
  mastery: number;
  attempts: number;
  correctCount: number;
  lastEvidenceAt?: string | null;
}

export interface LearningPathScoreBreakdown {
  weakness: number;
  readiness: number;
  difficultyFit: number;
  novelty: number;
  mandatory: number;
}

export interface LearningPathItemDto {
  rank: number;
  nodeId: number | null;
  nodeCode: string;
  nodeName: string;
  contentId: number;
  title: string;
  contentType: ContentType;
  difficulty: number;
  mastery: number;
  score: number;
  reason: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  breakdown: LearningPathScoreBreakdown;
}

export interface LearningPathResultDto {
  algorithmVersion: string;
  snapshotId: number;
  graphVersion: number;
  generatedAt: string;
  fallback: boolean;
  masterySummary: MasteryStateDto[];
  items: LearningPathItemDto[];
}

export interface EngagementRiskFactorDto {
  code: 'INACTIVITY' | 'OVERDUE_TASKS' | 'LEARNING_TREND' | 'SCORE_TREND' | 'UNREAD_NOTIFICATIONS';
  label: string;
  value: number;
  contribution: number;
}

export interface EngagementRiskDto {
  userId: number;
  userName: string;
  orgId: number;
  orgName: string;
  score: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: EngagementRiskFactorDto[];
  evaluatedAt: string;
  lastNotifiedAt?: string | null;
  note: string;
}

export class EvaluateEngagementRiskDto {
  @IsOptional() @IsInt() @Min(1) orgId?: number;
}
