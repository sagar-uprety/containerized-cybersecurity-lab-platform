const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PORTAL_BASE_URL || 'http://127.0.0.1:8000',
    httpCredentials: {
      username: process.env.PORTAL_USER || 'student01',
      password: process.env.PORTAL_PASSWORD || 'smoke-password',
    },
    trace: 'retain-on-failure',
  },
});
