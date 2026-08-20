import { describe, expect, it } from 'vitest';
import { guessProbability, updateBktMastery } from './bkt';

describe('BKT', () => {
  it('答对后提高掌握度', () => {
    const next = updateBktMastery({ prior: 0.2, correct: true, pLearn: 0.15, pSlip: 0.1, pGuess: 0.25 });
    expect(next).toBeCloseTo(0.5526315789, 8);
  });

  it('答错后仍应用学习转移并保持概率边界', () => {
    const next = updateBktMastery({ prior: 0.2, correct: false, pLearn: 0.15, pSlip: 0.1, pGuess: 0.25 });
    expect(next).toBeCloseTo(0.1774193548, 8);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThanOrEqual(1);
  });

  it('按题型返回猜测概率', () => {
    expect(guessProbability('SINGLE')).toBe(0.25);
    expect(guessProbability('JUDGE')).toBe(0.5);
    expect(guessProbability('MULTIPLE')).toBe(0.1);
  });
});
