import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.{test,spec}.ts'],
    resolve: {
      alias: {
        '@terrain/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
      },
    },
  },
});
