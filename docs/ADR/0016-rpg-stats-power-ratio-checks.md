# ADR-0016 — RPG foundation: attributes/skills/perks + power-ratio checks

**Status:** Accepted (Phases 3–4). Combat that consumes this lands later (turn-based).

## Context

The game needs an RPG layer (attributes, skills, perks) feeding a future turn-based
combat, plus a resolution model for actions surfaced through the emote pipeline
(ADR-0011/0012). The owner specified the numbers and rules directly.

## Decision

**Model (`src/entities/CharacterStats.ts`, pure):**
- **4 attributes** (0–100%): Força, Destreza, Inteligência, Carisma. Start: 20% each,
  one chosen **primary = 30%**.
- **13 skills** (0–100%), each governed by an attribute. Start: pick **2 @40%, 3 @20%**,
  the rest at 10%.
- **Learning by doing:** a successful check nudges the used skill **and** its parent
  attribute by **+0.1% × the Options multiplier** (`skillGainMultiplier` 1/3/10×), capped 100.
  (Owner's rule: gain **only on success**.)
- **40 perks** = **5 tiers × 2 per attribute** (weak→broken). Each **20%** of an attribute
  unlocks a tier; the player **chooses 1** perk from it. Perk *effects* are deferred to combat.

**Check resolution (`src/systems/SkillCheck.ts`, pure, RNG-injectable):** the d100 had too
much variance (a weak character beat a strong one too often). Replaced by a **power-ratio**:
`P = atk^k / (atk^k + def^k)`, **k = 2** (configurable), then **one d100; success if < P×100**.
- `atk` = the relevant **skill%** if the action clearly fits one, else the **governing
  attribute%** (`checkValue` fallback). `def` = the opponent's value (contested) or a fixed
  **difficulty** (unresisted; default 50, 5 levels 20/35/50/65/80).
- Contested = a **single** roll vs `P(actor wins)` (never one roll per side).
- **Modifiers** (buffs/debuffs/cover) are **±N on each side's effective value** before the
  ratio (medium cover +20, full +40), floored so nothing locks at 0/100%.
- Stat gap dominates; luck only decides close calls; nothing is ever a hard 0/100%.

**Emote → check (Phase 4, `GameWorldScene` + `PromptBuilder`/`ClaudeNPCService`):** after
moderation, a structured classifier returns VERDICT + SKILL/ATTR/DIFF; a DETERMINISTIC emote
runs `resolveCheck`, applies learning-on-success, has Claude **narrate the outcome with no
numbers**, then the addressed NPC reacts. **Diegetic health:** a self-exam emote runs a Medicina
check — a coarse honest read always (`coarseCondition`), upgraded to a precise band on success
(`Health.describeCondition`/`conditionBand`).

**Persistence:** `CharacterData.stats`; `SaveService.migrate` backfills a default sheet;
`GameSession` carries it. **Creator UI:** attribute picker (primary 30%), starting-skill picker
(2×40/3×20 with caps via `toggleStartingSkill`), tier-1 perk picks.

## Consequences

- The whole model + resolution are pure and unit-tested; only AnimationGroup/DOM/Claude code
  is `istanbul ignore`d. Registries are the single source of truth (mirrors SLOT/MORPH pattern).
- Combat (turn-based) will consume perk effects, contested checks, and `attack` intents.
- `k` and the skill-gain multiplier are tunable knobs for balance.
