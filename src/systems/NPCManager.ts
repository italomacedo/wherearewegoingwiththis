import { Vector3 } from '@babylonjs/core';
import { NPCAgent, NPCDefinition, PlayerAction } from '@entities/NPCAgent';
import { ClaudeNPCService } from '@systems/ClaudeNPCService';
import { WorldSnapshot, PromptBuilder } from '@systems/npc/PromptBuilder';
import { ConversationContext, ConversationState } from '@systems/npc/ConversationContext';
import { ActionClassification } from '@systems/npc/EmoteIntent';
import { NPCDisposition } from '@entities/NPCAgent';
import { IntentCandidate, NPCIntent, parseIntent } from '@systems/npc/Intent';
import { ClaudeCallQueue } from '@systems/ClaudeCallQueue';

export const COOLDOWN_SECONDS = 3;

/** A persisted NPC's memory: its conversation plus its dynamic disposition. */
export type NPCMemoryEntry = ConversationState & { disposition?: NPCDisposition };
export type NPCMemoryMap = Record<string, NPCMemoryEntry>;

/** A queued autonomous job (currently only deliberation runs through the queue). */
export interface AutonomyJob {
  agentId: string;
  kind: 'deliberation';
}

/** Per-tick context the scene supplies to the autonomy mechanism. */
export interface AutonomyContext {
  /** Human-readable time-of-day label injected into the deliberation prompt. */
  gameTimeLabel: string;
  /** Whether the player is present in the scene. */
  playerPresent: boolean;
  /** Deliberation cooldown per NPC, ms (= reflection interval). */
  reflectionMs: number;
  /** Reply language for any text (gossip). */
  language: string;
  /** Other NPCs near a given agent the agent could approach/attack. */
  nearbyOf: (agent: NPCAgent) => IntentCandidate[];
}

/** What one autonomy tick did. */
export interface AutonomyResult {
  /** NPCs that flagged an immediate attack intent (hostile + player present). */
  attackers: string[];
  /** How many deliberation jobs were newly enqueued this tick. */
  enqueued: number;
  /** The agent + intent produced if a deliberation dispatched this tick, else null. */
  deliberated: { agentId: string; intent: NPCIntent } | null;
}

/**
 * Owns the active NPCs in a zone: spawns them, updates proximity each frame,
 * routes player messages through ClaudeNPCService, and manages cooldown timers.
 * Save/load of conversation memory goes through (de)serialize helpers.
 */
export class NPCManager {
  private agents = new Map<string, NPCAgent>();
  private cooldowns = new Map<string, number>();
  private service: ClaudeNPCService | null;

  constructor(service: ClaudeNPCService | null = null) {
    this.service = service;
  }

  spawn(definition: NPCDefinition, conversation?: ConversationContext): NPCAgent {
    const agent = new NPCAgent(definition, conversation);
    this.agents.set(definition.id, agent);
    return agent;
  }

  getAgent(id: string): NPCAgent | null {
    return this.agents.get(id) ?? null;
  }

  getAgents(): NPCAgent[] {
    return [...this.agents.values()];
  }

  /** Per-frame update: proximity states + cooldown timers. */
  update(playerPos: Vector3, playerAction: PlayerAction, dt: number): void {
    this.agents.forEach((agent) => {
      agent.updateProximity(playerPos, playerAction);

      const remaining = this.cooldowns.get(agent.definition.id);
      if (remaining !== undefined) {
        const next = remaining - dt;
        if (next <= 0) {
          this.cooldowns.delete(agent.definition.id);
          agent.endCooldown();
        } else {
          this.cooldowns.set(agent.definition.id, next);
        }
      }
    });
  }

  /** The nearest NPC the player can currently talk to, if any. */
  getConversableAgent(playerPos: Vector3): NPCAgent | null {
    let best: NPCAgent | null = null;
    let bestDist = Infinity;
    this.agents.forEach((agent) => {
      if (agent.canConverse(playerPos) && !agent.isBusy()) {
        const d = agent.distanceTo(playerPos);
        if (d < bestDist) {
          bestDist = d;
          best = agent;
        }
      }
    });
    return best;
  }

  /**
   * Send a player message to a specific NPC. Streams via onChunk, starts the
   * cooldown when the reply completes. Requires a ClaudeNPCService.
   */
  async sendMessage(
    npcId: string,
    world: WorldSnapshot,
    message: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const agent = this.agents.get(npcId);
    if (!agent) throw new Error(`NPC '${npcId}' not found.`);
    if (!this.service) throw new Error('NPCManager has no ClaudeNPCService configured.');

    const reply = await this.service.query(agent, world, message, onChunk);
    this.cooldowns.set(npcId, COOLDOWN_SECONDS);
    return reply;
  }

  /**
   * Pre-moderate a player message before it reaches the NPC. Returns true
   * (allow) when there is no Claude service configured.
   */
  async moderate(npcId: string, message: string): Promise<boolean> {
    if (!this.service) return true;
    return this.service.moderate(npcId, message);
  }

  /**
   * Classify an emote-bearing action: DETERMINISTIC (→ cRPG check, with the
   * fitting skill/attribute + difficulty) vs NARRATIVE (→ chat). Defaults to a
   * NARRATIVE classification when there is no Claude service.
   */
  async classifyAction(npcId: string, message: string): Promise<ActionClassification> {
    if (!this.service) return { deterministic: false, skillId: null, attribute: null, difficulty: 50, hostile: false };
    return this.service.classifyAction(npcId, message);
  }

  /** One-shot narration of a resolved deterministic action's outcome. */
  async narrateOutcome(message: string, success: boolean, language = 'English'): Promise<string> {
    if (!this.service) return '';
    return this.service.narrate('action', PromptBuilder.buildOutcomeNarrationPrompt(message, success, language));
  }

