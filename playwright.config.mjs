// Playwright config for IT-Ticket E2E tests against the live deploy.
// Run: npx playwright test
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // One worker so we don't hit the chat API in parallel and trip rate
  // limits. The chat cascade has fallbacks but this keeps results clean.
  workers: 1,
  retries: 1,
  // Each individual test gets 90s — the chat round-trip can take 5-10s
  // when the cascade has to fall over to a slower provider.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/playwright-report', open: 'never' }],
    ['json', { outputFile: 'tests/playwright-report/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://portal-hub-taupe.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel5',  use: { ...devices['Pixel 5'] } },
    { name: 'iphone',  use: { ...devices['iPhone 13'] } },
  ],
});
