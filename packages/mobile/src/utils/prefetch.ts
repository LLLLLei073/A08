import type { Router } from 'vue-router';

/**
 * 空闲时预加载底部 Tab 路由组件，提升二次导航速度。
 * 通过 requestIdleCallback（不支持时回退 setTimeout）在浏览器空闲时段执行，不影响首屏渲染。
 *
 * 只预取 meta.tab === true 的路由（学习/任务/测验/我的），刻意跳过 content（md-editor 运行时
 * 约 852KB）与 report（echarts 约 365KB）等重型路由——这些仅在用户真正进入时才按需加载，
 * 避免首屏空闲期就把 1MB+ 的 chunk 拉下来挤占移动端带宽与 CPU。
 */
export function prefetchRoutes(router: Router): void {
  if (typeof window === 'undefined') return;
  const idle: (cb: () => void) => void =
    (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ||
    ((cb: () => void) => window.setTimeout(cb, 1500));
  idle(() => {
    router.getRoutes().forEach((r) => {
      if (r.meta?.tab !== true) return; // 仅预取底部 Tab，跳过重型路由
      const comp = (r as unknown as { components?: Record<string, unknown>; component?: unknown })
        .components?.default || (r as unknown as { component?: unknown }).component;
      if (typeof comp === 'function') {
        try {
          Promise.resolve((comp as () => unknown)()).catch(() => {});
        } catch {
          /* 预加载失败不阻塞 */
        }
      }
    });
  });
}
