/**
 * v-lazy 图片懒加载指令：
 * - 现代浏览器直接用原生 loading="lazy"（零 JS 开销）
 * - 旧浏览器用 IntersectionObserver，元素进入视口时才赋值 src
 * 用法：<img v-lazy="url" />
 */
export const lazy = {
  mounted(el: HTMLImageElement, binding: { value?: string }) {
    const src = binding.value;
    if (!src) return;
    if ('loading' in HTMLImageElement.prototype) {
      el.setAttribute('loading', 'lazy');
      el.src = src;
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          el.src = src;
          obs.disconnect();
        }
      });
    });
    io.observe(el);
    (el as any)._lazyObserver = io;
  },
  updated(el: HTMLImageElement, binding: { value?: string; oldValue?: string }) {
    if (binding.value && binding.value !== binding.oldValue) {
      el.setAttribute('loading', 'lazy');
      el.src = binding.value;
    }
  },
  unmounted(el: HTMLImageElement) {
    const io = (el as any)._lazyObserver;
    if (io) {
      io.disconnect();
      (el as any)._lazyObserver = null;
    }
  },
};
