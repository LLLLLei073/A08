import { Body, Controller, Get, Post, Delete, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Role,
  GenerateReportDto,
  PublishReportDto,
  UpdateReportScheduleDto,
  AiQueryDto,
} from '@ai-party-school/shared';
import { ReportListQueryDto } from '../../common/dto/query.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  // 移动端：个性化推荐
  @Post('recommend')
  recommend(@CurrentUser('sub') userId: number) {
    return this.ai.recommend(userId);
  }

  // 管理端：自然语言数据查询
  @Post('query')
  @Roles(Role.ADMIN, Role.SECRETARY)
  query(
    @Body() dto: AiQueryDto,
    @CurrentUser('sub') id: number,
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.ai.query(dto.question, { id, role, orgId });
  }

  // ===== AI 报告：学习端（只读，仅已下发） =====

  /** 学习端：我的最新报告 */
  @Get('report')
  report(@CurrentUser('sub') userId: number) {
    return this.ai.getMyReport(userId);
  }

  /** 学习端：历史报告 */
  @Get('report/history')
  reportHistory(@CurrentUser('sub') userId: number) {
    return this.ai.getMyReportHistory(userId);
  }

  // ===== AI 报告：管理端 =====

  /** 报告列表 */
  @Get('reports')
  @Roles(Role.ADMIN, Role.SECRETARY)
  listReports(
    @Query() query?: ReportListQueryDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') currentOrgId?: number,
  ) {
    return this.ai.listReports({ id: id!, role: role!, orgId: currentOrgId! }, {
      page: query?.page ?? 1,
      pageSize: query?.pageSize ?? 20,
      orgId: query?.orgId,
      userId: query?.userId,
      published: query?.published,
      period: query?.period,
    });
  }

  // ===== 报告定时调度配置（必须在 /:id 之前，否则 schedule 被 :id 吞掉） =====

  @Get('reports/schedule')
  @Roles(Role.ADMIN)
  getSchedule() {
    return this.ai.getSchedule();
  }

  @Post('reports/schedule')
  @Roles(Role.ADMIN)
  updateSchedule(@Body() dto: UpdateReportScheduleDto) {
    return this.ai.updateSchedule(dto as any);
  }

  /** 手动触发一次定时报告生成（管理员） */
  @Post('reports/schedule/run')
  @Roles(Role.ADMIN)
  runSchedule() {
    return this.ai.runScheduledReport();
  }

  // ===== 报告详情与 CRUD（动态路径 :id 放最后） =====

  @Get('reports/:id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  reportDetail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') actorId: number,
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.ai.getReportDetail(id, { id: actorId, role, orgId });
  }

  /** 批量生成报告 */
  @Post('reports/generate')
  @Roles(Role.ADMIN, Role.SECRETARY)
  generateReports(
    @Body() dto: GenerateReportDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.ai.generateBatch({ id: id!, role: role!, orgId: orgId! }, dto);
  }

  /** 下发报告 */
  @Post('reports/publish')
  @Roles(Role.ADMIN, Role.SECRETARY)
  publishReports(
    @Body() dto: PublishReportDto,
    @CurrentUser('sub') id: number,
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.ai.publishReports(dto.reportIds, { id, role, orgId });
  }

  @Delete('reports/:id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  deleteReport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') actorId: number,
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.ai.deleteReport(id, { id: actorId, role, orgId });
  }
}
