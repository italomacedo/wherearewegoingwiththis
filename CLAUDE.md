# Where Are We Going With This — Claude Agent Context

**BeiraRio Games | Cyberpunk Isometric Open-World RPG**

This is the primary entry point for all AI agents working on this project. Read this before touching any file.

---

## Current Status (keep this updated)

**Phases 0–8 COMPLETE** (+ gaps #1/#2/#3 closed) · **Phase 9 MVP** (flying motorcycle) · **pause/save + HUD + camera-relative WASD + Z/C & MMB orbit** · **health system (fall damage, bike crash → smoke → explode, game-over, persisted)** · **playable MVP verified in Electron (live Claude NPC chat)** · **Avatar overhaul — [ADR-0014](docs/ADR/0014-avatar-pipeline-makehuman-morphs.md) (+ addendum): **PIVOTED MakeHuman → Quaternius "Ultimate Modular" (CC0)** after MakeHuman's art ceiling/glitches (Addendums 3–4). Avatar = **whole-outfit swap**: each outfit is a complete, rigged, **self-animated** Quaternius character GLB (Punk/SWAT/Suit/Hoodie/Sci-Fi/Soldier… 11 ♂ + 10 ♀) in `characters/quaternius/{men,women}/`. `assembleGltf` keeps the 4 embedded clips (Idle/Walk/Run/Interact) renamed for name-based playback + disposes the rest (no Mixamo/anim-library). Tint by semantic material (`Skin`→skin, `Eye`→eye, `Eyebrows`/`Hair*`→hair) via `tintRoleForMaterial`; clothing keeps authored colours. Creator: Gender · Skin Tone · Eye Color · Outfit ◄► (gender-filtered) · Hair Color. Faces +Z (no flip), creator cam `alpha=+π/2`. `scripts/convert_outfits.py` batch-converts the pack glTF→GLB. **MakeHuman/Mixamo/superhero assets (~326 MB) + dead code removed.** Flying bike loads `vehicles/cyberpunk_harley.glb` via the same guarded-load/fallback. Deferred: per-part outfit mixing, clothing recolour, hero mesh disappears while mounted (separate task)** · 609 tests · ~99% coverage (gated 95% lines/stmts/funcs, 90% branches) · typecheck + build green.

> **Marco "MVP jogável" fechado.** Loop completo: splash→menu→criação→mundo; herói anda (WASD relativo à câmera), conversa com a Zara (Claude CLI ao vivo, com pré-moderação), pilota a moto, toma dano, salva. Aberto: Phase 9 follow-ups (carro/ tráfego), Phase 10 (combate), gap #4 (assets reais).

### Chat / NPC (this is the marquee feature — works end-to-end)
- **Cinematic chat** (`DialogSystem`): scrollable transcript seeded with prior history; `*emotes*` vs `"speech"` parsed + styled **per speaker** (player can roleplay actions or mix with dialogue); grid layout (SEND never clipped).
- **Native DOM `<input>`** (not Babylon GUI InputText) so non-US layouts / accents (ç ã é) / `?` / IME / paste work; `keydown` stopPropagation keeps typing out of the game input.
- **Pre-moderation** (`ClaudeNPCService.moderate` + `PromptBuilder.buildModerationPrompt`): a one-word ALLOW/BLOCK classifier screens the player's message BEFORE it reaches the NPC; blocked input shows a `system` line "You can't say or do that" and is never sent. Fails OPEN on CLI error. (With this gate, the earlier in-prompt violent/sexual guardrails + reply sanitizer were reverted as redundant.)
- **Windows Claude CLI launch** (`electron/main.ts` `resolveClaudeInvocation`): runs the package entry (`cli.js` via Electron-as-Node, or native `bin/claude.exe`) by reading the npm shim — no Node-on-PATH dependency. Keep Options→Claude CLI path **blank** to auto-detect.

### Health & damage (player + vehicle)
- [`src/entities/Health.ts`](src/entities/Health.ts) — pure HP value object (`applyDamage`/`heal`/`fraction`/`isDead`/`isCritical`/`toState`), shared by player and bike.
- **Player gravity + fall damage:** dismounting in mid-air drops the hero (`PlayerController.startFalling`); landing above `safeFallSpeed` costs HP scaled by impact speed. HP **0 → game over → Main Menu** (`GameWorldScene.checkGameOver`).
- **Bike crash model:** an *unpiloted* bike has its engine off, so it free-falls (no vertical drag) and crashes; impact above `safeImpactSpeed` damages it. Critical HP (≤30%) → smoke particles; **0 HP → explode** (destroyed = unmountable wreck).
- **Persisted:** `SaveGame.playerHealth` + `SaveGame.vehicle {health,destroyed}` (with `SaveService.migrate` backfilling legacy saves); carried across scenes by `GameSession`.
- HUD shows a hero HP bar (green→amber→red) + a `BIKE n%` / `BIKE DESTROYED` status (`WorldHud`).

### Controls (in game world)
- **WASD** — move, **relative to the camera** (W = where the camera faces). Hold **Shift** to sprint.
- **Z / C (hold)** — orbit the camera left / right 360° around the hero (`KEY_ORBIT_SPEED`, continuous). **Middle-mouse drag** also orbits (`ORBIT_SENSITIVITY`) but its native-canvas wiring is browser-only/untested — Z/C is the reliable, tested path. Q/E/R do not rotate.
- **E** — talk to a nearby NPC (opens chat; type `"speech"` and/or `*actions*`). **F** — enter/exit the flying bike. **Space/Ctrl** — bike altitude up/down.
- **ESC** — pause menu (Resume / Save Game / Load Game / Quit to Main Menu). While a dialog is open, ESC closes the dialog instead.
- On-screen: floating name labels over NPC/vehicle + a contextual `[E]/[F]` prompt + a persistent control hint (`WorldHud`).

| Phase | What | State |
|---|---|---|
| 0 | Docs + scaffolding | ✅ |
| 1 | Scene flow + fade transitions | ✅ |
| 2 | Splash/Studio/Publisher + Main Menu (neon, procedural cityscape) | ✅ |
| 3 | Options (4 tabs + persistence) | ✅ |
| 4 | Character Creator (modular, 360° preview) | ✅ |
| 5 | Save/Load/Delete | ✅ |
| 6 | World: zone system + isometric camera | ✅ |
| 7 | Player controller + Havok physics + input | ✅ |
| 8 | **NPC + Claude CLI (Zara) — MVP** | ✅ |
| 9 | Vehicles — flying motorcycle MVP (lift/drag flight, F to mount, vehicle camera) | 🟡 MVP (car + ambient traffic deferred) |
| 10+ | Combat, implants, world expansion | ⬜ |

**Verified working in Electron:** full flow splash → … → game world; player moves (camera-relative), camera orbits (Z/C), **Zara holds a live Claude conversation** (after fixing the Windows CLI launch + clearing a bad Options path), emotes/accents type correctly, pre-moderation blocks out-of-policy input.

**INTEGRATION GAPS:**
1. ✅ **Dialog GUI** — DONE. `DialogSystem` now renders a bottom speech bubble (NPC name + wrapped streaming text + `. . .` thinking placeholder), a player `InputText` with a SEND button and Enter-to-submit, and tracks input focus (`isInputFocused()`). Browser-only render/build is `istanbul ignore`d; pure state machine + focus flag stay fully tested. While the dialog is open, `GameWorldScene.update` freezes player movement/camera so typing doesn't move the character, and the interact key won't close the dialog while the field is focused.
2. ✅ **GameSession glue** — DONE. New `src/core/GameSession.ts` holder (`{saveId, character, npcMemory, world, gameTimeSeconds}`) registered in ServiceLocator under `'gameSession'`. `CharacterCreatorScene.onBegin` creates+persists a save (`SaveService.createNewSave`+`save`) and registers a session; `LoadGameScene.onLoadSave` builds a session via `GameSession.fromSave`. `GameWorldScene.onEnter` adopts appearance/name/npcMemory and spawns at the saved world position (falls back to the zone spawn point when position is all-zero).
3. ✅ **Autosave (on scene exit)** — DONE. `GameWorldScene.onExit` calls `persistSession()` → `SaveService.updateWorldState` + `updateNpcMemory` (and updates the in-memory session). NOTE: this persists on *exit only*; a periodic/interval autosave during play is still future work.
4. **Real assets** — STILL OPEN (next chosen target). Project ships ZERO `.glb`/textures; everything procedural. Wiring exists but is dormant: `CharacterAssembler.useGltf=false` + an `assembleGltf` path (SceneLoader, falls back to placeholder per-part), `AssetManifest` has the intended paths (`public/assets/...`) but no files, `MercadoSombrasZone.loadRealAssets` is a no-op. Curated CC0/CC-BY list in [docs/design/WORLD_DESIGN.md](docs/design/WORLD_DESIGN.md).
   - **Key constraint discovered:** the coding agent CANNOT download/commit binary assets here (no Sketchfab/PolyHaven MCP wired; `WebFetch` returns text, not binaries). So acquisition needs either (a) the user drops files into `public/assets/`, or (b) runtime-load CC0 textures/GLBs from a CDN URL (Poly Haven) — an **architectural decision** (offline/latency/external dependency) to confirm before doing. Recommended next step: build+test the loading pipeline (flip `useGltf`, real `loadRealAssets`, AssetManifest) so dropping files "just works", then source assets via (a) or (b).

---

## Hard-Won Lessons (READ before debugging the running app)

These cost real debugging time — internalize them:

1. **No runtime `require()` in `src/`.** The renderer is ESM-bundled by Vite; `require` is undefined → ReferenceError → black screen. Always use static `import` at file top, even for browser-only modules (`@babylonjs/gui`, `uuid`). The `typeof document` guards keep canvas-creating calls out of Jest; merely *importing* `@babylonjs/gui` is safe in Jest.
2. **Never `await sceneManager.loadScene(next)` from inside a scene's `onEnter`.** The SceneManager is still `transitioning` from loading THAT scene, so the nested call hits the guard and silently no-ops → stuck screen. Schedule the next scene with a fire-and-forget `setTimeout` (cleared in `onExit`). See SplashScene/StudioScene/PublisherScene.
3. **Create the camera FIRST in any scene's `onEnter`,** before any slow `await` (Havok WASM, asset loads). No active camera → `Scene.render()` throws "No camera defined" every frame → black screen. Keep slow/failable init (physics) LAST and in `try/catch`.
4. **Babylon GUI alignment uses named constants, not magic numbers.** `Control.VERTICAL_ALIGNMENT_CENTER` ≠ 1 (1 is BOTTOM). Import `Control` and use the constants.
5. **`tsconfig.jest.json` is laxer than the build configs.** Jest passing ≠ typecheck passing. ALWAYS run `npm run typecheck` (checks renderer + electron + node) before committing.
6. **One Electron instance.** `vite-plugin-electron` auto-launches Electron via `onstart`; do NOT also launch it with concurrently. `npm run dev` is the single dev command.
7. **Browser-only code pattern:** guard with `if (typeof document === 'undefined') return;` + `/* istanbul ignore next */` on the browser branch, keep pure logic separate and 100% tested. This is how every system stays at coverage target without a GPU/DOM.
8. **Don't set a `layerMask` on a fullscreen GUI layer.** `AdvancedDynamicTexture.CreateFullscreenUI(...).layer.layerMask = 0x10000000` is OUTSIDE the camera's default mask `0x0FFFFFFF` → the GUI silently never renders (invisible dialog). Leave the default mask. Tests can't catch this (NullEngine renders nothing) — it only shows in Electron.
9. **Camera-relative WASD needs a +90° yaw offset.** `ArcRotateCamera.alpha` is the orbit angle of the camera *position*; the direction it *looks* is `alpha + π/2`. `CameraSystem.getYaw()` returns that offset so `PlayerController/VehicleController.computeDisplacement` point W where the camera faces. Unit tests pass with raw `alpha` because they assert with self-consistent yaw values, but the real camera default (`alpha = -π/2`) made W move sideways until the offset was added.
10. **Babylon GUI controls are drawn on the canvas, not the DOM.** DOM-based automation (Preview MCP `preview_click`, querySelector) can't click `Button`/`InputText` — they have no DOM nodes. Driving the UI for screenshots requires canvas-coordinate clicks or programmatic scene calls. Plan manual verification accordingly.
11. **Linear drag caps terminal velocity — watch it vs. damage thresholds.** With `v *= (1 - drag·dt)` the terminal fall speed is ≈ `gravity/drag` (~4.9 at drag 2). If that's below your crash-damage threshold, falls *never* deal damage. Fix: don't apply drag to the vertical axis during free-fall (engine-off bike free-falls; player fall uses no drag at all). Always sanity-check terminal speed against any speed-gated effect.
12. **NullEngine `getDeltaTime()` is ~0 in tests.** Movement/physics that integrate `dt` won't progress; assert `>=` or `jest.spyOn(engine,'getDeltaTime').mockReturnValue(100)` when a test needs real motion.
13. **Spawning the `claude` CLI from Electron on Windows: run the package entry with Electron-as-Node.** The npm `claude.cmd` shim calls `node <entry>`, but the Electron child often lacks Node on its PATH → `"...is not recognized"` (exit 1). The package entry may be `cli.js` OR a native `bin/claude.exe` (newer versions). `electron/main.ts` `resolveClaudeInvocation()` finds the shim via a synchronous PATH `whichSync('claude')`, **reads the `.cmd` shim** (`readShimEntry`) to get the true entry, and runs it: `.js` via `process.execPath`+`ELECTRON_RUN_AS_NODE=1`, `.exe` directly. Always capture+surface the child's stderr (a verbose diagnostic log `[Claude NPC] claudePath=… command=… mode=…` was decisive). Two gotchas that cost rounds: a **malformed Options path** (`…cli.jsclaude` from a bad paste) → keep Options→Claude path **blank** to auto-detect; and a **broken global install** (`bin/claude.exe` missing) fails even in a plain terminal — that's `npm i -g @anthropic-ai/claude-code`, not the game.
14. **NPC names are hidden until introduced (anti-metagaming).** `NPCAgent.getDisplayName()` returns `'Unknown'` until `revealNameIfMentioned(reply)` matches the NPC's name in its own dialogue; only then do the floating label, dialog header, and `[E] Talk` prompt show the real name. (Currently runtime-only — resets on reload; persisting the discovery flag is a follow-up.)
15. **Babylon GUI `InputText` mangles non-US keyboards.** It reconstructs text from key events, so ABNT2 `?`, accents (ç ã é), dead keys, IME and paste break. Use a **native DOM `<input>`** overlaid on the canvas (`DialogSystem.buildDomInput`), `stopPropagation` its keydown so typing doesn't drive the game, and read its `.value` on submit. Canvas-drawn GUI is fine for display, not for text entry.
16. **NPC content safety = pre-moderation gate, not prompt-only.** Screen the player's message with a one-word ALLOW/BLOCK classifier call BEFORE sending to the NPC (`ClaudeNPCService.moderate`); block out-of-policy input up front with a `system` line. Fail OPEN on CLI error so play never hard-stops. This made the per-turn in-character "deflect sexual/violent" prompt guardrails + reply sanitizer redundant — they were removed. The model's own refusal of *explicit* generation is a safety line the prompt can't (and shouldn't) override.
17. **MakeHuman/MPFB2 exports carry no fine facial shape keys, and `Apply Modifiers` strips the macro ones.** MPFB applies its detail morphs (nose/ears/lips…) to vertices, not as glTF morph targets — a clean export has **0** fine shape keys (verify with the `[Avatar] GLB morph targets (N)` log). The basemesh's helper "robe" is hidden by a Mask modifier; you must enable glTF **Apply Modifiers** to drop it, but applying a vertex-count-changing modifier **deletes all shape keys** — so you can't keep macro morphs *and* a clean mesh. Conclusion: don't build in-game facial morph sliders on a MakeHuman base. Do customization by **swapping whole GLBs** instead (one per ethnicity: `body_<gender>_<african|asian|caucasian|universal>`), tint skin via material `albedoColor`, and reserve runtime morphs for a future shape-key-bearing base. Also: register `@babylonjs/loaders/glTF` or `SceneLoader` can't read `.glb`; Babylon GUI `verticalAlignment = 2` is CENTER not bottom (Lesson 4 again). **(The "rotate `__root__` 180°" that was here is base-dependent — see Lesson 18.)**

