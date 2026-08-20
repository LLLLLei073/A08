import type { Router } from 'vue-router';

/**
 * 空闲时预加载所有懒路由组件，提升二次导航速度。
 * 通过 requestIdleCallback（不支持时回退 setTimeout）在浏览器空闲时段执行，
 * 不影响首屏渲染。组件已用动态 import 拆分，预加载只在空闲时静默拉取对应 chunk。
 */
export function prefetchRoutes(router: Router): void {
  if (typeof window === 'undefined') return;
  const idle: (cb: () => void) => void =
    (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ||
    ((cb: () => void) => window.setTimeout(cb, 1500));
  idle(() => {
    router.getRoutes().forEach((r) => {
      const comp = (r as unknown as { components?: Record<string, unknown>; component?: unknown })
        .components?.default || (r as unknown as { component?: unknown }).component;
      if (typeof comp === 'function') {
        (comp as () => Promise<unknown>)().catch(() => {});
      }
    });
  });
}
