import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Frontend tests run in jsdom; the server/ tests (former apps/api) are
    // Node-only and run in the 'node' environment via environmentMatchGlobs.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.ts'],
    environmentMatchGlobs: [['server/**', 'node']],
    exclude: ['node_modules', 'dist'],
    passWithNoTests: true,
  },
});
