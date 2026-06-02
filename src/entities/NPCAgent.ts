import { Vector3 } from '@babylonjs/core';
import { ConversationContext } from '@systems/npc/ConversationContext';
import { CharacterAppearance } from '@entities/CharacterData';
import type { NPCIntent } from '@systems/npc/Intent';

export type NPCMood = 'neutral' | 'friendly' | 'suspicious' | 'hostile' | 'scared';

export type NPCState =
  | 'idle'
  | 'aware'
  | 'responding'
  | 'cooldown'
  | 'hostile';

export type PlayerAction = 'idle' | 'walking' | 'running' | 'weapon_drawn';

/**
 * How an NPC feels about the player. Set initially per-NPC; the dynamic
 * transitions (hostile-on-sight, ultimatum, worsening on hostile player actions)
 * land in Phase 5. Ordered from worst to best.
 */
export type NPCDisposition = 'hostile' | 'wary' | 'neutral' | 'friendly';

/** Disposition scale ordered worst→best (index 0 = most hostile). */
export const DISPOSITION_SCALE: readonly NPCDisposition[] = ['hostile', 'wary', 'neutral', 'friendly'];

/** One step worse toward hostile (clamped). */
export function worsenedDisposition(d: NPCDisposition): NPCDisposition {
  const i = DISPOSITION_SCALE.indexOf(d);
  return DISPOSITION_SCALE[Math.max(i - 1, 0)]!;
}

/** How far a disposition sits from neutral (0..2) — the "pull strength" for side-taking. */
export function dispositionMagnitude(d: NPCDisposition): number {
  return Math.abs(DISPOSITION_SCALE.indexOf(d) - DISPOSITION_SCALE.indexOf('neutral'));
}

/**
 * The outcome of intentionally striking an ally (8B friendly fire): their
 * disposition toward the attacker worsens one step, and once it reaches `wary`
 * (or worse) they DEFECT to the opposing side. A `friendly` ally therefore absorbs
 * ~two betrayals (friendly→neutral→wary) before turning on you.
 */
export function friendlyFireDefection(current: NPCDisposition): { disposition: NPCDisposition; defects: boolean } {
  const next = worsenedDisposition(current);
  return { disposition: next, defects: next === 'wary' || next === 'hostile' };
}

export interface NPCDefinition {
  id: string;
  name: string;
  role: string;
  location: string;
  personalityPrompt: string;
  defaultMood: NPCMood;
  interactionRadius: number;   // meters — NPC becomes AWARE
  conversationRadius: number;  // meters — player can talk
  position: [number, number, number];
  /**
   * Optional avatar appearance. When set, the scene builds a real Quaternius
   * avatar (via CharacterAssembler) instead of the procedural capsule.
   */
  appearance?: CharacterAppearance;
  // ─── Identity (who they are / what they do / where they live) ───────────────
  /** Where the NPC lives — injected into the persona prompt. */
  home?: string;
  /** A short backstory for the persona. */
  backstory?: string;
  /** What they do day to day. */
  routine?: string;
  /** Notable relationships (free text — fed to gossip/persona prompts). */
  relationships?: string;
  /**
   * Structured starting relationships toward OTHER NPCs by id (Fase 8B), on the
   * same 4-level scale. Drives multi-combatant side-taking (hostile/wary → fight
   * them, friendly → defend them). Missing entries default to `neutral`.
   */
  npcRelationships?: Record<string, NPCDisposition>;
  /** Initial disposition toward the player (dynamic transitions: Phase 5). */
  initialDisposition?: NPCDisposition;
}

/**
 * A single NPC: persona, position, mood, conversation, and a state machine
 * driven by player proximity and actions. Pure logic (no Babylon meshes here)
 * so the behavior is fully unit-testable.
 */
export class NPCAgent {
  readonly definition: NPCDefinition;
  readonly conversation: ConversationContext;

  private state: NPCState = 'idle';
  private mood: NPCMood;
  private nameKnown = false;
  private disposition: NPCDisposition;
  /** This NPC's relationships toward OTHER NPCs (id → disposition); default neutral. */
  private readonly relationships = new Map<string, NPCDisposition>();
  private intent: NPCIntent = { kind: 'stay' };

