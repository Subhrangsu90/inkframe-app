import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    isolate: false,
    testTimeout: 10000,
    include: ['projects/inkframe-editor/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
