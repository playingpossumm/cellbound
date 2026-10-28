// Bundles the leaderboard's server (server/entries) into plain JavaScript in api/, one file per
// Vercel function. Vercel compiles TypeScript functions with the project's TypeScript, which is 7
// here and has no compiler API for it, so the functions ship already built. Shared code goes into
// api/_lib, which Vercel does not serve as functions. `npm run build` runs this.
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'api',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: {
        join: 'server/entries/join.ts',
        sync: 'server/entries/sync.ts',
        board: 'server/entries/board.ts',
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '_lib/[name]-[hash].js',
      },
    },
  },
});