  /** One-shot ambient narration for the global chat's "react to surroundings". */
  async narrateAmbient(message: string, gameTime: string, surroundings: string, language = 'English'): Promise<string> {
    if (!this.service) return '';
    return this.service.narrate('world', PromptBuilder.buildAmbientReactionPrompt(message, gameTime, surroundings, language));
  }

  /** One-shot cinematic dramatization of a combat beat (no mechanics/numbers). */
  async narrateCombat(beat: string, language = 'English'): Promise<string> {
    if (!this.service) return '';
    return this.service.narrate('combat', PromptBuilder.buildCombatNarrationPrompt(beat, language));
  }

  // ─── Autonomy (Fase 5): deliberation + gossip, throttled ───────────────────

  /**
   * One autonomy tick (mechanism only — the caller gates it on the autonomy
   * setting and supplies the per-frame context). It: (1) flags an immediate
   * `attack` intent for any already-hostile NPC that sees the player (a stub —
   * no Claude call, no combat yet); (2) enqueues a throttled deliberation job
   * for each eligible NPC; (3) dispatches at most one job and runs it. Returns a
   * summary of what happened. Async because a dispatched deliberation calls Claude.
   */
  async tickAutonomy(
    queue: ClaudeCallQueue<AutonomyJob>,
    now: number,
    ctx: AutonomyContext,
  ): Promise<AutonomyResult> {
    const result: AutonomyResult = { attackers: [], enqueued: 0, deliberated: null };
    if (!this.service) return result;

    this.agents.forEach((agent) => {
      const id = agent.definition.id;
      if (agent.shouldInitiateCombat(ctx.playerPresent)) {
        agent.setIntent({ kind: 'attack' });
        result.attackers.push(id);
        return; // hostile NPCs don't deliberate — they're already committed
      }
      if (!NPCManager.isDeliberable(agent.getState())) return;
      const ok = queue.enqueue({
        id: `${id}:delib`,
        payload: { agentId: id, kind: 'deliberation' },
        cooldownKey: `${id}:deliberation`,
        cooldownMs: ctx.reflectionMs,
      });
      if (ok) result.enqueued += 1;
    });

    const job = queue.tryDispatch(now);
    if (job && job.payload.kind === 'deliberation') {
      const intent = await this.runDeliberation(job.payload.agentId, ctx);
      if (intent) result.deliberated = { agentId: job.payload.agentId, intent };
    }
    return result;
  }

  /** Run one NPC's intent deliberation through Claude and store the result. */
  async runDeliberation(agentId: string, ctx: AutonomyContext): Promise<NPCIntent | null> {
    const agent = this.agents.get(agentId);
    if (!agent || !this.service) return null;
    const nearby = ctx.nearbyOf(agent);
    const prompt = PromptBuilder.buildIntentPrompt({
      selfName: agent.definition.name,
      role: agent.definition.role,
      mood: agent.getMood(),
      disposition: agent.getDisposition(),
      gameTime: ctx.gameTimeLabel,
      nearbyNpcs: nearby,
      playerPresent: ctx.playerPresent,
    });
    const raw = await this.service.deliberate(agentId, prompt);
    const intent = parseIntent(raw, nearby.map((n) => n.id), ctx.playerPresent);
    agent.setIntent(intent);
    return intent;
  }

  /**
   * Run a short on-screen gossip exchange: `speaker` says a line to `listener`,
   * then `listener` replies. Both lines are recorded in each agent's memory.
   * Returns the two lines. No-op (empty) without a service.
   */
  async runGossip(speakerId: string, listenerId: string, language = 'English'): Promise<{ speaker: string; listener: string }> {
    const speaker = this.agents.get(speakerId);
    const listener = this.agents.get(listenerId);
    if (!speaker || !listener || !this.service) return { speaker: '', listener: '' };

    const sName = speaker.definition.name;
    const lName = listener.definition.name;
    const line1 = await this.service.gossip(
      speakerId,
      PromptBuilder.buildGossipPrompt(sName, lName, speaker.definition.relationships ?? '', null, language),
    );
    const line2 = await this.service.gossip(
      listenerId,
      PromptBuilder.buildGossipPrompt(lName, sName, listener.definition.relationships ?? '', line1 || null, language),
    );
    if (line1 || line2) {
      speaker.conversation.recordExchange(`(to ${lName})`, line1);
      listener.conversation.recordExchange(`(${sName}: ${line1})`, line2);
    }
    return { speaker: line1, listener: line2 };
  }

  /** An NPC may deliberate only when idle/aware (not mid-conversation or hostile). */
  private static isDeliberable(state: string): boolean {
    return state === 'idle' || state === 'aware';
  }

  // ─── Save / load memory ───────────────────────────────────────────────────

  serializeMemory(): NPCMemoryMap {
    const map: NPCMemoryMap = {};
    this.agents.forEach((agent, id) => {
      map[id] = { ...agent.conversation.toState(), disposition: agent.getDisposition() };
    });
    return map;
  }

  /** Returns a ConversationContext restored from saved memory, or a fresh one. */
  static restoreConversation(memory: NPCMemoryMap | undefined, npcId: string): ConversationContext {
    const state = memory?.[npcId];
    return state ? ConversationContext.fromState(state) : new ConversationContext();
  }

  /** The persisted disposition for an NPC, or the definition's fallback. */
  static restoreDisposition(
    memory: NPCMemoryMap | undefined,
    npcId: string,
    fallback: NPCDisposition,
  ): NPCDisposition {
    return memory?.[npcId]?.disposition ?? fallback;
  }

  dispose(): void {
    this.agents.clear();
    this.cooldowns.clear();
  }
}
