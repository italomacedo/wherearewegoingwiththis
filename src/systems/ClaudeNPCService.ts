import { v4 as uuidv4 } from 'uuid';
import { NPCAgent } from '@entities/NPCAgent';
import { PromptBuilder, WorldSnapshot } from '@systems/npc/PromptBuilder';
import { ActionClassification, parseActionClassification } from '@systems/npc/EmoteIntent';
import { CommerceParse, parseCommerceResponse } from '@systems/economy/Commerce';
import { VerbalClassification, parseVerbalClassification } from '@systems/actions/VerbalIntent';
import { estimateTokens } from '@systems/TokenMeter';

/**
 * IPC query params — structurally matches electron/preload.ts ClaudeQueryParams.
 * Defined here to avoid crossing the Electron project-reference boundary.
 */
export interface ClaudeQueryParams {
  npcId: string;
  prompt: string;
  claudePath: string;
  sessionId?: string;
  useSession?: boolean;
  /**
   * Continue an existing session (--resume) instead of creating it (--session-id).
   * `--session-id <uuid>` may only CREATE a session once; reusing it errors with
   * "Session ID ... is already in use". Set true on every session turn after the
   * first (graduation) call.
   */
  resumeSession?: boolean;
  /** Static NPC persona passed as --system-prompt for prompt caching. */
  systemPrompt?: string;
  /** Model alias (e.g. 'haiku') for --model — cheap model for game NPC calls. */
  model?: string;
  /** Reasoning effort (e.g. 'low') for --effort — minimizes thinking tokens. */
  effort?: string;
}

/**
 * Model used for ALL in-game Claude calls. Haiku is the cheapest tier and is
 * ample for NPC dialogue + the trivial classifiers (moderation/action/intent/
 * gossip). Owner's call (Fase 14E): "Haiku em tudo".
 */
export const NPC_MODEL = 'haiku';

/**
 * Reasoning effort for ALL in-game Claude calls. 'low' minimizes thinking
 * tokens (cheaper + faster) — ample for short NPC dialogue + the trivial
 * classifiers. Owner's call (Fase 14E). Levels: low|medium|high|xhigh|max.
 */
export const NPC_EFFORT = 'low';

/** Minimal slice of the Electron API this service needs (injectable for tests). */
export interface ClaudeBridge {
  claudeQuery: (params: ClaudeQueryParams) => Promise<void>;
  claudeCancel: (npcId: string) => Promise<void>;
  onClaudeResponseChunk: (cb: (data: { npcId: string; chunk: string }) => void) => () => void;
  onClaudeResponseDone: (cb: (data: { npcId: string; code: number | null }) => void) => () => void;
}

export interface ClaudeNPCServiceOptions {
  claudePath: string;
  bridge: ClaudeBridge;
  sessionIdFactory?: () => string;
}

/**
 * Orchestrates one NPC conversation turn through the Claude CLI (via Electron IPC).
 * Decides stateless vs session mode (ADR-0010), streams chunks, records the exchange.
 */
export class ClaudeNPCService {
  private claudePath: string;
  private bridge: ClaudeBridge;
  private sessionIdFactory: () => string;

  constructor(opts: ClaudeNPCServiceOptions) {
    this.claudePath = opts.claudePath;
    this.bridge = opts.bridge;
    this.sessionIdFactory = opts.sessionIdFactory ?? ClaudeNPCService.defaultSessionId;
  }

  /**
   * Send a player message to the NPC and stream Claude's reply.
   * @param onChunk optional progressive callback for each streamed chunk
   * @returns the full NPC reply text
   */
  async query(
    agent: NPCAgent,
    world: WorldSnapshot,
    playerMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (agent.isBusy()) {
      throw new Error(`NPC '${agent.definition.id}' is already responding.`);
    }

    const params = this.buildQueryParams(agent, world, playerMessage);

    agent.beginResponse();
    let response = '';
    const npcId = agent.definition.id;

    const offChunk = this.bridge.onClaudeResponseChunk((data) => {
      if (data.npcId !== npcId) return;
      response += data.chunk;
      onChunk?.(data.chunk);
    });

    ClaudeNPCService.traceFire('npc-turn', npcId, params.prompt, params.systemPrompt);
    try {
      await this.bridge.claudeQuery(params);
    } finally {
      offChunk();
    }

    const text = response.trim();
    ClaudeNPCService.traceDone('npc-turn', npcId, params.prompt, text, params.systemPrompt);
    agent.conversation.recordExchange(playerMessage, text);
    agent.endResponse();
    return text;
  }

