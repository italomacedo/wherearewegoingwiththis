# ADR-0002 — Desktop Wrapper: Electron

**Status:** Accepted  
**Date:** 2026-05-30

## Context

The game needs to run as a native Windows desktop application. The 3D engine (Babylon.js) runs in a browser renderer. We need a wrapper that:
- Packages the app as a standalone executable
- Provides access to the local filesystem (save files, asset loading)
- Can spawn child processes (Claude CLI subprocess for NPC AI)
- Supports IPC between the game renderer and Node.js capabilities
- Has good TypeScript support

## Decision

Use **Electron 33+** as the desktop wrapper.

Key factors:
- Electron main process (Node.js) can `spawn('claude', ...)` as a child process — essential for NPC AI
- `contextBridge` API provides secure IPC without exposing Node.js to the renderer
- `electron-store` or JSON files in `app.getPath('userData')` for save game persistence
- Well-documented, large community, excellent TypeScript types
- `electron-builder` for packaging Windows NSIS installer
- `vite-plugin-electron` integrates seamlessly with our Vite setup

## Architecture

```
Electron Main Process (Node.js)
├── Window management (frameless, resize events)
├── Claude CLI: child_process.spawn()
├── IPC handlers: claude-query, claude-cancel, window controls
└── File I/O: save games read/write via userData path

Electron Preload (contextBridge)
└── Exposes: electronAPI (claude, window, fs operations)

Renderer Process (Babylon.js + TypeScript)
└── Calls window.electronAPI.* — no direct Node.js access
```

## Consequences

**Positive:**
- Secure IPC architecture (contextIsolation: true, nodeIntegration: false)
- Claude CLI subprocess management is straightforward
- Easy packaging for Windows distribution

**Negative:**
- Electron bundle size (~150MB for a simple app)
- Two separate TypeScript configs needed (browser + Node.js)
- Hot reload requires `vite-plugin-electron` coordination

## Related

- [ADR-0004](0004-npc-claude-cli.md) — Claude CLI subprocess protocol
