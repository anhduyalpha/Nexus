import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, retries: 0, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4310', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node --experimental-strip-types packages/core/src/main.ts', url: 'http://127.0.0.1:4310/api/health', reuseExistingServer: false, timeout: 30000, env: { NEXUS_DATA_DIR: '.tmp/e2e', NEXUS_HOST: '127.0.0.1', NEXUS_PORT: '4310', NEXUS_TOKEN: '' } },
});
