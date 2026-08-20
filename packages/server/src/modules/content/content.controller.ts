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
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, CreateContentDto, UpdateContentDto, LearningRecordDto } from '@ai-party-school/shared';
import { ContentListQueryDto, VisibleContentQueryDto } from '../../common/dto/query.dto';

@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly contentService: ContentService) { }

  @Get()
  @Roles(Role.ADMIN, Role.SECRETARY)
  findAll(@Query() query: ContentListQueryDto) {
    return this.contentService.findAll({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
      category: query.category,
      type: query.type,
      isPublic: query.isPublic,
    });
  }

  @Get('categories')
  getCategories() {
    return this.contentService.getCategories();
  }

  @Get('visible')
  findVisible(
    @CurrentUser('sub') userId: number,
    @Query() query: VisibleContentQueryDto,
  ) {
    return this.contentService.findVisible(userId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
      category: query.category,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('role') role?: Role,
    @CurrentUser('sub') userId?: number,
  ) {
    return this.contentService.findOne(id, role && userId ? { id: userId, role } : undefined);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  create(@Body() dto: CreateContentDto) {
    return this.contentService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContentDto) {
    return this.contentService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contentService.remove(id);
  }

  @Post(':id/record')
  record(
    @CurrentUser('sub') userId: number,
    @CurrentUser('role') role: Role,
    @Param('id', ParseIntPipe) contentId: number,
    @Body() dto: LearningRecordDto,
  ) {
    return this.contentService.recordLearning(userId, contentId, dto, role);
  }

  @Get(':id/record')
  getMyRecord(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) contentId: number,
  ) {
    return this.contentService.getMyRecord(userId, contentId);
  }
}
