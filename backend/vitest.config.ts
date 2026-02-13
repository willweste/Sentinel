import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['**/*.ts'],
      exclude: ['node_modules', 'dist', '**/*.spec.ts', '**/*.test.ts']
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
})
