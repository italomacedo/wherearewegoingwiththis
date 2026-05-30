# Where Are We Going With This — Claude Agent Context

**BeiraRio Games | Cyberpunk Isometric Open-World RPG**

This is the primary entry point for all AI agents working on this project. Read this before touching any file.

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
  core/             Engine infrastructure (no Babylon dependencies except Engine)
    GameManager.ts  Singleton: owns Engine, SceneManager, ServiceLocator init
    SceneManager.ts Load/unload scenes, scene registry, fade transitions
    ServiceLocator.ts Lightweight DI container
    EventBus.ts     Typed pub/sub (GameEvents interface)
  scenes/           One file per Babylon.js Scene
    BaseScene.ts    Abstract base: onEnter(), onExit(), update(), dispose()
    SplashScene.ts  → StudioScene → PublisherScene → MainMenuScene
    MainMenuScene.ts  New Game / Load Game / Options / Quit
    CharacterCreatorScene.ts  Modular GLTF character builder
    LoadGameScene.ts  Save list, load, delete
    OptionsScene.ts   Tabs: Game / Display / Video / Audio
    GameWorldScene.ts Isometric world, player, NPCs
  entities/         Game objects (player, NPCs, vehicles)
  systems/          Stateless/stateful game systems
    InputSystem.ts  WASD + gamepad → action map
    CameraSystem.ts ArcRotateCamera, isometric follow
    SaveSystem.ts   JSON file I/O via Electron IPC
    ClaudeNPCSystem.ts  Spawn claude CLI, manage IPC stream
  ui/               Babylon GUI overlays (HUD, dialog boxes, menus)
  assets/           Asset manifests and loader helpers

tests/
  unit/core/        GameManager, SceneManager, EventBus, ServiceLocator
  unit/systems/     InputSystem, SaveSystem, ClaudeNPCSystem, CameraSystem
  unit/entities/    Serialization tests
  integration/      End-to-end flows (NullEngine, mocked IPC)

docs/
  ADR/              Architecture Decision Records (read before major changes)
  design/           Game Design Documents
  phases/           Phase plans with completion gates
  systems/          System specs and API contracts
  testing/          Testing guide and coverage requirements
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
