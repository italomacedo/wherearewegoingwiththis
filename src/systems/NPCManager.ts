import { Vector3 } from '@babylonjs/core';
import { NPCAgent, NPCDefinition, PlayerAction, TamperTrace } from '@entities/NPCAgent';
import { resolveCheck, RollFn, defaultRoll } from '@systems/SkillCheck';
import { SKILL_BASE } from '@entities/CharacterStats';
import { ClaudeNPCService } from '@systems/ClaudeNPCService';
import { WorldSnapshot, PromptBuilder } from '@systems/npc/PromptBuilder';
import { ConversationContext, ConversationState } from '@systems/npc/ConversationContext';
import { ActionClassification } from '@systems/npc/EmoteIntent';
import { CommerceParse } from '@systems/economy/Commerce';
import { NPCDisposition } from '@entities/NPCAgent';
import { IntentCandidate, NPCIntent, parseIntent } from '@systems/npc/Intent';
import { ClaudeCallQueue } from '@systems/ClaudeCallQueue';
import { InventoryState } from '@entities/Inventory';
import { HealthState } from '@entities/Health';

export const COOLDOWN_SECONDS = 3;

/**
 * A persisted NPC's memory: its conversation, its dynamic disposition toward the
 * player, and its relationship ledger toward other NPCs (8B).
 */
