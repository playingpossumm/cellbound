import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { IncomingMessage } from 'node:http';
import { APP_NAME } from './src/app/brand.ts';

/** A Node request as a web Request, for the leaderboard's handlers. */
async function requestOf(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const method = req.method ?? 'GET';
  return new Request(`http://localhost${req.url}`, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks) });
}

export default defineConfig({
  plugins: [
    react(),
    // The leaderboard's /api, served by the dev server from server/ with a store in memory, so the
    // app and the e2e tests can join, sync and rank without Redis (server/dev.ts).
    {
      name: 'leaderboard-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next();
          try {
            const { handle } = (await server.ssrLoadModule('/server/http.ts')) as typeof import('./server/http');
            const { devStore } = (await server.ssrLoadModule('/server/dev.ts')) as typeof import('./server/dev');
            const response = await handle(await requestOf(req), devStore());
            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (e) {
            next(e);
          }
        });
      },
    },
    // index.html writes the name as %APP_NAME%, so it lives in one place.
    {
      name: 'app-name',
      transformIndexHtml: {
        order: 'pre',
        handler: (html: string) => html.replaceAll('%APP_NAME%', APP_NAME),
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      // The glob below already precaches the icons, so they are not added a second time.
      includeManifestIcons: false,
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Variant sudoku with daily puzzles, roguelite runs and fog.',
        // The ground of Prism at night, its default.
        theme_color: '#0a0c11',
        background_color: '#0a0c11',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          // Full-bleed artwork that Android may crop to a circle or a squircle.
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Fonts ship as woff2 only: every browser that runs the app reads woff2, so the
        // .woff copies that @fontsource adds would only fill the cache. The app's text is
        // all Latin, so the latin-ext and Vietnamese slices are never requested either.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*-latin-ext-*.woff2', '**/*-vietnamese-*.woff2'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
    exclude: ['node_modules/**', '.worktrees/**', 'dist/**'],
    // The generation tests take under a second alone, and several times that when 25 files start
    // together on a busy machine, so the default 5 s was sometimes not enough.
    testTimeout: 20_000,
  },
});
