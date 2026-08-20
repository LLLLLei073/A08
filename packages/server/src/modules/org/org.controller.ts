import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrgService } from './org.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, CreateOrgDto, UpdateOrgDto } from '@ai-party-school/shared';

@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('tree')
  getTree() {
    return this.orgService.getTree();
  }

  @Get(':id/stats')
  @Roles(Role.ADMIN, Role.SECRETARY)
  getStats(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    // SECRETARY 只能查看本支部统计
    const effId = role === Role.SECRETARY ? curOrgId! : id;
    return this.orgService.getStats(effId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateOrgDto) {
    return this.orgService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrgDto) {
    return this.orgService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.orgService.remove(id);
  }
}
