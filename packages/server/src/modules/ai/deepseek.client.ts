import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SettingsService } from '../settings/settings.service';
import { AiConfig } from '@ai-party-school/shared';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

@Injectable()
export class DeepSeekClient {
  private readonly logger = new Logger(DeepSeekClient.name);
  private client: OpenAI;
  private chatModel: string;
  private reasonerModel: string;
  /** 记录上一次用于构建客户端的配置，便于在调用时检测变更并热更新 */
  private snapshot: AiConfig;

  constructor(private readonly settings: SettingsService) {
    this.snapshot = this.settings.getAiConfig();
    this.rebuild(this.snapshot);
  }

  private rebuild(cfg: AiConfig) {
    const apiKey = cfg.apiKey || '«redacted:sk-…»';
    if (apiKey === '«redacted:sk-…»') {
      this.logger.warn('AI API Key 未配置；AI 接口将在运行时报错，请在后台“AI 配置”中设置');
    }
    this.client = new OpenAI({ apiKey, baseURL: cfg.baseUrl, timeout: 30_000, maxRetries: 2 });
    this.chatModel = cfg.chatModel;
    // 推理模型可留空，留空时回退到对话模型（部分服务商无独立推理模型）
    this.reasonerModel = cfg.reasonerModel || cfg.chatModel;
  }

  /** 每次调用前同步最新配置，使后台修改即时生效（无需重启服务） */
  private syncConfig() {
    const cfg = this.settings.getAiConfig();
    if (
      cfg.apiKey !== this.snapshot.apiKey ||
      cfg.baseUrl !== this.snapshot.baseUrl ||
      cfg.chatModel !== this.snapshot.chatModel ||
      cfg.reasonerModel !== this.snapshot.reasonerModel
    ) {
      this.rebuild(cfg);
    }
  }

  async chat(
    messages: ChatMessage[],
    options: { jsonMode?: boolean; temperature?: number; useReasoner?: boolean } = {},
  ): Promise<string> {
    this.syncConfig();
    const model = options.useReasoner ? this.reasonerModel : this.chatModel;
    try {
      const res = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.3,
        response_format: options.jsonMode ? ({ type: 'json_object' } as any) : undefined,
      });
      return res.choices[0]?.message?.content ?? '';
    } catch (e: any) {
      this.logger.error(`DeepSeek chat failed: ${e.message}`);
      throw e;
    }
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: Array<{
      type: 'function';
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }>,
  ): Promise<{
    content: string | null;
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>;
  }> {
    this.syncConfig();
    const res = await this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.1,
    });
    const msg = res.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: (msg?.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    };
  }
}
