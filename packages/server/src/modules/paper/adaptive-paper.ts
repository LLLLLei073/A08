export interface AdaptiveQuestionCandidate {
  questionId: number;
  nodeId: number;
  mastery: number;
  difficulty: number;
  type: string;
  recentlyUsed: boolean;
}

/** 按薄弱度、难度匹配、新颖度评分，并以节点惩罚提高知识覆盖。 */
export function selectAdaptiveQuestions(candidates: AdaptiveQuestionCandidate[], count: number) {
  const selected: AdaptiveQuestionCandidate[] = [];
  const remaining = [...new Map(candidates.map((candidate) => [candidate.questionId, candidate])).values()];
  const nodeCounts = new Map<number, number>();
  while (selected.length < count && remaining.length > 0) {
    remaining.sort((a, b) => adjustedScore(b, nodeCounts) - adjustedScore(a, nodeCounts) || a.questionId - b.questionId);
    const next = remaining.shift()!;
    selected.push(next);
    nodeCounts.set(next.nodeId, (nodeCounts.get(next.nodeId) ?? 0) + 1);
  }
  return selected;
}

function adjustedScore(candidate: AdaptiveQuestionCandidate, nodeCounts: Map<number, number>) {
  const targetDifficulty = Math.min(5, Math.max(1, 1 + 4 * candidate.mastery));
  const weakness = 1 - candidate.mastery;
  const difficultyFit = 1 - Math.abs(candidate.difficulty - targetDifficulty) / 4;
  const novelty = candidate.recentlyUsed ? 0 : 1;
  return weakness * .6 + difficultyFit * .3 + novelty * .1 - (nodeCounts.get(candidate.nodeId) ?? 0) * .15;
}
