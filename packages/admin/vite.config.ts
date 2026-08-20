import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import { fileURLToPath, URL } from 'node:url';

const staticHostBuild = process.env.VITE_STATIC_HOST === 'vercel';

export default defineConfig({
  // 默认本地部署路径；若静态资源要走 CDN，构建时设置 VITE_CDN_BASE 为 CDN 绝对地址
  // （如 https://cdn.example.com/admin/），构建后把 index.html 与 assets 一并上传到该地址即可。
  // 管理端在一体化服务下位于 /admin/；Vercel 会为其分配独立站点根路径。
  base: staticHostBuild ? '/' : process.env.VITE_CDN_BASE || '/admin/',
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  cacheDir: 'node_modules/.vite-admin',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Vercel 的 Root Directory 指向本包时，构建产物必须留在当前目录内；
    // 本地一体化服务仍沿用 server/public/admin 目录。
    outDir: staticHostBuild ? 'dist' : '../server/public/admin',
    emptyOutDir: true,
    sourcemap: false,
    // 现代浏览器，去掉 legacy polyfill
    target: 'esnext',
    rollupOptions: {
      output: {
        // 第三方库拆成独立 chunk：浏览器并行下载 + 长缓存，切页只下载当页业务代码
        // 注意：element-plus 不强制合并为单 chunk，让其随各路由页面按需分包，
        // 避免首屏（dashboard）被预加载全部 el- 组件代码。
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]echarts[\\/]|[\\/]zrender[\\/]/.test(id)) return 'echarts';
          if (/[\\/]vue[\\/]|[\\/]vue-router[\\/]|[\\/]pinia[\\/]|[\\/]@vue[\\/]/.test(id)) return 'vue';
          if (/[\\/]axios[\\/]/.test(id)) return 'axios';
        },
      },
    },
  },
});
