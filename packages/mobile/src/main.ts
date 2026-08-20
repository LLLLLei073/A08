import { createApp } from 'vue';
import { createPinia } from 'pinia';
// 不再引入 Vant 全量样式（233KB）：声明式组件由 vite.config 中的 VantResolver 在编译期
// 按需注入样式；此处仅手动引入被函数式 API（showToast / showConfirmDialog）用到的组件样式，
// 首屏 CSS 体积从 233KB 降到不足 30KB。
import 'vant/es/toast/style';
import 'vant/es/dialog/style';
import App from './App.vue';
import router from './router';
import { lazy } from '@/directives/lazy';
import { prefetchRoutes } from '@/utils/prefetch';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('lazy', lazy);
// 浏览器空闲时预加载所有懒路由组件，加快二次导航
prefetchRoutes(router);
app.mount('#app');
