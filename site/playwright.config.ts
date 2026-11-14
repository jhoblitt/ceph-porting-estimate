// The browser smoke test: the built site, served by `vite preview` under its
// real base path, in Chromium only. `make site-e2e` builds from the data first.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/ceph-porting-estimate/`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE,
    // Always the build under test, never a server left running.
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
