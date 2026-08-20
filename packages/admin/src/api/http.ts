import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth';
import { useCacheStore } from '@/utils/cache';
import router from '@/router';

const baseURL = import.meta.env.VITE_ADMIN_API_BASE || '/api';

const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30000,
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

/**
 * 复核服务端认定的当前身份是否仍与本地登录态一致。
 * 用于 403 场景：同一浏览器里若会话被其他账号覆盖，服务端会持续判定权限不足，
 * 此时应引导重新登录，而不是让用户对着「权限不足」反复重试。
 * 走原始 axios，避免触发本拦截器造成递归。
 */
async function isSessionStale(localUserId: number): Promise<boolean> {
  try {
    const res = await axios.get(`${baseURL}/auth/me`, { headers: { 'X-Client': 'admin' } });
    const serverUser = res.data?.data;
    return !serverUser || serverUser.id !== localUserId;
  } catch {
    return true;
  }
}

http.interceptors.request.use((config) => {
  // P0-7：token 存于 HttpOnly Cookie，浏览器对同源请求自动携带，无需手动附加 Authorization
  // 声明客户端身份：管理端与学习端同源部署，服务端据此隔离各自的会话 Cookie
  config.headers.set('X-Client', 'admin');
  // 空字符串对可选枚举仍会触发 class-validator；发出请求前统一移除空筛选项。
  if (config.params && typeof config.params === 'object' && !Array.isArray(config.params)) {
    config.params = Object.fromEntries(
      Object.entries(config.params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
    );
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    const data = res.data;
    if (data && typeof data === 'object' && 'code' in data) {
      if (data.code === 0) return data.data;
      ElMessage.error(data.message || '请求失败');
      return Promise.reject(new Error(data.message || '请求失败'));
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
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => http({ ...err.config, headers: { ...err.config.headers } }));
      }

      isRefreshing = true;
      try {
        const ok = await auth.refreshAccessToken();
        if (ok) {
          failedQueue.forEach(({ resolve }) => resolve(undefined));
          failedQueue = [];
          isRefreshing = false;
          return http({ ...err.config, headers: { ...err.config.headers } });
        }
        failedQueue.forEach(({ reject }) => reject(err));
        failedQueue = [];
        isRefreshing = false;
        auth.logout();
        router.replace('/login');
        ElMessage.error('登录已过期，请重新登录');
        return Promise.reject(err);
      } catch (e) {
        failedQueue.forEach(({ reject }) => reject(e));
        failedQueue = [];
        isRefreshing = false;
        auth.logout();
        router.replace('/login');
        ElMessage.error('登录已过期，请重新登录');
        return Promise.reject(e);
      }
    }

    // 403：先确认不是「会话被其他账号覆盖」导致的假性权限不足
    if (err.response?.status === 403 && auth.user && (await isSessionStale(auth.user.id))) {
      await auth.logout();
      router.replace('/login');
      ElMessage.error('登录状态已失效或被其他账号覆盖，请重新登录');
      return Promise.reject(err);
    }

    // 登录失败（账号不存在 / 密码错误 / 网络异常）必须明确提示
    const msg =
      err.response?.data?.message ||
      (err.response ? '请求失败，请稍后重试' : '网络异常，请检查网络后重试');
    ElMessage.error(msg);
    return Promise.reject(err);
  },
);

export const api = {
  get<T = any>(url: string, config?: AxiosRequestConfig & { cache?: number }) {
    // TTL 缓存：命中且未过期直接返回，减少高频 GET 的重复请求
    if (config?.cache) {
      const store = useCacheStore();
      const key = `GET:${baseURL}${url}:${JSON.stringify(config.params ?? '')}`;
      const hit = store.get(key);
      if (hit !== undefined) return Promise.resolve(hit as T);
      return http.get<any, T>(url, config).then((d) => {
        store.set(key, d, config.cache as number);
        return d;
      });
    }
    return http.get<any, T>(url, config);
  },
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return http.post<any, T>(url, data, config).then((d) => {
      useCacheStore().invalidate();
      return d;
    });
  },
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return http.patch<any, T>(url, data, config).then((d) => {
      useCacheStore().invalidate();
      return d;
    });
  },
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return http.put<any, T>(url, data, config).then((d) => {
      useCacheStore().invalidate();
      return d;
    });
  },
  delete<T = any>(url: string, config?: AxiosRequestConfig) {
    return http.delete<any, T>(url, config).then((d) => {
      useCacheStore().invalidate();
      return d;
    });
  },
  upload<T = any>(url: string, file: File | File[], fieldName = 'file') {
    const form = new FormData();
    if (Array.isArray(file)) {
      file.forEach((f) => form.append(fieldName, f));
    } else {
      form.append(fieldName, file);
    }
    return http.post<any, T>(url, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export default http;
