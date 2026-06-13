// Generates public/assets/gallery_manifest.json by scanning public/assets/world/**
// and public/assets/items/** for .glb files. The Scene Editor's gallery reads it
// at boot (the renderer cannot list directories). Run via the copy:assets hook
// (predev/prebuild/preelectron:dev); the manifest is gitignored (generated).
import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, join, basename } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'public', 'assets');
const roots = ['world', 'items'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.toLowerCase().endsWith('.glb')) yield full;
  }
}

// Keep in sync with labelFromPath/categoryFromPath in
// src/systems/sceneeditor/GalleryManifest.ts (the TS copies are unit-tested).
function labelFrom(path) {
  const stem = basename(path).replace(/\.glb$/i, '');
  return stem.split(/[_-]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const entries = [];
for (const r of roots) {
  const dir = join(assetsDir, r);
  let files = [];
  try { files = [...walk(dir)]; } catch { continue; }
  for (const f of files) {
    const rel = relative(assetsDir, f).replace(/\\/g, '/');
    const parts = rel.split('/');
    const category = parts[0] === 'world' ? (parts.length > 2 ? parts[1] : 'world') : 'items';
    entries.push({ path: rel, category, label: labelFrom(f) });
  }
}
entries.sort((a, b) => a.path.localeCompare(b.path));

const out = resolve(assetsDir, 'gallery_manifest.json');
writeFileSync(out, JSON.stringify({ entries }, null, 1));
console.log(`[gen-gallery-manifest] ${entries.length} entries -> ${out}`);
