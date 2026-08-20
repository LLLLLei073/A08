import { describe, expect, it } from 'vitest';
import { selectAdaptiveQuestions } from './adaptive-paper';

describe('薄弱知识点智能组卷', () => {
  it('优先选择薄弱、未近期使用且覆盖不同知识点的试题', () => {
    const selected = selectAdaptiveQuestions([
      { questionId: 1, nodeId: 1, mastery: .1, difficulty: 1, type: 'SINGLE', recentlyUsed: false },
      { questionId: 2, nodeId: 1, mastery: .1, difficulty: 1, type: 'JUDGE', recentlyUsed: false },
      { questionId: 3, nodeId: 2, mastery: .2, difficulty: 2, type: 'SINGLE', recentlyUsed: false },
      { questionId: 4, nodeId: 3, mastery: .8, difficulty: 4, type: 'SINGLE', recentlyUsed: true },
    ], 3);
    expect(selected.map((item) => item.questionId)).not.toContain(4);
    expect(new Set(selected.map((item) => item.nodeId)).size).toBeGreaterThan(1);
  });
});
