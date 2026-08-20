import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AiQueryResult, AnalyticsMetric, AnalyticsQueryPlan, Role } from '@ai-party-school/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StatisticsService } from '../statistics/statistics.service';

export interface AnalyticsActor { id: number; role: Role; orgId: number; }

const METRICS: Array<{ metric: AnalyticsMetric; field: string; label: string; pattern: RegExp; aggregation: AnalyticsQueryPlan['aggregation'] }> = [
  { metric: 'learning_duration', field: 'totalLearningSeconds', label: '学习时长', pattern: /学习时长|学习时间|时长/, aggregation: 'SUM' },
  { metric: 'task_completion_rate', field: 'taskCompletionRate', label: '任务完成率', pattern: /任务.*完成|完成率/, aggregation: 'RATE' },
  { metric: 'avg_quiz_score', field: 'avgQuizScore', label: '测验平均分', pattern: /测验|练习|平均分|成绩/, aggregation: 'AVG' },
  { metric: 'exam_pass_rate', field: 'examPassRate', label: '考试通过率', pattern: /考试.*通过|通过率|及格率/, aggregation: 'RATE' },
  { metric: 'user_count', field: 'userCount', label: '党员人数', pattern: /党员数|人数|人员数/, aggregation: 'COUNT' },
];

@Injectable()
export class ConversationalAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly statistics: StatisticsService) {}

  async tryQuery(question: string, actor: AnalyticsActor): Promise<AiQueryResult | null> {
    if (!/数据|学习|完成|测验|考试|党员|人数|时长|支部|季度|同比|环比|对比|排名/.test(question)) return null;
    const plan = this.buildPlan(question);
    const result = await this.execute(plan, actor);
    await this.prisma.analyticsQueryAudit.create({
      data: {
        actorUserId: actor.id,
        orgId: actor.orgId,
        questionHash: createHash('sha256').update(question).digest('hex'),
        queryPlan: JSON.stringify(plan),
        resultCount: Array.isArray(result.data) ? result.data.length : 1,
      },
    });
    return result;
  }

  buildPlan(question: string, now = new Date()): AnalyticsQueryPlan {
    const metricDef = METRICS.find((item) => item.pattern.test(question)) ?? METRICS[0];
    const explicit = extractQuarterRanges(question, now);
    const range = explicit.at(-1) ?? resolveDateRange(question, now);
    let compareRange = explicit.length > 1 ? explicit[0] : undefined;
    if (!compareRange && /同比/.test(question)) compareRange = shiftYears(range, -1, '同比周期');
    if (!compareRange && /环比/.test(question)) compareRange = previousPeriod(range);
    return {
      metric: metricDef.metric,
      aggregation: metricDef.aggregation,
      groupBy: /对比|各支部|支部间|排名/.test(question) ? 'ORG' : 'TOTAL',
      range,
      compareRange,
      chartType: /趋势/.test(question) ? 'line' : /对比|排名|各支部/.test(question) ? 'bar' : 'gauge',
    };
  }

  private async execute(plan: AnalyticsQueryPlan, actor: AnalyticsActor): Promise<AiQueryResult> {
    const metricDef = METRICS.find((item) => item.metric === plan.metric)!;
    const orgId = actor.role === Role.SECRETARY ? actor.orgId : undefined;
    const currentStats = await this.statistics.getStatsByOrg(orgId, new Date(plan.range.start), new Date(plan.range.end));
    const safeCurrent = currentStats.filter((row) => row.userCount >= 5);
    const suppressed = currentStats.filter((row) => row.userCount < 5).map((row) => row.orgName);
    const compareStats = plan.compareRange
      ? await this.statistics.getStatsByOrg(orgId, new Date(plan.compareRange.start), new Date(plan.compareRange.end))
      : [];
    const compareMap = new Map(compareStats.filter((row) => row.userCount >= 5).map((row) => [row.orgId, row]));
    const data = safeCurrent.map((row) => ({
      orgId: row.orgId,
      orgName: row.orgName,
      value: (row as any)[metricDef.field] as number,
      compareValue: plan.compareRange ? ((compareMap.get(row.orgId) as any)?.[metricDef.field] ?? null) : undefined,
    }));
    const xAxis = data.map((row) => row.orgName);
    const display = (value: number | null | undefined) => value == null ? 0 : metricDef.aggregation === 'RATE' ? Math.round(value * 10_000) / 100 : metricDef.metric === 'learning_duration' ? Math.round(value / 360) / 10 : value;
    const series: any[] = [{ name: plan.range.label, type: plan.chartType === 'gauge' && data.length === 1 ? 'bar' : plan.chartType, data: data.map((row) => display(row.value)), itemStyle: { color: '#8b1a1a' } }];
    if (plan.compareRange) series.unshift({ name: plan.compareRange.label, type: 'bar', data: data.map((row) => display(row.compareValue)), itemStyle: { color: '#c9a961' } });
    const unit = metricDef.aggregation === 'RATE' ? '%' : metricDef.metric === 'learning_duration' ? '小时' : metricDef.metric === 'avg_quiz_score' ? '分' : '人';
    const text = data.length
      ? `${plan.range.label}${metricDef.label}已按权限范围完成统计，共返回${data.length}个组织。${suppressed.length ? `另有${suppressed.length}个小样本组织因少于5人已隐藏。` : ''}`
      : `没有可展示的${metricDef.label}数据；少于5人的组织会按隐私规则隐藏。`;
    return {
      text,
      queryPlan: plan,
      data,
      chartOption: {
        title: { text: `${metricDef.label} · ${plan.range.label}`, subtext: `单位：${unit}` },
        tooltip: { trigger: 'axis' }, legend: { top: 28 },
        xAxis: { type: 'category', data: xAxis }, yAxis: { type: 'value', name: unit }, series,
      },
    };
  }
}

