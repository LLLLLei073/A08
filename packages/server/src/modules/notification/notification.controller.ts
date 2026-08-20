import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationService, NotifyActor } from './notification.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, SendNotificationDto } from '@ai-party-school/shared';
import { PaginationQueryDto } from '../../common/dto/query.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notif: NotificationService) {}

  private actor(id?: number, role?: Role, orgId?: number): NotifyActor {
    return { id: id!, role: role!, orgId: orgId! };
  }

  /** 我的收件箱 */
  @Get()
  listMy(
    @CurrentUser('sub') userId: number,
    @Query() query?: PaginationQueryDto,
  ) {
    return this.notif.listMyNotifications(userId, query?.page ?? 1, query?.pageSize ?? 20);
  }

  /** 通知未读数（红点轮询用） */
  @Get('unread')
  unread(@CurrentUser('sub') userId: number) {
    return this.notif.unreadTotal(userId);
  }

  /** 我发送的通知列表（管理端/书记端） */
  @Get('sent')
  @Roles(Role.ADMIN, Role.SECRETARY)
  listSent(
    @Query() query?: PaginationQueryDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.notif.listSentNotifications(
      this.actor(id, role, orgId),
      query?.page ?? 1,
      query?.pageSize ?? 20,
    );
  }

  /** 发布通知（支部书记或更高权限） */
  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  send(
    @Body() dto: SendNotificationDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.notif.send(this.actor(id, role, orgId), dto);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.notif.detail(userId, id);
  }

  @Post(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.notif.markRead(userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser('sub') userId: number) {
    return this.notif.markAllRead(userId);
  }
}
