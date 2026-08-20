import axios, { type AxiosInstance } from 'axios';
import { showToast } from 'vant';
import { useAuthStore } from '@/store/auth';
import { useCacheStore } from '@/utils/cache';
import router from '@/router';

const baseURL = import.meta.env.VITE_MOBILE_API_BASE || '/api';

const http: AxiosInstance = axios.create({ baseURL, timeout: 30000 });

// 401 并发刷新锁：多个请求同时 401 时，只允许第一个触发 refreshAccessToken，
// 其余请求排队等待刷新结果后统一重放，避免 refresh_token 被多次消费
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

http.interceptors.request.use((config) => {
  // P0-7：token 存于 HttpOnly Cookie，浏览器对同源请求自动携带，无需手动附加 Authorization
  // 声明客户端身份：管理端与学习端同源部署，服务端据此隔离各自的会话 Cookie
  config.headers.set('X-Client', 'mobile');
  return config;
});

http.interceptors.response.use(
  (res) => {
    const data = res.data;
    if (data && typeof data === 'object' && 'code' in data) {
      if (data.code === 0) return data.data;
      showToast(data.message || '请求失败');
      return Promise.reject(new Error(data.message));
    }
    return data;
  },
  async (err) => {
    const url = err.config?.url || '';
    const isLoginReq = url.includes('/auth/login');
    const isRefreshReq = url.includes('/auth/refresh');
    const auth = useAuthStore();

    // 401 且非登录/刷新请求：尝试用 refresh_token(Cookie) 刷新后重放原请求
    if (err.response?.status === 401 && !isLoginReq && !isRefreshReq && auth.user) {
      // 已有刷新在进行：把当前请求放入队列等待重放
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          return http({ ...err.config, headers: { ...err.config.headers } });
        });
      }
      isRefreshing = true;
      try {
        const ok = await auth.refreshAccessToken();
        if (ok) {
          // 刷新成功：清空队列并重放所有排队请求
          const queue = failedQueue;
          failedQueue = [];
          queue.forEach(({ resolve }) => resolve());
          return http({ ...err.config, headers: { ...err.config.headers } });
        }
        // 刷新失败：reject 所有排队请求并跳转登录
        const queue = failedQueue;
        failedQueue = [];
        queue.forEach(({ reject }) => reject(err));
        auth.logout();
        router.replace('/login');
        showToast('登录已过期，请重新登录');
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    // 登录失败（账号不存在 / 密码错误 / 网络异常）必须明确提示，否则用户只感到"登不进"却无原因
    const msg =
      err.response?.data?.message ||
      (err.response ? '请求失败，请稍后重试' : '网络异常，请检查网络后重试');
    showToast(msg);
    return Promise.reject(err);
  },
);

export const api = {
  get: <T = any>(url: string, config?: any) => {
    // TTL 缓存：命中且未过期直接返回，减少高频 GET 的重复请求
    if (config?.cache) {
      const store = useCacheStore();
      const key = `GET:${baseURL}${url}:${JSON.stringify(config.params ?? '')}`;
      const hit = store.get(key);
      if (hit !== undefined) return Promise.resolve(hit as T);
      return http.get<any, T>(url, config).then((d: T) => {
        store.set(key, d, config.cache);
        return d;
      });
    }
    return http.get<any, T>(url, config);
  },
  post: <T = any>(url: string, data?: any, config?: any) =>
    http.post<any, T>(url, data, config).then((d: T) => {
      useCacheStore().invalidate();
      return d;
    }),
  patch: <T = any>(url: string, data?: any, config?: any) =>
    http.patch<any, T>(url, data, config).then((d: T) => {
      useCacheStore().invalidate();
      return d;
    }),
  delete: <T = any>(url: string, config?: any) =>
    http.delete<any, T>(url, config).then((d: T) => {
      useCacheStore().invalidate();
      return d;
    }),
};

export default http;
