import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ContentType,
  LearningPathItemDto,
  LearningPathResultDto,
  MasteryStateDto,
  Role,
} from '@ai-party-school/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LearningEventService } from './learning-event.service';
import { PathNodeCandidate, planLearningPath } from './path-planner';

export interface LearningPathActor {
  id: number;
  role: Role;
  orgId: number;
}

const ALGORITHM_VERSION = 'graph-bkt-v1';

@Injectable()
export class LearningPathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly events: LearningEventService,
  ) {}

  async getMastery(userId: number): Promise<MasteryStateDto[]> {
    await this.events.processPendingForUser(userId);
    const nodes = await this.prisma.knowledgeNode.findMany({
      where: { active: true },
      include: { userStates: { where: { userId } } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
    return nodes.map((node) => {
      const state = node.userStates[0];
      return {
        nodeId: node.id,
        code: node.code,
        name: node.name,
        category: node.category,
        mastery: state?.mastery ?? node.pInit,
        attempts: state?.attempts ?? 0,
        correctCount: state?.correctCount ?? 0,
        lastEvidenceAt: state?.lastEvidenceAt?.toISOString() ?? null,
      };
    });
  }

  async generate(userId: number, requestedLimit = 5): Promise<LearningPathResultDto> {
    const limit = Math.max(1, Math.min(Number(requestedLimit) || 5, 20));
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    await this.events.processPendingForUser(userId);

    const [nodes, contents, states, graphVersion] = await Promise.all([
      this.prisma.knowledgeNode.findMany({
        where: { active: true },
        include: { incomingEdges: { where: { type: 'PREREQUISITE' } } },
      }),
      this.prisma.content.findMany({
        where: {
          OR: [
            { isPublic: true },
            { tasks: { some: { task: { orgId: user.orgId } } } },
          ],
        },
        include: {
          knowledgeBindings: { include: { node: true } },
          tasks: { include: { task: true } },
          records: { where: { userId }, take: 1 },
        },
      }),
      this.prisma.userKnowledgeState.findMany({ where: { userId } }),
      this.knowledge.getGraphVersion(),
    ]);
    const stateMap = new Map(states.map((state) => [state.nodeId, state]));
    const visibleContents = contents.filter((content) => content.isPublic || content.tasks.some(({ task }) => {
      if (task.orgId !== user.orgId) return false;
      const participantIds = parseIds(task.participantUserIds);
      return participantIds.length === 0 || participantIds.includes(userId);
    }));

    const plannerNodes: PathNodeCandidate[] = nodes.map((node) => ({
      id: node.id,
      code: node.code,
      name: node.name,
      difficulty: node.difficulty,
      mastery: stateMap.get(node.id)?.mastery ?? node.pInit,
      prerequisiteIds: node.incomingEdges.map((edge) => edge.fromNodeId),
      contents: visibleContents.flatMap((content) => {
        const binding = content.knowledgeBindings.find((item) => item.nodeId === node.id);
        if (!binding) return [];
        const record = content.records[0];
        const mandatory = content.tasks.some(({ task }) => {
          if (task.orgId !== user.orgId) return false;
          const participantIds = parseIds(task.participantUserIds);
          return participantIds.length === 0 || participantIds.includes(userId);
        });
        return [{
          id: content.id,
          title: content.title,
          type: content.type as ContentType,
          difficulty: binding.difficulty,
          mandatory,
          completed: record?.completed ?? false,
          progress: record?.progress ?? 0,
        }];
      }),
    }));

    const planned = planLearningPath(plannerNodes, limit);
    const fallback = planned.length === 0;
    const apiItems: LearningPathItemDto[] = fallback
      ? this.fallbackItems(visibleContents, userId, limit)
      : planned.map((item, index) => ({
          rank: index + 1,
          nodeId: item.nodeId,
          nodeCode: item.nodeCode,
          nodeName: item.nodeName,
          contentId: item.content.id,
          title: item.content.title,
          contentType: item.content.type,
          difficulty: item.content.difficulty,
          mastery: item.mastery,
          score: item.score,
          reason: item.reason,
          status: item.content.completed ? 'COMPLETED' : item.content.progress > 0 ? 'IN_PROGRESS' : 'PENDING',
          breakdown: item.breakdown,
        }));

    const snapshot = await this.prisma.learningPathSnapshot.create({
      data: {
        userId,
        algorithmVersion: ALGORITHM_VERSION,
        graphVersion,
        context: JSON.stringify({ fallback, threshold: 0.65, limit }),
        items: {
          create: apiItems.map((item) => ({
            nodeId: item.nodeId,
            contentId: item.contentId,
            rank: item.rank,
            score: item.score,
            reason: item.reason,
            breakdown: JSON.stringify(item.breakdown),
            status: item.status,
          })),
        },
      },
    });
    const masterySummary = this.toMasterySummary(nodes, stateMap);
    return {
      algorithmVersion: ALGORITHM_VERSION,
      snapshotId: snapshot.id,
      graphVersion,
      generatedAt: snapshot.generatedAt.toISOString(),
      fallback,
      masterySummary,
      items: apiItems,
    };
  }

  async generateForActor(targetUserId: number, actor: LearningPathActor, limit = 5) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, orgId: true } });
    if (!target) throw new NotFoundException('用户不存在');
    if (actor.role === Role.SECRETARY && target.orgId !== actor.orgId) {
      throw new ForbiddenException('无权查看其他支部党员的学习路径');
    }
    return this.generate(targetUserId, limit);
  }

  private toMasterySummary(nodes: any[], stateMap: Map<number, any>): MasteryStateDto[] {
    return nodes.map((node) => {
      const state = stateMap.get(node.id);
      return {
        nodeId: node.id,
        code: node.code,
        name: node.name,
        category: node.category,
        mastery: state?.mastery ?? node.pInit,
        attempts: state?.attempts ?? 0,
        correctCount: state?.correctCount ?? 0,
        lastEvidenceAt: state?.lastEvidenceAt?.toISOString() ?? null,
      };
    }).sort((a, b) => a.mastery - b.mastery || a.nodeId - b.nodeId);
  }

  private fallbackItems(contents: any[], userId: number, limit: number): LearningPathItemDto[] {
    return contents
      .map((content) => {
        const record = content.records?.find((item: any) => item.userId === userId) ?? content.records?.[0];
        const mandatory = content.tasks.some(({ task }: any) => {
          const ids = parseIds(task.participantUserIds);
          return ids.length === 0 || ids.includes(userId);
        });
        return { content, record, mandatory };
      })
      .sort((a, b) => Number(b.mandatory) - Number(a.mandatory)
        || Number(a.record?.completed ?? false) - Number(b.record?.completed ?? false)
        || a.content.id - b.content.id)
      .slice(0, limit)
      .map(({ content, record, mandatory }, index) => ({
        rank: index + 1,
        nodeId: null,
        nodeCode: 'FALLBACK',
        nodeName: '通用学习',
        contentId: content.id,
        title: content.title,
        contentType: content.type as ContentType,
        difficulty: 1,
        mastery: 0,
        score: mandatory ? 0.2 : 0.1,
        reason: mandatory ? '当前知识图谱暂无可用路径，优先推荐所属支部的必修任务。' : '当前知识图谱暂无可用路径，推荐公开学习内容。',
        status: record?.completed ? 'COMPLETED' : record?.progress > 0 ? 'IN_PROGRESS' : 'PENDING',
        breakdown: { weakness: 0, readiness: 0, difficultyFit: 0, novelty: record?.completed ? 0 : 1, mandatory: mandatory ? 1 : 0 },
      }));
  }
}

function parseIds(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.filter((item): item is number => Number.isInteger(item));
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}
