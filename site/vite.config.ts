import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { type Plugin, createServer } from 'vite';
import { defineConfig } from 'vitest/config';
import { compileMarkdown } from './src/lib/prose/compile.js';

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

const contentDir = fileURLToPath(new URL('./src/content/', import.meta.url));

// The prose pages' Markdown, compiled at build time so no parser ships to
// the browser. A placeholder with bad syntax or an unknown formatter fails
// the build here; one whose path does not resolve fails checkProse below.
const proseMarkdown: Plugin = {
  name: 'prose-markdown',
  enforce: 'pre',
  transform(source, id) {
    if (!id.endsWith('.md') || !id.startsWith(contentDir)) return null;
    const doc = compileMarkdown(source, relative(contentDir, id));
    return { code: `export default ${JSON.stringify(doc)};`, map: null };
  },
};

// The prose pages render in the browser from report.json, and
// calibration.yaml is free-form, so a renamed key or a removed group would
// leave a blank page behind a green build. Render them against the report
// this build ships, through the same code the browser runs, and fail with
// every problem, each naming its content file and path.
const checkProse: Plugin = {
  name: 'check-prose-pages',
  apply: 'build',
  async buildStart() {
    if (!existsSync(reportJson)) return; // requireReport says so
    const server = await createServer({
      root: fileURLToPath(new URL('.', import.meta.url)),
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [proseMarkdown],
    });
    let problems: string[];
    try {
      const check = (await server.ssrLoadModule('/src/lib/prose/check.ts')) as {
        checkGeneratedReport(raw: unknown): string[];
      };
      problems = check.checkGeneratedReport(JSON.parse(readFileSync(reportJson, 'utf8')));
    } finally {
      await server.close();
    }
    if (problems.length > 0) {
      this.error(`the prose pages do not render against src/generated/report.json:\n  ${problems.join('\n  ')}`);
    }
  },
};

export default defineConfig({
  base: '/ceph-porting-estimate/',
  // Under vitest, svelteTesting resolves Svelte's client build, so component
  // tests can mount, and cleans up after each test.
  plugins: [proseMarkdown, svelte(), requireReport, checkProse, ...(process.env['VITEST'] ? [svelteTesting()] : [])],
  define: {
    // Formatted at runtime by lib/version.ts; an empty string means a dev build.
    __APP_VERSION__: JSON.stringify(process.env['APP_VERSION'] ?? ''),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
