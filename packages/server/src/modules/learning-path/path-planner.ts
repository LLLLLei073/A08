import { ContentType, LearningPathScoreBreakdown } from '@ai-party-school/shared';

export interface PathContentCandidate {
  id: number;
  title: string;
  type: ContentType;
  difficulty: number;
  mandatory: boolean;
  completed: boolean;
  progress: number;
}

export interface PathNodeCandidate {
  id: number;
  code: string;
  name: string;
  difficulty: number;
  mastery: number;
  prerequisiteIds: number[];
  contents: PathContentCandidate[];
}

export interface PlannedPathItem {
  nodeId: number;
  nodeCode: string;
  nodeName: string;
  content: PathContentCandidate;
  mastery: number;
  score: number;
  reason: string;
  breakdown: LearningPathScoreBreakdown;
}

export const MASTERY_THRESHOLD = 0.65;

const SCORE_WEIGHTS: LearningPathScoreBreakdown = {
  weakness: 0.35,
  readiness: 0.25,
  difficultyFit: 0.2,
  novelty: 0.1,
  mandatory: 0.1,
};

/** 先修约束下的贪心拓扑路径规划，复杂度 O(V + E + C log C)。 */
export function planLearningPath(nodes: PathNodeCandidate[], limit = 5): PlannedPathItem[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const targets = nodes
    .filter((node) => node.mastery < MASTERY_THRESHOLD)
    .sort((a, b) => a.mastery - b.mastery || a.id - b.id);
  const ordered: number[] = [];
  const visited = new Set<number>();

  const visit = (nodeId: number) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return;
    for (const prerequisiteId of node.prerequisiteIds) {
      const prerequisite = nodeMap.get(prerequisiteId);
      if (prerequisite && prerequisite.mastery < MASTERY_THRESHOLD) visit(prerequisiteId);
    }
    ordered.push(nodeId);
  };
  for (const target of targets) visit(target.id);

  const satisfiedNodes = new Set(nodes.filter((node) => node.mastery >= MASTERY_THRESHOLD).map((node) => node.id));
  const usedContents = new Set<number>();
  const result: PlannedPathItem[] = [];
  for (const nodeId of ordered) {
    if (result.length >= Math.max(1, Math.min(limit, 20))) break;
    const node = nodeMap.get(nodeId)!;
    const unresolved = node.prerequisiteIds.some((id) => {
      const prerequisite = nodeMap.get(id);
      return prerequisite && prerequisite.mastery < MASTERY_THRESHOLD && !satisfiedNodes.has(id);
    });
    if (unresolved) continue;

    const best = node.contents
      .filter((content) => !usedContents.has(content.id))
      .map((content) => scoreCandidate(node, content, nodeMap))
      .sort((a, b) => b.score - a.score || a.content.id - b.content.id)[0];
    if (!best) continue;
    result.push(best);
    usedContents.add(best.content.id);
    satisfiedNodes.add(node.id);
  }
  return result;
}

function scoreCandidate(
  node: PathNodeCandidate,
  content: PathContentCandidate,
  nodeMap: Map<number, PathNodeCandidate>,
): PlannedPathItem {
  const prerequisiteMasteries = node.prerequisiteIds
    .map((id) => nodeMap.get(id)?.mastery)
    .filter((value): value is number => value !== undefined);
  const readiness = prerequisiteMasteries.length
    ? prerequisiteMasteries.reduce((sum, value) => sum + value, 0) / prerequisiteMasteries.length
    : 1;
  const targetDifficulty = Math.min(5, Math.max(1, 1 + 4 * node.mastery));
  const breakdown: LearningPathScoreBreakdown = {
    weakness: round(1 - node.mastery),
    readiness: round(readiness),
    difficultyFit: round(1 - Math.abs(content.difficulty - targetDifficulty) / 4),
    novelty: content.completed ? 0 : 1,
    mandatory: content.mandatory ? 1 : 0,
  };
  const score = round(
    breakdown.weakness * SCORE_WEIGHTS.weakness
      + breakdown.readiness * SCORE_WEIGHTS.readiness
      + breakdown.difficultyFit * SCORE_WEIGHTS.difficultyFit
      + breakdown.novelty * SCORE_WEIGHTS.novelty
      + breakdown.mandatory * SCORE_WEIGHTS.mandatory,
  );
  const reason = content.completed
    ? `“${node.name}”掌握度为${percent(node.mastery)}，建议复习巩固该知识点。`
    : `“${node.name}”掌握度为${percent(node.mastery)}，该内容难度与当前水平匹配${content.mandatory ? '，且属于必修任务' : ''}。`;
  return { nodeId: node.id, nodeCode: node.code, nodeName: node.name, content, mastery: node.mastery, score, reason, breakdown };
}

function round(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
