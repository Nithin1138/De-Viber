import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['src/__tests__/**/*.integration.test.ts', 'node_modules', 'dist'],
    testTimeout: 15000, // dependency checks hit the network
  },
});
