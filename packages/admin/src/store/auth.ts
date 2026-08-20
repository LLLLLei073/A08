import { defineStore } from 'pinia';
import axios from 'axios';
import type { UserEntity } from '@ai-party-school/shared';
import { authApi } from '@/api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as UserEntity | null,
    forceChangePassword: false,
  }),
  getters: {
    // P0-7：登录态由服务端 HttpOnly Cookie 维持，前端仅以 user 是否存在判断
    isLoggedIn: (s) => !!s.user,
    role: (s) => s.user?.role,
  },
  actions: {
    async login(username: string, password: string) {
      const res = await authApi.login(username, password);
      this.user = res.user;
      this.forceChangePassword = res.forceChangePassword ?? false;
      return res;
    },
    async fetchMe() {
      try {
        const me = await authApi.me();
        this.user = me;
        this.forceChangePassword = me.forceChangePassword;
      } catch {
        this.logout();
      }
    },
    /** 用 Cookie 中的 refresh_token 换新 access_token（不走 http 拦截器，避免递归） */
    async refreshAccessToken(): Promise<boolean> {
      if (!this.user) return false;
      try {
        const baseURL = import.meta.env.VITE_ADMIN_API_BASE || '/api';
        // 浏览器自动携带 refresh_token Cookie；后端写入新的 access_token Cookie
        const res = await axios.post(`${baseURL}/auth/refresh`, null, {
          headers: { 'X-Client': 'admin' },
        });
        return res.data?.code === 0;
      } catch {
        return false;
      }
    },
    async logout() {
      this.user = null;
      this.forceChangePassword = false;
      // 清除服务端 HttpOnly Cookie（JS 无法直接清除）
      try {
        const baseURL = import.meta.env.VITE_ADMIN_API_BASE || '/api';
        await axios.post(`${baseURL}/auth/logout`, null, {
          withCredentials: true,
          headers: { 'X-Client': 'admin' },
        });
      } catch {
        /* 忽略：即使失败也清空本地状态 */
      }
    },
  },
});
