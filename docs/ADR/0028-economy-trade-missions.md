# ADR-0028 — Economy: chat-driven trade + kill-contract missions

**Status:** Accepted — Fase 16 implemented on branch `feat/economy` (awaiting Electron playtest + merge).
1275 tests, ~97/90 coverage, typecheck + build green.

## Context

The player loots **credsticks** from defeated NPCs but they had no use. The owner wanted money to matter:
NPCs that don't hate the player **sell** their own gear for credits, and can offer a **kill-contract** against
a rival NPC for a money/item reward. Valuation is **fixed** (no market). Crucially, trade and contracts are
the **agent's non-deterministic decision in conversation** — the game must not pre-script offers; it only
feeds the NPC the *levers* and validates/executes whatever the player agrees to.

## Decisions (owner-locked)

- **Currency = the `credstick` item** (1 credit each). Balance = credstick count; buying/rewards add/remove
  credsticks. No separate balance field.
- **Trade is open to any NPC that does not hate the player** (`canTrade` = disposition ≠ `hostile`).
  Discount comes from the **two highest tiers**: `friendly` ("ama") −30%, `neutral` ("gosta") −15%; **`wary`
  trades at full price**. The agent chooses *which* items to offer; **price is always fixed** (catalog value
  × (1 − discount)) — the LLM never sets prices.
- **Offers are agent-driven.** The NPC's turn is given latent **commerce context** (sellable items + prices,
  present rivals it's wary/hostile toward, what it could pay) framed as *"only bring it up if the player
  steers there"*. It is never a pushed offer.
- **Execution is validated deterministically.** A structured **commerce classifier** reads the NPC line +
  player reply → `OFFER/ITEM/TARGET/REWARD_*/ACCEPT`. The game tracks a **pending offer** and, on the
  player's acceptance, executes: trade transfers the item and moves credits player→NPC; a mission reward is
  **validated/clamped against the giver's real inventory** (held item, or credits ≤ its balance) so the LLM
  can't invent loot.
- **Mission target** = a present NPC the giver is wary/hostile toward (its NPC→NPC ledger). **Completing**
  it (target defeated) transfers the reward giver→player and **improves the giver's disposition one step**.

## Implementation

- **Pure cores (100% tested):** `systems/economy/Economy.ts` (`discountFor`/`priceFor`/`canTrade`/
  `canOfferMission`/`sellableItems` + credit helpers over the credstick stack); `Missions.ts`
  (`validateMissionOffer`/`completeMission`/`missionId`); `Commerce.ts` (`parseCommerceResponse`, id-validated).
  `ItemCatalog` gains fixed `value` (+ `ITEM_VALUES`/`itemValue`); `NPCAgent.improveDisposition`.
- **Prompt:** `PromptBuilder.buildCommerceContext` (levers) + `buildCommerceClassifierPrompt` (6 fixed lines);
  injected per-turn via `WorldSnapshot.extraContext`.
- **Service:** `ClaudeNPCService.classifyCommerce` (`--model haiku`/`--effort low`, **fail-open**) +
  `NPCManager.classifyCommerce`/`liveNpcIds` delegates.
- **Scene (browser-only):** `GameWorldScene.maybeHandleCommerce` (after a negotiable NPC reply) →
  pending trade/mission → `executePendingTrade`/`acceptPendingMission`; `completeMissionsAgainst` on an NPC's
  defeat. `commerceContextFor` builds the levers per disposition.
- **Persistence:** `SaveGame.missions` + migrate backfill `[]` + `updateMissions`; `GameSession.missions`;
  persisted via `persistSession`. NPC inventories already persist (Phase 9), so a sold/rewarded item sticks.

## Consequences

- A full loop emerges: loot credits → buy gear from a friendly vendor at a discount; or take a contract from
  a non-hostile NPC → kill the rival → get paid + warmer relations. No market sim — fixed prices.
- Commerce adds one gated Claude call per turn **only for negotiable NPCs** (skipped for hostile chats);
  fail-open + Haiku/low keep it cheap. Player-driven, so it bypasses the autonomy throttle.
- The classifier can misread; the deterministic validation (fixed price, grounded reward, id allow-lists)
  bounds the blast radius — a bad parse degrades to a no-op offer.

## Deferred

- A dedicated trade/shop UI (this phase is chat-only); haggling; sell-to-NPC (player→NPC sales); mission
  chains / multi-objective contracts; reputation beyond the 4-level disposition; NPC restocking; credit sinks
  beyond buying (implants, Zara shop economy).