export type NPCMemoryEntry = ConversationState & {
  disposition?: NPCDisposition;
  relationships?: Record<string, NPCDisposition>;
  /** World events this NPC witnessed (e.g. "X was killed"), fed into its prompt. */
  events?: string[];
  /** Persisted inventory (Phase 9), so a looted corpse stays looted across reloads. */
  inventory?: InventoryState;
  /** Death status (Fase 18): a defeated NPC reloads dead, not alive. */
  defeated?: boolean;
  /** Pervasive HP (Fase 20): persists wounds across reloads and in/out of combat. */
  health?: HealthState;
  /** An unnoticed covert action against this NPC (Fase 20G): resolved on deliberation. */
  tamper?: TamperTrace;
  /** Rigged gear flag (Fase 20H): explodes on the NPC's first combat use. */
  sabotaged?: boolean;
  /** The NPC's last world position [x,y,z] (Fase 20): so a corpse stays where it fell
   *  and a moved NPC reloads in place, not back at the authored spawn point. */
  position?: [number, number, number];
  /** Whether the player has been formally introduced to this NPC (Fase 20):
   *  persisted so the name reveal survives reload (anti-metagaming break sticks). */
  nameKnown?: boolean;
};
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
  /** Which NPC ids belong to each streamed tile (Fase 17), keyed by "tx,tz". */
  private tileAgents = new Map<string, Set<string>>();
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
      // A defeated NPC is a searchable corpse — reachable even though it's "busy"/down.
      if (agent.canConverse(playerPos) && (!agent.isBusy() || agent.isDefeated())) {
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
    if (!this.service) return { deterministic: false, skillId: null, attribute: null, difficulty: 50, hostile: false, effect: 'none', target2: null, dir: null };
    return this.service.classifyAction(npcId, message);
  }

  /** Commerce classifier delegate (Phase 16). No service → a no-op offer. */
  async classifyCommerce(
    npcId: string, npcReply: string, playerMessage: string, sellableIds: string[], rivalIds: string[],
  ): Promise<CommerceParse> {
    if (!this.service) return { offer: 'none', itemId: null, targetId: null, rewardItemId: null, rewardCredits: 0, accept: false };
    return this.service.classifyCommerce(npcId, npcReply, playerMessage, sellableIds, rivalIds);
  }

  /** Ids of live (not-defeated) NPCs — candidate mission targets / rivals. */
  liveNpcIds(): string[] {
    return this.getAgents().filter((a) => !a.isDefeated()).map((a) => a.definition.id);
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
    // Covert-action detection runs first and is service-free (no Claude): a robbed/
    // hacked NPC may notice on its next think and turn on the player (Fase 20G).
    this.detectTampering();
    if (!this.service) return result;

    this.agents.forEach((agent) => {
      const id = agent.definition.id;
      // Only NPCs in the player's CURRENT quadrant are awake; the rest hibernate.
      // A 24×24 procedural world has too many NPCs to each spawn a heavyweight
      // `claude` CLI per reflection — that volume crashed the Electron main process
      // (Fase 17H). Hibernating NPCs stay fully interactive (player-initiated chat).
      if (!agent.isAwake()) return;
      if (agent.isDefeated()) return; // the dead take no autonomous turns
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

  // ─── Covert-action detection (Fase 20G) ─────────────────────────────────────

  /** NPC detection values (uniform stat block, mirrors GameWorldScene.enemyStatsFor). */
  static readonly TAMPER_PERCEPTION = 20;
  static readonly TAMPER_INFOTECH_HACKER = 30;

  /**
   * Pure: does an NPC NOTICE a covert action? Picks the detector skill by kind
   * (theft → Perception; hack → IT; social → IT if a hacker, else Perception) and
   * runs ONE power-ratio check of that value vs the player's skill at the time.
   * A hack is undetectable without a deck (returns false).
   */
  static resolveTamperNotice(
    tamper: TamperTrace,
    npc: { perception: number; infotech: number; hasDeck: boolean },
    rng: RollFn = defaultRoll,
  ): boolean {
    let detector: number;
    if (tamper.kind === 'theft') detector = npc.perception;
    else if (tamper.kind === 'hack') { if (!npc.hasDeck) return false; detector = npc.infotech; }
    else detector = npc.hasDeck ? npc.infotech : npc.perception; // social
    return resolveCheck({ value: detector, opponent: tamper.playerSkillValue }, rng).success;
  }

  /**
   * Resolve every pending covert action against an awake, living NPC. On a notice:
   * record the event (feeds the prompt), worsen disposition toward the player, and
   * clear the trace. Returns the ids that noticed. Service-free + injectable RNG.
   */
  detectTampering(rng: RollFn = defaultRoll): string[] {
    const noticed: string[] = [];
    this.agents.forEach((agent) => {
      if (!agent.isAwake() || agent.isDefeated()) return;
      const tamper = agent.getTamper();
      if (!tamper) return;
      const hasDeck = agent.getInventory().has('cyberdeck');
      const infotech = hasDeck ? NPCManager.TAMPER_INFOTECH_HACKER : SKILL_BASE;
      if (NPCManager.resolveTamperNotice(tamper, { perception: NPCManager.TAMPER_PERCEPTION, infotech, hasDeck }, rng)) {
        agent.rememberEvent(NPCManager.tamperEventLine(tamper.kind));
        agent.worsenDisposition();
        agent.clearTamper();
        noticed.push(agent.definition.id);
      }
    });
    return noticed;
  }

  /** The witnessed-event line an NPC records when it notices a covert action. */
  static tamperEventLine(kind: TamperTrace['kind']): string {
    if (kind === 'theft') return 'You realized someone picked your pocket.';
    if (kind === 'hack') return 'You caught an intruder rifling through your systems.';
    return 'You realized someone has been turning people against you.';
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

  /** The persisted memory entry for one agent. A defeated NPC never converses or
   * deliberates again, so we drop its conversation/disposition/ledger/events and
   * keep only the death status + the corpse inventory (so loot state survives a
   * reload) — keeps the save lean (Fase 18, owner-decided). */
  private memoryOf(agent: NPCAgent): NPCMemoryEntry {
    const pos = agent.definition.position;
    const position: [number, number, number] = [pos[0], pos[1], pos[2]];
    const nameKnown = agent.isNameKnown() || undefined;
    if (agent.isDefeated()) {
      return {
        mode: 'stateless', sessionId: null, history: [],
        defeated: true,
        inventory: agent.getInventoryState(),
        position, // so the corpse reloads where it fell, not at the spawn point
        nameKnown, // if you knew them in life, you still know their corpse's name
      };
    }
    return {
      ...agent.conversation.toState(),
      disposition: agent.getDisposition(),
      relationships: agent.relationshipsRecord(),
      events: agent.getKnownEvents(),
      inventory: agent.getInventoryState(),
      health: agent.getHealthState(),
      tamper: agent.getTamper() ?? undefined,
      sabotaged: agent.isSabotaged() || undefined,
      position, // so an NPC that walked off reloads where it stopped, not at spawn
      nameKnown, // anti-metagaming break sticks across reloads
    };
  }

  serializeMemory(): NPCMemoryMap {
    const map: NPCMemoryMap = {};
    this.agents.forEach((agent, id) => { map[id] = this.memoryOf(agent); });
    return map;
  }

  /**
   * Spawn one NPC, restoring ALL persisted state by its id (conversation,
   * disposition, NPC↔NPC ledger, witnessed events, inventory). Shared by the
   * static (0,0) setup and per-tile streaming (Fase 17).
   */
  spawnWithMemory(def: NPCDefinition, memory: NPCMemoryMap | undefined): NPCAgent {
    const agent = this.spawn(def, NPCManager.restoreConversation(memory, def.id));
    agent.setDisposition(NPCManager.restoreDisposition(memory, def.id, def.initialDisposition ?? 'neutral'));
    const ledger = NPCManager.restoreRelationships(memory, def.id);
    if (ledger) agent.restoreRelationships(ledger);
    agent.restoreEvents(NPCManager.restoreEvents(memory, def.id));
    agent.restoreInventory(NPCManager.restoreInventory(memory, def.id));
    const savedHp = memory?.[def.id]?.health;
    if (savedHp) agent.setHealthState(savedHp); // pervasive HP restored (Fase 20)
    agent.restoreTamper(memory?.[def.id]?.tamper);   // pending covert action (Fase 20G)
    agent.restoreSabotaged(memory?.[def.id]?.sabotaged); // rigged gear (Fase 20H)
    // Restore the last world position BEFORE markDefeated so the holder builds
    // there (the visual reads agent.definition.position, mutated by setPosition).
    const savedPos = memory?.[def.id]?.position;
    if (savedPos) agent.setPosition(new Vector3(savedPos[0], savedPos[1], savedPos[2]));
    agent.restoreNameKnown(memory?.[def.id]?.nameKnown); // name reveal persists (Fase 20)
    if (memory?.[def.id]?.defeated) agent.markDefeated(); // stays dead across reloads (Fase 18)
    return agent;
  }

  /** Spawn a streamed tile's NPCs, tracked by tile key for later despawn (Fase 17). */
  spawnTile(tileKey: string, defs: NPCDefinition[], memory: NPCMemoryMap | undefined): NPCAgent[] {
    const ids = this.tileAgents.get(tileKey) ?? new Set<string>();
    const spawned: NPCAgent[] = [];
    for (const def of defs) {
      spawned.push(this.spawnWithMemory(def, memory));
      ids.add(def.id);
    }
    this.tileAgents.set(tileKey, ids);
    return spawned;
  }

  /** The NPC ids currently spawned for a streamed tile. */
  tileNpcIds(tileKey: string): string[] {
    return [...(this.tileAgents.get(tileKey) ?? [])];
  }

  /**
   * Remove a streamed tile's NPCs and return their ids + a memory sub-map (so the
   * scene can persist their state into the world delta and dispose their visuals).
   */
  despawnTile(tileKey: string): { ids: string[]; memory: NPCMemoryMap } {
    const ids = this.tileNpcIds(tileKey);
    const memory: NPCMemoryMap = {};
    for (const id of ids) {
      const agent = this.agents.get(id);
      if (agent) memory[id] = this.memoryOf(agent);
      this.agents.delete(id);
      this.cooldowns.delete(id);
    }
    this.tileAgents.delete(tileKey);
    return { ids, memory };
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

  /** The persisted NPC→NPC relationship ledger for an NPC (undefined = none saved). */
  static restoreRelationships(
    memory: NPCMemoryMap | undefined,
    npcId: string,
  ): Record<string, NPCDisposition> | undefined {
    return memory?.[npcId]?.relationships;
  }

  /** The persisted witnessed-events memory for an NPC (undefined = none saved). */
  static restoreEvents(
    memory: NPCMemoryMap | undefined,
    npcId: string,
  ): string[] | undefined {
    return memory?.[npcId]?.events;
  }

  /** The persisted inventory for an NPC (undefined = none saved → rebuild from loadout). */
  static restoreInventory(
    memory: NPCMemoryMap | undefined,
    npcId: string,
  ): InventoryState | undefined {
    return memory?.[npcId]?.inventory;
  }

  dispose(): void {
    this.agents.clear();
    this.cooldowns.clear();
    this.tileAgents.clear();
  }
}
