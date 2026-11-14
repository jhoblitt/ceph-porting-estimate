import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const reportJson = fileURLToPath(new URL('./src/generated/report.json', import.meta.url));

// Without it the site would build and then fail in the browser.
const requireReport: Plugin = {
  name: 'require-report-json',
  apply: 'build',
  buildStart() {
    if (!existsSync(reportJson)) {
      this.error('src/generated/report.json is missing: run `make site-build`, or `make site-dev-data` for the fixture');
    }
  },
};

export default defineConfig({
  base: '/ceph-porting-estimate/',
  plugins: [svelte(), requireReport],
  define: {
    // Formatted at runtime by lib/version.ts; an empty string means a dev build.
    __APP_VERSION__: JSON.stringify(process.env['APP_VERSION'] ?? ''),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
