import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join, resolve, extname } from 'path';
import { randomUUID } from 'crypto';

/** 允许保存的扩展名白名单（与 controller 的 fileFilter 双重校验） */
const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.mp3',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
];

@Injectable()
export class UploadService {
  private readonly uploadDir: string;
  constructor(private readonly config: ConfigService) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR', 'uploads');
  }

  async save(file: Express.Multer.File, subdir = 'content'): Promise<{ url: string; filename: string }> {
    // resolve() keeps relative paths project-local while allowing production to
    // place uploads on a dedicated absolute data volume.
    const dir = resolve(process.cwd(), this.uploadDir, subdir);
    await fs.mkdir(dir, { recursive: true });
    const ext = extname(file.originalname).toLowerCase();
    // 防御性二次校验：即使绕过 controller 的 fileFilter，也不允许危险扩展名
    if (!ALLOWED_EXT.includes(ext)) {
      throw new BadRequestException('不支持的文件类型');
    }
    if (!matchesFileSignature(ext, file.buffer)) {
      throw new BadRequestException('文件内容与扩展名不匹配');
    }
    const filename = `${randomUUID()}${ext}`;
    const filepath = join(dir, filename);
    await fs.writeFile(filepath, file.buffer);
    return {
      url: `/uploads/${subdir}/${filename}`,
      filename,
    };
  }
}

function matchesFileSignature(ext: string, buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('ascii');
  const starts = (...bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte);

  if (ext === '.jpg' || ext === '.jpeg') return starts(0xff, 0xd8, 0xff);
  if (ext === '.png') return starts(0x89, 0x50, 0x4e, 0x47);
  if (ext === '.gif') return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
  if (ext === '.webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (ext === '.mp4') return ascii(4, 8) === 'ftyp';
  if (ext === '.mp3') return ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  if (ext === '.pdf') return ascii(0, 5) === '%PDF-';
  if (ext === '.doc' || ext === '.xls') return starts(0xd0, 0xcf, 0x11, 0xe0);
  if (ext === '.docx' || ext === '.xlsx') return starts(0x50, 0x4b, 0x03, 0x04);
  return false;
}
