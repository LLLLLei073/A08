import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { ContentType } from '@ai-party-school/shared';
import { PathNodeCandidate, planLearningPath } from './path-planner';

describe('路径规划性能', () => {
  it('200节点、近1000条先修关系时低于300ms', () => {
    const nodes: PathNodeCandidate[] = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1,
      code: `K${index + 1}`,
      name: `知识点${index + 1}`,
      difficulty: index % 5 + 1,
      mastery: (index % 6) / 10,
      prerequisiteIds: Array.from({ length: Math.min(5, index) }, (_, offset) => index - offset),
      contents: [{ id: 1000 + index, title: `课程${index + 1}`, type: ContentType.ARTICLE, difficulty: index % 5 + 1, mandatory: index % 3 === 0, completed: false, progress: 0 }],
    }));
    const start = performance.now();
    const result = planLearningPath(nodes, 5);
    const elapsed = performance.now() - start;
    expect(result.length).toBeLessThanOrEqual(5);
    expect(elapsed).toBeLessThan(300);
  });
});
