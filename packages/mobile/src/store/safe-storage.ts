/**
 * 安全访问 localStorage 的工具
 *
 * 修复：Edge / Safari 的隐私模式 / Tracking Prevention 会拦截 localStorage 访问，
 * 直接调用 localStorage.getItem/setItem 会抛 SecurityError，导致 store 初始化崩溃。
 * 本工具用 try/catch 包裹所有访问，失败时返回空值/静默忽略，让应用能在受限环境下继续运行。
 *
 * 副作用：在 storage 不可用时，登录状态无法跨刷新保留（每次刷新需重新登录），
 * 但比直接崩掉好。生产环境通常在 https 同源下不会触发此问题。
 */

const memStore = new Map<string, string>();

function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const available = isStorageAvailable();

export const safeStorage = {
  getItem(key: string): string | null {
    if (available) {
      try {
        return localStorage.getItem(key);
      } catch {
        // ignore
      }
    }
    return memStore.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    if (available) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {
        // ignore
      }
    }
    memStore.set(key, value);
  },
  removeItem(key: string): void {
    if (available) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    memStore.delete(key);
  },
};
