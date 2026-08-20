import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiConfig,
  UpdateAiConfigDto,
  TestAiConfigResult,
  aiProviderPreset,
} from '@ai-party-school/shared';

/** 系统设置键值前缀，避免与其它设置冲突 */
const KEYS = {
  provider: 'ai.provider',
  apiKey: 'ai.apiKey',
  baseUrl: 'ai.baseUrl',
  chatModel: 'ai.chatModel',
  reasonerModel: 'ai.reasonerModel',
} as const;

/** 旧版 DeepSeek 专属键（读取时兼容迁移，写入统一用新键） */
const LEGACY_KEYS = {
  apiKey: 'ai.deepseek.apiKey',
  baseUrl: 'ai.deepseek.baseUrl',
  chatModel: 'ai.deepseek.chatModel',
  reasonerModel: 'ai.deepseek.reasonerModel',
} as const;

const API_KEY_DECRYPT_FAILED = '«redacted:decrypt-failed»';

interface DecryptedSecret {
  value: string | null;
  needsMigration: boolean;
}

/**
 * 系统设置服务：把 AI 配置等以键值对形式持久化到数据库，
 * 并在内存中缓存，使后台修改能即时生效（无需重启服务）。
 * 数据库中不存在的键会回退到环境变量（.env）中的默认值。
 * apiKey 在数据库中加密存储（AES-256-GCM），防止数据库泄露时暴露明文。
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, string>();
  private decryptFailureLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) { }

  async onModuleInit() {
    try {
      const rows = await this.prisma.setting.findMany();
      rows.forEach((r) => this.cache.set(r.key, r.value));
      await this.migrateApiKeyEncryption();
      this.logger.log(`已加载 ${rows.length} 条系统设置`);
    } catch (e: any) {
      this.logger.warn(`加载系统设置失败（Setting 表可能尚未创建）: ${e.message}`);
    }
  }

  get(key: string): string | null {
    return this.cache.has(key) ? (this.cache.get(key) as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  /** 读取当前生效的 AI 配置：数据库优先（apiKey 解密），未配置则回退到环境变量默认值 */
  getAiConfig(): AiConfig {
    const storedApiKey = this.get(KEYS.apiKey) ?? this.get(LEGACY_KEYS.apiKey);
    const provider = (this.get(KEYS.provider) ??
      this.config.get<string>('AI_PROVIDER', 'deepseek')) as AiConfig['provider'];
    const preset = aiProviderPreset(provider);
    return {
      provider,
      apiKey: storedApiKey
        ? this.decryptApiKey(storedApiKey)
        : this.config.get<string>('DEEPSEEK_API_KEY', '«redacted:sk-…»'),
      baseUrl:
        this.get(KEYS.baseUrl) ??
        this.get(LEGACY_KEYS.baseUrl) ??
        this.config.get<string>('DEEPSEEK_BASE_URL', preset.baseUrl),
      chatModel:
        this.get(KEYS.chatModel) ??
        this.get(LEGACY_KEYS.chatModel) ??
        this.config.get<string>('DEEPSEEK_CHAT_MODEL', preset.chatModel),
      reasonerModel:
        this.get(KEYS.reasonerModel) ??
        this.get(LEGACY_KEYS.reasonerModel) ??
        this.config.get<string>('DEEPSEEK_REASONER_MODEL', preset.reasonerModel || preset.chatModel),
    };
  }

  async updateAiConfig(dto: UpdateAiConfigDto): Promise<AiConfig> {
    const provider = dto.provider?.trim();
    const apiKey = dto.apiKey.trim();
    const baseUrl = dto.baseUrl.trim().replace(/\/+$/, '');
    const chatModel = dto.chatModel.trim();
    const reasonerModel = dto.reasonerModel?.trim() ?? '';
    const ssrfError = this.validateBaseUrl(baseUrl);
    if (ssrfError) throw new BadRequestException(ssrfError);
    // apiKey 加密后存储，防止数据库泄露时暴露明文；
    // 若前端回传的是脱敏占位符（含 ***），视为未修改，不覆盖已存真实 Key
    if (apiKey && !this.isMaskedKey(apiKey)) {
      await this.set(KEYS.apiKey, this.encrypt(apiKey));
    }
    if (provider) await this.set(KEYS.provider, provider);
    await this.set(KEYS.baseUrl, baseUrl);
    await this.set(KEYS.chatModel, chatModel);
    // 空字符串也需要保存，否则切换服务商后会继续使用旧的推理模型。
    await this.set(KEYS.reasonerModel, reasonerModel);
    this.logger.log(`AI 配置已更新（provider=${provider ?? 'unchanged'}）`);
    return this.getAiConfig();
  }

  /** 用给定配置（或当前生效配置）发起一次最小调用，验证 Key / 地址是否可用 */
  async testAiConfig(override?: Partial<AiConfig>): Promise<TestAiConfigResult> {
    const normalizedOverride = override ? { ...override } : undefined;
    // 表单回传的脱敏占位符不是真实 Key，丢弃并回退到当前生效配置
    if (normalizedOverride?.apiKey && this.isMaskedKey(normalizedOverride.apiKey)) {
      delete normalizedOverride.apiKey;
    }
    const cfg: AiConfig = this.normalizeAiConfig({ ...this.getAiConfig(), ...(normalizedOverride ?? {}) });
    if (cfg.apiKey === API_KEY_DECRYPT_FAILED) {
      return { ok: false, error: 'API Key 无法解密，请检查服务器 ENCRYPT_KEY 配置' };
    }
    if (!cfg.apiKey || this.isPlaceholderKey(cfg.apiKey)) {
      return { ok: false, error: '尚未配置 API Key' };
    }
    // SSRF 防护：校验 baseUrl 不指向内网
    const ssrfError = this.validateBaseUrl(cfg.baseUrl);
    if (ssrfError) return { ok: false, error: ssrfError };
    try {
      const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, timeout: 15_000, maxRetries: 1 });
      const res = await client.chat.completions.create({
        model: cfg.chatModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      return { ok: true, model: res.model ?? cfg.chatModel };
    } catch (e: any) {
      const msg = this.formatAiError(e);
      this.logger.warn(`AI 连接测试失败: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /** 判断是否为 GET 接口返回的脱敏占位符（如 sk-***1234 / ***） */
  private isMaskedKey(key: string): boolean {
    return key.includes('***') || this.isPlaceholderKey(key);
  }

  private isPlaceholderKey(key: string): boolean {
    const value = key.trim().toLowerCase();
    return value === 'sk-not-configured' || value === '***' || value.includes('redacted') || value.includes('未配置');
  }

  private normalizeAiConfig(cfg: AiConfig): AiConfig {
    return {
      ...cfg,
      apiKey: cfg.apiKey.trim(),
      baseUrl: cfg.baseUrl.trim().replace(/\/+$/, ''),
      chatModel: cfg.chatModel.trim(),
      reasonerModel: cfg.reasonerModel?.trim() ?? '',
    };
  }

  /** 将 SDK 的笼统错误转换为后台可直接排查的提示，不返回密钥或请求体。 */
  private formatAiError(error: any): string {
    const status = Number(error?.status ?? error?.response?.status ?? 0);
    const code = String(
      error?.code ?? error?.cause?.code ?? error?.cause?.cause?.code ?? '',
    ).toUpperCase();
    const providerMessage =
      error?.error?.message ??
      error?.response?.data?.error?.message ??
      error?.response?.data?.message;
    if (status === 401) return `API Key 无效或已过期${providerMessage ? `：${providerMessage}` : ''}`;
    if (status === 403) return `API Key 没有该模型的访问权限${providerMessage ? `：${providerMessage}` : ''}`;
    if (status === 404) return 'API 地址或模型名称不存在，请检查基础地址和模型名';
    if (status === 429) return `账户额度不足或请求频率受限${providerMessage ? `：${providerMessage}` : ''}`;
    if (status >= 500) return `模型服务暂时不可用（HTTP ${status}），请稍后重试`;
    if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) {
      return `连接超时（${code}），请检查服务器网络、代理或防火墙`;
    }
    if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
      return `无法连接模型服务（${code}），请检查服务器网络、DNS、代理和 API 基础地址`;
    }
    if (providerMessage) return String(providerMessage);
    const message = String(error?.message ?? '').trim();
    if (!message || /^connection error\.?$/i.test(message) || /fetch failed/i.test(message)) {
      return '无法连接模型服务，请检查服务器网络、代理、防火墙和 API 基础地址';
    }
    return message;
  }

  /**
   * 拉取指定服务商的模型列表（OpenAI 兼容 GET /models）。
   * 表单回传的脱敏 Key 会自动回退到已存配置；失败时返回可读错误信息。
   */
  async listAiModels(override?: { provider?: string; baseUrl?: string; apiKey?: string }): Promise<{ models: { id: string; ownedBy?: string }[] }> {
    if (override?.apiKey && this.isMaskedKey(override.apiKey)) {
      delete override.apiKey;
    }
    const base = this.getAiConfig();
    const cfg: AiConfig = this.normalizeAiConfig({
      ...base,
      ...(override ?? {}),
      provider: (override?.provider ?? base.provider) as AiConfig['provider'],
      chatModel: base.chatModel,
      reasonerModel: base.reasonerModel,
    });
    if (cfg.apiKey === API_KEY_DECRYPT_FAILED) {
      throw new BadRequestException('API Key 无法解密，请检查服务器 ENCRYPT_KEY 配置');
    }
    if (!cfg.apiKey || this.isPlaceholderKey(cfg.apiKey)) {
      throw new BadRequestException('尚未配置 API Key，无法获取模型列表');
    }
    const ssrfError = this.validateBaseUrl(cfg.baseUrl);
    if (ssrfError) throw new BadRequestException(ssrfError);
    try {
      const baseUrl = cfg.baseUrl.replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new BadRequestException(`获取模型列表失败（HTTP ${res.status}）${body.slice(0, 150)}`);
      }
      const json: any = await res.json();
      const models = (json?.data ?? [])
        .map((m: any) => ({
          id: String(m?.id ?? '').trim(),
          ownedBy: m?.owned_by ? String(m.owned_by) : undefined,
        }))
        .filter((m: any) => m.id)
        .sort((a: any, b: any) => a.id.localeCompare(b.id, 'zh-CN'));
      return { models };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`获取模型列表失败：${this.formatAiError(e)}`);
    }
  }

  /** 校验 baseUrl 不指向内网/非法地址，防 SSRF */
  private validateBaseUrl(baseUrl: string): string | null {
    try {
      const u = new URL(baseUrl);
      if (!/^https?:$/.test(u.protocol)) return '仅支持 http/https 协议';
      const host = u.hostname;
      if (/^(127\.|192\.168\.|10\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|localhost)/i.test(host)) {
        return '不允许指向内网地址';
      }
      // 拒绝 IPv6 格式 [::1] 等
      if (host.startsWith('[') || host.includes(':')) return '不允许的内网地址';
      // 拒绝十进制/十六进制 IP
      if (/^\d+$/.test(host)) return '不允许的内网地址';
      if (/^0x/i.test(host)) return '不允许的内网地址';
      return null;
    } catch {
      return 'baseUrl 格式不合法';
    }
  }

  /**
   * 加密密钥候选：新数据只用 ENCRYPT_KEY；未配置时兼容回退 JWT_SECRET。
   * 解密会继续尝试 JWT_SECRET，以便无感迁移旧版本数据。
   */
  private get encryptionSecrets(): string[] {
    const values = [
      this.config.get<string>('ENCRYPT_KEY')?.trim(),
      this.config.get<string>('JWT_SECRET')?.trim(),
    ].filter((value): value is string => Boolean(value));
    const unique = [...new Set(values)];
    if (unique.length === 0) throw new Error('ENCRYPT_KEY or JWT_SECRET must be configured');
    return unique;
  }

  private deriveKey(secret: string): Buffer {
    return crypto.createHash('sha256').update(secret).digest();
  }

  /** AES-256-GCM 加密：v2 使用独立 ENCRYPT_KEY，输出 `v2:iv:tag:ciphertext`。 */
  private encrypt(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      this.deriveKey(this.encryptionSecrets[0]),
      iv,
    );
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  private decryptStoredSecret(data: string): DecryptedSecret {
    const parts = data.split(':');
    const versioned = parts[0] === 'v2';
    const encryptedParts = versioned ? parts.slice(1) : parts;
    const [ivHex, tagHex, encHex] = encryptedParts;
    const validEncryptedShape =
      encryptedParts.length === 3 &&
      /^[0-9a-f]{24}$/i.test(ivHex ?? '') &&
      /^[0-9a-f]{32}$/i.test(tagHex ?? '') &&
      /^(?:[0-9a-f]{2})+$/i.test(encHex ?? '');

    // v2 前缀表示一定是密文；格式损坏时绝不能回退为明文 API Key。
    if (!validEncryptedShape) {
      return versioned
        ? { value: null, needsMigration: false }
        : { value: data, needsMigration: true };
    }

    for (let index = 0; index < this.encryptionSecrets.length; index++) {
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          this.deriveKey(this.encryptionSecrets[index]),
          Buffer.from(ivHex, 'hex'),
        );
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(encHex, 'hex')),
          decipher.final(),
        ]).toString('utf8');
        return {
          value: decrypted,
          needsMigration: !versioned || index !== 0,
        };
      } catch {
        // 尝试下一把兼容密钥；不得返回原密文。
      }
    }
    return { value: null, needsMigration: false };
  }

  private decryptApiKey(data: string): string {
    const result = this.decryptStoredSecret(data);
    if (result.value !== null) return result.value;
    if (!this.decryptFailureLogged) {
      this.decryptFailureLogged = true;
      this.logger.error('数据库中的 AI API Key 无法解密；请确认 ENCRYPT_KEY 未被修改');
    }
    return API_KEY_DECRYPT_FAILED;
  }

  /** 启动时把旧明文/旧 JWT 密文迁移为 v2，后续重启不再依赖 JWT_SECRET。 */
  private async migrateApiKeyEncryption(): Promise<void> {
    const stored = this.get(KEYS.apiKey) ?? this.get(LEGACY_KEYS.apiKey);
    if (!stored) return;
    const result = this.decryptStoredSecret(stored);
    if (result.value === null || !result.needsMigration) return;
    await this.set(KEYS.apiKey, this.encrypt(result.value));
    this.logger.log('AI API Key 加密格式已升级，无需重新输入');
  }
}
