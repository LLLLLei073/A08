import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@ai-party-school/shared';
import { OrgStatsQueryDto, TrendQueryDto } from '../../common/dto/query.dto';

@Controller('statistics')
@UseGuards(JwtAuthGuard)
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get('overview')
  @Roles(Role.ADMIN, Role.SECRETARY)
  overview(
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.statistics.getOverview(role === Role.SECRETARY ? orgId : undefined);
  }

  @Get('by-org')
  @Roles(Role.ADMIN, Role.SECRETARY)
  byOrg(
    @Query() query?: OrgStatsQueryDto,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    // SECRETARY 只能查看本支部统计
    const effOrgId = role === Role.SECRETARY ? curOrgId : query?.orgId;
    return this.statistics.getStatsByOrg(effOrgId);
  }

  @Get('trend')
  @Roles(Role.ADMIN, Role.SECRETARY)
  trend(
    @Query() query?: TrendQueryDto,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    const d = query?.days ?? 30;
    // SECRETARY 只能查看本支部趋势
    const effOrgId = role === Role.SECRETARY ? curOrgId : query?.orgId;
    return this.statistics.getLearningTrend(effOrgId, d);
  }
}
