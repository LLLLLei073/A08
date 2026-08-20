import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, UpdateAiConfigDto, AiConfig, TestAiConfigResult } from '@ai-party-school/shared';
import { SettingsService } from './settings.service';

/**
 * 系统设置接口（仅 ADMIN 可访问）
 * GET    /settings/ai       获取当前 AI 配置
 * PUT    /settings/ai       更新 AI 配置
 * POST   /settings/ai/test  测试 AI 连接（可使用表单中的临时配置）
 */
@Controller('settings')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  private maskApiKey(cfg: AiConfig): AiConfig {
    const key = cfg.apiKey;
    const masked = key && !key.includes('redacted') && key.length > 8
      ? `${key.slice(0, 3)}***${key.slice(-4)}`
      : '***';
    return { ...cfg, apiKey: masked };
  }

  @Get('ai')
  getAi(): AiConfig {
    return this.maskApiKey(this.settings.getAiConfig());
  }

  @Put('ai')
  async updateAi(@Body() dto: UpdateAiConfigDto): Promise<AiConfig> {
    return this.maskApiKey(await this.settings.updateAiConfig(dto));
  }

  @Post('ai/test')
  testAi(@Body() dto: UpdateAiConfigDto): Promise<TestAiConfigResult> {
    // provider 是可选字符串（校验用），测试时转成 Partial<AiConfig>
    return this.settings.testAiConfig({ ...dto, provider: dto.provider as any });
  }

  @Post('ai/models')
  listAiModels(@Body() dto: { provider?: string; baseUrl?: string; apiKey?: string }) {
    return this.settings.listAiModels(dto);
  }
}
