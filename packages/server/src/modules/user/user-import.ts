import { BadRequestException } from '@nestjs/common';
import { Role } from '@ai-party-school/shared';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

export interface ParsedUserImportRow {
  rowNumber: number;
  username: string;
  name: string;
  phone?: string;
  orgId: number;
  role: Role;
  password?: string;
}

export interface UserImportResultRow {
  rowNumber: number;
  username: string;
  success: boolean;
  error?: string;
  initialPassword?: string;
}

const HEADER_ALIASES = {
  username: ['用户名', '账号', 'username'],
  name: ['姓名', 'name'],
  phone: ['手机号', '手机号码', '联系电话', 'phone'],
  orgId: ['支部id', '所属支部id', '组织id', 'orgid'],
  role: ['角色', '用户角色', 'role'],
  password: ['初始密码', '密码', 'password'],
} as const;

const REQUIRED_HEADERS: Array<keyof typeof HEADER_ALIASES> = ['username', 'name', 'orgId', 'role'];

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s*＊_\-（）()]/g, '')
    .replace(/可选/g, '');
}

function roleOf(value: string): Role | null {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, Role> = {
    ADMIN: Role.ADMIN,
    系统管理员: Role.ADMIN,
    管理员: Role.ADMIN,
    SECRETARY: Role.SECRETARY,
    支部书记: Role.SECRETARY,
    书记: Role.SECRETARY,
    MEMBER: Role.MEMBER,
    党员: Role.MEMBER,
    普通党员: Role.MEMBER,
  };
  return aliases[normalized] ?? null;
}

async function loadFirstWorksheet(filename: string, buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    return workbook.csv.read(Readable.from([buffer]) as any);
  }
  if (!/\.xlsx$/i.test(filename)) {
    throw new BadRequestException('仅支持 .xlsx 或 .csv 人员导入文件');
  }
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.getWorksheet('人员导入') ?? workbook.worksheets[0];
  if (!worksheet) throw new BadRequestException('导入文件中没有工作表');
  return worksheet;
}

/** 解析人员导入文件；无效数据逐行返回，不再静默丢弃。 */
export async function parseUserImportFile(
  filename: string,
  buffer: Buffer,
): Promise<{ users: ParsedUserImportRow[]; errors: UserImportResultRow[] }> {
  const worksheet = await loadFirstWorksheet(filename, buffer);
  const headerColumns = new Map<keyof typeof HEADER_ALIASES, number>();
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const normalized = normalizeHeader(cell.text);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as Array<[
      keyof typeof HEADER_ALIASES,
      readonly string[],
    ]>) {
      if (aliases.map(normalizeHeader).includes(normalized)) headerColumns.set(key, columnNumber);
    }
  });

  const missing = REQUIRED_HEADERS.filter((key) => !headerColumns.has(key));
  if (missing.length > 0) {
    const labels = missing.map((key) => HEADER_ALIASES[key][0]).join('、');
    throw new BadRequestException(`模板表头缺少：${labels}。请重新下载最新模板填写`);
  }

  const textAt = (row: ExcelJS.Row, key: keyof typeof HEADER_ALIASES) => {
    const column = headerColumns.get(key);
    return column ? row.getCell(column).text.trim() : '';
  };
  const users: ParsedUserImportRow[] = [];
  const errors: UserImportResultRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const username = textAt(row, 'username');
    const name = textAt(row, 'name');
    const phone = textAt(row, 'phone');
    const orgIdText = textAt(row, 'orgId');
    const roleText = textAt(row, 'role');
    const password = textAt(row, 'password');
    if (![username, name, phone, orgIdText, roleText, password].some(Boolean)) return;

    const orgId = Number(orgIdText);
    const role = roleOf(roleText);
    const rowError =
      !username ? '用户名不能为空' :
      !name ? '姓名不能为空' :
      !Number.isInteger(orgId) || orgId <= 0 ? '支部ID必须是正整数' :
      !role ? '角色必须是 ADMIN/SECRETARY/MEMBER 或对应中文名称' :
      password && password.length < 8 ? '初始密码至少 8 位' : '';
    if (rowError) {
      errors.push({ rowNumber, username, success: false, error: rowError });
      return;
    }
    users.push({
      rowNumber,
      username,
      name,
      phone: phone || undefined,
      orgId,
      role,
      password: password || undefined,
    });
  });

  if (users.length === 0 && errors.length === 0) {
    throw new BadRequestException('文件中没有可导入的人员数据');
  }
  return { users, errors };
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1A1A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

