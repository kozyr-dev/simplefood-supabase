import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/*
 * Built into dist/, which the API serves at /admin (ADMIN_DIST_DIR).
 * `npm run dev` serves it at http://localhost:5173/admin/ and passes /api
 * through to the API on :1339, keeping the Host header: the API's
 * SameOriginGuard compares it with Origin.
 */
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  // No source maps: the app is public, its maps would only add weight.
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:1339', changeOrigin: false } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
