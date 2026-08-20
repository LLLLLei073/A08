import { StreamableFile } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  it('普通响应保持统一 JSON 结构', async () => {
    const result = await firstValueFrom(interceptor.intercept({} as any, { handle: () => of({ ok: true }) }));
    expect(result).toEqual({ code: 0, message: 'success', data: { ok: true } });
  });

  it('文件流不包装为 JSON', async () => {
    const file = new StreamableFile(Buffer.from('template'));
    const result = await firstValueFrom(interceptor.intercept({} as any, { handle: () => of(file) }));
    expect(result).toBe(file);
  });
});
