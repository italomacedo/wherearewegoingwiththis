# ADR-0004 — NPC AI: Claude CLI Subprocess

**Status:** Accepted  
**Date:** 2026-05-30

## Context

The core differentiator of this game is NPCs powered by real AI — not scripted dialogue trees. Each NPC should:
- Respond naturally to player conversation
- React to player actions (approaching, running, pointing weapon)
- Maintain conversational context
- Speak in character given their backstory and current situation

Options evaluated:
- **Direct Anthropic API calls** — requires API key embedded in client, network dependency
- **Local LLM (Ollama)** — fully offline but lower quality, requires GPU
- **Claude CLI subprocess** — uses locally installed `claude` CLI, no API key in code, leverages Opus/Sonnet quality, requires `claude` to be installed

## Decision

Use the **`claude` CLI as a subprocess** spawned from the Electron main process.

### Protocol

```
Renderer → IPC invoke('claude-query', {npcId, context, message, claudePath})
  Electron Main: child_process.spawn(claudePath, ['--print', '--no-markdown'])
    stdin: full context prompt + player message
    stdout: streaming response chunks
  Electron Main → IPC send('claude-response-chunk', {npcId, chunk})
  Electron Main → IPC send('claude-response-done', {npcId, code})
Renderer: renders chunks progressively in dialog bubble
```

### Context Prompt Template

```
You are [NPC_NAME], [DESCRIPTION].
Location: [ZONE_NAME], [CITY_NAME]
Time: [GAME_TIME]
Current mood: [MOOD_STATE]
Recent events: [LAST_5_EVENTS]
Player name: [PLAYER_NAME]
Player is [DISTANCE]m away, currently [PLAYER_ACTION].
Conversation history:
[LAST_5_EXCHANGES]

Respond in character. 2-3 sentences max. React to both words and actions.
```

### NPC State Machine

```
IDLE → PLAYER_NEARBY (within 10m) → AWARE
AWARE + player message → RESPONDING (spawn Claude)
RESPONDING → IDLE (after response + 3s timeout)
IDLE/AWARE + player_action:weapon_drawn → HOSTILE/SCARED (personality-dependent)
```

## Consequences

**Positive:**
- No API key in the codebase
- Full Claude model quality (Sonnet/Opus)
- Streaming responses feel natural
- Context management is explicit — we control exactly what the NPC "knows"

**Negative:**
- Requires `claude` CLI installed on player's machine
- Response latency 1-3s (network round trip to Anthropic)
- One subprocess per active NPC conversation — must limit concurrent NPCs
- Player needs an Anthropic account

**Mitigation:**
- Claude CLI path is configurable in Options menu
- Graceful fallback: if Claude CLI is not found, NPCs show placeholder "..." dialogue
- Rate limiting: only 1 active Claude subprocess per scene

## Related

- [ADR-0002](0002-electron-wrapper.md) — Electron subprocess management
- [docs/design/NPC_SYSTEM.md](../design/NPC_SYSTEM.md) — Full NPC system spec
