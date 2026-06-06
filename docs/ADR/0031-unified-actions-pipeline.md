# ADR-0031 — Unified Actions Pipeline (PC ↔ NPC)

**Status:** Accepted — Fase 21 21A-F + 21H **MERGED**. 21G (NPC autonomy verb migration) deferred to Fase 22.
**Date:** 2026-06
**Builds on:** ADR-0028 (Economy + Missions), ADR-0030 (Skill Mechanics).

## Context

Pre-Fase 21 the action pipeline had two parallel asymmetric architectures:

- **PC chat:** moderate → `hasEmote` gate → `classifyAction` (ONLY if emote) →
  `applySkillEffect` → mutations OR `streamNpcReply` (chat) → `maybeHandleCommerce`
  (post-hoc trade/mission detection).
- **NPC autonomy:** `tickAutonomy` → 4-intent deliberation (`stay|approach|attack|react_to_player`)
  → scene-coupled execution (approach=walk+gossip; attack=`beginCombat`).

Five concrete problems:
1. **Mission flow was fragile** — depended on Claude (a) deciding to offer, (b) phrasing parseable,
   (c) all in one turn. No way to detect "Got work?" / "Job done" deterministically. Auto-paid on
   kill (no handshake).
2. **Persuasion/Intimidation only via emote** — "*you should help*" without `*…*` had no mechanic.
3. **Comércio had no skill check** — only skill without an in-game mechanic.
4. **NPC autonomy severely limited** — 4 verbs. Couldn't steal, sabotage, heal-self, propose
   trades, etc.
5. **`maybeHandleCommerce` was a post-hoc hack** — ran AFTER the NPC reply, classified retroactively.
   The NPC spoke blind; the game decided after.

## Decision

A single **actor-agnostic** action pipeline with a shared **vocabulary of verbs** and a pure
`resolveAction(actor, verb, target?, options?, rng?, channel?) → ResolveResult { mutations[] }`
resolver. The Applier consumes the mutations and applies them to the world via a
`ApplierContext` seam (one method per kind). PC and NPC both flow through the same Resolver +
Applier; the only difference is HOW they produce verbs.

### Vocabularies

**Verbal (15 + narrative)** — PC speech with no `*emote*`:
```
job_request | job_claim | job_accept | job_decline | job_cancel
commerce_discovery | commerce_pricing | commerce_haggle | commerce_buy | commerce_sell
manipulate | persuade | intimidate | info | narrative
```

**Emote (13 + narrative)** — PC `*action*`:
```
attack | steal | info | coerce | heal | sabotage | repair | craft
persuade | intimidate | disarm | examine_self | narrate_time | narrative
```

**Autonomy** — NPC deliberation: `move_to | flee_from | wait | talk_to | use_item` +
subset of verbal/emote. 21G migrates this; today the 4-intent system still runs.

### Channels disambiguate shared verbs

`info`, `persuade`, `intimidate`, `attack`, `steal`, `sabotage`, `heal`, `manipulate`,
`commerce_pricing`, `narrative` appear in MORE THAN ONE vocabulary with different semantics.
The Resolver takes a `channel: 'verbal' | 'emote' | 'autonomy'` parameter to disambiguate.

### Mutations (35 kinds)

Discriminated union with explicit `actor` / `from` / `to` / `target` fields. Replaces the
implicit-player `SkillMutation`. New kinds: locomotion (move_to/flee_from/wait/talk_to/use_item),
mission lifecycle (stage/accept/decline/claim/cancel), commerce lifecycle (stage/execute/haggle),
special narrations (examine_self, narrate_time), TTS-only narration (narrate), learn-by-doing
(apply_skill_use).

### Pipeline (PC chat path)

```
[A] resolveAddressee(msg, aim, candidates)   — pre-classifier (T-chat addressing)
[B] moderate                                 — Claude oneShot ALLOW/BLOCK
[C] hasEmote? → emoteClassify : verbalClassify
[D] tryVerbalAction(agent, message) — Fase 21
    └─ classifyVerbal → Resolver(channel='verbal') → Applier → STAGE STATE
[E] streamNpcReply (NPC reacts informed by extraContext)
[F] speakNpc TTS
```

Pre-existing emote path (Fase 20 + earlier) still handles `*…*`. Migration of emote-path into
the unified pipeline is deferred (would be 21F.3 or later).

### Decisions resolved interactively (14 furos)