  /**
   * Pre-screen a player message against Anthropic's Usage Policy via a one-word
   * ALLOW/BLOCK classifier call. Returns true if the message is allowed.
   * Fails OPEN (returns true) on any error so a moderation hiccup never blocks play.
   */
  async moderate(npcId: string, message: string): Promise<boolean> {
    const modId = `${npcId}::moderation`;
    const prompt = PromptBuilder.buildModerationPrompt(message);
    let response = '';
    const offChunk = this.bridge.onClaudeResponseChunk((data) => {
      if (data.npcId !== modId) return;
      response += data.chunk;
    });
    ClaudeNPCService.traceFire('moderate', modId, prompt);
    try {
      await this.bridge.claudeQuery({ npcId: modId, prompt, claudePath: this.claudePath, model: NPC_MODEL, effort: NPC_EFFORT });
    } catch {
      return true; // fail-open
    } finally {
      offChunk();
    }
    ClaudeNPCService.traceDone('moderate', modId, prompt, response);
    // Blocked only on an explicit BLOCK verdict; anything else allows play.
    return !/\bBLOCK\b/i.test(response);
  }

  /**
   * Classify an emote-bearing player action: DETERMINISTIC (resolve via a cRPG
   * check — with the fitting skill/attribute + difficulty) vs NARRATIVE
   * (roleplay → normal chat). One-shot; fails OPEN to NARRATIVE.
   */
  async classifyAction(npcId: string, message: string): Promise<ActionClassification> {
    try {
      const raw = await this.oneShot(`${npcId}::action`, PromptBuilder.buildActionClassifierPrompt(message), 'action-classify');
      return parseActionClassification(raw);
    } catch {
      return { deterministic: false, skillId: null, attribute: null, difficulty: 50, hostile: false, effect: 'none', target2: null, dir: null };
    }
  }

  /**
   * Verbal classifier (Fase 21). For SPEECH messages (no `*emote*`) the player
   * directs at an NPC: detects job/commerce/social verbs (15 + narrative) plus
   * a target/item/price/dir per the verb's needs. One-shot; fails OPEN to
   * `narrative` (the no-op fall-through) so a CLI failure never blocks the
   * conversation.
   *
   * `pendings` carries the NPC's open offers (trades / missions) so the
   * classifier can disambiguate "yes, deal" / "I'll take it" against the
   * actual pending — see `parseVerbalClassification`.
   */
  async classifyVerbal(
    npcId: string, npcName: string, message: string,
    sellableIds: string[], rivalIds: string[],
    pendings: { kind: 'trade' | 'mission'; status?: 'pending' | 'active'; itemId?: string; targetId?: string }[] = [],
    spice: { addict: boolean; playerHasSpice: boolean } = { addict: false, playerHasSpice: false },
  ): Promise<VerbalClassification> {
    try {
      const prompt = PromptBuilder.buildVerbalClassifierPrompt(message, npcName, sellableIds, rivalIds, pendings, spice);
      const raw = await this.oneShot(`${npcId}::verbal`, prompt, 'verbal-classify');
      return parseVerbalClassification(raw, { sellableIds, rivalIds });
    } catch {
      return { verb: 'narrative', target: null, itemId: null, proposedPrice: null, dir: null };
    }
  }

  /**
   * One-shot commerce classifier (Phase 16): does the exchange contain a trade /
   * mission offer the player accepted? Fails OPEN to a no-op parse on CLI error.
   */
  async classifyCommerce(
    npcId: string, npcReply: string, playerMessage: string,
    sellableIds: string[], rivalIds: string[],
  ): Promise<CommerceParse> {
    const noop: CommerceParse = { offer: 'none', itemId: null, targetId: null, rewardItemId: null, rewardCredits: 0, accept: false };
    try {
      const prompt = PromptBuilder.buildCommerceClassifierPrompt(npcReply, playerMessage, sellableIds, rivalIds);
      const raw = await this.oneShot(`${npcId}::commerce`, prompt, 'commerce-classify');
      return parseCommerceResponse(raw, { sellableIds, rivalIds });
    } catch {
      return noop;
    }
  }

  /** One-shot free-text generation (e.g. ambient narration). Fails to '' on error. */
  async narrate(id: string, prompt: string): Promise<string> {
    try {
      return await this.oneShot(`${id}::ambient`, prompt, 'narrate');
    } catch {
      return '';
    }
  }

  /** One-shot intent deliberation (autonomous). Fails to '' → parses as `stay`. */
  async deliberate(npcId: string, prompt: string): Promise<string> {
    try {
      return await this.oneShot(`${npcId}::intent`, prompt, 'deliberate');
    } catch {
      return '';
    }
  }

  /** One-shot gossip line an NPC speaks to another NPC. Fails to '' on error. */
  async gossip(npcId: string, prompt: string): Promise<string> {
    try {
      return await this.oneShot(`${npcId}::gossip`, prompt, 'gossip');
    } catch {
      return '';
    }
  }

  /** Run a single prompt and return the full trimmed reply (no session, no history). */
  /**
   * Pin a minimal system prompt on EVERY one-shot call (narrate/classify/intent/
   * gossip). Without it the Claude CLI falls back to its default Claude Code system
   * prompt and the model can leak "I'm Claude Code, built to help with software
   * engineering…" instead of the game narration/label (Lesson 40 — applied to NPC
   * turns already, missing on one-shots until now).
   */
  private static readonly ONE_SHOT_SYSTEM =
    "You are the game-engine narrator/classifier for a cyberpunk roleplay RPG. " +
    "Respond ONLY in the format the user's prompt requires (a short narration or a structured label set). " +
    "Stay fully in the fictional frame. Never break character, never mention you are an AI, " +
    "never offer software-engineering or assistant services, never reveal a name like 'Claude'. " +
    "If the prompt asks for narration, output ONLY the narration with no preamble. " +
    "If the prompt asks for structured lines, output ONLY those lines.";

