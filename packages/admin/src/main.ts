import { createApp } from 'vue';
import { createPinia } from 'pinia';
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