| # | Decision |
|---|---|
| 1 | `examine_self` + `narrate_time` as dedicated emote verbs (replaces regex short-circuits). |
| 2 | `resolveAddressee` survives + deceased-NPC short-circuit; `stripShout` dropped. |
| 3 | `narrative` = pure no-op (no check, no XP, no mutation). |
| 4 | Auto-attack stub (hostile + player present → `attack` w/o Claude) preserved. |
| 5 | `ClaudeCallQueue` throttle preserved. |
| 6 | Awake/hibernation (Fase 17H quadrant scoping) preserved. |
| 7 | `detectTampering` at top of `tickAutonomy` preserved. |
| 8 | `hostile_reaction` = full `onHostilePlayerAction` behaviour (disposition -1 + state/mood + ultimatum → combat). |
| 9 | Mixed text (`*scowls* Got work?`) → emote always wins. |
| 10 | `commerce_haggle` without `pendingTrade` → fallback to `commerce_discovery`. |
| 11 | Pendings persist in `SaveGame.pendings` (cross-session). |
| 12 | Learn-by-doing: `applySkillUse` on EVERY rolled check (success OR failure). |
| 13 | Auxiliary NPC verb: ONLY `use_item` included (pickup/drop/equip/unequip deferred to Fase 22). |
| 14 | `job_cancel` verb: drops active mission, -1 disposition (no formal renegotiation). |

### Mission lifecycle (deterministic)

1. **`job_request`** → game picks first present rival from giver's ledger, computes reward
   (min(default 30, giver balance)), stages `pendingMission` in `SaveGame.pendings`. NPC narrates
   the offer.
2. **`job_accept`** → moves pending to `SaveGame.missions[active]` with status `'active'`.
3. **`job_decline`** → drops pending. No penalty.
4. **`job_cancel`** (Fase 21 NEW) → finds active mission, marks `status: 'cancelled'`, worsens
   disposition -1. Preserves history (no array delete) for PDA display.
5. **`job_claim`** → checks active mission against `defeatedNpcIds`. Target dead → pays out
   (`completeMission`). Target alive → narrates "still walking around."
6. **NO auto-pay** — kill alone doesn't trigger reward (decision #14 + design intent).

### Commerce flow (deterministic)

- `commerce_discovery` → no-op ack (NPC reply lists wares via extraContext).
- `commerce_pricing` → stages `pendingTrade` at `priceFor(item, disposition)`.
- `commerce_haggle` → **Comércio vs NPC Carisma** skill check. Success → ×0.85; crit → ×0.7;
  failure → no penalty. Floor: 50% of base neutral price.
- `commerce_buy` → executes `pendingTrade`.
- **No pendingTrade + haggle** → falls through to `commerce_discovery`.

### Persuade/Intimidate asymmetry

- `persuade` (Persuasão): success → disposition UP. Failure → no penalty.
- `intimidate` (Intimidação): success → disposition UP + fear. Failure → disposition -1 +
  `hostile_reaction` (may escalate to combat).

## Architecture

```
                           ┌──────────────────┐
                           │   Player chat    │     ┌──────────────────┐
                           │   (PC speech)    │     │  NPC autonomy    │
                           └────────┬─────────┘     └────────┬─────────┘
                                    │                        │
                                    ▼                        ▼
                            verbalClassify              autonomy deliberate
                            (Claude)                    (Claude)
                                    │                        │
                                    ▼                        ▼
        Surprise click ──→  ┌──────────────────────────────────────┐
        (UI input)          │  resolveAction(actor, verb, target,  │
                            │   options, rng, channel)             │
                            │  → ResolveResult { mutations[] }     │
                            │  (PURE, RNG-injected)                │
                            └──────────────────┬──────────────────┘
                                               ▼
                            ┌──────────────────────────────────────┐
                            │  applyMutations(ctx, mutations)      │
                            │  → switch on kind → ctx method       │
                            │  (PURE dispatcher)                   │
                            └──────────────────┬──────────────────┘
                                               ▼
                            ┌──────────────────────────────────────┐
                            │   SceneApplierContext (browser)      │
                            │   (~35 methods proxying to live      │
                            │    scene refs: inventory, HP,        │
                            │    disposition, missions, PDA,       │
                            │    combat, TTS, save)                │
                            └──────────────────────────────────────┘
```

### File map

**New:**
- `src/systems/actions/Verbs.ts` — 3 vocabularies + type guards + FALLBACK_VERB.
- `src/systems/actions/Mutations.ts` — discriminated union (35 kinds) + ActorId.
- `src/systems/actions/Actor.ts` — Actor interface + PlayerActor + NpcActor adapters.
- `src/systems/actions/VerbalIntent.ts` — `parseVerbalClassification` tolerant parser.
- `src/systems/actions/Resolver.ts` — `resolveAction` pure, channel-dispatched.
- `src/systems/actions/Applier.ts` — `applyMutation`/`applyMutations` + `ApplierContext` interface.
- `tests/unit/systems/actions/*.test.ts` — 100% testing of pure cores.

