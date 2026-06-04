import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
          },
        },
      },
    ]),
    // NOTE: vite-plugin-electron-renderer was removed — the renderer runs with
    // nodeIntegration:false + contextIsolation:true (pure browser; it talks to
    // main only via the preload `window.electronAPI` bridge), and the plugin's
    // Node-condition resolution pulled the Node build of @huggingface/transformers
    // (Kokoro TTS) → `Dynamic require of "path"` crash. (Lesson 38.)
  ],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@systems': path.resolve(__dirname, 'src/systems'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      // Force the BROWSER build of transformers.js (Kokoro TTS dep). The
      // electron-renderer plugin prefers Node conditions, which otherwise pull
      // transformers.node.cjs → `Dynamic require of "path"` crash in the
      // renderer. The web build runs on onnxruntime-web (WASM). (Lesson 38.)
      '@huggingface/transformers': path.resolve(
        __dirname,
        'node_modules/@huggingface/transformers/dist/transformers.web.js'
      ),
    },
  },
  optimizeDeps: {
    // Pre-bundle the TTS deps from their web entry so the dev server doesn't
    // re-resolve them to the Node build on first dynamic import.
    include: ['kokoro-js', '@huggingface/transformers'],
  },
  worker: {
    // ES-module worker output so the TTS worker can code-split its dynamic
    // imports (kokoro-js / transformers). The default 'iife' rejects splitting.
    format: 'es',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
