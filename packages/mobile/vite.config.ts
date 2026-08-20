import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import { fileURLToPath, URL } from 'node:url';

const staticHostBuild = process.env.VITE_STATIC_HOST === 'vercel';

export default defineConfig({
  // 默认本地部署路径；若静态资源要走 CDN，构建时设置 VITE_CDN_BASE 为 CDN 绝对地址
  // （如 https://cdn.example.com/mobile/），构建后把 index.html 与 assets 一并上传到该地址即可。
  base: process.env.VITE_CDN_BASE || '/',
  plugins: [
    vue(),
    // @vant/auto-import-resolver 的声明会引入另一份 Vite 类型；运行时仍由当前
    // Vite 5 插件协议加载，断言仅消除跨版本声明冲突，保证 CI/Vercel 能类型检查。
    Components({ resolvers: [VantResolver()] }) as any,
  ],
  cacheDir: 'node_modules/.vite-mobile',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // Vercel 的 Root Directory 指向本包时，构建产物必须留在当前目录内；
    // 本地一体化服务仍沿用 server/public/mobile 目录。
    outDir: staticHostBuild ? 'dist' : '../server/public/mobile',
    emptyOutDir: true,
    sourcemap: false,
    // 移动端 WebView 为现代浏览器，esnext 可去掉 legacy polyfill，减小体积
    target: 'esnext',
    rollupOptions: {
      output: {
        // 第三方库拆成独立 chunk：利用浏览器并行下载(HTTP/2) + 长缓存，切页只下载当页业务代码。
        // 关键：只显式拆“首屏必需”的 vue/vant/axios，以及“路由级懒加载”的 echarts；
        // 不写兜底 fallback —— md-editor / highlight.js / @vueuse / dayjs 等走 Rollup 默认分包，
        // 因为它们是动态 import，会自动成为懒 chunk，绝不会被打进首屏预加载。
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](echarts|zrender)[\\/]/.test(id)) return 'echarts';
          if (/[\\/]node_modules[\\/]vant[\\/]/.test(id)) return 'vant';
          if (/[\\/]node_modules[\\/](vue|vue-router|pinia|@vue)[\\/]/.test(id)) return 'vue';
          if (/[\\/]node_modules[\\/]axios[\\/]/.test(id)) return 'axios';
        },
      },
    },
  },
});
