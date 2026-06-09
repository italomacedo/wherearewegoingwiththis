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
  **modulated** by a Comércio-vs-Carisma haggle check + a friendlier-addict premium
  (`spiceResaleUnit`); failure = no penalty.
- **Report = handshake, no verification.** Returning to the originating dealer and
  saying "sold it all" improves that dealer's disposition one step and completes
  the contract. We deliberately do NOT verify how much was actually resold.
- **Persistence:** a separate `SaveGame.spiceContracts: SpiceContract[]` (one active
  per dealer), backfilled `[]` by `migrate`; carried by `GameSession`.

### Pipeline (reuses the Fase 21 unified Resolver/Applier)
Three new **VERBAL** verbs + three **mutations** + three `ApplierContext` methods:

| Verb | Mutation | Effect |
|---|---|---|
| `spice_buy` | `buy_spice{dealer,qty,unitPrice}` | credits player→dealer, spice dealer→player, open/​top-up a contract |
| `spice_sell` | `sell_spice{buyer,qty,unitPrice}` | spice player→addict, credits addict→player (clamped to the addict's funds) |
| `spice_report` | `report_spice{dealer}` | `improveDisposition` + complete the contract |

The Resolver gates each (`not_dealer`/`not_addict`/`no_spice`/`cannot_afford`/
`no_spice_contract`/`dead_target`) and rolls the resale Comércio check inline (XP
emitted on success OR failure). The verbal classifier learns the three verbs; the
dealer/addict NPC turn gets latent **levers** via `PromptBuilder.buildSpiceContext`
(offer a shipment / nudge a report / hint they'd buy) injected through the same
`extraContext` seam as commerce. The addict "crave" lever only surfaces when the
player is actually holding spice (keeps idle prompts under
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
