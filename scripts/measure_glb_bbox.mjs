// Offline GLB bounding-box measurement (no GPU). Parses the glTF JSON + POSITION
// accessor min/max per primitive, applies each node's world TRS (handles hierarchy),
// and unions the world-space corners. Prints native X/Y/Z extent per file.
//   node scripts/measure_glb_bbox.mjs <file.glb> [<file.glb> ...]
import { readFileSync } from 'node:fs';

function readGlb(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  return json;
}

// 4x4 column-major helpers (glTF convention).
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  return trs(n.translation, n.rotation, n.scale);
}
function apply(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function measure(path) {
  const g = readGlb(path);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const roots = (g.scenes?.[g.scene ?? 0]?.nodes) ?? g.nodes.map((_, i) => i);
  const walk = (idx, parent) => {
    const n = g.nodes[idx];
    const world = mul(parent, nodeMatrix(n));
    if (n.mesh != null) {
      for (const prim of g.meshes[n.mesh].primitives) {
        const acc = g.accessors[prim.attributes.POSITION];
        if (!acc?.min || !acc?.max) continue;
        const [ax, ay, az] = acc.min, [bx, by, bz] = acc.max;
        const corners = [
          [ax, ay, az], [bx, ay, az], [ax, by, az], [ax, ay, bz],
          [bx, by, az], [bx, ay, bz], [ax, by, bz], [bx, by, bz],
        ];
        for (const c of corners) {
          const w = apply(world, c);
          for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
        }
      }
    }
    for (const ch of n.children ?? []) walk(ch, world);
  };
  const I = trs();
  for (const r of roots) walk(r, I);
  return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] };
}

for (const path of process.argv.slice(2)) {
  const e = measure(path);
  const name = path.split(/[\\/]/).pop();
  console.log(`${name}: X=${e.x.toFixed(2)} Y=${e.y.toFixed(2)} Z=${e.z.toFixed(2)}  (maxXZ=${Math.max(e.x, e.z).toFixed(2)})`);
}
