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
import { ChatService, ChatActor } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Role,
  CreateGroupDto,
  UpdateGroupDto,
  SendMessageDto,
  GroupMembersDto,
} from '@ai-party-school/shared';
import { ContactQueryDto, MessageListQueryDto } from '../../common/dto/query.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private actor(id?: number, role?: Role, orgId?: number): ChatActor {
    return { id: id!, role: role!, orgId: orgId! };
  }

  /** 我的群聊列表（含未读数与最后一条消息） */
  @Get('groups')
  listGroups(@CurrentUser('sub') userId: number) {
    return this.chat.listMyGroups(userId);
  }

  /** 群聊未读总数（红点轮询用） */
  @Get('unread')
  unread(@CurrentUser('sub') userId: number) {
    return this.chat.unreadTotal(userId);
  }

  /** 可选联系人（建群/拉人） */
  @Get('contacts')
  contacts(
    @Query() query?: ContactQueryDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.listContacts(this.actor(id, role, orgId), query?.keyword);
  }

  /** 手动触发系统群同步（管理员） */
  @Post('groups/sync')
  @Roles(Role.ADMIN)
  sync() {
    return this.chat.syncSystemGroups();
  }

  @Post('groups')
  createGroup(
    @Body() dto: CreateGroupDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.createGroup(this.actor(id, role, orgId), dto);
  }

  @Get('groups/:id')
  getGroup(@Param('id', ParseIntPipe) groupId: number, @CurrentUser('sub') userId: number) {
    return this.chat.getGroup(userId, groupId);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id', ParseIntPipe) groupId: number,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.updateGroup(this.actor(id, role, orgId), groupId, dto);
  }

  @Get('groups/:id/members')
  listMembers(@Param('id', ParseIntPipe) groupId: number, @CurrentUser('sub') userId: number) {
    return this.chat.listMembers(userId, groupId);
  }

  @Post('groups/:id/members')
  addMembers(
    @Param('id', ParseIntPipe) groupId: number,
    @Body() dto: GroupMembersDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.addMembers(this.actor(id, role, orgId), groupId, dto.userIds);
  }

  @Delete('groups/:id/members')
  removeMembers(
    @Param('id', ParseIntPipe) groupId: number,
    @Body() dto: GroupMembersDto,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.removeMembers(this.actor(id, role, orgId), groupId, dto.userIds);
  }

  @Post('groups/:id/leave')
  leaveGroup(@Param('id', ParseIntPipe) groupId: number, @CurrentUser('sub') userId: number) {
    return this.chat.leaveGroup(userId, groupId);
  }

  @Delete('groups/:id')
  dissolveGroup(
    @Param('id', ParseIntPipe) groupId: number,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.dissolveGroup(this.actor(id, role, orgId), groupId);
  }

  @Post('groups/:id/mute')
  toggleMute(
    @Param('id', ParseIntPipe) groupId: number,
    @Body('muted') muted: boolean,
    @CurrentUser('sub') userId: number,
  ) {
    return this.chat.toggleMute(userId, groupId, muted);
  }

  /**
   * 拉取消息
   * - after：增量轮询，取 id > after 的最新消息（升序，前端增量追加）
   * - before：向上翻历史，取 id < before 的消息（返回时已转为升序）
   */
  @Get('groups/:id/messages')
  listMessages(
    @Param('id', ParseIntPipe) groupId: number,
    @CurrentUser('sub') userId: number,
    @Query() query?: MessageListQueryDto,
  ) {
    return this.chat.listMessages(userId, groupId, {
      before: query?.before,
      after: query?.after,
      limit: query?.limit,
    });
  }

  @Post('groups/:id/messages')
  sendMessage(
    @Param('id', ParseIntPipe) groupId: number,
    @Body() dto: SendMessageDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.chat.sendMessage(userId, groupId, dto);
  }

  @Post('groups/:id/read')
  markRead(
    @Param('id', ParseIntPipe) groupId: number,
    @Body('messageId') messageId: number | undefined,
    @CurrentUser('sub') userId: number,
  ) {
    return this.chat.markRead(userId, groupId, messageId);
  }

  /** 仅清空当前账号的群聊记录，不影响其他成员 */
  @Post('groups/:id/clear')
  clearHistory(@Param('id', ParseIntPipe) groupId: number, @CurrentUser('sub') userId: number) {
    return this.chat.clearHistory(userId, groupId);
  }

  @Post('messages/:id/recall')
  recallMessage(
    @Param('id', ParseIntPipe) messageId: number,
    @CurrentUser('sub') id?: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('orgId') orgId?: number,
  ) {
    return this.chat.recallMessage(this.actor(id, role, orgId), messageId);
  }
}