  private async oneShot(id: string, prompt: string, label = 'one-shot'): Promise<string> {
    let response = '';
    const offChunk = this.bridge.onClaudeResponseChunk((data) => {
      if (data.npcId === id) response += data.chunk;
    });
    const systemPrompt = ClaudeNPCService.ONE_SHOT_SYSTEM;
    ClaudeNPCService.traceFire(label, id, prompt, systemPrompt);
    try {
      await this.bridge.claudeQuery({
        npcId: id, prompt, claudePath: this.claudePath, model: NPC_MODEL, effort: NPC_EFFORT,
        systemPrompt,
      });
    } finally {
      offChunk();
    }
    const text = response.trim();
    ClaudeNPCService.traceDone(label, id, prompt, text, systemPrompt);
    return text;
  }

  /**
   * Dev observability: log when each Claude prompt fires and a token ESTIMATE of
   * the prompt and reply (the CLI runs with `--print`, so there is no real usage
   * count). Browser/Electron only — silent in tests/headless.
   */
  /* istanbul ignore next — dev console logging, browser/Electron only */
  private static traceFire(label: string, id: string, prompt: string, systemPrompt?: string): void {
    if (typeof document === 'undefined') return;
    const sysTok = systemPrompt ? ` · sys ~${estimateTokens(systemPrompt)} tok` : '';
    console.warn(`[Claude] ▶ ${label} id=${id}${sysTok} · prompt ~${estimateTokens(prompt)} tok (${prompt.length} chars)`);
  }

  /* istanbul ignore next — dev console logging, browser/Electron only */
  private static traceDone(label: string, id: string, prompt: string, reply: string, systemPrompt?: string): void {
    if (typeof document === 'undefined') return;
    const pt = estimateTokens(prompt) + (systemPrompt ? estimateTokens(systemPrompt) : 0);
    const rt = estimateTokens(reply);
    console.warn(`[Claude] ✓ ${label} id=${id} · reply ~${rt} tok (${reply.length} chars) · turn ~${pt + rt} tok`);
  }

  /** Cancel an in-flight NPC response. */
  async cancel(agent: NPCAgent): Promise<void> {
    await this.bridge.claudeCancel(agent.definition.id);
    agent.endResponse();
  }

  /** Builds the IPC params, applying the stateless→session strategy. */
  private buildQueryParams(
    agent: NPCAgent,
    world: WorldSnapshot,
    playerMessage: string
  ): ClaudeQueryParams {
    const ctx = agent.conversation;
    const history = ctx.getRecentHistory();
    const definition = agent.definition;
    const mood = agent.getMood();
    const language = world.language ?? 'English';

    // Static persona — passed as --system-prompt for prompt-cache efficiency.
    const systemPrompt = PromptBuilder.buildStaticPersona(definition, language, world.cityName);

    const statelessInputs = { definition, mood, world, history, playerMessage };
    // Full prompt (persona + dynamic) used only for graduation size check.
    const statelessPrompt = PromptBuilder.buildStateless(statelessInputs);

    const modeBefore = ctx.getMode();
    ctx.evaluateGraduation(statelessPrompt.length, this.sessionIdFactory);
    const modeAfter = ctx.getMode();

    if (modeAfter === 'stateless') {
      // Send only the dynamic context as stdin; persona goes via --system-prompt.
      return {
        npcId: definition.id,
        prompt: PromptBuilder.buildDynamicContext(statelessInputs),
        claudePath: this.claudePath,
        systemPrompt,
        model: NPC_MODEL,
        effort: NPC_EFFORT,
      };
    }

    // session mode
    const sessionTurn = PromptBuilder.buildSessionTurn(world, playerMessage);
    const justGraduated = modeBefore === 'stateless' && modeAfter === 'session';
    const prompt = justGraduated
      ? `${PromptBuilder.buildSessionPrimer({ definition, mood, world, history })}\n\n${sessionTurn}`
      : sessionTurn;

    return {
      npcId: definition.id,
      prompt,
      claudePath: this.claudePath,
      sessionId: ctx.getSessionId() ?? undefined,
      useSession: true,
      // Create the session on the graduation call (--session-id), resume it after
      // (--resume) — reusing --session-id errors "already in use".
      resumeSession: !justGraduated,
      // Persona MUST ride every turn: `--resume` does NOT re-apply the session's
      // original `--system-prompt`, so without it the model reverts to its default
      // Claude Code identity (NPC breaks character). The text is identical each turn,
      // so the API prompt-caches it (5-min TTL) — correctness with ~no extra cost.
      systemPrompt,
      model: NPC_MODEL,
      effort: NPC_EFFORT,
    };
  }

  /* istanbul ignore next — deterministic factory injected in tests */
  private static defaultSessionId(): string {
    return uuidv4();
  }
}
