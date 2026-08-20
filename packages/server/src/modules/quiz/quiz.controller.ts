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
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, CreateQuizDto, UpdateQuizDto, SubmitQuizDto } from '@ai-party-school/shared';
import { QuizListQueryDto } from '../../common/dto/query.dto';

@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SECRETARY)
  findAll(
    @Query() query: QuizListQueryDto,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.quizService.findAll(
      {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        orgId: query.orgId,
        type: query.type,
      },
      { id: curUserId!, role: curRole!, orgId: curOrgId! },
    );
  }

  @Get('my')
  findMy(@CurrentUser('sub') userId: number) {
    return this.quizService.findMyQuizzes(userId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quizService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  create(
    @Body() dto: CreateQuizDto,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.quizService.create(dto, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuizDto,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.quizService.update(id, dto, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') curUserId?: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
  ) {
    return this.quizService.remove(id, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Post(':id/start')
  start(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.quizService.start(userId, id);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.quizService.submit(userId, id, dto);
  }

  @Get(':id/result')
  result(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.quizService.getResult(userId, id);
  }
}
