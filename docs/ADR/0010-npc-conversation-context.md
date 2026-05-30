# ADR-0010 — NPC Conversation Context: Hybrid Stateless→Session + Save Persistence

**Status:** Accepted
**Date:** 2026-05-30
**Extends:** [ADR-0004](0004-npc-claude-cli.md)

## Context

Phase 8 makes NPCs talk via the `claude` CLI. Two design questions:

1. **How is conversation context maintained across turns?** Each NPC turn needs the
   persona, world state, and prior exchanges. Rebuilding the full prompt every turn is
   simple and controllable but grows unbounded; relying solely on the CLI's own session
   memory is cheaper per-call but fragile and hard to test/version.
2. **Does conversation memory survive save/load?** The owner wants NPCs that remember
   past conversations across game sessions.

## Decision

### 1. Hybrid context strategy (stateless → session graduation)

Each NPC conversation starts **stateless** and **graduates to a CLI session** once the
rebuilt context exceeds a size budget.

```
ConversationContext (per NPC)
  mode: 'stateless' | 'session'
  sessionId: string | null          // stable UUID, allocated on graduation
  history: Exchange[]                // rolling { player, npc } pairs
  estimatedChars(): number          // persona + worldState + history

  recordExchange(player, npc)
  shouldGraduate(builtPromptChars): boolean   // > GRADUATION_THRESHOLD_CHARS
```

- **Stateless mode** (early conversation): every call sends the full prompt
  (persona + world snapshot + last N exchanges) to `claude --print`. Deterministic,
  fully controllable, easy to test.
- **Graduation**: when the built prompt would exceed `GRADUATION_THRESHOLD_CHARS`
  (default 6000), allocate a stable `sessionId` and switch to **session mode**.
- **Session mode** (long conversation): the first session call sends a **primer**
  (persona + accumulated summary) under a fixed `--session-id <uuid>`; subsequent calls
  send only the new player turn + a short world-state delta. The CLI carries history.

This caps per-call token growth while keeping early turns fully reconstructable, and
keeps the expensive path (live CLI sessions) off the hot path until actually needed.

### 2. IPC contract extension

`claude-query` gains optional session fields. The Electron main process maps them to
CLI flags:

```
claude-query { npcId, prompt, claudePath, sessionId?, useSession? }
  useSession + sessionId → spawn: claude --session-id <uuid> --print --no-markdown
  otherwise              → spawn: claude --print --no-markdown   (stateless, ADR-0004)
```

`--session-id <uuid>` is idempotent (creates or continues that exact session), which is
more deterministic than `--resume` and needs no discovery step.

### 3. Save persistence

`SaveGame` gains an `npcMemory` map. Conversation state is serialized per NPC and
restored on load, so NPCs remember across sessions.

```typescript
SaveGame.npcMemory: Record<string /*npcId*/, {
  mode: 'stateless' | 'session';
  sessionId: string | null;
  history: { player: string; npc: string }[];
}>
```

History is capped at `MAX_PERSISTED_EXCHANGES` (default 20) to bound save size; the
prompt itself still only includes the last N (default 5).

## Testability

- `ConversationContext` and `PromptBuilder` are **pure** → 100% unit coverage.
- The graduation threshold, history cap, and prompt windowing are all unit-tested with
  deterministic inputs.
- `ClaudeNPCService` is tested against a **mocked `window.electronAPI`** — never spawns a
  real process. The streaming chunk protocol is asserted via the mock.
- Real CLI behavior (actual sessions, latency) is validated only in the Electron smoke
  test, consistent with prior phases.

## Consequences

**Positive:**
- Bounded per-call cost; early turns deterministic and reconstructable
- NPCs remember across save/load (owner requirement)
- Pure context/prompt logic keeps coverage at target without spawning processes

**Negative:**
- Two code paths (stateless + session) to maintain and test
- Session-mode primer must faithfully summarize pre-graduation history or the NPC
  "forgets" the transition turn — covered by tests on the primer builder
- Save size grows with conversation; capped by `MAX_PERSISTED_EXCHANGES`

## Related

- [ADR-0004](0004-npc-claude-cli.md) — base Claude CLI subprocess architecture
- [ADR-0006](0006-save-system.md) — save format (extended with npcMemory)
- [docs/design/NPC_SYSTEM.md](../design/NPC_SYSTEM.md) — NPC state machine & Zara
