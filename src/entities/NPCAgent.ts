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
  /** Notable relationships (free text). */
  relationships?: string;
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
  private intent: NPCIntent = { kind: 'stay' };

  constructor(definition: NPCDefinition, conversation?: ConversationContext) {
    this.definition = definition;
    this.mood = definition.defaultMood;
    this.conversation = conversation ?? new ConversationContext();
    this.disposition = definition.initialDisposition ?? 'neutral';
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
    const order: NPCDisposition[] = ['friendly', 'neutral', 'wary', 'hostile'];
    const i = order.indexOf(this.disposition);
    this.disposition = order[Math.min(i + 1, order.length - 1)]!;
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
