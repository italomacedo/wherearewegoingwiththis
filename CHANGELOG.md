# Changelog

All notable changes to this project will be documented here.

Format: [Conventional Commits](https://www.conventionalcommits.org/)

---

## [Unreleased]

### Phases 1–8 + runtime hardening (summary)

- feat(phase-1): scene flow with fade transitions + EventBus integration (79a1b02)
- feat(phase-2): splash/studio/publisher + procedural cyberpunk main menu (89d0eb9)
- feat(phase-3): options menu with 4 tabs + settings persistence (9b14139)
- feat(phase-4): character creator, modular assembler, 360° preview (0903856)
- feat(phase-5): save/load/delete system (fdca3e6)
- feat(phase-6): world foundation — zone system + isometric camera, ADR-0008 (f918196)
- feat(phase-7): player controller + Havok physics + input system, ADR-0009 (5b5d002)
- feat(phase-8): NPC + Claude CLI — Zara (MVP), ADR-0010 (99b9cc9)
- build: unify typecheck/build across renderer/electron/node configs
- fix(renderer): replace runtime require() with ESM imports (fixes black screen)
- fix(dev): single Electron launch via vite-plugin-electron
- fix(scenes): splash sequence re-entrancy deadlock + centered logo layout (edd30ff)
- fix(world): camera-first onEnter + placeholder assets (fixes black screen on world entry) (d5b5f97)
- docs: ADR-0008/0009/0010; CLAUDE.md current status + hard-won lessons; phase statuses

### Phase 0 — Foundation & Documentation

- chore: initialize project repository
- chore: add Electron + Babylon.js + TypeScript + Vite scaffolding
- chore: configure Jest with NullEngine support and 95% coverage threshold
- feat(core): GameManager singleton with initialize/start/dispose lifecycle
- feat(core): SceneManager with typed scene registry and async load/unload
- feat(core): EventBus with typed GameEvents interface
- feat(core): ServiceLocator DI container
- feat(scenes): BaseScene abstract class
- feat(scenes): stub scenes for all game screens (Splash → GameWorld)
- feat(electron): main process with Claude CLI IPC and window controls
- feat(electron): preload bridge with contextBridge API
- docs: full documentation structure (ADRs, design docs, phase plans, systems)
- docs: CLAUDE.md agent entry point
- test(core): unit tests for GameManager, SceneManager, EventBus, ServiceLocator
