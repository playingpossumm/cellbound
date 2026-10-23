import { defineConfig } from '@playwright/test';

// Smoke tests at phone and laptop sizes against the dev server.
// The installed Chromium may not match this Playwright version, so the tests
// use the system Edge channel by default; set PW_CHANNEL=chromium to switch.
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');
const port = Number(process.env.PW_PORT ?? 5263);

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
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: 'laptop', use: { viewport: { width: 1366, height: 768 } } },
  ],
});