**Modified:**
- `src/systems/npc/PromptBuilder.ts` — `buildVerbalClassifierPrompt` (new) + slim `buildActionClassifierPrompt`.
- `src/systems/npc/EmoteIntent.ts` — `SkillEffect` SUPERSET (slim + legacy) for compat during transition.
- `src/systems/ClaudeNPCService.ts` — `classifyVerbal` one-shot.
- `src/systems/NPCManager.ts` — `classifyVerbal` delegate.
- `src/systems/economy/Missions.ts` — `MissionStatus` adds `'cancelled'`; new `PendingOffer` type.
- `src/systems/SaveService.ts` — `SaveGame.pendings: PendingOffer[]` + migrate backfill + updater.
- `src/scenes/GameWorldScene.ts` — `tryVerbalAction` + `buildApplierContext` + wired into
  `sendToActiveNPC` + `sendGlobalMessage`. REMOVED `maybeHandleCommerce` +
  `completeMissionsAgainst` (replaced by verbal pipeline + handshake).
- `src/systems/I18n.ts` — 7 new keys for system lines.

### Invariant: TTS preservation

The 12 legacy call sites of `speakNpc` / `speakNarration` collapse into ONE
`ApplierContext.narrate(line, voice, agentId?)` method going forward. The unified pipeline
fires TTS through `narrate`; the legacy emote path keeps its direct `speak*` calls until 21G
migrates them. Smoke-tested categories: NPC reply, skill outcome, self-exam, check-time,
ambient T-chat, combat crit/sabotage/blow.

## Consequences

### Positive
- **Mission flow is robust:** deterministic stage/accept/cancel/claim. Cross-session pendings.
- **NPC reply is informed:** mutations apply BEFORE the reply, so the NPC narrates a
  just-decided outcome instead of inventing one.
- **Comércio skill is finally mechanical:** haggle has a real skill check.
- **Symmetric foundation:** same Resolver+Applier+vocab can drive NPC autonomy in 21G.
- **Token cost preserved:** mod + verbal-classify + reply = 3 calls (same as pre-Fase 21 with
  the dropped `maybeHandleCommerce` post-hoc classifier).
- **Save schema additive:** `SaveGame.pendings` backfilled to `[]`; legacy saves load cleanly.

### Trade-offs
- **No auto-pay on kill** — player MUST return to giver and verbally claim. Some players may
  forget; matches design intent ("contract is contract").
- **TTS preservation is convention** — the `narrate` gateway exists but isn't enforced
  architecturally until 21G migrates the emote path. Risk: a future regression skipping it.
- **Branch coverage:** Resolver pure tests cover ~92% branches; many `?? defaults` are
  istanbul-ignored as defensive (createDefaultStats always populates).

### Deferred (Fase 22)
- **21G: NPC autonomy vocab migration** — replace `buildIntentPrompt` (4 intents) with
  `buildAutonomyClassifierPrompt` (full vocab). NPCs gain real agency (steal from player,
  self-medicate, sabotage rivals, etc.). Current 4-intent system works fine; not blocking.
- **Emote path migration** — `applySkillEffect` still handles emotes via legacy SkillActions.
  Migration adds emote → unified pipeline. The Resolver already supports `channel='emote'`.
- **Auxiliary NPC verbs** — pickup, drop, equip, unequip (decision #13 capped at `use_item`).
- **`commerce_sell`** — vocab reserved; resolver returns "not interested" until wired.
- **`disarm` mechanic** — Applier branch is a stub; real implementation drops weapon into
  `GroundItems` for pickup.

## Lessons (added to CLAUDE.md)

53. **Channel disambiguation:** the same verb string can mean different things in different
    vocabularies (`info` = ask vs scan; `persuade` = verbal vs emote). Carry a channel arg
    through the unified resolver so callers explicitly pick semantics; never rely on
    verb-string alone for dispatch.
54. **`ApplierContext` seam:** the pure dispatcher (`applyMutation`) is exhaustive over the
    Mutation union with a `_exhaustive: never` default. Adding a kind without a branch
    fails compile — caught immediately. The seam to live state is one interface (~35 methods);
    the scene's implementation is the only browser-side code in the action layer.
55. **Type-superset transition:** when slimming a discriminated union (drop legacy entries),
    keep them as type members during the transition window so consumers' switch branches stay
    type-safe. Mark with `@deprecated`/comments; remove in a follow-up phase after the
    classifier stops emitting them.
56. **rng() returns [0,1)**: `SkillCheck.resolveCheck` multiplies rng by 100. Test helpers
    must use `() => 0.30` (30 face) not `() => 30`.
