# NPC System Design

## Overview

Every NPC in NeoBeiraRio is driven by a live `claude` CLI subprocess. This document specifies the design, data model, and behavior contract for all NPCs.

---

## NPC Data Model

```typescript
interface NPCDefinition {
  id: string;                    // unique, used as Claude process key
  name: string;
  role: string;                  // "street vendor", "corpo agent", etc.
  location: string;              // zone name
  personalityPrompt: string;     // 2-3 sentences describing character
  defaultMood: NPCMood;
  interactionRadius: number;     // meters — when NPC becomes AWARE
  conversationRadius: number;    // meters — player must be this close to type
  voicePitch?: number;           // future: TTS pitch modifier
}

type NPCMood = 'neutral' | 'friendly' | 'suspicious' | 'hostile' | 'scared';
```

---

## State Machine

```
IDLE
  → player enters interactionRadius → AWARE
  → player leaves interactionRadius → IDLE

AWARE
  → player sends message → RESPONDING (spawn claude)
  → player draws weapon → HOSTILE (immediate, no claude needed)
  → player runs past → ALARMED (brief, auto-resets)
  → player leaves radius → IDLE

RESPONDING
  → claude finishes → COOLDOWN (3s)
  → player sends another message while responding → queue it
  → claude process errors → IDLE + show "..." bubble

COOLDOWN
  → 3s elapsed → AWARE
  → player leaves → IDLE

HOSTILE
  → player holsters weapon → AWARE (if mood allows)
  → combat starts → COMBAT (Phase 10+)
```

---

## Context Prompt Template

```
You are [name], a [role] in NeoBeiraRio's [location].
[personalityPrompt]
Current mood: [mood]
Game time: [HH:MM, day N]
You know the player as: [playerName], [playerReputation if known].
Recent events you witnessed: [last 3 world events near you]
Player is [distance]m away. Player action: [current player action].

Conversation so far (last 5 exchanges):
[conversationHistory]

Respond in character. 2-3 sentences. React to their words AND their current action.
Do not break character. Do not mention being an AI.
```

---

## Conversation History Management

- Stored in memory only (not persisted across save loads in MVP)
- Maximum 5 exchanges kept (rolling window)
- Each exchange: `{ player: string, npc: string }`
- Cleared when player leaves conversation radius for >60 seconds

---

## Performance Constraints

- Maximum **1 active Claude subprocess** per scene in MVP
- If player tries to talk to a second NPC while first is responding: queue request, show "one moment..." bubble
- Subprocess killed immediately when: game paused, scene changes, window closes

---

## First NPC: Zara — The Street Vendor

| Field | Value |
|---|---|
| ID | `npc_zara_vendor_01` |
| Name | Zara |
| Role | Street vendor (black market data chips) |
| Location | Mercado das Sombras, stall 7 |
| Personality | Wary but fair. Speaks in short sentences. Has seen everything. Trusts no one fully. |
| Default Mood | suspicious |
| Interaction Radius | 8m |
| Conversation Radius | 3m |

This NPC is the Phase 8 test subject — if Zara works, the system works.

---

## Dialog UI

- Speech bubble above NPC: streams Claude response chunks in real time
- Player input: text field at bottom of screen (press E near NPC to activate)
- Conversation log: toggleable panel, last 5 exchanges
- "Thinking..." indicator: animated ellipsis while Claude processes
- Cooldown visual: bubble fades after response, reappears on next input
