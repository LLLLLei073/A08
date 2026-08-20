import { describe, expect, it } from 'vitest';
import { ContentType } from '@ai-party-school/shared';
import { planLearningPath, PathNodeCandidate } from './path-planner';

const nodes: PathNodeCandidate[] = [
  {
    id: 1, code: 'A', name: '基础', difficulty: 1, mastery: 0.2, prerequisiteIds: [],
    contents: [{ id: 10, title: '基础课', type: ContentType.ARTICLE, difficulty: 1, mandatory: true, completed: false, progress: 0 }],
  },
  {
    id: 2, code: 'B', name: '进阶', difficulty: 3, mastery: 0.1, prerequisiteIds: [1],
    contents: [{ id: 20, title: '进阶课', type: ContentType.VIDEO, difficulty: 2, mandatory: false, completed: false, progress: 0 }],
  },
];

describe('自适应学习路径规划', () => {
  it('未掌握的先修知识排在进阶知识之前', () => {
    expect(planLearningPath(nodes, 5).map((item) => item.nodeCode)).toEqual(['A', 'B']);
  });

  it('先修知识缺少可学内容时不越级推荐进阶内容', () => {
    const missingPrerequisite = nodes.map((node) => node.id === 1 ? { ...node, contents: [] } : node);
    expect(planLearningPath(missingPrerequisite, 5)).toEqual([]);
  });

  it('不重复推荐同一内容', () => {
    const duplicated = nodes.map((node) => ({ ...node, prerequisiteIds: [], contents: [{ ...nodes[0].contents[0] }] }));
    expect(planLearningPath(duplicated, 5)).toHaveLength(1);
  });
});
