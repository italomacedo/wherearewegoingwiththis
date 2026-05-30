# Coverage Requirements

## Global Thresholds

| Metric | Minimum |
|---|---|
| Lines | 95% |
| Functions | 95% |
| Branches | 90% |
| Statements | 95% |

Configured in `jest.config.ts`. CI blocks if these drop.

---

## Per-Module Expectations

| Module | Expected Coverage | Notes |
|---|---|---|
| `src/core/` | 100% | Critical infrastructure |
| `src/systems/` | 95%+ | All public methods tested |
| `src/entities/` | 95%+ | Including serialization |
| `src/scenes/` | 80%+ | Visual logic excluded |
| `electron/main.ts` | 85%+ | IPC handlers mocked |
| `electron/preload.ts` | 90%+ | Bridge methods tested |

---

## Exclusions

These are excluded from coverage measurement:
- `src/main.ts` — Electron entry point (tested via integration)
- `src/vite-env.d.ts` — type declarations only
- `**/*.d.ts` — type-only files

---

## When Coverage Drops

If a PR drops coverage below threshold:
1. Identify uncovered lines in `coverage/index.html`
2. Write tests for the specific branches/functions uncovered
3. Do NOT lower the threshold — find the missing test

## Coverage During Phase 0

Phase 0 establishes the baseline. With 4 core unit test files, we expect 95%+ on `src/core/`. Coverage on stub scenes is expected to be low — this is acceptable until Phase 1 adds real implementation.

> The `coverageThreshold` gate applies to **global** coverage. Stub scenes with 0% coverage are offset by 100% coverage of core modules.
