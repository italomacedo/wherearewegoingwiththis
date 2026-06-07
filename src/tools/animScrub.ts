/* istanbul ignore file */
/**
 * Animation scrub tool — a standalone Babylon harness to browse a character's
 * embedded clips frame-by-frame and find a pose to FREEZE in-game (e.g. the
 * driving pose = the 'death' clip held at frame 20, picked here).
 *
 * Run:  npm run scrub   then open  http://localhost:5174/tools/anim-scrub.html
 * (NOT the site root `/` — that serves the full game, with music.)
 *
 * To use a found pose in the game, freeze it via PlayerController.playPose(clip, frame).
 * Not part of the game bundle; coverage-ignored.
 */
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, Color4, SceneLoader,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { AnimationGroup, AssetContainer } from '@babylonjs/core';
import { OUTFITS } from '@assets/AvatarMeshCatalog';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const charSel = document.getElementById('char') as HTMLSelectElement;
const clipSel = document.getElementById('clip') as HTMLSelectElement;
const scrub = document.getElementById('scrub') as HTMLInputElement;
const frameLbl = document.getElementById('frame')!;
const poseLbl = document.getElementById('pose')!;
const loopCb = document.getElementById('loop') as HTMLInputElement;

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.23, 0.23, 0.27, 1);
const cam = new ArcRotateCamera('cam', Math.PI, Math.PI / 2.3, 3.8, new Vector3(0, 0.9, 0), scene);
cam.attachControl(canvas, true);
cam.wheelPrecision = 30;
new HemisphericLight('l', new Vector3(0.4, 1, 0.3), scene);
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());

const views: Record<string, [number, number]> = {
  side: [Math.PI, Math.PI / 2.3], front: [-Math.PI / 2, Math.PI / 2.3],
  back: [Math.PI / 2, Math.PI / 2.3], '3q': [-Math.PI / 1.5, Math.PI / 2.4],
};
document.querySelectorAll('[data-view]').forEach((b) => {
  b.addEventListener('click', () => {
    const v = views[(b as HTMLElement).dataset.view!];
    if (v) { cam.alpha = v[0]; cam.beta = v[1]; }
  });
});

let container: AssetContainer | null = null;
let groups: AnimationGroup[] = [];
let current: AnimationGroup | null = null;

function selectClip(name: string) {
  groups.forEach((g) => g.stop());
  current = groups.find((g) => g.name === name) ?? null;
  if (!current) return;
  scrub.min = String(Math.round(current.from));
  scrub.max = String(Math.round(current.to));
  scrub.value = scrub.min;
  apply();
}

function apply() {
  if (!current) return;
  const f = Number(scrub.value);
  if (loopCb.checked) { current.start(true); }
  else { current.start(false); current.goToFrame(f); current.pause(); }
  frameLbl.textContent = `frame ${f}`;
  poseLbl.textContent = `${charSel.value} · ${current.name} [${Math.round(current.from)}..${Math.round(current.to)}] → freeze at frame ${f}`;
}

scrub.addEventListener('input', apply);
clipSel.addEventListener('change', () => selectClip(clipSel.value));
loopCb.addEventListener('change', apply);
document.getElementById('prev')!.addEventListener('click', () => { scrub.value = String(Math.max(Number(scrub.min), Number(scrub.value) - 1)); apply(); });
document.getElementById('next')!.addEventListener('click', () => { scrub.value = String(Math.min(Number(scrub.max), Number(scrub.value) + 1)); apply(); });

function populateClips() {
  clipSel.innerHTML = '';
  for (const g of groups) {
    const o = document.createElement('option');
    o.value = g.name; o.textContent = `${g.name} [${Math.round(g.from)}..${Math.round(g.to)}]`;
    clipSel.appendChild(o);
  }
}

async function loadChar(path: string) {
  container?.dispose();
  container = await SceneLoader.LoadAssetContainerAsync('/assets/', path, scene);
  container.addAllToScene();
  container.animationGroups.forEach((g) => g.stop());
  groups = [...container.animationGroups];
  populateClips();
  selectClip(groups.find((g) => g.name === 'Idle')?.name ?? groups[0].name);
}

async function main() {
  for (const o of OUTFITS) {
    const opt = document.createElement('option');
    opt.value = o.path; opt.textContent = `${o.label} (${o.key})`;
    charSel.appendChild(opt);
  }
  charSel.addEventListener('change', () => loadChar(charSel.value));
  const adventurer = OUTFITS.find((o) => o.key === 'adventurer') ?? OUTFITS[0];
  charSel.value = adventurer.path;
  await loadChar(adventurer.path);
}
main().catch((e) => { poseLbl.textContent = 'ERROR: ' + (e?.message ?? e); console.error(e); });