18. **Rig + animate the hero via Mixamo, and mind the facing.** Several traps, learned end-to-end: **(a) Mixamo won't accept GLB** — only FBX/OBJ/ZIP. Export the body from Blender as FBX, auto-rig in Mixamo, re-download the rigged character **With Skin** as the new base GLB. **(b) Bone-name parity is everything** — get base AND clips from Mixamo so all bones are `mixamorig:*`; then retargeting separate clips is a pure name match (`diffSkeletonBones` reports mismatches). **(c) Mixamo names every clip `Armature|mixamo.com|Layer0`** — `loadAnimationClips` clones each `AnimationGroup` onto the base skeleton and **renames it to the manifest key** (`idle/walk/run/interact`) so `PlayerController`'s name-based playback works. Separate clips are loaded "Without Skin" (walk/run **In Place**, 30fps) and **take precedence** over any embedded in the base. **(d) Facing is base-dependent: Mixamo faces +Z, MPFB faced away.** +Z IS our world forward at `rotation.y=0`, so with `root.rotation.y = facing` you must **NOT** rotate the model — keeping the old 180° flip makes the hero "moonwalk" (body 180° from travel). The flip was removed in `assembleGltf`; the creator camera moved to `alpha=+π/2` to still face the model's front. **(e)** Convert the Mixamo FBX→GLB headless with `scripts/convert_anims.py` (`blender --background --python`). Verify with the `[Avatar] loaded anim clip "…"` / `…bones absent from the base rig` console logs.

