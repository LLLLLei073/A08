import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'crypto';
import { SettingsService } from './settings.service';

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = { completions: { create: createCompletion } };
  },
}));

function createService(options?: {
  rows?: Map<string, string>;
  configValues?: Record<string, string>;
}) {
  const rows = options?.rows ?? new Map<string, string>();
  const prisma = {
    setting: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(
        [...rows].map(([key, value]) => ({ key, value })),
      )),
      upsert: vi.fn().mockImplementation(({ where, create, update }) => {
        rows.set(where.key, rows.has(where.key) ? update.value : create.value);
        return Promise.resolve({ key: where.key, value: rows.get(where.key) });
      }),
    },
  };
  const configValues: Record<string, string> = {
    ENCRYPT_KEY: 'test-encrypt-key',
    JWT_SECRET: 'test-jwt-secret',
    DEEPSEEK_API_KEY: 'sk-not-configured',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    DEEPSEEK_CHAT_MODEL: 'deepseek-chat',
    DEEPSEEK_REASONER_MODEL: 'deepseek-reasoner',
    ...(options?.configValues ?? {}),
  };
  const config = { get: vi.fn((key: string, fallback?: string) => configValues[key] ?? fallback) };
  return { service: new SettingsService(prisma as any, config as any), rows };
}

function encryptLegacy(plain: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

describe('SettingsService AI 配置', () => {
  beforeEach(() => createCompletion.mockReset());

  it('保存时清理空格、移除地址末尾斜杠并允许清空推理模型', async () => {
    const { service, rows } = createService();

    const result = await service.updateAiConfig({
      provider: 'zhipu',
      apiKey: '  test-api-key  ',
      baseUrl: ' https://open.bigmodel.cn/api/paas/v4/ ',
      chatModel: ' glm-4.7-flash ',
      reasonerModel: '',
    });

    expect(result.apiKey).toBe('test-api-key');
    expect(result.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(result.chatModel).toBe('glm-4.7-flash');
    expect(rows.get('ai.reasonerModel')).toBe('');
  });

  it('连接错误包含底层网络原因', async () => {
    const { service } = createService();
    createCompletion.mockRejectedValueOnce(Object.assign(new Error('Connection error.'), {
      cause: { code: 'ETIMEDOUT' },
    }));

    const result = await service.testAiConfig({
      provider: 'zhipu',
      apiKey: 'test-api-key',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      chatModel: 'glm-4.7-flash',
      reasonerModel: '',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('连接超时'),
    });
  });

  it('服务器重启且 JWT 变化后仍可使用独立 ENCRYPT_KEY 解密 API Key', async () => {
    const rows = new Map<string, string>();
    const first = createService({
      rows,
      configValues: { ENCRYPT_KEY: 'stable-encrypt-key', JWT_SECRET: 'jwt-before-restart' },
    });
    await first.service.updateAiConfig({
      provider: 'zhipu',
      apiKey: 'persistent-api-key',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      chatModel: 'glm-4.7-flash',
      reasonerModel: '',
    });

    const restarted = createService({
      rows,
      configValues: { ENCRYPT_KEY: 'stable-encrypt-key', JWT_SECRET: 'jwt-after-restart' },
    });
    await restarted.service.onModuleInit();

    expect(restarted.service.getAiConfig().apiKey).toBe('persistent-api-key');
    expect(rows.get('ai.apiKey')).toMatch(/^v2:/);
  });

  it('启动时自动把旧 JWT 加密数据迁移为独立 ENCRYPT_KEY 加密格式', async () => {
    const rows = new Map<string, string>([
      ['ai.apiKey', encryptLegacy('legacy-api-key', 'old-jwt-secret')],
    ]);
    const { service } = createService({
      rows,
      configValues: { ENCRYPT_KEY: 'new-stable-encrypt-key', JWT_SECRET: 'old-jwt-secret' },
    });

    await service.onModuleInit();

    expect(service.getAiConfig().apiKey).toBe('legacy-api-key');
    expect(rows.get('ai.apiKey')).toMatch(/^v2:/);
  });

  it('解密失败时不把数据库密文当作 API Key 请求模型服务', async () => {
    const encryptedWithUnknownKey = encryptLegacy('unavailable-api-key', 'unknown-secret');
    const rows = new Map<string, string>([['ai.apiKey', encryptedWithUnknownKey]]);
    const { service } = createService({ rows });
    await service.onModuleInit();

    expect(service.getAiConfig().apiKey).not.toBe(encryptedWithUnknownKey);
    await expect(service.testAiConfig()).resolves.toEqual({
      ok: false,
      error: 'API Key 无法解密，请检查服务器 ENCRYPT_KEY 配置',
    });
    expect(createCompletion).not.toHaveBeenCalled();
  });
});
