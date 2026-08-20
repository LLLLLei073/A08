import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrgStats, OverviewStats } from '@ai-party-school/shared';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(orgId?: number, since?: Date, until?: Date): Promise<OverviewStats> {
    const userWhere: Prisma.UserWhereInput = orgId ? { orgId } : {};
    const recordWhere: Prisma.LearningRecordWhereInput = {
      ...(orgId ? { user: { orgId } } : {}),
    };
    const contentWhere: Prisma.ContentWhereInput = orgId
      ? { OR: [{ isPublic: true }, { tasks: { some: { task: { orgId } } } }] }
      : {};
    const [totalUsers, totalOrgs, totalContents, recordsAgg] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      orgId ? Promise.resolve(1) : this.prisma.org.count(),
      this.prisma.content.count({ where: contentWhere }),
      since || until
        ? this.prisma.learningDailyStat.aggregate({
          where: { day: dateFilter(since, until), ...(orgId ? { user: { orgId } } : {}) },
          _sum: { duration: true },
        })
        : this.prisma.learningRecord.aggregate({ where: recordWhere, _sum: { duration: true } }),
    ]);

    const orgs = await this.prisma.org.findMany({ where: orgId ? { id: orgId } : { level: 2 } });
    const orgIds = orgs.map((o) => o.id);
    const orgStatsList = await Promise.all(orgIds.map((id) => this.getOrgStats(id, since, until)));

    const totalLearningSeconds = recordsAgg._sum.duration ?? 0;
    const overallTaskCompletionRate = avg(orgStatsList.map((s) => s.taskCompletionRate));
    const overallAvgQuizScore = avg(orgStatsList.map((s) => s.avgQuizScore));
    const overallExamPassRate = avg(orgStatsList.map((s) => s.examPassRate));

    return {
      totalUsers,
      totalOrgs,
      totalContents,
      totalLearningSeconds,
      overallTaskCompletionRate,
      overallAvgQuizScore,
      overallExamPassRate,
    };
  }

  async getOrgStats(orgId: number, since?: Date, until?: Date): Promise<OrgStats> {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException(`组织 ${orgId} 不存在`);

    const userCount = await this.prisma.user.count({ where: { orgId } });

    const recordsAgg = since || until
      ? await this.prisma.learningDailyStat.aggregate({
        where: { user: { orgId }, day: dateFilter(since, until) },
        _sum: { duration: true },
      })
      : await this.prisma.learningRecord.aggregate({
        where: { user: { orgId } },
        _sum: { duration: true },
      });
    const totalLearningSeconds = recordsAgg._sum.duration ?? 0;
    const avgLearningSeconds = userCount > 0 ? Math.round(totalLearningSeconds / userCount) : 0;

    // 任务完成率
    const tasks = await this.prisma.learningTask.findMany({
      where: { orgId },
      include: { contents: true },
    });
    let taskCompletionRate = 0;
    if (tasks.length > 0 && userCount > 0) {
      let totalAssignments = 0;
      let totalCompleted = 0;
      for (const t of tasks) {
        const participants = parseIds((t as any).participantUserIds);
        const denom = participants.length > 0 ? participants.length : userCount;
        totalAssignments += denom * t.contents.length;
        if (t.contents.length > 0) {
          const taskContentIds = t.contents.map((c) => c.contentId);
          const taskCompletedAgg = await this.prisma.learningRecord.groupBy({
            by: ['contentId'],
            where: {
              contentId: { in: taskContentIds },
              completed: true,
              ...(since || until ? { updatedAt: dateFilter(since, until) } : {}),
              ...(participants.length > 0
                ? { userId: { in: participants } }
                : { user: { orgId } }),
            },
            _count: true,
          });
          const taskCompletedMap = new Map(taskCompletedAgg.map((r) => [r.contentId, r._count]));
          for (const c of t.contents) {
            totalCompleted += taskCompletedMap.get(c.contentId) ?? 0;
          }
        }
      }
      taskCompletionRate = totalAssignments > 0 ? totalCompleted / totalAssignments : 0;
    }

    // 测验平均分
    const quizAgg = await this.prisma.quizRecord.aggregate({
      where: {
        user: { orgId },
        quiz: { type: 'PRACTICE' },
        submitTime: { not: null, ...dateFilter(since, until) },
      },
      _avg: { score: true },
    });
    const avgQuizScore = Math.round(quizAgg._avg.score ?? 0);

    // 考试通过率
    const examRecords = await this.prisma.quizRecord.findMany({
      where: {
        user: { orgId },
        quiz: { type: 'EXAM' },
        submitTime: { not: null, ...dateFilter(since, until) },
      },
      select: { passed: true },
    });
    const examPassRate =
      examRecords.length > 0
        ? examRecords.filter((r) => r.passed).length / examRecords.length
        : 0;

    return {
      orgId,
      orgName: org.name,
      userCount,
      totalLearningSeconds,
      avgLearningSeconds,
      taskCompletionRate,
      avgQuizScore,
      examPassRate,
    };
  }

  async getStatsByOrg(orgId?: number, since?: Date, until?: Date) {
    if (orgId) return [await this.getOrgStats(orgId, since, until)];
    const orgs = await this.prisma.org.findMany({ where: { level: 2 } });
    return Promise.all(orgs.map((o) => this.getOrgStats(o.id, since, until)));
  }

  async getLearningTrend(orgId?: number, days = 30) {
    const rangeDays = Math.min(Math.max(Math.trunc(days), 1), 365);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = new Date(today);
    since.setDate(since.getDate() - rangeDays + 1);
    const where: Prisma.LearningDailyStatWhereInput = { day: { gte: since } };
    if (orgId) where.user = { orgId };
    const records = await this.prisma.learningDailyStat.findMany({
      where,
      select: { duration: true, day: true },
    });
    const map = new Map<string, number>();

    // 先补齐日期轴，即使某天没有学习记录也能正常显示 0 值趋势。
    for (let index = 0; index < rangeDays; index++) {
      const day = new Date(since);
      day.setDate(since.getDate() + index);
      map.set(toLocalDateKey(day), 0);
    }

    records.forEach((r) => {
      const key = toLocalDateKey(r.day);
      map.set(key, (map.get(key) ?? 0) + r.duration);
    });

    // 兼容升级前的数据：按日统计尚未生成时，用学习记录最后更新时间回填 Demo 趋势。
    if (records.length === 0) {
      const legacyRecords = await this.prisma.learningRecord.findMany({
        where: {
          updatedAt: { gte: since },
          ...(orgId ? { user: { orgId } } : {}),
        },
        select: { duration: true, updatedAt: true },
      });
      legacyRecords.forEach((record) => {
        const key = toLocalDateKey(record.updatedAt);
        map.set(key, (map.get(key) ?? 0) + record.duration);
      });
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, duration]) => ({ date, duration }));
  }
}

function toLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function dateFilter(since?: Date, until?: Date): { gte?: Date; lt?: Date } {
  return { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) };
}

function parseIds(raw: any): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
