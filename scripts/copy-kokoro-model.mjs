// Optional: vendor the Kokoro TTS ONNX model into public/models so the renderer
// can load it OFFLINE (transformers.js env.localModelPath = '/models/'). If the
// model isn't present locally, this is a NO-OP — TTSService falls back to the
// Hugging Face hub on first run (then the browser caches it). Run via the same
// pre-hooks as copy-havok-wasm.
//
// To vendor offline, drop the HF repo folder at one of:
//   ~/Downloads/Kokoro-82M-v1.0-ONNX
//   node_modules/.cache/kokoro/Kokoro-82M-v1.0-ONNX
// (the full repo: config.json, tokenizer*, onnx/*.onnx, voices). It is copied to
//   public/models/onnx-community/Kokoro-82M-v1.0-ONNX
// public/models is gitignored (large binaries).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  resolve(homedir(), 'Downloads/Kokoro-82M-v1.0-ONNX'),
  resolve(root, 'node_modules/.cache/kokoro/Kokoro-82M-v1.0-ONNX'),
];
const src = candidates.find((p) => existsSync(p));
const destDir = resolve(root, 'public/models/onnx-community');
const dest = resolve(destDir, 'Kokoro-82M-v1.0-ONNX');

if (!src) {
  console.log('[copy-kokoro-model] no local model found (will fetch from HF on first run); checked:', candidates.join(', '));
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[copy-kokoro-model] vendored ->', dest);
