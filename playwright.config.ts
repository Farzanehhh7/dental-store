import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const e2eDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-store-e2e-'));
const e2ePort = Number(process.env.E2E_PORT || 3100);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
export const E2E_ADMIN_TEST_TOKEN =
  process.env.E2E_ADMIN_TEST_TOKEN || 'e2e-test-admin-secret-token-2026';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx tsx server.ts',
    url: `${e2eBaseUrl}/api/health`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(e2ePort),
      DATA_DIR: e2eDataDir,
      SMS_PROVIDER: 'sandbox',
      PAYMENT_MODE: 'sandbox',
      SESSION_SECRET: 'e2e-test-session-secret-more-than-32-chars',
      E2E_ADMIN_TEST_TOKEN,
    },
  },
});
