import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@ai-party-school/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LearningPathService } from './learning-path.service';

@Controller('learning-path')
@UseGuards(JwtAuthGuard)
export class LearningPathController {
  constructor(private readonly paths: LearningPathService) {}

  @Get('me')
  getMine(@CurrentUser('sub') userId: number, @Query('limit') limit?: string) {
    return this.paths.generate(userId, Number(limit) || 5);
  }

  @Post('me/refresh')
  refreshMine(@CurrentUser('sub') userId: number, @Query('limit') limit?: string) {
    return this.paths.generate(userId, Number(limit) || 5);
  }

  @Get('me/mastery')
  getMyMastery(@CurrentUser('sub') userId: number) {
    return this.paths.getMastery(userId);
  }

  @Get('users/:userId')
  @Roles(Role.ADMIN, Role.SECRETARY)
  getUserPath(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit: string | undefined,
    @CurrentUser('sub') actorId: number,
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.paths.generateForActor(userId, { id: actorId, role, orgId }, Number(limit) || 5);
  }
}
