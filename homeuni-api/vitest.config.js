import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config(); // load .env before DATABASE_URL is read below

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.js'],
    exclude: ['src/__tests__/e2e/**'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-not-for-production',
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
    },
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.js', 'src/middleware/**/*.js', 'src/routes/**/*.js'],
      exclude: ['src/__tests__/**'],
      reporter: ['text', 'html'],
    },
  },
});