---

## Project Overview

Single-player cyberpunk isometric open-world RPG for PC. Standout feature: every NPC is powered by a live `claude` CLI subprocess, enabling natural conversation and reactive behavior. Developed entirely by vibe coding with Claude.

**Vision:** Satellite Reign × Space Haven × Cyberpunk 2077  
**Studio/Publisher:** BeiraRio Games  
**Target Platform:** Windows PC (Electron wrapper)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| 3D Engine | Babylon.js | ^7.35.0 |
| Language | TypeScript | ^5.7.2 |
| Desktop | Electron | ^33.2.0 |
| Bundler | Vite + vite-plugin-electron | ^6.0.2 |
| Tests | Jest + ts-jest | ^29.7.0 |
| Coverage | Istanbul (built-in Jest) | 95% threshold |
| NPC AI | `claude` CLI subprocess | system-installed |

---

## Commands

```bash
npm run dev          # Vite dev server (browser preview)
npm run electron:dev # Electron + Vite dev (full game)
npm run build        # Production build
npm run electron:build # Build + package installer
npm test             # Run all tests
npm run test:watch   # Tests in watch mode
npm run coverage     # Tests + coverage report (must be ≥95%)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

---

## Directory Structure

```
electron/           IPC bridge, Claude CLI subprocess, window controls
  main.ts           Electron main process (Node.js); resolveClaudeInvocation() finds+launches the claude entry robustly (see Lesson 13); streams stdout, surfaces stderr
  preload.ts        contextBridge API exposed to renderer

