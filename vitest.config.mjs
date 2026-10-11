import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@inkframe-ui/editor/core': path.resolve(__dirname, './projects/inkframe-editor/core/index.ts'),
      '@inkframe-ui/editor/toolbar': path.resolve(__dirname, './projects/inkframe-editor/toolbar/index.ts'),
      '@inkframe-ui/editor/extensions': path.resolve(__dirname, './projects/inkframe-editor/extensions/index.ts'),
      '@inkframe-ui/editor': path.resolve(__dirname, './projects/inkframe-editor/src/public-api.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    testTimeout: 15000,
    include: ['projects/inkframe-editor/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
