import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config();

export default defineConfig({
  test: {
    include: ['src/__tests__/e2e/**/*.test.js'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-not-for-production',
      DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
      REVIEWER_ENABLED: 'false',
    },
    testTimeout: 600000,
    hookTimeout: 600000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
  },
});
