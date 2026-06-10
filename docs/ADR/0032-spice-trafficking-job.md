# ADR-0032 — Spice-trafficking job (second NPC job type)

**Status:** Accepted · **Phase:** Fase 22 · **Date:** 2026-06-09

## Context

Until now the only "job" an NPC could offer the player was a **kill-contract**
(`Missions.ts`, ADR-0028/0031): a non-hostile NPC pays credits/an item to have a
present rival killed. We want a **second, non-violent job type** that creates an
emergent economic loop instead of combat: **spice trafficking**.

## Decision

A new NPC job: buy contraband **spice** low from a dealer, resell high to addicts,
report back to the dealer for a relationship reward.

### Model (owner-decided)
- **Two probabilistic, seeded NPC traits** (`NPCDefinition.dealer` / `addict`),
  not an "illegal" archetype flag. Every NPC has a chance to be a **dealer**
  (offers + sells spice to the player) and/or an **addict** (buys spice from the
  player). Procedural NPCs roll them deterministically per world id
  (`rollSpiceTraits(hash32(worldSeed, tx, tz, i, salt))`) on a SEPARATE seed so the
  existing tile layout/RNG stream is untouched; authored NPCs set them explicitly
  (Mback = dealer, Zara = addict → a self-contained loop in tile (0,0)).
- **Only `addict` NPCs buy spice from the player.**
- **Offer gate:** a dealer only offers when its stance toward the player is
  **≥ neutral** (`canOfferSpice`), reusing the disposition scale.
- **Economy:** spice is a real stackable `misc` item (`itemValue` = X). Buy price =
  `X × (1 − dispositionDiscount)` (dealer disposition). Resale base = **10×**,
  **modulated** by a player-driven Comércio-vs-Carisma **haggle** step; failure =
  no penalty.
- **Negotiated like commerce (NOT a direct sale).** Both the buy and the sell run
  through the SAME four-phase machine as `commerce_*`: **discovery → pricing →
  haggle → commit**. discovery/pricing STAGE a `pendingSpice` deal (no transfer);
  haggle adjusts its price (the BUYER pushes it down, the SELLER up, clamped);
  `spice_buy`/`spice_sell` COMMIT whichever side is staged. A mere "wanna buy
  spice?" is now a *discovery* (it quotes, it does not close) — fixing the playtest
  bug where the sale fired on the opening line.
- **Report = handshake, no verification.** Returning to the originating dealer and
  saying "sold it all" improves that dealer's disposition one step and completes
  the contract. We deliberately do NOT verify how much was actually resold.
- **Persistence:** a separate `SaveGame.spiceContracts: SpiceContract[]` (one active
  per dealer), backfilled `[]` by `migrate`; carried by `GameSession`.

### Pipeline (reuses the Fase 21 unified Resolver/Applier + the pendingTrade pattern)
Six **VERBAL** verbs + five **mutations** + five `ApplierContext` methods, mirroring
the `pendingTrade` staging:

| Verb(s) | Mutation | Effect |
|---|---|---|
| `spice_discovery` / `spice_pricing` | `stage_pending_spice{npc,side,unitPrice,qty}` | put a quote on the table — side from the NPC's trait (dealer→buy / addict→sell), no transfer |
| `spice_haggle` | `apply_spice_haggle{npc,factor}` | Comércio×Carisma roll → adjust the staged price (buy↓ / sell↑, `clampSpicePrice`); fail = no change |
| `spice_buy` / `spice_sell` | `execute_pending_spice{npc}` | execute the staged side (buy: credits→dealer+spice→player+contract / sell: spice→addict+credits→player, both clamped) |
| — | `clear_pending_spice{npc}` | drop the staged deal |
| `spice_report` | `report_spice{dealer}` | `improveDisposition` + complete the contract |

`SpiceTrade` (pure) computes the side (`spiceDealSide`), base prices (`spiceBuyPrice`/
`spiceResaleBase`), the haggle factor (`spiceHaggleFactor`) and the clamp
(`clampSpicePrice`). The Resolver gates each (`not_dealer`/`not_addict`/`no_spice`/
`no_spice_contract`/`dead_target`) and a commit with no prior staging stages-then-
executes in one turn (implicit pricing, like `commerce_buy`). The verbal classifier
learns the six verbs (questions/offers → discovery/pricing, never a close); the
dealer/addict NPC turn gets latent **levers** via `PromptBuilder.buildSpiceContext`
through the same `extraContext` seam as commerce. The addict "crave" lever only
surfaces when the player is actually holding spice (keeps idle prompts under
`GRADUATION_THRESHOLD_CHARS` — Lesson 61).

## Consequences
- A non-combat money loop driven by social exploration (finding addicts) + the
  Comércio skill. The profit is the spread; the relationship bump rewards being a
  reliable distributor.
- **Pure cores** (`SpiceTrade` + Resolver/Applier branches) are 100%/branch-tested;
  the scene wiring (`buySpice`/`sellSpice`/`reportSpice`, context assembly) is
  browser-only `istanbul ignore`d.
- Awaiting an Electron playtest. **Deferred:** spice as a combat/addiction status
  effect; addict NPCs autonomously seeking dealers; territory/quota mechanics.

## Files
`src/systems/economy/SpiceTrade.ts` (new), `src/systems/actions/{Verbs,Mutations,
Resolver,Applier}.ts`, `src/entities/items/ItemCatalog.ts`, `src/entities/NPCAgent.ts`,
`src/assets/world/ThemeRegistry.ts`, `src/entities/npcs/{zara,mback}.ts`,
`src/systems/{SaveService,I18n}.ts`, `src/core/GameSession.ts`,
`src/systems/npc/PromptBuilder.ts`, `src/scenes/GameWorldScene.ts`.
