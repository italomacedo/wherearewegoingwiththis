# ADR-0025 — Game audio (SFX + Music) + Voice/TTS

**Status:** Accepted — 13A/13B/13C/**13D all implemented & owner-validated in Electron** on branch
`feat/audio-system` (NOT merged). 13D (Voice/TTS via Kokoro) runs in a Web Worker with sentence-
streaming playback (gapless, in-order, all sentences); see the TTS decisions + Lesson 39.

## Context

The game shipped with zero audio — only `docs/systems/AUDIO_SYSTEM.md` (a stale spec) and unused
volume fields in `SettingsService` (`masterVolume/musicVolume/sfxVolume/npcVoiceVolume`). The owner
wants full game sound phased **Foundation → SFX → Music → Voice (TTS)**, plus a configurable Sound
tab in Options (including an enable/disable switch for the TTS service). Each NPC should eventually
get its own voice, plus a narrator that voices select events (e.g. critical hits).

## Decisions

- **Playback = plain `HTMLAudioElement`, not Babylon `Sound`.** Babylon's legacy audio engine was
  never unlocked/initialized → silence. `HTMLAudioElement` needs no scene/engine, auto-unlocks after
  the first user gesture, and plays OGG fine in Electron. (Lesson 35.)
- **Pure core, browser-only playback.** `AudioManager` holds a pure bus mixer (master/music/sfx/voice,
  `effectiveVolume`, mutes, per-cue instance cap) — 100% tested. `SfxCatalog`/`MusicCatalog` are pure
  registries (`sfxForBeat`, `footstepInterval`, `musicForScene`, `fadeStep`). The `new Audio` playback
  + Web-Audio engine tone are `typeof document` guarded + `istanbul ignore`d.
- **SFX via EventBus + scene seams.** A new `audio:sfx` event + direct `playCue` calls at the existing
  seams (combat `onCombatBeat`, footstep cadence, eat, hunger growl, nave explosion, UI open/click/
  error, fall landing). Bare fists → `punch`; armed melee → `swing`+`stab`; any melee miss → `whiff`;
  ranged → `gunshot`; kill → `bodyfall`.
- **Nave engine = procedural Web-Audio sine** (180 Hz idle → 220 Hz with throttle, `setTargetAtTime`
  glide), not a sample loop — owner request.
- **Music = per-scene looping beds with crossfade.** `musicForScene`: theme on splash/studio/publisher
  (owner's call — menu/creator otherwise), menu on main-menu/load/options, street ambience in the
  world, combat raised by `beginCombat`/restored on `endCombat`, game-over from `checkGameOver`.
  `webPreferences.autoplayPolicy: 'no-user-gesture-required'` so branding music plays pre-gesture.
- **Assets = freesound CC0 (preferred) + CC-BY (with credit).** Owner curates per category; converted
  to normalized OGG (mono SFX / stereo music) via `scripts/convert_audio.mjs` (bundled `ffmpeg-static`,
  no system install). CC-BY clips are attributed in `CREDITS.md`.
- **Settings:** existing volume fields are now read; added `ttsEnabled`/`musicEnabled`/`sfxEnabled`.
  Options gains a Sound tab (volume cyclers + mute/TTS toggles); the tab filter was wired (it rendered
  all tabs before).
- **TTS = Kokoro via `kokoro-js`** (13D, implemented): runs 100% local in the renderer
  (transformers.js / onnxruntime-web, WASM), no Python install; per-character voices + a narrator;
  gated by `ttsEnabled`, **fail-open** (any load/synth error is a silent no-op). (Anthropic has no TTS
  API — its own voice mode uses ElevenLabs.) Apache-2.0, free, 54 voices.
  - **`VoiceAssigner` (pure):** maps speakers → Kokoro voice ids. Named-cast override (`FIXED_VOICES`:
    Zara=`af_bella`, Mback=`am_onyx`) wins; otherwise a deterministic pick from the gender pool
    (`FEMALE_VOICES`/`MALE_VOICES`) via an FNV-1a hash of the speaker id (stable per session). Narrator
    = `bm_george`. NPC gender from `genderOfOutfit(appearance.bodyBase)`. 100% tested.
  - **`TTSService` (browser-only synth, pure helpers):** lazy-loads `KokoroTTS.from_pretrained` once on
    first use (q8/WASM), behind `ttsEnabled`; `generate` → `RawAudio.toBlob()` → `HTMLAudioElement` at
    the **voice-bus** gain (`AudioManager.effective('voice')`). An incrementing token cancels stale
    utterances; `cancel()` on dialog close. Pure `ttsSpeechText` (strip `*emotes*`) + `shouldSpeak`
    tested; load/synth/playback `istanbul ignore`d.
  - **Hooks (GameWorldScene):** NPC reply (full text, emotes stripped) → `speakNpc`; cinematic
    narration (ambient / check-time / self-exam condition / action outcome / melee blow / combat
    **critical** line) → `speakNarration`. Frequent background gossip is **not** voiced.
  - **Model delivery:** prefers a vendored offline copy under `public/models/` (transformers.js
    `env.localModelPath='/models/'`, vendored by the optional `scripts/copy-kokoro-model.mjs` from
    `~/Downloads/Kokoro-82M-v1.0-ONNX`); otherwise falls back to the HF hub on first run (browser-
    cached thereafter). `public/models/` is gitignored. `kokoro-js` + `@huggingface/transformers` are
    lazy dynamic imports → Vite code-splits them into separate chunks (not in the main bundle).

## Files

`src/systems/AudioManager.ts`, `SfxCatalog.ts`, `MusicCatalog.ts`, `UiSound.ts`, **`VoiceAssigner.ts`,
`TTSService.ts`**; `scripts/convert_audio.mjs`, **`scripts/copy-kokoro-model.mjs`**;
`public/assets/audio/{sfx,music}/*.ogg`; `CREDITS.md`; wiring in `GameWorldScene.ts` (SFX + **TTS
speakNpc/speakNarration hooks**), `OptionsScene.ts`, `SettingsService.ts`, `EventBus.ts`,
`electron/main.ts` (autoplay + crash logging), `GameManager.ts` (registers `audio` + **`tts`**),
`package.json` (`kokoro-js` dep + `copy:kokoro` pre-hook).

## Consequences

- Audio is fully testable (pure mixer/catalogs) with no GPU/DOM; playback is browser-only.
- CC-BY tracks (opening theme, game-over) require keeping `CREDITS.md` accurate.
- 13D pending: per-character TTS + narrator, the `voice` bus already exists in the mixer + Options TTS
  toggle. Dedicated SFX (crit sting, equip, medkit-use, mount/dismount, hurt grunt) deferred.
