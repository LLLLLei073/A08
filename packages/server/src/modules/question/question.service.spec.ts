import { describe, expect, it, vi } from 'vitest';
import * as ExcelJS from 'exceljs';
import { QType } from '@ai-party-school/shared';
import { QuestionService } from './question.service';

function createService() {
  const prisma = {
    question: {
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: 1, ...data })),
    },
  };
  return {
    prisma,
    service: new QuestionService(prisma as any, {} as any),
  };
}

describe('QuestionService 判断题', () => {
  it('新增判断题时固定正确/错误选项并规范化答案', async () => {
    const { prisma, service } = createService();

    await service.create({
      type: QType.JUDGE,
      stem: '党员应当按期交纳党费。',
      options: ['任意旧选项'],
      answer: '对',
      category: '党章',
    });

    expect(prisma.question.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: QType.JUDGE,
        options: JSON.stringify(['正确', '错误']),
        answer: 'true',
      }),
    });
  });

  it('CSV 导入仅靠本地解析并支持正确/错误答案', async () => {
    const { prisma, service } = createService();
    const csv = '\uFEFF题干,答案(正确/错误),解析(选填),分类(选填)\r\n"党章是党的根本大法。",正确,"判断说明",党章\r\n"党员可以不参加组织生活。",错误,,党员教育\r\n';

    const result = await service.importSpreadsheet({
      originalname: 'questions.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    } as Express.Multer.File);

    expect(result).toMatchObject({ success: 2, failed: 0 });
    expect(prisma.question.create).toHaveBeenCalledTimes(2);
    expect(prisma.question.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ type: QType.JUDGE, answer: 'true' }),
    });
    expect(prisma.question.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ type: QType.JUDGE, answer: 'false' }),
    });
  });

  it('导入答案不是正确或错误时返回失败明细且不写入数据库', async () => {
    const { prisma, service } = createService();
    const csv = '题干,答案(正确/错误),解析(选填),分类(选填)\n测试题,不知道,,测试';

    const result = await service.importSpreadsheet({
      originalname: 'questions.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    } as Express.Multer.File);

    expect(result).toMatchObject({ success: 0, failed: 1 });
    expect(result.detail[0].error).toContain('正确或错误');
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('Excel 模板列可直接导入', async () => {
    const { prisma, service } = createService();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('判断题导入模板');
    worksheet.addRow(['题干', '答案(正确/错误)', '解析(选填)', '分类(选填)']);
    worksheet.addRow(['全面从严治党永远在路上。', '正确', '', '党建']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.importSpreadsheet({
      originalname: 'questions.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    } as Express.Multer.File);

    expect(result).toMatchObject({ success: 1, failed: 0 });
    expect(prisma.question.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: QType.JUDGE,
        stem: '全面从严治党永远在路上。',
        answer: 'true',
        category: '党建',
      }),
    });
  });
});
