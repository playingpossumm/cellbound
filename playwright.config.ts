import { defineConfig } from '@playwright/test';

// Browser tests at phone and laptop sizes against the dev server, plus a production
// project that builds the app, serves it with vite preview and checks offline use.
// The installed Chromium may not match this Playwright version, so the tests use the
// system Edge channel by default; set PW_CHANNEL=chromium to switch.
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');
const port = Number(process.env.PW_PORT ?? 5263);
const previewPort = port + 1;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    channel,
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: `npx vite --port ${port} --strictPort`,
      url: `http://localhost:${port}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx vite preview --port ${previewPort} --strictPort`,
      url: `http://localhost:${previewPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    { name: 'phone', testIgnore: /production\.spec/, use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'laptop', testIgnore: /production\.spec/, use: { viewport: { width: 1366, height: 768 } } },
    {
      name: 'production',
      testMatch: /production\.spec/,
      use: { baseURL: `http://localhost:${previewPort}`, viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
});
