import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding...');

  const seedPassword = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value || value.length < 12 || /CHANGE[_-]?ME/i.test(value)) {
      throw new Error('请在环境变量中提供至少 12 位且非占位符的 ' + name);
    }
    return value;
  };

  // 组织
  const existingRoot = await prisma.org.findFirst({ where: { name: '智瀑科技党委' } });
  const root = existingRoot ?? await prisma.org.create({ data: { name: '智瀑科技党委', level: 1 } });
  const existingO1 = await prisma.org.findFirst({ where: { name: '第一党支部' } });
  const org1 = existingO1 ?? await prisma.org.create({ data: { name: '第一党支部', parentId: root.id, level: 2 } });
  const existingO2 = await prisma.org.findFirst({ where: { name: '第二党支部' } });
  const org2 = existingO2 ?? await prisma.org.create({ data: { name: '第二党支部', parentId: root.id, level: 2 } });
  const existingO3 = await prisma.org.findFirst({ where: { name: '第三党支部' } });
  const org3 = existingO3 ?? await prisma.org.create({ data: { name: '第三党支部', parentId: root.id, level: 2 } });

  // 用户
  const adminPlain = seedPassword('SEED_ADMIN_PASSWORD');
  const secretaryPlain = seedPassword('SEED_SECRETARY_PASSWORD');
  const memberPlain = seedPassword('SEED_MEMBER_PASSWORD');
  const adminPwd = await bcrypt.hash(adminPlain, 12);
  const secretaryPwd = await bcrypt.hash(secretaryPlain, 12);
  const memberPwd = await bcrypt.hash(memberPlain, 12);

  const adminExisting = await prisma.user.findUnique({ where: { username: 'admin' } });
  const admin = adminExisting ?? await prisma.user.create({
    data: {
      username: 'admin',
      password: adminPwd,
      name: '系统管理员',
      orgId: root.id,
      role: 'ADMIN',
      phone: '13800000001',
      forceChangePassword: true,
    },
  });

  const secretaryExisting = await prisma.user.findUnique({ where: { username: 'secretary1' } });
  const secretary1 = secretaryExisting ?? await prisma.user.create({
    data: {
      username: 'secretary1',
      password: secretaryPwd,
      name: '一支部书记',
      orgId: org1.id,
      role: 'SECRETARY',
      phone: '13800000011',
      forceChangePassword: true,
    },
  });

  const members: any[] = [];
  for (let i = 1; i <= 6; i++) {
    const org = i <= 2 ? org1 : i <= 4 ? org2 : org3;
    const existing = await prisma.user.findUnique({ where: { username: `member${i}` } });
    const m = existing ?? await prisma.user.create({
      data: {
        username: `member${i}`,
        password: memberPwd,
        name: `党员${i}`,
        orgId: org.id,
        role: 'MEMBER',
        phone: `1380000002${i}`,
        forceChangePassword: true,
      },
    });
    members.push(m);
  }

  // 内容
  const contents: any[] = [];
  const contentData = [
    { title: '党章学习：总纲', type: 'ARTICLE', category: '党章', tags: ['总纲', '基础'], isPublic: true, body: '# 党章总纲\n\n中国共产党是中国工人阶级的先锋队...' },
    { title: '二十大报告解读', type: 'ARTICLE', category: '时政', tags: ['二十大', '报告'], isPublic: true, body: '# 二十大报告解读\n\n高质量发展是全面建设社会主义现代化国家的首要任务...' },
    { title: '党史微视频：建党伟业', type: 'VIDEO', category: '党史', tags: ['建党', '历史'], isPublic: true, mediaUrl: '/uploads/content/sample.mp4', duration: 600 },
    { title: '习近平新时代中国特色社会主义思想', type: 'ARTICLE', category: '理论', tags: ['思想', '理论'], isPublic: true, body: '# 习近平新时代中国特色社会主义思想\n\n是当代中国马克思主义、二十一世纪马克思主义...' },
    { title: '党员发展工作流程', type: 'ARTICLE', category: '党务', tags: ['党员发展', '流程'], isPublic: false, body: '# 党员发展工作流程\n\n1. 入党申请\n2. 积极分子确定...' },
    { title: '廉政教育专题', type: 'ARTICLE', category: '廉政', tags: ['廉政', '教育'], isPublic: true, body: '# 廉政教育\n\n全面从严治党永远在路上...' },
  ];
  for (const c of contentData) {
    const existing = await prisma.content.findFirst({ where: { title: c.title } });
    if (existing) {
      contents.push(existing);
    } else {
      const created = await prisma.content.create({
        data: {
          ...c,
          tags: JSON.stringify(c.tags),
        } as any,
      });
      contents.push(created);
    }
  }

  // 题库
  const questions: any[] = [];
  const questionData = [
    {
      type: 'SINGLE',
      stem: '中国共产党的根本宗旨是什么？',
      options: ['A. 全心全意为人民服务', 'B. 经济建设为中心', 'C. 改革开放', 'D. 四项基本原则'],
      answer: 'A',
      analysis: '党章规定：全心全意为人民服务是党的根本宗旨。',
      category: '党章',
    },
    {
      type: 'SINGLE',
      stem: '党的最高理想和最终目标是？',
      options: ['A. 实现共产主义', 'B. 全面建成小康社会', 'C. 实现现代化', 'D. 实现中华民族伟大复兴'],
      answer: 'A',
      analysis: '实现共产主义是党的最高理想和最终目标。',
      category: '党章',
    },
    {
      type: 'MULTIPLE',
      stem: '下列属于党的基本路线内容的有？',
      options: ['A. 一个中心', 'B. 两个基本点', 'C. 自力更生', 'D. 艰苦创业'],
      answer: 'ABCD',
      analysis: '党的基本路线：以经济建设为中心，坚持四项基本原则，坚持改革开放，自力更生，艰苦创业。',
      category: '理论',
    },
    {
      type: 'JUDGE',
      stem: '中国共产党是中国工人阶级的先锋队，同时是中国人民和中华民族的先锋队。',
      options: ['A. 正确', 'B. 错误'],
      answer: 'true',
      analysis: '党章总纲明确规定。',
      category: '党章',
    },
    {
      type: 'SINGLE',
      stem: '党的二十大报告指出，全面建设社会主义现代化国家的首要任务是？',
      options: ['A. 高质量发展', 'B. 共同富裕', 'C. 科技自立自强', 'D. 乡村振兴'],
      answer: 'A',
      analysis: '二十大报告原文：高质量发展是全面建设社会主义现代化国家的首要任务。',
      category: '时政',
    },
    {
      type: 'MULTIPLE',
      stem: '党的三大作风包括？',
      options: ['A. 理论联系实际', 'B. 密切联系群众', 'C. 批评与自我批评', 'D. 艰苦奋斗'],
      answer: 'ABC',
      analysis: '党的三大作风是理论联系实际、密切联系群众、批评与自我批评。',
      category: '党史',
    },
  ];
  for (const q of questionData) {
    const existing = await prisma.question.findFirst({ where: { stem: q.stem } });
    if (existing) {
      questions.push(existing);
    } else {
      const created = await prisma.question.create({
        data: {
          ...q,
          options: JSON.stringify(q.options),
        } as any,
      });
      questions.push(created);
    }
  }

  // 试卷
  const paper = await prisma.paper.findFirst({ where: { title: '党建基础知识测验' } });
  let paperId: number;
  if (!paper) {
    const created = await prisma.paper.create({
      data: {
        title: '党建基础知识测验',
        passScore: 60,
        totalScore: 100,
        questions: {
          create: questions.slice(0, 5).map((q, i) => ({
            questionId: q.id,
            score: 20,
            sort: i,
          })),
        },
      },
    });
    paperId = created.id;
  } else {
    paperId = paper.id;
  }

  // 测验
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - 1);
  const endTime = new Date();
  endTime.setHours(endTime.getHours() + 24);

  const existingQuiz = await prisma.quiz.findFirst({ where: { orgId: org1.id, type: 'PRACTICE' } });
  if (!existingQuiz) {
    await prisma.quiz.create({
      data: {
        paperId,
        orgId: org1.id,
        type: 'PRACTICE',
        startTime,
        endTime,
        duration: 30,
      },
    });
  }

  const existingExam = await prisma.quiz.findFirst({ where: { orgId: org1.id, type: 'EXAM' } });
  if (!existingExam) {
    await prisma.quiz.create({
      data: {
        paperId,
        orgId: org1.id,
        type: 'EXAM',
        startTime,
        endTime,
        duration: 60,
      },
    });
  }

  // 学习任务
  const existingTask = await prisma.learningTask.findFirst({ where: { orgId: org1.id } });
  if (!existingTask) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    await prisma.learningTask.create({
      data: {
        orgId: org1.id,
        title: '本周学习任务：党章与二十大精神',
        deadline,
        contents: {
          create: contents.slice(0, 3).map((c) => ({ contentId: c.id })),
        },
      },
    });
  }

  console.log('✅ Seed completed');
  console.log('   管理员账号: admin');
  console.log('   书记账号:   secretary1');
  console.log('   党员账号:   member1-6');
  if (!isProduction) {
    console.log('');
    console.log('⚠️  当前为开发模式，使用模板中的演示密码；首次登录后必须修改。');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
