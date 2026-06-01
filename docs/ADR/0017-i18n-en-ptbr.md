# ADR-0017 — In-house i18n (EN / pt-BR), UI + NPC

**Status:** Accepted.

## Context

The UI was a mix of English and Portuguese with no real localization. The owner wants
a single language setting (default English, switchable to pt-BR) that drives **both** the
UI **and** the NPC's replies (if pt-BR, the NPC answers in pt-BR).

## Decision

A **lightweight in-house** i18n (no dependency) — `src/systems/I18n.ts`:
- A flat catalog `STRINGS[key] = { en, 'pt-BR' }`; `t(key, params?)` resolves against the
  current locale, falls back to English then to the key, and interpolates `{name}`.
- The locale is cached and read lazily from **`SettingsService.language`** (`'en' | 'pt-BR'`,
  default `'en'`); `setLocale` updates cache + persists; `resetLocale` clears the cache (tests).
- `languageName(locale)` → the human-readable name injected into prompts.
- **Single setting** (UI + NPC together), per the owner.

**Options:** a Language toggle (Game tab) that **re-translates the screen live** (`rebuildUI`).

**NPC + narration follow the language:** `WorldSnapshot.language` threads into the
stateless/session prompts (`Respond in {language}`); ambient + outcome narration take a
language arg. **Internal classifiers (moderation, action determinism) stay English** — they
only emit labels (ALLOW/BLOCK, VERDICT/SKILL/…), so the player never sees them.

**Scope:** swept all player-facing UI — HUD, dialog, pause, creator, options, main menu,
load — plus **RPG labels by id** (4 attributes, 13 skills, all 40 perks). Pure schema labels
(creator) map English→key via small lookup tables; perk display falls back to the registry
label when a key is missing (`hasKey`).

## Consequences

- `t()` is cheap (cached locale); all logic is pure and unit-tested. Tests that change the
  locale must call `resetLocale()` in teardown (Jest isolates modules per file otherwise).
- Adding a string = one catalog entry + a `t('key')` call site. Adding a locale = a third
  column in `Entry` + `languageName`/`LANGUAGE_LABELS`.
- Branding (splash/studio/publisher) and the game title are intentionally left untranslated.