  constructor(definition: NPCDefinition, conversation?: ConversationContext) {
    this.definition = definition;
    this.mood = definition.defaultMood;
    this.conversation = conversation ?? new ConversationContext();
    this.disposition = definition.initialDisposition ?? 'neutral';
    for (const [id, level] of Object.entries(definition.npcRelationships ?? {})) {
      this.relationships.set(id, level);
    }
  }

  // ─── Disposition toward the player (dynamic, persisted via npcMemory) ────────

  getDisposition(): NPCDisposition {
    return this.disposition;
  }

  setDisposition(d: NPCDisposition): void {
    this.disposition = d;
  }

  /**
   * Worsen the disposition one step toward hostile (friendly→neutral→wary→
   * hostile, clamped). Returns the new value.
   */
  worsenDisposition(): NPCDisposition {
    this.disposition = worsenedDisposition(this.disposition);
    return this.disposition;
  }

  /**
   * The player did something hostile (via the emote/action pipeline). The
   * disposition worsens one step. Returns whether the NPC should issue a spoken
   * ULTIMATUM rather than immediately fighting: yes when it was non-hostile and
   * is now (the warning shot); no when it was already hostile (combat is flagged
   * elsewhere). Always forces the hostile *state* + mood so it reacts now.
   */
  onHostilePlayerAction(): { ultimatum: boolean } {
    const wasHostile = this.disposition === 'hostile';
    this.worsenDisposition();
    this.state = 'hostile';
    this.mood = 'hostile';
    return { ultimatum: !wasHostile };
  }

  /**
   * Whether seeing the player should make this NPC start a confrontation
   * (the `attack` intent stub). True only for an already-hostile disposition.
   */
  shouldInitiateCombat(playerPresent: boolean): boolean {
    return playerPresent && this.disposition === 'hostile';
  }

  // ─── Relationships toward OTHER NPCs (the ledger; Fase 8B) ───────────────────

  /** This NPC's disposition toward another NPC (defaults to neutral). */
  getRelationship(npcId: string): NPCDisposition {
    return this.relationships.get(npcId) ?? 'neutral';
  }

  setRelationship(npcId: string, level: NPCDisposition): void {
    this.relationships.set(npcId, level);
  }

  /** Worsen the relationship toward another NPC one step (clamped). Returns the new value. */
  worsenRelationship(npcId: string): NPCDisposition {
    const next = worsenedDisposition(this.getRelationship(npcId));
    this.relationships.set(npcId, next);
    return next;
  }

  /** The full ledger as a plain record (for persistence). Omitted when empty. */
  relationshipsRecord(): Record<string, NPCDisposition> {
    return Object.fromEntries(this.relationships);
  }

  /** Replace the ledger from a persisted record (load). */
  restoreRelationships(record: Record<string, NPCDisposition> | undefined): void {
    this.relationships.clear();
    for (const [id, level] of Object.entries(record ?? {})) this.relationships.set(id, level);
  }

  /** True when this NPC would take up arms against `npcId` (hostile or wary). */
  isAntagonisticToward(npcId: string): boolean {
    const r = this.getRelationship(npcId);
    return r === 'hostile' || r === 'wary';
  }

  // ─── Defeat (killed in combat — persists for the rest of the scene) ──────────

  private defeated = false;
  /** Mark this NPC as defeated/killed: it stays down and takes no further part in the world. */
  markDefeated(): void { this.defeated = true; }
  isDefeated(): boolean { return this.defeated; }

  // ─── Witnessed events (e.g. "X was killed") — fed into the NPC's prompt ──────

  private static readonly MAX_EVENTS = 8;
  private knownEvents: string[] = [];

  /** Record a world event this NPC witnessed/learned (deduped, newest kept; capped). */
  rememberEvent(line: string): void {
    const e = line.trim();
    if (!e || this.knownEvents.includes(e)) return;
    this.knownEvents.push(e);
    if (this.knownEvents.length > NPCAgent.MAX_EVENTS) {
      this.knownEvents = this.knownEvents.slice(-NPCAgent.MAX_EVENTS);
    }
  }

