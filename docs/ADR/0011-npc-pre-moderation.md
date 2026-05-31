# ADR-0011 — NPC Content Safety: Pre-Moderation Gate (not prompt-only)

**Status:** Accepted
**Date:** 2026-05-30
**Extends:** [ADR-0004](0004-npc-claude-cli.md)

## Context

NPCs are driven by a live `claude` CLI (ADR-0004). Players can type anything. Two
problems surfaced in playtesting:

1. **Out-of-policy player input** (e.g. sexual/explicit advances) reached the NPC and
   the model replied with an **out-of-character meta refusal** ("I'm Zara in this scene,
   but I'm not going to roleplay that. Let me give you an in-character out: …"), which
   breaks immersion.
2. First mitigation was **in-prompt guardrails** ("stay in character, deflect tersely,
   non-explicit, no preamble") + a **reply sanitizer** that stripped leading/trailing
   meta lines. This reduced but didn't eliminate the meta wrapper, and coupled tone
   policy into every NPC prompt.

## Decision

Add a **pre-moderation gate** that screens the player's message **before** it is ever
sent to the NPC. If blocked, the game refuses up front and the NPC is never involved.

```
sendToActiveNPC(message):
  allowed = await npcManager.moderate(npcId, message)   // ALLOW/BLOCK classifier
  if !allowed:
     dialog.addSystemLine("You can't say or do that.")   // never shown to NPC, never sent
     return
  … normal NPC turn …
```

- **Classifier prompt** (`PromptBuilder.buildModerationPrompt`): a separate
  `claude --print` call that answers exactly `ALLOW` or `BLOCK`. Fictional cyberpunk
  violence, crude language, flirting, in-world crime → ALLOW. Sexual content involving
  minors, real actionable harm, threats/harassment of real people → BLOCK.
- **`ClaudeNPCService.moderate(npcId, message)`** runs the call under a distinct id
  (`<npcId>::moderation`), parses the verdict, and **fails OPEN** (returns allowed) on any
  CLI error so a moderation hiccup never hard-stops play.
- **`DialogSystem` gains a `system` role** for the refusal notice (styled distinctly).

**Because the gate blocks disallowed input up front, the earlier in-prompt tone
guardrails and the reply sanitizer were reverted** — the NPC prompt returns to its
simpler form (ADR-0004 / ADR-0010). The model's own refusal to *generate explicit
content* remains a safety line the prompt neither can nor should override; the gate just
ensures we don't push the NPC there in the first place.

## Testability

- `buildModerationPrompt` is pure → unit-tested (ALLOW/BLOCK wording, message inclusion).
- `moderate()` tested against a mocked bridge: ALLOW→true, BLOCK→false, CLI error→true
  (fail-open).
- The block path is tested at the scene level (system line shown, NPC turn never sent).

## Consequences

**Positive:** disallowed input refused before the NPC; immersion preserved (no meta
refusals from the NPC); tone policy decoupled from every NPC prompt; fail-open keeps play
robust.

**Negative:** **two CLI calls per message** (moderation + NPC turn) → added latency/cost.
Acceptable for the MVP; future options: a fast local pre-filter for trivial messages, a
short-circuit cache, or an Options toggle. The classifier is itself an LLM call and not
infallible.

## Related

- [ADR-0004](0004-npc-claude-cli.md) — Claude CLI subprocess
- [ADR-0010](0010-npc-conversation-context.md) — conversation context
- [docs/design/NPC_SYSTEM.md](../design/NPC_SYSTEM.md)
