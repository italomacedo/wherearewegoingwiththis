// Browser-only Vite config for the animation scrub tool (tools/anim-scrub.html).
// Excludes vite-plugin-electron (which auto-launches Electron). Run via
// `npm run scrub`, then open http://localhost:5174/tools/anim-scrub.html
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@systems': path.resolve(__dirname, 'src/systems'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  define: { __DISABLE_PHYSICS__: JSON.stringify(true) },
});
