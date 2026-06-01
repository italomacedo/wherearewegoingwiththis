// Copies the Havok physics .wasm into public/ so Vite serves it at
// /HavokPhysics.wasm with the correct MIME type. PhysicsService passes
// locateFile: () => '/HavokPhysics.wasm'. Run via predev/prebuild hooks.
// (The package's `exports` map forbids a deep `?url` import, so we copy.)
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm');
const destDir = resolve(root, 'public');
const dest = resolve(destDir, 'HavokPhysics.wasm');

if (!existsSync(src)) {
  console.warn('[copy-havok-wasm] source not found, skipping:', src);
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-havok-wasm] copied ->', dest);
