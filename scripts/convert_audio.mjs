#!/usr/bin/env node
/**
 * Convert downloaded CC0/CC-BY freesound clips into normalized game-ready OGG
 * (Vorbis) cues under public/assets/audio/. Mirrors the gap-#4 asset pipeline:
 * the owner drops source files in ~/Downloads, this runs Blender-less via the
 * bundled `ffmpeg-static` binary (no system install), and the outputs are
 * committed.
 *
 * Each entry: { src (basename in ~/Downloads), dest (cue path under audio/),
 * startSec? (seek in before extracting), trimSec? (hard cap length),
 * fadeOutSec? (tail fade to avoid a click on a mid-clip cut) }.
 * Loudness is normalized (EBU R128 loudnorm) so the mix is even.
 *
 * Usage: node scripts/convert_audio.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOWNLOADS = join(homedir(), 'Downloads');
const OUT_DIR = join(ROOT, 'public', 'assets', 'audio');

/** Source basename (in ~/Downloads) → cue spec. */
const SFX = [
  // The source is 8 footsteps in a row; extract a single step (one impact + tail).
  { src: '702399__ienba__generic-footsteps.wav', dest: 'sfx/footstep.ogg', startSec: 0.46, trimSec: 0.42, fadeOutSec: 0.06 },
  { src: '573378__johnloser__cyber-punch-03.wav', dest: 'sfx/punch.ogg' },
  { src: '413497__inspectorj__stab-metal-knife-in-lettuce-e.wav', dest: 'sfx/stab.ogg' },
  { src: '840717__nomagician__sword-swing-3.mp3', dest: 'sfx/swing.ogg' },
  { src: '392229__morganpurkis__single-pistol-gunshot-33.wav', dest: 'sfx/gunshot.ogg' },
  { src: '490266__anomaex__sci-fi_explosion_2.wav', dest: 'sfx/explosion.ogg' },
  { src: '504626__leonelmail__body-fall-v-hvy-dirt.mp3', dest: 'sfx/bodyfall.ogg' },
  { src: '394159__vacuumfan7072__uiclick5.wav', dest: 'sfx/ui_click.ogg' },
  { src: '657945__lilmati__scifi-inspect-sound-ui-or-in-game-notification-01.wav', dest: 'sfx/ui_open.ogg' },
  { src: '594210__steaq__robo-nope-16bit-flac.flac', dest: 'sfx/ui_error.ogg' },
  { src: '634123__erbsland-music__eating-a-raw-carrot.wav', dest: 'sfx/eat.ogg', trimSec: 2 },
  { src: '447911__breviceps__growling-stomach-stomach-rumbles.wav', dest: 'sfx/growl.ogg', trimSec: 3 },
  { src: '420668__sypherzent__basic-melee-swing-miss-whoosh.wav', dest: 'sfx/whiff.ogg' },
];

/** Looping background-music beds. Kept STEREO + higher bitrate, no trim. */
const MUSIC = [
  { src: '645691__marcriver29__generic-futuristic-heros-theme.flac', dest: 'music/theme.ogg' },
  { src: '410592__osfx__outside-an-urban-rave.wav', dest: 'music/world.ogg' },
  { src: '798358__harrisonlace__dystopic_menu_ambience_f_phrygdom_133_bpm.wav', dest: 'music/menu.ogg' },
  { src: '611305__szegvari__new-york-cyberpunk-synth-analogue-drums-bass-dance-retro-atmo-ambience-pad-drone-cinematic-action-music-surround.wav', dest: 'music/combat.ogg' },
  { src: '844767__glorytothemachine__waterbender-84bpm-melodic_data_stream-seamless-loop-glorytothemachine.mp3', dest: 'music/gameover.ogg' },
];

function findSource(basename) {
  const direct = join(DOWNLOADS, basename);
  if (existsSync(direct)) return direct;
  // tolerate "(1)" suffixes browsers add on re-download
  const stem = basename.replace(/\.[^.]+$/, '');
  const ext = basename.slice(stem.length);
  const alt = readdirSync(DOWNLOADS).find(
    (f) => f === `${stem} (1)${ext}` || f.toLowerCase() === basename.toLowerCase(),
  );
  return alt ? join(DOWNLOADS, alt) : null;
}

let ok = 0;
const missing = [];
for (const cue of SFX) {
  const src = findSource(cue.src);
  if (!src) {
    missing.push(cue.src);
    continue;
  }
  const out = join(OUT_DIR, cue.dest);
  mkdirSync(dirname(out), { recursive: true });
  const args = ['-y'];
  if (cue.startSec) args.push('-ss', String(cue.startSec)); // seek in (accurate after -i below)
  args.push('-i', src, '-ac', '1');
  if (cue.trimSec) args.push('-t', String(cue.trimSec));
  // EBU R128 loudnorm to even the mix; optional tail fade so a mid-clip cut doesn't click.
  const filters = ['loudnorm=I=-18:TP=-1.5:LRA=11'];
  if (cue.fadeOutSec && cue.trimSec) {
    filters.push(`afade=t=out:st=${cue.trimSec - cue.fadeOutSec}:d=${cue.fadeOutSec}`);
  }
  // Vorbis q4 ≈ ~96 kbps.
  args.push('-af', filters.join(','), '-c:a', 'libvorbis', '-q:a', '4', out);
  execFileSync(ffmpegPath, args, { stdio: 'pipe' });
  ok++;
  console.log(`✓ ${cue.dest}`);
}

console.log(`\nConverted ${ok}/${SFX.length} SFX cues → ${OUT_DIR}`);

let mok = 0;
for (const track of MUSIC) {
  const src = findSource(track.src);
  if (!src) {
    missing.push(track.src);
    continue;
  }
  const out = join(OUT_DIR, track.dest);
  mkdirSync(dirname(out), { recursive: true });
  // Stereo, loudnorm, Vorbis q5 (~160 kbps) — fuller than the mono SFX.
  execFileSync(
    ffmpegPath,
    ['-y', '-i', src, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'libvorbis', '-q:a', '5', out],
    { stdio: 'pipe' },
  );
  mok++;
  console.log(`✓ ${track.dest}`);
}
console.log(`Converted ${mok}/${MUSIC.length} music tracks → ${OUT_DIR}`);
if (missing.length) {
  console.warn(`\n⚠ Missing sources in ${DOWNLOADS}:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
