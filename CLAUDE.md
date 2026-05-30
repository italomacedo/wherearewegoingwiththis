# Where Are We Going With This — Claude Agent Context

**BeiraRio Games | Cyberpunk Isometric Open-World RPG**

This is the primary entry point for all AI agents working on this project. Read this before touching any file.

---

## Current Status (keep this updated)

**Phases 0–8 COMPLETE** (+ integration gaps #1/#2/#3 closed) · 427 tests · ~99.6% coverage (gated 95% lines/stmts/funcs, 90% branches) · typecheck + build green.

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
| 9 | Vehicles (flying car + Harley) | ⬜ next |
| 10+ | Combat, implants, world expansion | ⬜ |

**Verified working in Electron:** splash → studio → publisher → menu → options → character creator → game world (player moves, camera follows, Zara visible).

**INTEGRATION GAPS:**
1. ✅ **Dialog GUI** — DONE. `DialogSystem` now renders a bottom speech bubble (NPC name + wrapped streaming text + `. . .` thinking placeholder), a player `InputText` with a SEND button and Enter-to-submit, and tracks input focus (`isInputFocused()`). Browser-only render/build is `istanbul ignore`d; pure state machine + focus flag stay fully tested. While the dialog is open, `GameWorldScene.update` freezes player movement/camera so typing doesn't move the character, and the interact key won't close the dialog while the field is focused.
2. ✅ **GameSession glue** — DONE. New `src/core/GameSession.ts` holder (`{saveId, character, npcMemory, world, gameTimeSeconds}`) registered in ServiceLocator under `'gameSession'`. `CharacterCreatorScene.onBegin` creates+persists a save (`SaveService.createNewSave`+`save`) and registers a session; `LoadGameScene.onLoadSave` builds a session via `GameSession.fromSave`. `GameWorldScene.onEnter` adopts appearance/name/npcMemory and spawns at the saved world position (falls back to the zone spawn point when position is all-zero).
3. ✅ **Autosave (on scene exit)** — DONE. `GameWorldScene.onExit` calls `persistSession()` → `SaveService.updateWorldState` + `updateNpcMemory` (and updates the in-memory session). NOTE: this persists on *exit only*; a periodic/interval autosave during play is still future work.
4. **Real assets** — still open. Project ships ZERO `.glb`/textures; everything is procedural placeholder. `CharacterAssembler.useGltf=false` and `MercadoSombrasZone.loadRealAssets` is a no-op. Curated CC0/CC-BY assets catalogued in [docs/design/WORLD_DESIGN.md](docs/design/WORLD_DESIGN.md) for manual download.

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
  main.ts           Electron main process (Node.js)
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
    GameWorldScene.ts Wires camera+input+zone+player+NPC+dialog (camera FIRST)
  entities/         Game objects (data + behavior, no GUI)
    CharacterData.ts      Appearance model, DEFAULT_APPEARANCE, BODY_BASES
    WorldZone.ts          Abstract zone (load/unload/spawn/bounds)
    zones/MercadoSombrasZone.ts  Starting district (procedural)
    PlayerController.ts   Pure computeDisplacement + spawn + movement
    NPCAgent.ts           Persona + state machine + proximity (pure)
    npcs/zara.ts          Zara definition (first NPC)
  systems/          Game systems
    InputSystem.ts        Keyboard → action map + movement axis (pure core)
    CameraSystem.ts       Isometric ArcRotateCamera, follow, rotate, zoom
    PhysicsService.ts     Havok WASM init (browser-only, guarded)
    SettingsService.ts    Settings load/save/validate (localStorage + memory)
    SaveService.ts        SaveGame JSON CRUD + npcMemory
    CharacterAssembler.ts GLTF/placeholder character assembly (useGltf flag)
    ZoneManager.ts        Zone registry + load/unload
    DialogSystem.ts       Dialog state machine (GUI render = STUB, gap #1)
    ClaudeNPCService.ts   Orchestrates an NPC turn via Electron IPC (streaming)
    NPCManager.ts         Spawns agents, proximity/cooldown, memory serialize
    npc/
      ConversationContext.ts  Rolling history + stateless→session graduation
      PromptBuilder.ts        Pure prompt builders (stateless/primer/turn)
  assets/
    AssetManifest.ts  Typed asset path registry

tests/unit/         Mirrors src/ paths (core, scenes, systems, systems/npc, entities, assets)

docs/
  ADR/              0001-0010 Architecture Decision Records (read before major changes)
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
