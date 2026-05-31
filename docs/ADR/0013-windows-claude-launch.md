# ADR-0013 — Launching the Claude CLI from Electron (Windows-robust)

**Status:** Accepted
**Date:** 2026-05-30
**Supersedes** the `--no-markdown` flag and bare-`spawn('claude')` approach in
[ADR-0004](0004-npc-claude-cli.md) / [ADR-0010](0010-npc-conversation-context.md).

## Context

NPC chat spawns the `claude` CLI from the Electron main process. On Windows this failed
repeatedly even though `claude` worked in the user's terminal:

- `spawn('claude', …)` (no shell) → `ENOENT` (the `.cmd` shim isn't directly executable).
- `spawn('claude', …, { shell: true })` → the npm `claude.cmd` shim runs but calls
  `node <entry>`, and the **Electron child often lacks Node on its PATH** → the entry path
  `"…is not recognized as an internal or external command"` (exit 1).
- The CLI entry is not always `cli.js`; newer `@anthropic-ai/claude-code` ships a native
  **`bin/claude.exe`**.
- A **malformed configured path** (`…cli.jsclaude`, from a bad paste in Options) and a
  **broken global install** (missing `bin/claude.exe`, which fails in a plain terminal
  too) caused additional dead ends.

The opaque "Claude unavailable" message hid all of this for several rounds.

## Decision

`electron/main.ts` `resolveClaudeInvocation(claudePath, args)` resolves the **real entry**
and runs it **without** depending on the shim or Node-on-PATH:

1. Find the `claude` shim via a synchronous PATH scan honoring `PATHEXT`
   (`whichSync` — `.CMD` before the extensionless bash shim).
2. **Read the `.cmd` shim** (`readShimEntry`) to extract the true entry path
   (`%dp0%`-resolved), accepting `.js`/`.mjs`/`.cjs` **or** `.exe`. Also self-heals a
   path that points *inside* the `@anthropic-ai/claude-code` package (recovers the real
   entry from a typo'd suffix), with `%APPDATA%\npm` / `%ProgramFiles%\nodejs` fallbacks.
3. Launch:
   - `.js` entry → `process.execPath` (Electron) with **`ELECTRON_RUN_AS_NODE=1`** — uses
     Electron's bundled Node; no system Node required.
   - `.exe` entry → spawn it directly.
   - Last resort → `shell: true` on the `.cmd` (works only if Node is on PATH).
4. Args are `['--print']` only (the prompt is fed via **stdin**, never the command line →
   no shell-injection risk). The `--no-markdown` flag was dropped (not universally valid).
5. **Surface real stderr**: the child's stderr is buffered and returned in the rejection;
   a diagnostic log `[Claude NPC] claudePath=… command=… mode=…` made the root cause
   visible. The dialog shows the actual error.

**Operational note:** keep **Options → Claude CLI path BLANK** to use auto-detection. A
broken global install is fixed with `npm i -g @anthropic-ai/claude-code`, not in the game.

## Testability

`electron/main.ts` runs in the Electron main process and is not unit-tested (consistent
with prior phases); behavior is validated by the Electron smoke test. The resolution
helpers are deliberately small/pure-ish and logged for diagnosis.

## Consequences

**Positive:** NPC chat launches reliably across npm-global installs (cli.js or native
exe) without requiring Node on the Electron PATH; real errors are visible.

**Negative:** Windows-specific resolution logic + shim parsing to maintain; relies on the
npm package layout (`@anthropic-ai/claude-code`); `ELECTRON_RUN_AS_NODE` couples to
Electron's bundled Node version.

## Related

- [ADR-0004](0004-npc-claude-cli.md) — base Claude CLI subprocess + IPC
- CLAUDE.md "Hard-Won Lessons" #13
