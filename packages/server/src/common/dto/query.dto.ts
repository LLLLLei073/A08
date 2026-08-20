import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ContentType, QType, QuizType, ReportPeriod, Role } from '@ai-party-school/shared';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UserListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) orgId?: number;
  @IsOptional() @IsEnum(Role) role?: Role;
}

export class ContentListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(ContentType) type?: ContentType;
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isPublic?: boolean;
}

export class VisibleContentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() category?: string;
}

export class OrgPageQueryDto extends PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) orgId?: number;
}

export class QuestionListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(QType) type?: QType;
  @IsOptional() @IsString() keyword?: string;
}

export class PaperListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() keyword?: string;
}

export class QuizListQueryDto extends OrgPageQueryDto {
  @IsOptional() @IsEnum(QuizType) type?: QuizType;
}

export class ReportListQueryDto extends OrgPageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) userId?: number;
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  published?: boolean;
  @IsOptional() @IsEnum(ReportPeriod) period?: ReportPeriod;
}

export class OrgStatsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) orgId?: number;
}

export class TrendQueryDto extends OrgStatsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

export class ContactQueryDto {
  @IsOptional() @IsString() keyword?: string;
}

export class MessageListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) after?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
