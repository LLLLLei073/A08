import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService 环检测', () => {
  let prisma: any;
  let service: KnowledgeService;

  beforeEach(() => {
    prisma = {
      knowledgeNode: { findUnique: vi.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id })) },
      knowledgeEdge: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 9 }) },
      setting: { findUnique: vi.fn().mockResolvedValue({ value: '1' }), upsert: vi.fn() },
    };
    service = new KnowledgeService(prisma);
  });

  it('拒绝自环', async () => {
    await expect(service.createEdge({ fromNodeId: 1, toNodeId: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('拒绝形成间接循环的边', async () => {
    prisma.knowledgeEdge.findMany.mockResolvedValue([{ fromNodeId: 2, toNodeId: 1 }]);
    await expect(service.createEdge({ fromNodeId: 1, toNodeId: 2 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.knowledgeEdge.create).not.toHaveBeenCalled();
  });

  it('允许无环的先修边并提升图谱版本', async () => {
    await expect(service.createEdge({ fromNodeId: 1, toNodeId: 2, weight: 1 })).resolves.toEqual({ id: 9 });
    expect(prisma.setting.upsert).toHaveBeenCalled();
  });
});
