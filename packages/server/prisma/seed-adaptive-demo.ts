/**
 * 自适应学习功能演示夹具。
 * 仅用于功能演示与可复现验收，不代表真实训练数据或算法效果实验。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const nodeFixtures = [
  ['K01', '党的性质与宗旨', '理论基础', 1], ['K02', '党章基本结构', '理论基础', 1],
  ['K03', '党员义务与权利', '党章党规', 2], ['K04', '组织生活制度', '组织建设', 2],
  ['K05', '纪律处分基础', '纪律教育', 2], ['K06', '廉洁纪律实践', '纪律教育', 3],
  ['K07', '马克思主义基本原理', '理论基础', 2], ['K08', '新时代党的创新理论', '理论基础', 3],
  ['K09', '党史发展脉络', '党史教育', 2], ['K10', '群众路线与群众工作', '实践能力', 3],
  ['K11', '基层支部治理', '组织建设', 4], ['K12', '综合实践与决策', '实践能力', 5],
] as const;

const edges = [
  ['K01', 'K02'], ['K02', 'K03'], ['K02', 'K04'], ['K03', 'K05'], ['K05', 'K06'],
  ['K07', 'K08'], ['K09', 'K08'], ['K01', 'K10'], ['K09', 'K10'], ['K10', 'K11'],
  ['K04', 'K11'], ['K06', 'K11'], ['K08', 'K12'], ['K11', 'K12'], ['K05', 'K12'],
] as const;

async function main() {
  const nodeIds = new Map<string, number>();
  const questionIds: number[] = [];

  for (const [code, name, category, difficulty] of nodeFixtures) {
    const node = await prisma.knowledgeNode.upsert({
      where: { code },
      create: { code, name, category, difficulty, description: `${name}相关核心概念与实践要求。` },
      update: { name, category, difficulty, active: true },
    });
    nodeIds.set(code, node.id);

    const contentTitle = `学习专题：${name}`;
    let content = await prisma.content.findFirst({ where: { title: contentTitle } });
    content ??= await prisma.content.create({
      data: {
        title: contentTitle,
        type: difficulty % 2 === 0 ? 'VIDEO' : 'ARTICLE',
        body: `本专题围绕“${name}”梳理核心概念、制度要求与实践案例。此内容为比赛功能演示夹具。`,
        category,
        tags: JSON.stringify(['知识图谱', category, '演示夹具']),
        isPublic: true,
        duration: 8 + difficulty * 4,
      },
    });
    await prisma.contentKnowledge.upsert({
      where: { contentId_nodeId: { contentId: content.id, nodeId: node.id } },
      create: { contentId: content.id, nodeId: node.id, weight: 1, difficulty },
      update: { weight: 1, difficulty },
    });

    const questionTemplates = [
      { type: 'SINGLE', stem: `关于“${name}”的核心要求，下列哪项表述正确？`, options: ['A. 符合制度与理论要求', 'B. 可以脱离组织监督', 'C. 只强调形式不重实效', 'D. 与党员实践无关'], answer: 'A' },
      { type: 'JUDGE', stem: `学习“${name}”应坚持理论联系实际。`, options: ['正确', '错误'], answer: 'true' },
      { type: 'MULTIPLE', stem: `推进“${name}”学习应重视哪些方面？`, options: ['A. 理论理解', 'B. 制度规范', 'C. 实践运用', 'D. 拒绝复盘'], answer: 'ABC' },
    ];
    for (let index = 0; index < questionTemplates.length; index++) {
      const fixture = questionTemplates[index];
      let question = await prisma.question.findFirst({ where: { stem: fixture.stem } });
      question ??= await prisma.question.create({
        data: { ...fixture, options: JSON.stringify(fixture.options), category, analysis: `本题考查知识点“${name}”。` },
      });
      questionIds.push(question.id);
      await prisma.questionKnowledge.upsert({
        where: { questionId_nodeId: { questionId: question.id, nodeId: node.id } },
        create: { questionId: question.id, nodeId: node.id, weight: 1, difficulty },
        update: { weight: 1, difficulty },
      });
    }
  }

  for (const [from, to] of edges) {
    await prisma.knowledgeEdge.upsert({
      where: { fromNodeId_toNodeId_type: { fromNodeId: nodeIds.get(from)!, toNodeId: nodeIds.get(to)!, type: 'PREREQUISITE' } },
      create: { fromNodeId: nodeIds.get(from)!, toNodeId: nodeIds.get(to)!, type: 'PREREQUISITE', weight: 1 },
      update: { weight: 1 },
    });
  }

  const paperTitle = '自适应学习诊断演示卷';
  let paper = await prisma.paper.findFirst({ where: { title: paperTitle } });
  paper ??= await prisma.paper.create({ data: { title: paperTitle, totalScore: 100, passScore: 60, duration: 30 } });
  for (const [index, questionId] of questionIds.filter((_, index) => index % 3 === 0).slice(0, 10).entries()) {
    await prisma.paperQuestion.upsert({
      where: { paperId_questionId: { paperId: paper.id, questionId } },
      create: { paperId: paper.id, questionId, score: 10, sort: index + 1 },
      update: { score: 10, sort: index + 1 },
    });
  }

  const org = await prisma.org.findFirst({ where: { level: 2 }, orderBy: { id: 'asc' } });
  if (org) {
    const existingQuiz = await prisma.quiz.findFirst({ where: { paperId: paper.id, orgId: org.id } });
    if (!existingQuiz) {
      await prisma.quiz.create({
        data: {
          paperId: paper.id, orgId: org.id, type: 'PRACTICE', duration: 60,
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          participantUserIds: '[]',
        },
      });
    }
  }

  const users = await prisma.user.findMany({ where: { role: 'MEMBER' }, take: 6, orderBy: { id: 'asc' } });
  const evidenceQuestions = await prisma.question.findMany({
    where: { id: { in: questionIds.slice(0, 18) } }, select: { id: true, type: true }, orderBy: { id: 'asc' },
  });
  for (const [userIndex, user] of users.entries()) {
    for (const [questionIndex, question] of evidenceQuestions.entries()) {
      const isCorrect = (questionIndex + userIndex) % (userIndex + 2) !== 0;
      const sourceKey = `demo-fixture:${user.id}:${question.id}`;
      await prisma.learningEvent.upsert({
        where: { sourceKey },
        create: {
          userId: user.id, orgId: user.orgId, eventType: 'QUIZ_ANSWER', subjectType: 'QUESTION', subjectId: question.id,
          sourceKey, payload: JSON.stringify({ isCorrect, questionType: question.type, fixture: true }),
          occurredAt: new Date(Date.now() - (evidenceQuestions.length - questionIndex) * 60_000),
        },
        update: {},
      });
    }
  }

  await prisma.setting.upsert({ where: { key: 'knowledge.graphVersion' }, create: { key: 'knowledge.graphVersion', value: '1' }, update: {} });
  console.log(`Adaptive demo seeded: ${nodeFixtures.length} nodes, ${edges.length} edges, ${questionIds.length} questions, ${users.length} learner profiles.`);
}

main().finally(() => prisma.$disconnect());
