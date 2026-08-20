import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import * as zlib from 'zlib';
import { PrismaService } from '../../prisma/prisma.service';
import { DeepSeekClient } from '../ai/deepseek.client';
import { CreateQuestionDto, Paginated, QuestionEntity, QType } from '@ai-party-school/shared';

@Injectable()
export class QuestionService {
  private static readonly JUDGE_OPTIONS = ['正确', '错误'];
  private readonly logger = new Logger(QuestionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly deepseek: DeepSeekClient,
  ) {}

  private map(q: any): QuestionEntity {
    let options: string[] = [];
    try {
      options = q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : [];
    } catch {
      options = [];
    }
    return {
      id: q.id,
      type: q.type,
      stem: q.stem,
      options,
      answer: q.answer,
      analysis: q.analysis,
      category: q.category,
    };
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    category?: string;
    type?: QType;
    keyword?: string;
  }): Promise<Paginated<QuestionEntity>> {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const where: Prisma.QuestionWhereInput = {};
    if (params.category) where.category = params.category;
    if (params.type) where.type = params.type as any;
    if (params.keyword) where.stem = { contains: params.keyword };

    const [list, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.question.count({ where }),
    ]);
    return { list: list.map(this.map), total, page, pageSize };
  }

  async findOne(id: number) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('题目不存在');
    return this.map(q);
  }

  async create(dto: CreateQuestionDto) {
    const isJudge = dto.type === QType.JUDGE;
    const q = await this.prisma.question.create({
      data: {
        type: dto.type as any,
        stem: dto.stem,
        options: JSON.stringify(isJudge ? QuestionService.JUDGE_OPTIONS : dto.options),
        answer: isJudge ? this.normalizeJudgeAnswer(dto.answer) : dto.answer,
        analysis: dto.analysis,
        category: dto.category,
      },
    });
    return this.map(q);
  }

  async update(id: number, dto: Partial<CreateQuestionDto>) {
    const exists = await this.prisma.question.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('题目不存在');
    const targetType = (dto.type ?? exists.type) as QType;
    const isJudge = targetType === QType.JUDGE;
    const q = await this.prisma.question.update({
      where: { id },
      data: {
        type: dto.type as any,
        stem: dto.stem,
        options: isJudge
          ? JSON.stringify(QuestionService.JUDGE_OPTIONS)
          : dto.options !== undefined
            ? JSON.stringify(dto.options)
            : undefined,
        answer: isJudge ? this.normalizeJudgeAnswer(dto.answer ?? exists.answer) : dto.answer,
        analysis: dto.analysis,
        category: dto.category,
      },
    });
    return this.map(q);
  }

  async remove(id: number) {
    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.paperQuestion.findMany({
        where: { questionId: id },
        include: { paper: true },
      });
      await tx.question.delete({ where: { id } });
      const paperIds = [...new Set(affected.map((pq) => pq.paperId))];
      for (const paperId of paperIds) {
        const remaining = await tx.paperQuestion.aggregate({
          where: { paperId },
          _sum: { score: true },
        });
        await tx.paper.update({
          where: { id: paperId },
          data: { totalScore: remaining._sum.score ?? 0 },
        });
      }
    });
    return { success: true };
  }

  async importSpreadsheet(file: Express.Multer.File): Promise<{
    success: number;
    failed: number;
    detail: Array<{ success: boolean; stem?: string; error?: string }>;
  }> {
    const extension = (file.originalname.split('.').pop() ?? '').toLowerCase();
    let rows: string[][];

    if (extension === 'csv') {
      rows = this.parseCsv(file.buffer);
    } else if (extension === 'xlsx') {
      rows = await this.parseXlsx(file.buffer);
    } else {
      throw new BadRequestException('仅支持 .xlsx 或 .csv 文件');
    }

    const questions = this.mapSpreadsheetRows(rows);
    const detail: Array<{ success: boolean; stem?: string; error?: string }> = [];

    for (const row of questions) {
      try {
        if (!row.stem) throw new BadRequestException('题干不能为空');
        const answer = this.normalizeJudgeAnswer(row.answer);
        await this.prisma.question.create({
          data: {
            type: QType.JUDGE as any,
            stem: row.stem,
            options: JSON.stringify(QuestionService.JUDGE_OPTIONS),
            answer,
            analysis: row.analysis || null,
            category: row.category || '未分类',
          },
        });
        detail.push({ success: true, stem: row.stem });
      } catch (error: any) {
        const message = error?.response?.message ?? error?.message ?? '导入失败';
        detail.push({ success: false, stem: row.stem || undefined, error: message });
      }
    }

    return {
      success: detail.filter((item) => item.success).length,
      failed: detail.filter((item) => !item.success).length,
      detail,
    };
  }

  private async parseXlsx(buffer: Buffer): Promise<string[][]> {
    if (buffer.subarray(0, 4).toString('hex') !== '504b0304') {
      throw new BadRequestException('Excel 文件内容与扩展名不匹配');
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('Excel 文件无法解析，请重新下载模板填写');
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new BadRequestException('Excel 文件中没有工作表');

    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let index = 1; index <= Math.max(row.cellCount, 4); index++) {
        values.push(row.getCell(index).text.trim());
      }
      rows.push(values);
    });
    return rows;
  }

  private parseCsv(buffer: Buffer): string[][] {
    const source = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          field += '"';
          index++;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === ',') {
        row.push(field.trim());
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[index + 1] === '\n') index++;
        row.push(field.trim());
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    row.push(field.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
    return rows;
  }

  private mapSpreadsheetRows(rows: string[][]): Array<{
    stem: string;
    answer: string;
    analysis?: string;
    category?: string;
  }> {
    if (rows.length === 0) throw new BadRequestException('导入文件为空');
    const headers = rows[0].map((header) => header.replace(/[\s（）()]/g, ''));
    const findColumn = (...prefixes: string[]) =>
      headers.findIndex((header) => prefixes.some((prefix) => header.startsWith(prefix)));
    const stemColumn = findColumn('题干', '题目内容', '题目');
    const answerColumn = findColumn('答案', '正确答案');
    const analysisColumn = findColumn('解析', '答案解析');
    const categoryColumn = findColumn('分类', '题目分类');

    if (stemColumn < 0 || answerColumn < 0) {
      throw new BadRequestException('模板列不正确，必须包含“题干”和“答案(正确/错误)”');
    }

    return rows.slice(1)
      .filter((row) => row.some((cell) => cell.trim() !== ''))
      .map((row) => ({
        stem: row[stemColumn]?.trim() ?? '',
        answer: row[answerColumn]?.trim() ?? '',
        analysis: analysisColumn >= 0 ? row[analysisColumn]?.trim() : undefined,
        category: categoryColumn >= 0 ? row[categoryColumn]?.trim() : undefined,
      }));
  }

  private normalizeJudgeAnswer(answer: unknown): 'true' | 'false' {
    const value = String(answer ?? '').trim();
    if (/^(true|对|正确|是|1)$/i.test(value)) return 'true';
    if (/^(false|错|错误|否|0)$/i.test(value)) return 'false';
    throw new BadRequestException('判断题答案只能填写正确或错误');
  }

  async importFromBuffer(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    const results: Array<{ success: boolean; stem?: string; error?: string }> = [];
    const rows: any[] = [];
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const v = row.values as any[];
      rows.push({
        type: String(v[1] ?? '').trim().toUpperCase(),
        stem: String(v[2] ?? '').trim(),
        options: [v[3], v[4], v[5], v[6], v[7], v[8]].filter(Boolean).map((s) => String(s).trim()),
        answer: String(v[9] ?? '').trim(),
        analysis: v[10] ? String(v[10]).trim() : undefined,
        category: String(v[11] ?? '未分类').trim(),
      });
    });

    for (const r of rows) {
      try {
        if (!r.stem || !r.type || r.options.length === 0) {
          results.push({ success: false, stem: r.stem, error: '字段不完整' });
          continue;
        }
        const typeMap: Record<string, QType> = {
          SINGLE: QType.SINGLE,
          MULTIPLE: QType.MULTIPLE,
          JUDGE: QType.JUDGE,
          单选: QType.SINGLE,
          多选: QType.MULTIPLE,
          判断: QType.JUDGE,
        };
        const type = typeMap[r.type];
        if (!type) {
          results.push({ success: false, stem: r.stem, error: `未知题型 ${r.type}` });
          continue;
        }
        await this.prisma.question.create({
          data: {
            type: type as any,
            stem: r.stem,
            options: JSON.stringify(r.options),
            answer: r.answer,
            analysis: r.analysis,
            category: r.category,
          },
        });
        results.push({ success: true, stem: r.stem });
      } catch (e: any) {
        results.push({ success: false, stem: r.stem, error: e.message });
      }
    }
    return results;
  }

  async getCategories() {
    const rows = await this.prisma.question.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category);
  }

  // ============ AI 智能导入（自动匹配题目格式） ============
  // 支持 doc/docx、excel、markdown、pdf，统一抽取纯文本后由大模型解析为标准题库
  async importWithAi(file: Express.Multer.File): Promise<{
    success: number;
    failed: number;
    truncated?: boolean;
    detail: Array<{ success: boolean; stem?: string; error?: string }>;
  }> {
    // 1. 按扩展名/类型抽取纯文本
    let text = '';
    let truncated = false;
    try {
      text = await this.extractText(file);
    } catch (e: any) {
      return { success: 0, failed: 0, detail: [{ success: false, error: `文件解析失败：${e.message}` }] };
    }
    const MAX = 50000;
    if (text.length > MAX) {
      text = text.slice(0, MAX);
      truncated = true;
    }
    if (!text.trim()) {
      return { success: 0, failed: 0, detail: [{ success: false, error: '未能从文件中提取到文本内容' }] };
    }

    // 2. 调用 AI 解析为结构化题目
    let parsed: any[] = [];
    try {
      parsed = await this.parseQuestionsWithAi(text);
    } catch (e: any) {
      this.logger.error(`AI 解析题目失败：${e.message}`);
      return {
        success: 0,
        failed: 0,
        truncated,
        detail: [{ success: false, error: `AI 解析失败（请确认已配置可用的 DeepSeek）：${e.message}` }],
      };
    }

    // 3. 归一化 + 批量入库
    const detail: Array<{ success: boolean; stem?: string; error?: string }> = [];
    for (const raw of parsed) {
      try {
        const q = this.normalizeQuestion(raw);
        if (!q) {
          detail.push({ success: false, stem: this.shorten(raw?.stem), error: '题型无法识别或字段缺失' });
          continue;
        }
        await this.prisma.question.create({
          data: {
            type: q.type as any,
            stem: q.stem,
            options: JSON.stringify(q.options),
            answer: q.answer,
            analysis: q.analysis || null,
            category: q.category || '未分类',
          },
        });
        detail.push({ success: true, stem: q.stem });
      } catch (e: any) {
        detail.push({ success: false, stem: this.shorten(raw?.stem), error: e.message });
      }
    }
    return {
      success: detail.filter((d) => d.success).length,
      failed: detail.filter((d) => !d.success).length,
      truncated,
      detail,
    };
  }

  private shorten(s?: string) {
    if (!s) return undefined;
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  /** 从上传文件中抽取纯文本，按扩展名选择解析器（docx/pdf 用内置 zlib 解析，零额外依赖） */
  private async extractText(file: Express.Multer.File): Promise<string> {
    const name = (file.originalname || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop()! : '';
    const mime = file.mimetype || '';
    const starts = (...bytes: number[]) => bytes.every((byte, index) => file.buffer[index] === byte);
    const isZip = starts(0x50, 0x4b, 0x03, 0x04);
    const isOle = starts(0xd0, 0xcf, 0x11, 0xe0);
    const isPdf = file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';

    if ((ext === 'docx' || ext === 'xlsx') && !isZip) throw new Error('文件内容与扩展名不匹配');
    if ((ext === 'doc' || ext === 'xls') && !isOle) throw new Error('文件内容与扩展名不匹配');
    if (ext === 'pdf' && !isPdf) throw new Error('文件内容与扩展名不匹配');

    // Excel
    if (ext === 'xlsx' || ext === 'xls' || mime.includes('spreadsheet') || mime.includes('excel')) {
      return this.extractExcelText(file.buffer);
    }
    // Word (.docx)：本质是 ZIP，用内置 zlib 解压 word/document.xml
    if (ext === 'docx' || mime.includes('officedocument.wordprocessingml')) {
      return this.extractDocxText(file.buffer);
    }
    if (ext === 'doc') {
      throw new Error('.doc 为旧版格式暂不支持，请另存为 .docx 后导入');
    }
    // PDF：遍历 FlateDecode 流，用 zlib 解压后提取文本
    if (ext === 'pdf' || mime === 'application/pdf') {
      return this.extractPdfText(file.buffer);
    }
    // Markdown / 纯文本
    if (ext === 'md' || ext === 'markdown' || mime.includes('markdown') || mime.includes('text/plain') || mime === '') {
      return file.buffer.toString('utf-8');
    }
    // 兜底：尝试作为文本
    return file.buffer.toString('utf-8');
  }

  /** 解析 docx（ZIP）中的 word/document.xml 并转为纯文本 */
  private extractDocxText(buffer: Buffer): string {
    const entries = this.parseZip(buffer);
    for (const e of entries) {
      if (e.name.endsWith('document.xml') || e.name === 'word/document.xml') {
        const xml = e.inflated.toString('utf8');
        return xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<w:(tab|br)[^>]*\/?>/g, (_, t: string) => (t === 'tab' ? '\t' : '\n'))
          .replace(/<w:t[^>]*>/g, '')
          .replace(/<\/w:t>/g, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{2,}/g, '\n')
          .trim();
      }
    }
    return '';
  }

  /** 极简 ZIP 解析：遍历本地文件头，返回各条目的文件名与解压后内容 */
  private parseZip(buffer: Buffer): Array<{ name: string; inflated: Buffer }> {
    const entries: Array<{ name: string; inflated: Buffer }> = [];
    const sig = 0x04034b50;
    let offset = 0;
    const len = buffer.length;
    // 先收集所有本地文件头位置，便于用下一个头界定数据边界
    const headers: Array<{ name: string; method: number; dataStart: number; compSize: number; uncompSize: number }> = [];
    while (offset < len - 4) {
      if (buffer.readUInt32LE(offset) !== sig) {
        offset++;
        continue;
      }
      let p = offset + 4;
      p += 2; // version
      const flags = buffer.readUInt16LE(p);
      p += 2;
      const method = buffer.readUInt16LE(p);
      p += 2;
      p += 4; // time/date
      p += 4; // crc32
      const compSize = buffer.readUInt32LE(p);
      p += 4;
      const uncompSize = buffer.readUInt32LE(p);
      p += 4;
      const fnameLen = buffer.readUInt16LE(p);
      p += 2;
      const extraLen = buffer.readUInt16LE(p);
      p += 2;
      const name = buffer.toString('utf8', p, p + fnameLen);
      p += fnameLen;
      p += extraLen;
      const dataStart = p;
      headers.push({ name, method, dataStart, compSize: flags & 0x08 ? 0 : compSize, uncompSize });
      offset = dataStart + (flags & 0x08 ? 0 : compSize);
      if (!(flags & 0x08) && compSize === 0) offset = dataStart; // 避免死循环
    }
    const MAX_ENTRY_INFLATED = 20 * 1024 * 1024;
    const MAX_TOTAL_INFLATED = 50 * 1024 * 1024;
    let totalInflated = 0;
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const nextStart = i + 1 < headers.length ? headers[i + 1].dataStart - (headers[i + 1].compSize || 0) : len;
      const end = h.compSize > 0 ? h.dataStart + h.compSize : nextStart;
      const comp = buffer.subarray(h.dataStart, Math.max(h.dataStart, end));
      if (h.uncompSize > MAX_ENTRY_INFLATED || totalInflated + h.uncompSize > MAX_TOTAL_INFLATED) {
        throw new BadRequestException('压缩文件解压后超过 50MB 安全限制');
      }
      try {
        if (h.method !== 0 && h.method !== 8) continue;
        const remaining = Math.min(MAX_ENTRY_INFLATED, MAX_TOTAL_INFLATED - totalInflated);
        const inflated = h.method === 0
          ? Buffer.from(comp)
          : zlib.inflateRawSync(comp, { maxOutputLength: remaining });
        totalInflated += inflated.length;
        entries.push({ name: h.name, inflated });
        if (totalInflated > MAX_TOTAL_INFLATED) {
          throw new BadRequestException('压缩文件解压后超过 50MB 安全限制');
        }
      } catch (error) {
        if (error instanceof BadRequestException || (error as any)?.code === 'ERR_BUFFER_TOO_LARGE') {
          throw new BadRequestException('压缩文件解压后超过安全限制');
        }
        /* 跳过无法解压的条目 */
      }
    }
    return entries;
  }

  /** 解析 PDF：解压所有 FlateDecode 内容流并提取文本 */
  private extractPdfText(buffer: Buffer): string {
    const s = buffer.toString('latin1');
    const re = /([\s\S]*?)stream\r?\n([\s\S]*?)\r?\nendstream/g;
    const chunks: string[] = [];
    let totalInflated = 0;
    const MAX_TOTAL_INFLATED = 20 * 1024 * 1024;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const dict = m[1];
      if (!/FlateDecode/i.test(dict)) continue;
      const dataStr = m[2].replace(/\r?\n$/, '');
      const data = Buffer.from(dataStr, 'latin1');
      // 去掉可能存在的 EOC 前的多余空白
      try {
        if (totalInflated >= MAX_TOTAL_INFLATED) {
          throw new BadRequestException('PDF 解压后超过 20MB 安全限制');
        }
        const inflated = zlib.inflateSync(data, {
          maxOutputLength: Math.min(5 * 1024 * 1024, MAX_TOTAL_INFLATED - totalInflated),
        });
        totalInflated += inflated.length;
        if (totalInflated > MAX_TOTAL_INFLATED) {
          throw new BadRequestException('PDF 解压后超过 20MB 安全限制');
        }
        const text = this.pdfContentToText(inflated.toString('latin1'));
        if (text.trim()) chunks.push(text);
      } catch (error) {
        if (error instanceof BadRequestException || (error as any)?.code === 'ERR_BUFFER_TOO_LARGE') {
          throw new BadRequestException('PDF 解压后超过安全限制');
        }
        /* 跳过 */
      }
    }
    return chunks.join('\n');
  }

  /** 从 PDF 内容流的操作符中提取可见文本 */
  private pdfContentToText(s: string): string {
    let out = '';
    const tjArr = /\[([\s\S]*?)\]\s*TJ/g;
    let m: RegExpExecArray | null;
    while ((m = tjArr.exec(s)) !== null) {
      out += this.pdfDecodeArray(m[1]) + '\n';
    }
    const tj = /\(([\s\S]*?)\)\s*Tj/g;
    while ((m = tj.exec(s)) !== null) {
      out += this.pdfUnescape(m[1]) + '\n';
    }
    return out;
  }

  /** 解析 TJ 数组里的字符串片段（字面量 (...) 与十六进制 <...>） */
  private pdfDecodeArray(arr: string): string {
    let res = '';
    const re = /\(([\s\S]*?)\)|<([0-9A-Fa-f\s]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(arr)) !== null) {
      if (m[1] !== undefined) res += this.pdfUnescape(m[1]);
      else if (m[2] !== undefined) {
        const hex = m[2].replace(/\s/g, '');
        for (let i = 0; i + 1 < hex.length; i += 2) {
          res += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
      }
    }
    return res;
  }

  private pdfUnescape(str: string): string {
    return str
      .replace(/\\([nrtbf()\\])/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c] ?? c))
      .replace(/\\(\d{1,3})/g, (_, code: string) => String.fromCharCode(parseInt(code, 8)));
  }

  /** 把 Excel 工作表转成便于 AI 阅读的文本表格 */
  private async extractExcelText(buffer: Buffer): Promise<string> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    const lines: string[] = [];
    ws.eachRow((row, i) => {
      const cells = (row.values as any[]).slice(1).map((c) => (c === null || c === undefined ? '' : String(c)));
      lines.push(`行${i}:\t${cells.join('\t| ')}`);
    });
    return lines.join('\n');
  }

  /** 调用 DeepSeek 把文本解析为标准题目数组 */
  private async parseQuestionsWithAi(text: string): Promise<any[]> {
    const prompt = `你是一个题库解析助手。下面是来自试卷/题库文档的文本内容（可能源自 Word、Excel、PDF 或 Markdown）。请从中提取所有题目，并规范化为标准 JSON 格式。

题型定义：
- SINGLE：单选题。options 为选项数组（如 ["A. 全心全意为人民服务","B. 以经济建设为中心"]），answer 为正确选项字母（如 "A"）。
- MULTIPLE：多选题。options 同上，answer 为正确选项字母组合（如 "ABC"）。
- JUDGE：判断题。options 允许为空数组 []，answer 为 "true" 或 "false"（也可用 "对"/"错"）。

输出要求（仅返回 JSON，不要任何额外文字）：
{
  "questions": [
    {
      "type": "SINGLE|MULTIPLE|JUDGE",
      "stem": "题干文本",
      "options": ["A. 选项一", "B. 选项二"],
      "answer": "A",
      "analysis": "解析（可选）",
      "category": "分类（可选，如 党史/党建/党纪）"
    }
  ]
}

规则：
1. 严格按上述 schema 输出，options 每个选项建议保留 "A. " 这类字母前缀。
2. 含 对/错、正确/错误、true/false 的题目判为 JUDGE。
3. 多选题答案用连续大写字母（如 "AB"）。
4. 跳过明显不是题目的内容（如标题、页眉页脚、目录）。
5. 若文本中没有题目，返回 {"questions":[]}。

待解析文本：
"""
${text}
"""`;

    const raw = await this.deepseek.chat([{ role: 'user', content: prompt }], {
      jsonMode: true,
      temperature: 0.2,
    });
    if (!raw) return [];
    try {
      const obj = JSON.parse(raw);
      const arr = Array.isArray(obj) ? obj : obj.questions;
      return Array.isArray(arr) ? arr : [];
    } catch {
      // 退一步：尝试提取第一个 JSON 数组
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          return JSON.parse(m[0]);
        } catch {
          return [];
        }
      }
      return [];
    }
  }

  /** 归一化单题：校验题型、规整选项前缀、规范答案 */
  private normalizeQuestion(raw: any): { type: QType; stem: string; options: string[]; answer: string; analysis?: string; category?: string } | null {
    if (!raw || typeof raw !== 'object') return null;
    const stem = String(raw.stem ?? '').trim();
    if (!stem) return null;

    const typeMap: Record<string, QType> = {
      SINGLE: QType.SINGLE,
      MULTIPLE: QType.MULTIPLE,
      JUDGE: QType.JUDGE,
      单选: QType.SINGLE,
      多选: QType.MULTIPLE,
      判断: QType.JUDGE,
    };
    const type = typeMap[String(raw.type ?? '').toUpperCase().trim()];
    if (!type) return null;

    // 选项规整为带字母前缀的数组
    let options: string[] = [];
    if (Array.isArray(raw.options)) {
      options = raw.options.map((o: any) => (typeof o === 'string' ? o.trim() : String(o?.text ?? o?.label ?? ''))).filter(Boolean);
    }
    options = this.ensurePrefixedOptions(options);

    let answer = String(raw.answer ?? '').trim();
    if (type === QType.JUDGE) {
      if (/^(true|对|正确|t|yes)$/i.test(answer)) answer = 'true';
      else if (/^(false|错|错误|f|no)$/i.test(answer)) answer = 'false';
      else if (!/^(true|false)$/i.test(answer)) return null;
    } else {
      // 仅保留大写字母
      const letters = answer.toUpperCase().replace(/[^A-F]/g, '');
      if (letters) {
        answer = letters;
      } else {
        // 答案给的是文本，尝试匹配选项
        const idx = options.findIndex((o) => o.replace(/^[A-F][.、)]\s*/i, '').trim() === answer);
        answer = idx >= 0 ? String.fromCharCode(65 + idx) : '';
      }
    }

    return { type, stem, options, answer, analysis: raw.analysis, category: raw.category };
  }

  /** 给选项补齐 A./B. 字母前缀（若缺失） */
  private ensurePrefixedOptions(options: string[]): string[] {
    return options.map((o, i) => {
      const letter = String.fromCharCode(65 + i);
      if (/^[A-Za-z][.、)]\s*/.test(o.trim())) return o.trim();
      return `${letter}. ${o.trim()}`;
    });
  }
}
