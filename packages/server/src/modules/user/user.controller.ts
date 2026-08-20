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
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, CreateUserDto, UpdateUserDto } from '@ai-party-school/shared';
import { UserListQueryDto } from '../../common/dto/query.dto';
import { Response } from 'express';
import {
  buildUserImportCsvTemplate,
  buildUserImportTemplate,
  parseUserImportFile,
} from './user-import';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SECRETARY)
  findAll(
    @Query() query: UserListQueryDto,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
    @CurrentUser('sub') curUserId?: number,
  ) {
    return this.userService.findAll(
      {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        name: query.name,
        orgId: query.orgId,
        role: query.role,
      },
      { id: curUserId!, role: curRole!, orgId: curOrgId! },
    );
  }

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
    @CurrentUser('sub') curUserId?: number,
  ) {
    return this.userService.create(dto, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
    @CurrentUser('sub') curUserId?: number,
  ) {
    return this.userService.update(id, dto, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SECRETARY)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('role') curRole?: Role,
    @CurrentUser('orgId') curOrgId?: number,
    @CurrentUser('sub') curUserId?: number,
  ) {
    return this.userService.remove(id, { id: curUserId!, role: curRole!, orgId: curOrgId! });
  }

  @Post('import')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!/\.(xlsx|csv)$/i.test(file.originalname ?? '')) {
        return cb(new BadRequestException('仅支持 .xlsx 或 .csv 人员导入文件'), false);
      }
      cb(null, true);
    },
  }))
  async import(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('未接收到文件');
    const parsed = await parseUserImportFile(file.originalname, file.buffer);
    const created = await this.userService.batchCreate(parsed.users);
    return [...parsed.errors, ...created].sort((a, b) => a.rowNumber - b.rowNumber);
  }

  @Get('template')
  @Roles(Role.ADMIN)
  async template(@Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    const orgs = await this.userService.listImportOrganizations();
    const csv = format?.toLowerCase() === 'csv';
    const buffer = csv ? buildUserImportCsvTemplate(orgs) : await buildUserImportTemplate(orgs);
    res.set({
      'Content-Type': csv
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="users-template.${csv ? 'csv' : 'xlsx'}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(buffer as any);
  }
}
