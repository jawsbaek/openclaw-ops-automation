import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['ops-automation/**/*.js'],
      exclude: ['ops-automation/**/*.test.js', 'ops-automation/**/*.spec.js']
    },
    testTimeout: 15000
  }
});
