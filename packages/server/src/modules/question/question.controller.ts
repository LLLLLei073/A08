import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { QuestionService } from './question.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, CreateQuestionDto, UpdateQuestionDto } from '@ai-party-school/shared';
import { QuestionListQueryDto } from '../../common/dto/query.dto';

@Controller('questions')
@UseGuards(JwtAuthGuard)
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SECRETARY)
  findAll(@Query() query: QuestionListQueryDto) {
    return this.questionService.findAll({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      category: query.category,
      type: query.type,
      keyword: query.keyword,
    });
  }

  @Get('categories')
  getCategories() {
    return this.questionService.getCategories();
  }

  @Get('template')
  @Roles(Role.ADMIN, Role.SECRETARY)
  async template(@Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    const headers = ['题干', '答案(正确/错误)', '解析(选填)', '分类(选填)'];
    const examples = [
      ['党章是党的根本大法。', '正确', '党章具有最高党内法规效力。', '党章'],
      ['党员可以不参加党的组织生活。', '错误', '党员应当参加党的组织生活。', '党员教育'],
    ];

    if (format?.toLowerCase() === 'csv') {
      const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const csv = '\uFEFF' + [headers, ...examples].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="questions-template.csv"',
      });
      return new StreamableFile(Buffer.from(csv, 'utf8'));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '数智党校';
    const worksheet = workbook.addWorksheet('判断题导入模板', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = [
      { header: headers[0], key: 'stem', width: 46 },
      { header: headers[1], key: 'answer', width: 22 },
      { header: headers[2], key: 'analysis', width: 40 },
      { header: headers[3], key: 'category', width: 18 },
    ];
    examples.forEach((row) => worksheet.addRow(row));
    worksheet.autoFilter = 'A1:D1';
    worksheet.getRow(1).height = 24;
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB22222' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    for (let row = 2; row <= 1001; row++) {
      worksheet.getCell(row, 2).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"正确,错误"'],
        showErrorMessage: true,
        errorTitle: '答案格式不正确',
        error: '请从下拉列表中选择“正确”或“错误”',
      };
    }

    const instructions = workbook.addWorksheet('填写说明');
    instructions.columns = [{ width: 100 }];
    [
      '1. 每行填写一道判断题，题干和答案为必填项。',
      '2. 答案请填写或下拉选择“正确”或“错误”。',
      '3. 解析和分类可留空，分类留空时系统按“未分类”导入。',
      '4. 系统同时支持上传本 Excel 模板或同列名的 UTF-8 CSV 文件。',
    ].forEach((line) => instructions.addRow([line]));
    instructions.getColumn(1).alignment = { wrapText: true, vertical: 'middle' };

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="questions-template.xlsx"',
    });
    return new StreamableFile(buffer as any);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.questionService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  create(@Body() dto: CreateQuestionDto) {
    return this.questionService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuestionDto) {
    return this.questionService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.questionService.remove(id);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.SECRETARY)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/\.(xlsx|csv)$/i.test(file.originalname ?? '')) {
          return cb(new BadRequestException('仅支持 .xlsx 或 .csv 文件'), false);
        }
        cb(null, true);
      },
    }),
  )
  async import(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('未接收到文件');
    return this.questionService.importSpreadsheet(file);
  }
}