/** 生成包含填写说明和实时支部 ID 对照的 Excel 模板。 */
export async function buildUserImportTemplate(orgs: Array<{ id: number; name: string }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '数智党校';
  const users = workbook.addWorksheet('人员导入', { views: [{ state: 'frozen', ySplit: 1 }] });
  users.columns = [
    { header: '用户名*', key: 'username', width: 20 },
    { header: '姓名*', key: 'name', width: 16 },
    { header: '手机号', key: 'phone', width: 18, style: { numFmt: '@' } },
    { header: '支部ID*', key: 'orgId', width: 12 },
    { header: '角色*', key: 'role', width: 22 },
    { header: '初始密码（可选）', key: 'password', width: 22, style: { numFmt: '@' } },
  ];
  styleHeader(users.getRow(1));
  users.autoFilter = 'A1:F1';
  const sampleOrg = orgs[0] ?? { id: 1, name: '请查看支部对照' };
  users.addRow(['member001', '张三', '13800138000', sampleOrg.id, 'MEMBER', 'Demo1234!']);
  users.getCell('E2').dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"ADMIN,SECRETARY,MEMBER"'],
    showErrorMessage: true,
    errorTitle: '角色不合法',
    error: '请选择 ADMIN、SECRETARY 或 MEMBER',
  };
  users.getRow(2).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
  });

  const guide = workbook.addWorksheet('填写说明', { views: [{ state: 'frozen', ySplit: 1 }] });
  guide.columns = [{ width: 22 }, { width: 70 }];
  guide.addRow(['字段', '填写要求']);
  guide.addRows([
    ['用户名*', '必填，系统内唯一，至少 2 个字符'],
    ['姓名*', '必填'],
    ['手机号', '可选；建议将单元格设为文本，避免长号码被科学计数法转换'],
    ['支部ID*', '必填；请从“支部对照”工作表复制对应 ID'],
    ['角色*', 'ADMIN=系统管理员，SECRETARY=支部书记，MEMBER=党员；也支持填写中文名称'],
    ['初始密码', '可选，至少 8 位；留空时系统随机生成，并在导入结果中显示一次'],
    ['CSV', '支持 UTF-8 编码 CSV；表头和字段顺序可参考“人员导入”工作表'],
  ]);
  styleHeader(guide.getRow(1));
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const orgSheet = workbook.addWorksheet('支部对照', { views: [{ state: 'frozen', ySplit: 1 }] });
  orgSheet.columns = [
    { header: '支部ID', key: 'id', width: 12 },
    { header: '支部名称', key: 'name', width: 36 },
  ];
  styleHeader(orgSheet.getRow(1));
  orgs.forEach((org) => orgSheet.addRow([org.id, org.name]));
  orgSheet.autoFilter = `A1:B${Math.max(orgs.length + 1, 2)}`;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildUserImportCsvTemplate(orgs: Array<{ id: number; name: string }>): Buffer {
  const orgId = orgs[0]?.id ?? 1;
  const csv = [
    ['用户名', '姓名', '手机号', '支部ID', '角色', '初始密码'],
    ['member001', '张三', '13800138000', String(orgId), 'MEMBER', 'Demo1234!'],
  ].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  return Buffer.from(`\uFEFF${csv}\r\n`, 'utf8');
}
