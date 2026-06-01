import { Vector3 } from '@babylonjs/core';
import { NPCAgent, NPCDefinition, PlayerAction } from '@entities/NPCAgent';
import { ClaudeNPCService } from '@systems/ClaudeNPCService';
import { WorldSnapshot, PromptBuilder } from '@systems/npc/PromptBuilder';
import { ConversationContext, ConversationState } from '@systems/npc/ConversationContext';
import { ActionClassification } from '@systems/npc/EmoteIntent';
import { NPCDisposition } from '@entities/NPCAgent';

export const COOLDOWN_SECONDS = 3;

/** A persisted NPC's memory: its conversation plus its dynamic disposition. */
export type NPCMemoryEntry = ConversationState & { disposition?: NPCDisposition };
export type NPCMemoryMap = Record<string, NPCMemoryEntry>;

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
    if (!this.service) return { deterministic: false, skillId: null, attribute: null, difficulty: 50 };
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
