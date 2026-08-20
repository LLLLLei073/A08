import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateKnowledgeBindingDto,
  CreateKnowledgeEdgeDto,
  CreateKnowledgeNodeDto,
  KnowledgeResourceType,
  UpdateKnowledgeNodeDto,
} from '@ai-party-school/shared';
import { PrismaService } from '../../prisma/prisma.service';

const GRAPH_VERSION_KEY = 'knowledge.graphVersion';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async getGraph() {
    const [nodes, edges, version] = await Promise.all([
      this.prisma.knowledgeNode.findMany({
        include: {
          contents: { include: { content: { select: { id: true, title: true, type: true } } } },
          questions: { include: { question: { select: { id: true, stem: true, type: true } } } },
        },
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      }),
      this.prisma.knowledgeEdge.findMany({ orderBy: { id: 'asc' } }),
      this.getGraphVersion(),
    ]);
    return { version, nodes, edges };
  }

  async createNode(dto: CreateKnowledgeNodeDto) {
    try {
      const node = await this.prisma.knowledgeNode.create({ data: dto });
      await this.bumpGraphVersion();
      return node;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('知识点编码已存在');
      throw error;
    }
  }

  async updateNode(id: number, dto: UpdateKnowledgeNodeDto) {
    await this.requireNode(id);
    try {
      const node = await this.prisma.knowledgeNode.update({ where: { id }, data: dto });
      await this.bumpGraphVersion();
      return node;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('知识点编码已存在');
      throw error;
    }
  }

  async removeNode(id: number) {
    await this.requireNode(id);
    await this.prisma.knowledgeNode.delete({ where: { id } });
    await this.bumpGraphVersion();
    return { success: true };
  }

  async createEdge(dto: CreateKnowledgeEdgeDto) {
    if (dto.fromNodeId === dto.toNodeId) throw new BadRequestException('知识点不能以自身作为先修知识');
    await Promise.all([this.requireNode(dto.fromNodeId), this.requireNode(dto.toNodeId)]);
    if (await this.wouldCreateCycle(dto.fromNodeId, dto.toNodeId)) {
      throw new BadRequestException('新增先修关系会形成循环依赖');
    }
    try {
      const edge = await this.prisma.knowledgeEdge.create({
        data: { ...dto, type: 'PREREQUISITE', weight: dto.weight ?? 1 },
      });
      await this.bumpGraphVersion();
      return edge;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('该先修关系已存在');
      throw error;
    }
  }

  async removeEdge(id: number) {
    const edge = await this.prisma.knowledgeEdge.findUnique({ where: { id } });
    if (!edge) throw new NotFoundException('先修关系不存在');
    await this.prisma.knowledgeEdge.delete({ where: { id } });
    await this.bumpGraphVersion();
    return { success: true };
  }

  async createBinding(dto: CreateKnowledgeBindingDto) {
    const node = await this.requireNode(dto.nodeId);
    const difficulty = dto.difficulty ?? node.difficulty;
    if (dto.resourceType === KnowledgeResourceType.CONTENT) {
      const content = await this.prisma.content.findUnique({ where: { id: dto.resourceId } });
      if (!content) throw new NotFoundException('学习内容不存在');
      const binding = await this.prisma.contentKnowledge.upsert({
        where: { contentId_nodeId: { contentId: dto.resourceId, nodeId: dto.nodeId } },
        create: { contentId: dto.resourceId, nodeId: dto.nodeId, weight: dto.weight ?? 1, difficulty },
        update: { weight: dto.weight ?? 1, difficulty },
      });
      await this.bumpGraphVersion();
      return binding;
    }
    if (dto.resourceType === KnowledgeResourceType.QUESTION) {
      const question = await this.prisma.question.findUnique({ where: { id: dto.resourceId } });
      if (!question) throw new NotFoundException('试题不存在');
      const binding = await this.prisma.questionKnowledge.upsert({
        where: { questionId_nodeId: { questionId: dto.resourceId, nodeId: dto.nodeId } },
        create: { questionId: dto.resourceId, nodeId: dto.nodeId, weight: dto.weight ?? 1, difficulty },
        update: { weight: dto.weight ?? 1, difficulty },
      });
      await this.bumpGraphVersion();
      return binding;
    }
    throw new BadRequestException('资源类型不合法');
  }

  async removeBinding(resourceType: KnowledgeResourceType, resourceId: number, nodeId: number) {
    if (resourceType === KnowledgeResourceType.CONTENT) {
      await this.prisma.contentKnowledge.delete({ where: { contentId_nodeId: { contentId: resourceId, nodeId } } });
    } else if (resourceType === KnowledgeResourceType.QUESTION) {
      await this.prisma.questionKnowledge.delete({ where: { questionId_nodeId: { questionId: resourceId, nodeId } } });
    } else {
      throw new BadRequestException('资源类型不合法');
    }
    await this.bumpGraphVersion();
    return { success: true };
  }

  async getGraphVersion() {
    const value = await this.prisma.setting.findUnique({ where: { key: GRAPH_VERSION_KEY } });
    return Number.parseInt(value?.value ?? '1', 10) || 1;
  }

  private async requireNode(id: number) {
    const node = await this.prisma.knowledgeNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('知识点不存在');
    return node;
  }

  private async wouldCreateCycle(fromNodeId: number, toNodeId: number) {
    const edges = await this.prisma.knowledgeEdge.findMany({ select: { fromNodeId: true, toNodeId: true } });
    const adjacency = new Map<number, number[]>();
    for (const edge of edges) {
      const next = adjacency.get(edge.fromNodeId) ?? [];
      next.push(edge.toNodeId);
      adjacency.set(edge.fromNodeId, next);
    }
    const stack = [toNodeId];
    const visited = new Set<number>();
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromNodeId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(adjacency.get(current) ?? []));
    }
    return false;
  }

  private async bumpGraphVersion() {
    const current = await this.getGraphVersion();
    await this.prisma.setting.upsert({
      where: { key: GRAPH_VERSION_KEY },
      create: { key: GRAPH_VERSION_KEY, value: String(current + 1) },
      update: { value: String(current + 1) },
    });
  }
}