src/
  main.ts           Renderer entry point — initializes GameManager
  vite-env.d.ts     Vite types + global Window.electronAPI (single source)
  core/             Engine infrastructure
    GameManager.ts  Singleton: owns Engine, SceneManager, ServiceLocator init
    SceneManager.ts Load/unload scenes, scene registry, fade transitions
    FadeController.ts Pure alpha animation (injectable applyAlpha callback)
    ServiceLocator.ts Lightweight DI container
    EventBus.ts     Typed pub/sub (GameEvents interface)
  scenes/           One file per Babylon.js Scene
    BaseScene.ts    Abstract base: onEnter(), onExit(), update(), dispose()
    SplashScene/StudioScene/PublisherScene  Branding sequence (timer-driven)
    MainMenuScene.ts  Procedural cityscape + New Game / Load / Options / Quit
    CharacterCreatorScene.ts  360° preview, body/hair/skin/clothes/implants
    LoadGameScene.ts  Save list, load, delete
    OptionsScene.ts   Tabs: Game / Display / Video / Audio
    GameWorldScene.ts Wires camera+input+zone+player+vehicle+NPC+dialog+pause+HUD (camera FIRST); ESC pause freezes world
  entities/         Game objects (data + behavior, no GUI)
    CharacterData.ts      Appearance model (slots/morphs/colors/skinTexture) + SLOT/MORPH registries + pure rules (applySlot/resolveLayers/clampMorph) + migrateAppearance
    WorldZone.ts          Abstract zone (load/unload/spawn/bounds)
    zones/MercadoSombrasZone.ts  Starting district (procedural)
    PlayerController.ts   Pure computeDisplacement + spawn + movement + gravity/fall damage + Health + locomotion anim state
    Locomotion.ts         Pure selectLocoState (idle/walk/run/interact) for animation playback
    VehicleController.ts  Pure computeFlightStep (lift/drag) + mount/pilot/park + fall/crash/smoke/explode + Health (Phase 9 MVP)
    Health.ts             Pure HP value object (damage/heal/fraction/isDead/isCritical) for player + vehicle
    NPCAgent.ts           Persona + state machine + proximity (pure)
    npcs/zara.ts          Zara definition (first NPC)
  systems/          Game systems
    InputSystem.ts        Keyboard → action map + movement axis (pure core)
    CameraSystem.ts       Isometric ArcRotateCamera, follow, MMB-drag 360° orbit, getYaw (+90° offset), vehicle mode
    PhysicsService.ts     Havok WASM init (browser-only, guarded)
    SettingsService.ts    Settings load/save/validate (localStorage + memory)
    SaveService.ts        SaveGame JSON CRUD + npcMemory + playerHealth + vehicle{health,destroyed} (migrate() backfills)
    CharacterAssembler.ts Pure buildCharacterPlan + GLTF(skeleton/morphs/layers)/placeholder assembly (useGltf flag, setUseGltf)
    ZoneManager.ts        Zone registry + load/unload
    DialogSystem.ts       Chat: pure state (player/npc/system lines, *emote* vs "speech" parse) + scrollable cinematic GUI + native DOM <input>
    PauseMenu.ts          ESC pause overlay: Resume / Save Game / Load / Quit (pure state + browser GUI)
    WorldHud.ts           Floating NPC/vehicle labels (by key) + [E]/[F] prompt + hero HP bar + bike status
    ClaudeNPCService.ts   Orchestrates an NPC turn via Electron IPC (streaming) + moderate() pre-screen
    NPCManager.ts         Spawns agents, proximity/cooldown, memory serialize, moderate() delegate
    npc/
      ConversationContext.ts  Rolling history + stateless→session graduation
      PromptBuilder.ts        Pure prompt builders (stateless/primer/turn/moderation)
  assets/
    AssetManifest.ts  Typed asset path registry

