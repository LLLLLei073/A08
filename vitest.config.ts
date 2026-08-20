import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/server/src/**/*.spec.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      // 直接指向 shared 源码，无需先 build shared
      '@ai-party-school/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
    },
  },
});
