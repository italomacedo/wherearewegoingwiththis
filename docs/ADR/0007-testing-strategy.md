# ADR-0007 — Testing Strategy: Jest + NullEngine + 95% Coverage

**Status:** Accepted  
**Date:** 2026-05-30

## Context

The game is built entirely by AI agents (vibe coding). High test coverage is essential to prevent regressions as the codebase grows rapidly. Requirements:
- 95% line/function coverage, 90% branch coverage
- Tests must run in CI (no GPU, no Electron, no display)
- Fast feedback loop (< 30s for unit tests)
- Tests must mock external dependencies (Claude CLI, file system)

## Decision

**Jest 29 + ts-jest** with the following architecture:

### Test Categories

**Unit tests** (`tests/unit/`):
- Pure TypeScript logic: EventBus, ServiceLocator, SaveSystem, ClaudeNPCSystem
- Babylon.js 3D logic: use `NullEngine` — runs without GPU
- Electron IPC: mock `ipcRenderer`/`ipcMain`
- Target: covers all branches of every class

**Integration tests** (`tests/integration/`):
- Scene flow: Splash → Studio → Publisher → MainMenu (NullEngine, mocked timers)
- Save/Load cycle: create → write → read → verify data integrity
- NPC IPC protocol: mock `child_process.spawn`, verify context prompt format

### NullEngine Pattern

```typescript
import { NullEngine, Scene } from '@babylonjs/core';

const engine = new NullEngine();
const scene = new Scene(engine);
// scene logic runs without any GPU or display
afterEach(() => {
  scene.dispose();
  engine.dispose();
});
```

### Claude CLI Mock Pattern

```typescript
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdin: { write: jest.fn(), end: jest.fn() },
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));
```

### Coverage Gates (jest.config.ts)

```typescript
coverageThreshold: {
  global: {
    lines: 95,
    functions: 95,
    branches: 90,
    statements: 95,
  },
}
```

CI blocks merges if coverage drops below threshold.

### What We Do NOT Test

- Visual output (pixel-perfect rendering) — not feasible without a display
- Electron window behavior — tested manually in smoke tests
- Actual Claude CLI responses — mocked in all tests

## Consequences

**Positive:**
- Regressions caught automatically before they reach manual testing
- NullEngine means tests run on any CI machine (no GPU required)
- 95% threshold forces thoughtful coverage even during rapid AI-driven development

**Negative:**
- Initial setup cost for mocking Babylon.js modules in Jest
- Babylon.js is ESM — requires `transformIgnorePatterns` workaround in Jest config
- Visual regressions must be caught by manual smoke tests

## Related

- [docs/testing/TESTING_GUIDE.md](../testing/TESTING_GUIDE.md) — how to write tests
- [docs/testing/COVERAGE_REQUIREMENTS.md](../testing/COVERAGE_REQUIREMENTS.md) — coverage rules per module
