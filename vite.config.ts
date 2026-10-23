import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/app/brand.ts';

export default defineConfig({
  plugins: [
    react(),
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
        theme_color: '#0c1730',
        background_color: '#0c1730',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', '.worktrees/**', 'dist/**'],
  },
});
