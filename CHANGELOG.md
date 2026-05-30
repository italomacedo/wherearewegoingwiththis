# Changelog

All notable changes to this project will be documented here.

Format: [Conventional Commits](https://www.conventionalcommits.org/)

---

## [Unreleased]

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