  /** Events this NPC knows, oldest first (stable for persistence). */
  getKnownEvents(): string[] {
    return [...this.knownEvents];
  }

  /** The most recent `n` events, newest first (for the prompt's "recent events"). */
  getRecentEvents(n = 3): string[] {
    return [...this.knownEvents].slice(-n).reverse();
  }

  /** Replace the known-events memory from a persisted list (load). */
  restoreEvents(events: string[] | undefined): void {
    this.knownEvents = [...(events ?? [])];
  }

  // ─── Current deliberated intent (set by the autonomy layer) ─────────────────

  getIntent(): NPCIntent {
    return this.intent;
  }

  setIntent(intent: NPCIntent): void {
    this.intent = intent;
  }

  /** True once the NPC has revealed its name to the player. */
  isNameKnown(): boolean {
    return this.nameKnown;
  }

  /** Name to show in UI: the real name only after the NPC introduces itself. */
  getDisplayName(): string {
    return this.nameKnown ? this.definition.name : 'Unknown';
  }

  markNameKnown(): void {
    this.nameKnown = true;
  }

  /**
   * Reveal the name if the NPC's own name appears in the given text (e.g. it
   * just introduced itself). Returns true only on the first reveal — anti-
   * metagaming: the player shouldn't see "Zara" before she says it.
   */
  revealNameIfMentioned(text: string): boolean {
    if (this.nameKnown) return false;
    const escaped = this.definition.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      this.nameKnown = true;
      return true;
    }
    return false;
  }

  getState(): NPCState {
    return this.state;
  }

  getMood(): NPCMood {
    return this.mood;
  }

  getPosition(): Vector3 {
    const [x, y, z] = this.definition.position;
    return new Vector3(x, y, z);
  }

  /**
   * Update the NPC's logical position (so proximity, the [E] Talk prompt, the
   * conversation camera and addressing follow it when the autonomy layer walks
   * its mesh around). Mutates the runtime definition copy only.
   */
  setPosition(pos: Vector3): void {
    this.definition.position = [pos.x, pos.y, pos.z];
  }

  /** Distance from this NPC to a world position. */
  distanceTo(playerPos: Vector3): number {
    return Vector3.Distance(this.getPosition(), playerPos);
  }

  /** True when player is close enough to start typing. */
  canConverse(playerPos: Vector3): boolean {
    return this.distanceTo(playerPos) <= this.definition.conversationRadius;
  }

  /**
   * Update proximity-driven state. Does not override RESPONDING/COOLDOWN
   * (those are driven by the conversation flow), and weapon_drawn forces hostile.
   */
  updateProximity(playerPos: Vector3, playerAction: PlayerAction = 'idle'): void {
    if (playerAction === 'weapon_drawn') {
      this.onThreat();
      return;
    }
    if (this.state === 'responding' || this.state === 'cooldown') return;

    const dist = this.distanceTo(playerPos);
    if (this.state === 'hostile') {
      // hostile only relaxes when player leaves interaction radius
      if (dist > this.definition.interactionRadius) {
        this.state = 'idle';
        this.mood = this.definition.defaultMood;
      }
      return;
    }

    if (dist <= this.definition.interactionRadius) {
      this.state = 'aware';
    } else {
      this.state = 'idle';
    }
  }

  /** Player sent a message — begin responding (locks proximity transitions). */
  beginResponse(): void {
    this.state = 'responding';
  }

  /** Claude finished — enter cooldown. */
  endResponse(): void {
    this.state = 'cooldown';
  }

  /** Cooldown elapsed — return to aware. */
  endCooldown(): void {
    if (this.state === 'cooldown') {
      this.state = 'aware';
    }
  }

  private onThreat(): void {
    this.state = 'hostile';
    // React to a drawn weapon by disposition: a friendly NPC is frightened;
    // a wary/neutral one turns hostile; an already-hostile one stays hostile.
    this.mood = this.disposition === 'friendly' ? 'scared' : 'hostile';
  }

  setMood(mood: NPCMood): void {
    this.mood = mood;
  }

  /** True when the NPC is busy and should not accept a new message. */
  isBusy(): boolean {
    return this.state === 'responding';
  }
}
