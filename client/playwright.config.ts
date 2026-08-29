import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4000',
    headless: true,
    channel: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'cd .. && npx tsx src/server.ts',
    port: 4000,
    reuseExistingServer: true,
    timeout: 45_000,
  },
})
