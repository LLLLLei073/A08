import { defineStore } from 'pinia';

interface Entry {
  value: unknown;
  exp: number;
}

/**
 * 全局 TTL 数据缓存层（基于 Pinia）。
 * - get(key): 命中且未过期返回 value，否则 undefined（并清理已过期项）
 * - set(key, value, ttl): 写入并设置过期时间（ms）
 * - invalidate(prefix?): 清空全部缓存或按前缀清空（写操作后调用保证一致性）
 *
 * 配合 http.ts 的 api.get({ cache }) 使用，可让高频 GET 在 TTL 内直接命中缓存，
 * 减少重复请求、加快二次导航与切页速度。
 */
export const useCacheStore = defineStore('http-cache', {
  state: () => ({ entries: {} as Record<string, Entry> }),
  actions: {
    get(key: string): unknown {
      const e = this.entries[key];
      if (e && e.exp > Date.now()) return e.value;
      if (e) delete this.entries[key];
      return undefined;
    },
    set(key: string, value: unknown, ttl: number) {
      this.entries[key] = { value, exp: Date.now() + ttl };
    },
    invalidate(prefix?: string) {
      if (!prefix) {
        this.entries = {};
        return;
      }
      for (const k of Object.keys(this.entries)) {
        if (k.startsWith(prefix)) delete this.entries[k];
      }
    },
  },
});

/** TTL 缓存包装：高频读取命中缓存直接返回，避免重复请求 */
export async function cached<T>(key: string, fetcher: () => Promise<T>, ttl = 60000): Promise<T> {
  const store = useCacheStore();
  const hit = store.get(key);
  if (hit !== undefined) return hit as T;
  const v = await fetcher();
  store.set(key, v, ttl);
  return v;
}
