import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@ai-party-school/shared';

/** 允许上传的文件扩展名白名单 */
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif|webp|mp4|mp3|pdf|docx?|xlsx?)$/i;

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SECRETARY)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
      fileFilter: (_req, file, cb) => {
        if (!file || !file.originalname || !ALLOWED_EXTENSIONS.test(file.originalname)) {
          return cb(new BadRequestException('不支持的文件类型，仅允许图片/视频/音频/PDF/Word/Excel'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('未接收到文件');
    return this.uploadService.save(file);
  }
}
