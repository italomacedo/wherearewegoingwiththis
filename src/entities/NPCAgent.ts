import { Vector3 } from '@babylonjs/core';
import { ConversationContext } from '@systems/npc/ConversationContext';
import { CharacterAppearance } from '@entities/CharacterData';

export type NPCMood = 'neutral' | 'friendly' | 'suspicious' | 'hostile' | 'scared';

export type NPCState =
  | 'idle'
  | 'aware'
  | 'responding'
  | 'cooldown'
  | 'hostile';

export type PlayerAction = 'idle' | 'walking' | 'running' | 'weapon_drawn';

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

  constructor(definition: NPCDefinition, conversation?: ConversationContext) {
    this.definition = definition;
    this.mood = definition.defaultMood;
    this.conversation = conversation ?? new ConversationContext();
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
    // suspicious/neutral NPCs turn hostile; timid personas would be scared
    this.mood = this.definition.defaultMood === 'friendly' ? 'scared' : 'hostile';
  }

  setMood(mood: NPCMood): void {
    this.mood = mood;
  }

  /** True when the NPC is busy and should not accept a new message. */
  isBusy(): boolean {
    return this.state === 'responding';
  }
}
