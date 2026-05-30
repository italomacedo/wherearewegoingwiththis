# Where Are We Going With This

**BeiraRio Games** — Cyberpunk Isometric Open-World RPG for PC

> An isometric single-player RPG set in a neon-soaked cyberpunk city where every NPC is powered by a live Claude AI subprocess. Flying Harleys, cybernetic implants, katanas, and a world that talks back.

---

## Current Status

**Phases 0–8 complete** — playable from splash → menu → character creator → world.
The MVP NPC (Zara, Claude-CLI-driven) logic is in place; its on-screen dialog UI
and the character→save→world session glue are the next integration steps.

- 412 tests, ~99.5% coverage
- Verified in Electron through to the game world (player movement, camera, NPC present)
- See [CLAUDE.md](CLAUDE.md) for current status, open integration gaps, and hard-won lessons
- See [docs/phases/](docs/phases/) for the full roadmap

**Dev command:** `npm run dev` (single Electron instance via vite-plugin-electron)

---

## Requirements

- Node.js 22+
- npm 10+
- Windows 10/11 (primary target)
- `claude` CLI installed and accessible in PATH (for NPC AI — required for Phase 8+)

---

## Development

```bash
npm install
npm run electron:dev   # full game in Electron
npm run dev            # browser-only preview
```

## Tests

```bash
npm test               # run all tests
npm run coverage       # with coverage report (target: ≥95%)
```

## Build

```bash
npm run electron:build  # package Windows installer
```

---

## Tech Stack

- **Babylon.js 7** — 3D rendering, physics, animations
- **TypeScript 5** — type-safe throughout
- **Electron 33** — desktop wrapper, IPC, Claude CLI subprocess
- **Vite 6** — bundler with HMR
- **Jest 29** — unit + integration tests with NullEngine

---

## Contributing

This project is developed by AI agents (vibe coding). See [CLAUDE.md](CLAUDE.md) for agent context and conventions.

---

## License

Proprietary — © 2024-2025 BeiraRio Games
