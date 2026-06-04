/* istanbul ignore file — browser-only worker factory (uses import.meta; never run in Jest) */
// Browser-only factory for the TTS Web Worker. Isolated in its own module so
// `import.meta.url` (needed by Vite to bundle the worker) is NEVER reached by
// the CommonJS ts-jest transform — TTSService imports this dynamically, only on
// the browser path, so Jest never compiles it.
export function createTtsWorker(): Worker {
  return new Worker(new URL('../workers/ttsWorker.ts', import.meta.url), { type: 'module' });
}