export function resolveDateRange(question: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recent = question.match(/近\s*(\d{1,3})\s*天/);
  if (recent) {
    const days = Math.min(365, Math.max(1, Number(recent[1])));
    const start = new Date(today); start.setDate(start.getDate() - days + 1);
    const end = new Date(today); end.setDate(end.getDate() + 1);
    return toRange(start, end, `近${days}天`);
  }
  if (/去年/.test(question)) return toRange(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1), `${now.getFullYear() - 1}年`);
  if (/今年/.test(question)) return toRange(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1), `${now.getFullYear()}年`);
  const start = new Date(today); start.setDate(start.getDate() - 29);
  const end = new Date(today); end.setDate(end.getDate() + 1);
  return toRange(start, end, '近30天');
}

function extractQuarterRanges(question: string, now: Date) {
  const result: ReturnType<typeof toRange>[] = [];
  const pattern = /(前年|去年|今年)?(?:第)?([一二三四1234])季度/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(question))) {
    const offset = match[1] === '前年' ? -2 : match[1] === '去年' ? -1 : 0;
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 };
    const quarter = map[match[2]] ?? Number(match[2]);
    const year = now.getFullYear() + offset;
    result.push(toRange(new Date(year, (quarter - 1) * 3, 1), new Date(year, quarter * 3, 1), `${year}年第三季度`.replace('第三', `第${['一','二','三','四'][quarter - 1]}`)));
  }
  return result;
}

function shiftYears(range: ReturnType<typeof toRange>, years: number, suffix: string) {
  const start = new Date(range.start); const end = new Date(range.end);
  start.setFullYear(start.getFullYear() + years); end.setFullYear(end.getFullYear() + years);
  return toRange(start, end, suffix);
}

function previousPeriod(range: ReturnType<typeof toRange>) {
  const start = new Date(range.start); const end = new Date(range.end); const duration = end.getTime() - start.getTime();
  return toRange(new Date(start.getTime() - duration), start, '环比周期');
}

function toRange(start: Date, end: Date, label: string) {
  return { start: start.toISOString(), end: end.toISOString(), label };
}
