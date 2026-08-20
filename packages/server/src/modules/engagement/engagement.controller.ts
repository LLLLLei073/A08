import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { EvaluateEngagementRiskDto, Role } from '@ai-party-school/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EngagementService } from './engagement.service';

@Controller('engagement-risk')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN, Role.SECRETARY)
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  list(@Query('orgId') orgId: string | undefined, @CurrentUser('sub') id: number, @CurrentUser('role') role: Role, @CurrentUser('orgId') currentOrgId: number) {
    return this.engagement.list({ id, role, orgId: currentOrgId }, Number(orgId) || undefined);
  }

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateEngagementRiskDto, @CurrentUser('sub') id: number, @CurrentUser('role') role: Role, @CurrentUser('orgId') orgId: number) {
    return this.engagement.evaluate({ id, role, orgId }, dto.orgId);
  }

  @Post(':userId/remind')
  remind(@Param('userId', ParseIntPipe) userId: number, @CurrentUser('sub') id: number, @CurrentUser('role') role: Role, @CurrentUser('orgId') orgId: number) {
    return this.engagement.remind(userId, { id, role, orgId });
  }
}