tests/unit/         Mirrors src/ paths (core, scenes, systems, systems/npc, entities, assets)

docs/
  ADR/              0001-0013 Architecture Decision Records (read before major changes)
  design/           GDD, CHARACTER_SYSTEM, NPC_SYSTEM, WORLD_DESIGN (+ asset catalog), VEHICLE_SYSTEM, COMBAT_SYSTEM
  phases/           PHASE_0..PHASE_10 plans with completion gates
  systems/          INPUT/CAMERA/AUDIO/ASSET_LOADING specs
  testing/          Testing guide + coverage requirements
```

---

## Code Conventions

### Naming
- Classes: `PascalCase` — `GameManager`, `ClaudeNPCSystem`
- Files: `PascalCase.ts` for classes, `camelCase.ts` for utilities
- Interfaces/types: `PascalCase` with `I` prefix only for interface contracts (`IScene`), not for data shapes
- Private fields: no underscore prefix — use `private` keyword
- Constants: `SCREAMING_SNAKE_CASE` for module-level constants

### Patterns
- **Singleton:** Use `static getInstance()` + `static resetInstance()` (for test isolation) — see `GameManager`
- **Service registration:** Register in `GameManager.initialize()`, retrieve via `ServiceLocator.get<T>(key)`
- **Events:** Typed via `GameEvents` interface in `EventBus.ts` — add new events there first
- **Async scenes:** `onEnter()` and `onExit()` are async — await them fully before continuing
- **No God objects:** Each system has one responsibility. Cross-system communication goes through EventBus.

### Testing
- Always use `NullEngine` for Babylon.js tests — never require a real GPU
- Always call `ServiceLocator.clear()` in `afterEach`
- Always call `engine.dispose()` and `scene.dispose()` in `afterEach`
- Mock `child_process.spawn` for Claude CLI tests — never spawn real processes in tests
- Coverage must stay ≥95% lines/functions, ≥90% branches on every PR

---

## How to Create a New Scene

1. Create `src/scenes/MyScene.ts` extending `BaseScene`
2. Implement `onEnter()`, `onExit()`, optionally `update()`
3. Add the scene name to `SceneName` union type in `SceneManager.ts`
4. Register the factory in `src/main.ts` or the scene that transitions to it
5. Write unit tests in `tests/unit/scenes/MyScene.test.ts` using `NullEngine`

```typescript
export class MyScene extends BaseScene {
  async onEnter(): Promise<void> {
    // build scene content here
  }
  async onExit(): Promise<void> {
    // cleanup animations/timers
  }
}
```

---

## How to Create a New System

1. Create `src/systems/MySystem.ts`
2. Register it in `ServiceLocator` during `GameManager.initialize()`
3. Systems communicate only through `EventBus` — never import other systems directly
4. Write tests in `tests/unit/systems/MySystem.test.ts`

---

## How to Add an Asset

1. Search using Sketchfab MCP or Poly Haven API (see `docs/ADR/0005-asset-pipeline.md`)
2. Present 3 options to the user before downloading
3. Place downloaded file in `src/assets/[category]/[name].glb`
4. Create a typed reference in `src/assets/AssetManifest.ts`
5. Document the choice in an ADR update

---

## Commit Format (Conventional Commits)

```
feat(phase-N): description of new feature
fix(system): description of bug fix
test(core): add missing coverage for EventBus
docs(adr): add ADR-0008 for new system
chore: update dependencies
```

---

## Phase Gate Checklist

Before closing a phase:
1. `npm run typecheck` — zero errors
2. `npm test` — all tests pass
3. `npm run coverage` — ≥95% lines/functions
4. Manual smoke test in Electron (`npm run electron:dev`)
5. `git commit` with conventional format

---

## Architecture Decision Records

Read these before making structural changes:

- [ADR-0001](docs/ADR/0001-babylon-typescript.md) — Engine choice: Babylon.js + TypeScript
- [ADR-0002](docs/ADR/0002-electron-wrapper.md) — Desktop wrapper: Electron
- [ADR-0003](docs/ADR/0003-character-modular-gltf.md) — Character system: modular GLTF
- [ADR-0004](docs/ADR/0004-npc-claude-cli.md) — NPC AI: Claude CLI subprocess
- [ADR-0005](docs/ADR/0005-asset-pipeline.md) — Asset pipeline: Sketchfab MCP + Poly Haven
- [ADR-0006](docs/ADR/0006-save-system.md) — Save system: JSON files
- [ADR-0007](docs/ADR/0007-testing-strategy.md) — Testing: Jest + NullEngine + 95% coverage
- [ADR-0008](docs/ADR/0008-world-zones.md) — World architecture: zone/chunk system
- [ADR-0009](docs/ADR/0009-physics-havok.md) — Physics: Havok (isolated from tests)
- [ADR-0010](docs/ADR/0010-npc-conversation-context.md) — NPC conversation: hybrid stateless→session + save persistence
- [ADR-0011](docs/ADR/0011-npc-pre-moderation.md) — NPC content safety: pre-moderation gate (reverts in-prompt guardrails)
- [ADR-0012](docs/ADR/0012-dialog-native-input.md) — Chat UI: native DOM input (non-US keyboards) + emote/speech transcript
- [ADR-0013](docs/ADR/0013-windows-claude-launch.md) — Launching the Claude CLI from Electron (Windows-robust)
