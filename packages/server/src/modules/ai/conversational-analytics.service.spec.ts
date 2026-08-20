import { describe, expect, it } from 'vitest';
import { ConversationalAnalyticsService, resolveDateRange } from './conversational-analytics.service';

describe('结构化对话查询计划', () => {
  const service = new ConversationalAnalyticsService({} as any, {} as any);
  const now = new Date(2026, 7, 15);

  it('解析去年三季度并按支部对比', () => {
    const plan = service.buildPlan('对比去年三季度各支部学习时长数据', now);
    expect(plan.metric).toBe('learning_duration');
    expect(plan.groupBy).toBe('ORG');
    expect(new Date(plan.range.start).getFullYear()).toBe(2025);
    expect(new Date(plan.range.start).getMonth()).toBe(6);
    expect(new Date(plan.range.end).getMonth()).toBe(9);
  });

  it('同比查询生成独立比较周期', () => {
    const plan = service.buildPlan('今年第三季度考试通过率同比', now);
    expect(plan.metric).toBe('exam_pass_rate');
    expect(plan.compareRange).toBeDefined();
    expect(new Date(plan.compareRange!.start).getFullYear()).toBe(2025);
  });

  it('近30天形成左闭右开日期范围', () => {
    const range = resolveDateRange('近30天学习情况', now);
    expect((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000).toBe(30);
  });
});
