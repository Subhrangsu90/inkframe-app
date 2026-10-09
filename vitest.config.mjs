import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    testTimeout: 15000,
    include: ['projects/inkframe-editor/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
