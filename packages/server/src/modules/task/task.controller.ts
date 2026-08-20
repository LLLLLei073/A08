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
} from '@nestjs/common';
import { TaskService } from './task.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, CreateTaskDto, UpdateTaskDto } from '@ai-party-school/shared';
import { OrgPageQueryDto } from '../../common/dto/query.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SECRETARY)
  findAll(
    @Query() query: OrgPageQueryDto,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.taskService.findAll(
      {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        orgId: query.orgId,
      },
      { id: curUserId!, role: curRole!, orgId: curOrgId! },
    );
  }

  @Get('my')
  findMy(@CurrentUser('sub') userId: number) {
    return this.taskService.findMyTasks(userId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.taskService.create(dto, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.taskService.update(id, dto, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.taskService.remove(id, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }
}
