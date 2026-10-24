import { defineConfig, devices } from '@playwright/test';

// Browser tests at phone and laptop sizes against the dev server, plus a production
// project that builds the app, serves it with vite preview and checks offline use.
// Chromium runs through the system Edge channel by default, because an installed
// Chromium may not match this Playwright version; set PW_CHANNEL=chromium to switch.
// WebKit (Safari's engine) and Firefox use Playwright's own builds: install them once
// with `npx playwright install webkit firefox`.
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');
const port = Number(process.env.PW_PORT ?? 5263);
const previewPort = port + 1;

const phone = { width: 390, height: 844 };
const laptop = { width: 1366, height: 768 };
const preview = { baseURL: `http://localhost:${previewPort}` };
const productionSpec = /production\.spec/;
const slow = 60_000;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
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
  // metadata.form says which screen shape a project stands for; a few tests only make
  // sense on one of them.
  projects: [
    // Edge (Chromium). The phone projects emulate a phone, not a narrow desktop window: a phone's
    // scrollbars float over the page, so the board gets the full width, as it does on a real phone.
    { name: 'phone', testIgnore: productionSpec, metadata: { form: 'phone' }, use: { channel, viewport: phone, hasTouch: true, isMobile: true } },
    { name: 'laptop', testIgnore: productionSpec, metadata: { form: 'laptop' }, use: { channel, viewport: laptop } },
    { name: 'production', testMatch: productionSpec, use: { ...preview, channel, viewport: phone, hasTouch: true, isMobile: true } },
    // WebKit: an iPhone and an iPad with touch. Playwright's WebKit build for Windows runs
    // several times slower than Edge, so the WebKit and Firefox projects get more time.
    { name: 'webkit-phone', testIgnore: productionSpec, timeout: slow, metadata: { form: 'phone' }, use: { ...devices['iPhone 14'], viewport: phone } },
    { name: 'webkit-tablet', testIgnore: productionSpec, timeout: slow, metadata: { form: 'tablet' }, use: { ...devices['iPad Pro 11'] } },
    { name: 'webkit-production', testMatch: productionSpec, timeout: slow, use: { ...devices['iPhone 14'], ...preview, viewport: phone } },
    // Firefox on a laptop.
    { name: 'firefox', testIgnore: productionSpec, timeout: slow, metadata: { form: 'laptop' }, use: { ...devices['Desktop Firefox'], viewport: laptop } },
    { name: 'firefox-production', testMatch: productionSpec, timeout: slow, use: { ...devices['Desktop Firefox'], ...preview, viewport: laptop } },
  ],
});
