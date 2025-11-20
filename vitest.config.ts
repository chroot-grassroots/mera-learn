import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // Include test files
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Map TypeScript imports to source files
      '@': path.resolve(__dirname, './src/ts'),
    },
  },
  // This is critical: tells Vitest to transform TypeScript
  esbuild: {
    target: 'es2020',
  },
});
