import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30000, expect: {timeout: 8000}, retries: 0,
  reporter: 'list', outputDir: '../../test-results',
  use: {baseURL: process.env.E2E_BASE_URL, browserName: 'chromium', channel: 'chromium', headless: true, viewport: {width: 1440, height: 1000}, trace: 'retain-on-failure', screenshot: 'only-on-failure'},
});
