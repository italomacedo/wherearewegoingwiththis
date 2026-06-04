# ADR-0026 — Token economy (Claude CLI cost reduction)

**Status:** Accepted — Fase 14 (14A–14E) implemented, owner-validated in Electron, **MERGED to `main`**
(`feat/token-economy`, merge `7bf6417`). 1219 tests, ~97/90 coverage, typecheck + build green.

## Context

Every NPC interaction spawns a `claude --print` subprocess (ADR-0004). A token audit of a typical
10-minute session (3 player messages, 2 NPCs, no gossip) found ~3.5k tokens, dominated by:

1. **Static persona repeated every stateless turn** (~370 tok) — `buildStateless` re-sent the NPC's
   name/role/personality/backstory/routine/relationships + response rules on every turn. Session mode
   (a 2-4 tok/turn delta) was only reached after 6000 accumulated chars — many short chats never got there.
2. **Verbose classifier boilerplate** — moderation (~160 tok), action classifier (~245 tok), intent
   deliberation (~315 tok) carried long explanatory paragraphs the model doesn't need to parse the output.
3. **No model/effort control** — all calls used the CLI default (Sonnet-tier, default effort).
4. **The killer hidden cost:** the child was spawned with the Electron `cwd` = the project dir, so
   Claude Code **auto-discovered and injected the project `CLAUDE.md` (~15k tokens) + auto-memory into
   every NPC call**.

The owner asked specifically about cheaper models and "low effort", which surfaced levers 3 and 4.

## Decisions

- **Earlier session graduation + tighter history window** (14A). `GRADUATION_THRESHOLD_CHARS` 6000 → **2500**
  (session mode after ~2-3 exchanges instead of potentially never); `PROMPT_HISTORY_WINDOW` 5 → **3**.
- **Compress classifier/response boilerplate** (14B) without changing the parsed output format
  (ALLOW/BLOCK, VERDICT/SKILL/ATTR/DIFF/HOSTILE, INTENT/TARGET). Moderation 9→4 lines, action
  classifier 13→12, intent 13→10, stateless response rules 4 sentences→1, ambient narration 5→3.
- **Static persona via `--system-prompt`** (14C). `PromptBuilder.buildStaticPersona(def, lang, cityName)`
  (pure) holds the unchanging persona; `buildDynamicContext(inputs)` sends only mood/time/events/history/
  message as stdin. `ClaudeQueryParams.systemPrompt` is threaded through `electron/preload.ts` →
  `electron/main.ts` spawn args (`--system-prompt`). This both lets the Claude API **prompt-cache** the
  identical persona for 5 minutes AND **replaces Claude Code's large default coding-agent system prompt**.
  Graduation (first session) call includes the persona; subsequent session turns omit it (session carries it).
- **`--model haiku` + `--effort low` on ALL NPC calls** (14E, owner: "Haiku em tudo"). Haiku is the
  cheapest tier (~3-12× cheaper/token than Sonnet) and ample for dialogue + the trivial classifiers;
  `--effort low` (levels `low|medium|high|xhigh|max`) minimizes reasoning/thinking output tokens.
  `NPC_MODEL`/`NPC_EFFORT` constants → `ClaudeQueryParams.model`/`.effort` → spawn args.
- **Spawn `cwd = os.tmpdir()`** (14E) so Claude Code does NOT auto-discover the project `CLAUDE.md`.
  `--bare` would also skip it but forces `ANTHROPIC_API_KEY` auth (no OAuth/keychain) — rejected because
  the owner uses the globally-installed CLI login; `cwd` is auth-agnostic.
- **Session create-vs-resume** (fix). `--session-id <uuid>` only CREATES a session; reusing it errors
  `Session ID ... is already in use`. So the graduation call uses `--session-id` (create) and every
  subsequent session turn uses `--resume <uuid>` (`ClaudeQueryParams.resumeSession = !justGraduated`).
  This bug was latent at the 6000-char threshold; lowering to 2500 surfaced it.

## Consequences

- **~37% fewer tokens transmitted** (graduation + history + compression) + **~56% cheaper on cache hits**
  (`--system-prompt`) + **Haiku pricing** (~3-12× cheaper/token) + **`--effort low`** (minimal reasoning
  output) + **no ~15k-token CLAUDE.md per call** (tmpdir cwd). Combined, a large multiplicative cut.
- NPC dialogue runs on Haiku (owner's explicit choice for minimum cost); quality is lower than Sonnet
  but validated as acceptable in Electron.
- Player-driven calls still bypass the autonomy throttle (`ClaudeCallQueue`) — human typing rate limits them.
- `--effort`/`--model`/`--system-prompt`/`--resume`/`cwd` are all owner-configurable in code via the
  `NPC_MODEL`/`NPC_EFFORT` constants; no Options UI was added (could be a future enhancement).

## Files

- `src/systems/npc/ConversationContext.ts` — `GRADUATION_THRESHOLD_CHARS=2500`, `PROMPT_HISTORY_WINDOW=3`.
- `src/systems/npc/PromptBuilder.ts` — `buildStaticPersona`/`buildDynamicContext`; compressed prompts;
  `buildSessionPrimer` no longer carries the persona.
- `src/systems/ClaudeNPCService.ts` — `ClaudeQueryParams.{systemPrompt,model,effort,resumeSession}`;
  `NPC_MODEL='haiku'`, `NPC_EFFORT='low'`; `buildQueryParams` wires create-vs-resume + persona split;
  `traceFire`/`traceDone` log `sys ~N tok` separately.
- `electron/preload.ts` — mirrored `ClaudeQueryParams` fields.
- `electron/main.ts` — spawn adds `--system-prompt`/`--model`/`--effort`, `--session-id` vs `--resume`,
  and `options.cwd = os.tmpdir()`.
- Tests: `tests/unit/systems/npc/PromptBuilder.test.ts`, `tests/unit/systems/ClaudeNPCService.test.ts`.

See also Lesson 40 in `CLAUDE.md` for the hard-won pitfalls (CLI flag verification, `--system-prompt`
vs CLAUDE.md being separate injections, session create-vs-resume lifecycle).
