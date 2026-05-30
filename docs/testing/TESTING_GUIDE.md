# Testing Guide

## Philosophy

Tests exist to catch regressions in an AI-driven (vibe coding) project where multiple agents make rapid changes. Every PR must pass the coverage gate before merge.

---

## Running Tests

```bash
npm test              # run all tests once
npm run test:watch    # watch mode for active development
npm run coverage      # run with coverage report
```

Coverage report output: `coverage/index.html`

---

## NullEngine Pattern (Babylon.js in Jest)

Never import a real `Engine` in tests. Use `NullEngine` which runs without a GPU:

```typescript
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';

describe('MySystem', () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('does something', () => {
    // test 3D logic here without GPU
  });
});
```

---

## ServiceLocator Cleanup

Always clear the ServiceLocator in `afterEach` to prevent test pollution:

```typescript
afterEach(() => {
  ServiceLocator.clear();
});
```

---

## Mocking Claude CLI

Never spawn real `claude` processes in tests:

```typescript
import { spawn } from 'child_process';

jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdin: { write: jest.fn(), end: jest.fn() },
    stdout: { on: jest.fn((event, cb) => {
      if (event === 'data') cb(Buffer.from('NPC response text'));
    })},
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === 'close') cb(0);
    }),
    kill: jest.fn(),
  })),
}));
```

---

## Mocking Electron IPC

```typescript
jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
}));
```

---

## Test File Locations

| What | Where |
|---|---|
| Core systems | `tests/unit/core/` |
| Game systems | `tests/unit/systems/` |
| Entities | `tests/unit/entities/` |
| Scenes | `tests/unit/scenes/` |
| End-to-end flows | `tests/integration/` |

---

## Writing a New Test File

1. Mirror the source path: `src/core/EventBus.ts` → `tests/unit/core/EventBus.test.ts`
2. Import using path aliases: `import { EventBus } from '@core/EventBus'`
   - Note: in Jest, aliases resolve via `moduleNameMapper` in `jest.config.ts`
   - Must use relative paths or configured aliases — not `@babylonjs/core` directly in mocks
3. Follow Arrange-Act-Assert structure
4. One concept per `it()` block
5. `describe` block name = class/module name
