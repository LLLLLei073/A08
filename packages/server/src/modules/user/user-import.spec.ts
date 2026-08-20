import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildUserImportTemplate, parseUserImportFile } from './user-import';

describe('人员批量导入文件', () => {
  it('支持 UTF-8 CSV、中文角色和可选初始密码', async () => {
    const csv = '\uFEFF用户名,姓名,手机号,支部ID,角色,初始密码\nmember88,测试党员,13800138088,2,党员,Demo1234!\n';

    const result = await parseUserImportFile('users.csv', Buffer.from(csv, 'utf8'));

    expect(result.errors).toEqual([]);
    expect(result.users).toEqual([
      {
        rowNumber: 2,
        username: 'member88',
        name: '测试党员',
        phone: '13800138088',
        orgId: 2,
        role: 'MEMBER',
        password: 'Demo1234!',
      },
    ]);
  });

  it('缺少必填表头时返回明确错误', async () => {
    const csv = '用户名,姓名\nmember88,测试党员\n';

    await expect(parseUserImportFile('users.csv', Buffer.from(csv, 'utf8')))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('Excel 模板包含导入表、填写说明和支部对照', async () => {
    const buffer = await buildUserImportTemplate([
      { id: 2, name: '第一党支部' },
      { id: 3, name: '第二党支部' },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['人员导入', '填写说明', '支部对照']);
    expect(workbook.getWorksheet('人员导入')?.getRow(1).values).toEqual([
      undefined,
      '用户名*',
      '姓名*',
      '手机号',
      '支部ID*',
      '角色*',
      '初始密码（可选）',
    ]);
    expect(workbook.getWorksheet('支部对照')?.getCell('B2').text).toBe('第一党支部');
  });
});
