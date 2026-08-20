import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EngagementRiskDto, EngagementRiskFactorDto, NotifyLevel, NotifyScope, Role } from '@ai-party-school/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

interface EngagementActor { id: number; role: Role; orgId: number; }
const DAY = 86_400_000;

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationService) {}

  async evaluate(actor: EngagementActor, requestedOrgId?: number) {
    const orgId = actor.role === Role.SECRETARY ? actor.orgId : requestedOrgId;
    const users = await this.prisma.user.findMany({ where: { role: 'MEMBER', ...(orgId ? { orgId } : {}) }, include: { org: true } });
    const results: EngagementRiskDto[] = [];
    for (const user of users) results.push(await this.evaluateUser(user));
    return results.sort((a, b) => b.score - a.score);
  }

  async list(actor: EngagementActor, requestedOrgId?: number) {
    const orgId = actor.role === Role.SECRETARY ? actor.orgId : requestedOrgId;
    const snapshots = await this.prisma.engagementRiskSnapshot.findMany({
      where: orgId ? { orgId } : undefined,
      include: { user: true, org: true },
      orderBy: [{ score: 'desc' }, { evaluatedAt: 'desc' }],
    });
    return snapshots.map((snapshot) => this.map(snapshot));
  }

  async remind(userId: number, actor: EngagementActor) {
    const snapshot = await this.prisma.engagementRiskSnapshot.findUnique({ where: { userId }, include: { user: true } });
    if (!snapshot) throw new NotFoundException('请先评估该党员的参与度风险');
    if (actor.role === Role.SECRETARY && snapshot.orgId !== actor.orgId) throw new ForbiddenException('只能提醒本支部党员');
    await this.notifications.send(actor, {
      title: '学习计划温馨提醒',
      content: '近期学习参与度有所下降，建议登录数智党校查看个性化学习路径并完成待办任务。如有困难，可联系支部书记获得帮助。',
      level: NotifyLevel.IMPORTANT,
      scope: NotifyScope.USER,
      userIds: [userId],
      syncToGroup: false,
    });
    const updated = await this.prisma.engagementRiskSnapshot.update({ where: { userId }, data: { lastNotifiedAt: new Date() }, include: { user: true, org: true } });
    return this.map(updated);
  }

  private async evaluateUser(user: any): Promise<EngagementRiskDto> {
    const now = new Date();
    const since28 = new Date(now.getTime() - 28 * DAY);
    const since14 = new Date(now.getTime() - 14 * DAY);
    const [lastRecord, dailyStats, quizRecords, tasks, notificationTotal, notificationUnread] = await Promise.all([
      this.prisma.learningRecord.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.learningDailyStat.findMany({ where: { userId: user.id, day: { gte: since28 } }, select: { day: true, duration: true } }),
      this.prisma.quizRecord.findMany({ where: { userId: user.id, submitTime: { gte: since28 } }, select: { score: true, submitTime: true } }),
      this.prisma.learningTask.findMany({ where: { orgId: user.orgId, deadline: { lt: now } }, include: { contents: true } }),
      this.prisma.notificationRecipient.count({ where: { userId: user.id } }),
      this.prisma.notificationRecipient.count({ where: { userId: user.id, isRead: false } }),
    ]);
    const inactivityDays = lastRecord ? Math.max(0, Math.floor((now.getTime() - lastRecord.updatedAt.getTime()) / DAY)) : 30;
    let overdue = 0;
    for (const task of tasks) {
      const participantIds = parseIds(task.participantUserIds);
      if (participantIds.length && !participantIds.includes(user.id)) continue;
      const contentIds = task.contents.map((item) => item.contentId);
      const completed = contentIds.length ? await this.prisma.learningRecord.count({ where: { userId: user.id, contentId: { in: contentIds }, completed: true } }) : 0;
      overdue += Math.max(0, contentIds.length - completed);
    }
    const recentDuration = dailyStats.filter((item) => item.day >= since14).reduce((sum, item) => sum + item.duration, 0);
    const previousDuration = dailyStats.filter((item) => item.day < since14).reduce((sum, item) => sum + item.duration, 0);
    const learningDrop = previousDuration > 0 ? Math.max(0, (previousDuration - recentDuration) / previousDuration) : 0;
    const recentScores = quizRecords.filter((item) => item.submitTime! >= since14).map((item) => item.score ?? 0);
    const previousScores = quizRecords.filter((item) => item.submitTime! < since14).map((item) => item.score ?? 0);
    const scoreDrop = previousScores.length && recentScores.length ? Math.max(0, average(previousScores) - average(recentScores)) : 0;
    const unreadRate = notificationTotal ? notificationUnread / notificationTotal : 0;
    const factors: EngagementRiskFactorDto[] = [
      { code: 'INACTIVITY', label: '连续未学习天数', value: inactivityDays, contribution: inactivityDays >= 14 ? 40 : inactivityDays >= 7 ? 25 : inactivityDays >= 3 ? 10 : 0 },
      { code: 'OVERDUE_TASKS', label: '逾期内容数量', value: overdue, contribution: Math.min(30, overdue * 10) },
      { code: 'LEARNING_TREND', label: '学习时长下降比例', value: learningDrop, contribution: learningDrop >= .5 ? 15 : learningDrop >= .25 ? 8 : 0 },
      { code: 'SCORE_TREND', label: '测验平均分下降', value: scoreDrop, contribution: scoreDrop >= 15 ? 15 : scoreDrop >= 8 ? 8 : 0 },
      { code: 'UNREAD_NOTIFICATIONS', label: '通知未读比例', value: unreadRate, contribution: unreadRate > .5 ? 10 : 0 },
    ];
    const score = Math.min(100, factors.reduce((sum, factor) => sum + factor.contribution, 0));
    const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
    const snapshot = await this.prisma.engagementRiskSnapshot.upsert({
      where: { userId: user.id },
      create: { userId: user.id, orgId: user.orgId, score, level, factors: JSON.stringify(factors), ruleVersion: 'engagement-rules-v1', evaluatedAt: now },
      update: { orgId: user.orgId, score, level, factors: JSON.stringify(factors), ruleVersion: 'engagement-rules-v1', evaluatedAt: now },
      include: { user: true, org: true },
    });
    return this.map(snapshot);
  }

  private map(snapshot: any): EngagementRiskDto {
    return {
      userId: snapshot.userId, userName: snapshot.user.name, orgId: snapshot.orgId, orgName: snapshot.org.name,
      score: snapshot.score, level: snapshot.level, factors: JSON.parse(snapshot.factors || '[]'),
      evaluatedAt: snapshot.evaluatedAt.toISOString(), lastNotifiedAt: snapshot.lastNotifiedAt?.toISOString() ?? null,
      note: '透明规则评估，仅用于学习关怀提醒，不代表情绪识别或临床判断。',
    };
  }
}

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function parseIds(raw: string): number[] { try { const value = JSON.parse(raw || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
