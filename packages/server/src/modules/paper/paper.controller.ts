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
import { PaperService } from './paper.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, CreatePaperDto, GenerateAdaptivePaperDto, UpdatePaperDto } from '@ai-party-school/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaperListQueryDto } from '../../common/dto/query.dto';

@Controller('papers')
@UseGuards(JwtAuthGuard)
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SECRETARY)
  findAll(@Query() query: PaperListQueryDto) {
    return this.paperService.findAll({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      keyword: query.keyword,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paperService.findOne(id);
  }

  @Post('adaptive/generate')
  @Roles(Role.ADMIN, Role.SECRETARY)
  generateAdaptive(
    @Body() dto: GenerateAdaptivePaperDto,
    @CurrentUser('role') role: Role,
    @CurrentUser('orgId') orgId: number,
  ) {
    return this.paperService.generateAdaptive(dto, { role, orgId });
  }

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  create(@Body() dto: CreatePaperDto) {
    return this.paperService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaperDto) {
    return this.paperService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.paperService.remove(id);
  }
}
