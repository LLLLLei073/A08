export interface BktUpdateInput {
  prior: number;
  correct: boolean;
  pLearn: number;
  pSlip: number;
  pGuess: number;
}

export function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Bayesian Knowledge Tracing 单次证据更新。 */
export function updateBktMastery(input: BktUpdateInput) {
  const prior = clampProbability(input.prior);
  const pLearn = clampProbability(input.pLearn);
  const pSlip = clampProbability(input.pSlip);
  const pGuess = clampProbability(input.pGuess);
  const numerator = input.correct ? prior * (1 - pSlip) : prior * pSlip;
  const denominator = input.correct
    ? numerator + (1 - prior) * pGuess
    : numerator + (1 - prior) * (1 - pGuess);
  const posterior = denominator === 0 ? prior : numerator / denominator;
  return clampProbability(posterior + (1 - posterior) * pLearn);
}

export function guessProbability(questionType: string) {
  if (questionType === 'JUDGE') return 0.5;
  if (questionType === 'MULTIPLE') return 0.1;
  return 0.25;
}
