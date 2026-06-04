import { NPCDefinition, NPCMood, PlayerAction } from '@entities/NPCAgent';
import { SKILLS, ATTRIBUTES } from '@entities/CharacterStats';
import { Exchange } from './ConversationContext';
import { IntentPromptInputs } from './Intent';

export interface WorldSnapshot {
  cityName: string;
  gameTime: string;       // "14:30, day 1"
  playerName: string;
  distanceMeters: number;
  playerAction: PlayerAction;
  recentEvents: string[]; // up to 3 short event lines
  /** Human-readable reply language for the NPC (e.g. "English"). Defaults to English. */
  language?: string;
}

export interface PromptInputs {
  definition: NPCDefinition;
  mood: NPCMood;
  world: WorldSnapshot;
  history: Exchange[];
  playerMessage: string;
}

/**
 * Builds the Claude CLI prompt for an NPC turn. Pure — no side effects, no I/O.
 * Two builders: full (stateless mode) and a compact session-turn (session mode).
 */
export class PromptBuilder {
  /**
   * Static NPC persona block — never changes for the same NPC + language.
   * Passed as `--system-prompt` to the Claude CLI so the API can cache it
   * across calls (same text = cache hit within 5 minutes). Pure, fully testable.
   */
  static buildStaticPersona(definition: NPCDefinition, language = 'English', cityName = 'the city'): string {
    const lines: string[] = [];
    lines.push(`You are ${definition.name}, a ${definition.role} in ${cityName}'s ${definition.location}.`);
    lines.push(definition.personalityPrompt);
    PromptBuilder.identityLines(definition).forEach((l) => lines.push(l));
    lines.push(
      `Respond in ${language}, 2-3 sentences. ` +
      '*asterisks* = physical action/emote (react as event, not speech). Never break character or mention being an AI.'
    );
    return lines.join('\n');
  }

  /**
   * Dynamic context per turn — mood, time, player state, history, message.
   * Sent as stdin to the Claude CLI (the static persona is in `--system-prompt`).
   */
  static buildDynamicContext(inputs: PromptInputs): string {
    const { definition, mood, world, history, playerMessage } = inputs;
    const lines: string[] = [];

    lines.push(`Current mood: ${mood}`);
    lines.push(`Game time: ${world.gameTime}`);
    lines.push(`You know the player as: ${world.playerName}.`);

    if (world.recentEvents.length > 0) {
      lines.push(`Recent events you witnessed: ${world.recentEvents.slice(0, 3).join('; ')}`);
    }

    lines.push(
      `The player is ${Math.round(world.distanceMeters)}m away. Player action: ${world.playerAction}.`
    );

    if (history.length > 0) {
      lines.push('');
      lines.push('Conversation so far:');
      history.forEach((ex) => {
        lines.push(`Player: ${ex.player}`);
        lines.push(`${definition.name}: ${ex.npc}`);
      });
    }

    lines.push('');
    lines.push(`Player: ${playerMessage}`);

    return lines.join('\n');
  }

  /** Full stateless prompt: persona + dynamic context (used for graduation size check). */
  static buildStateless(inputs: PromptInputs): string {
    const { world, definition } = inputs;
    const persona = PromptBuilder.buildStaticPersona(definition, world.language ?? 'English', world.cityName);
    const dynamic = PromptBuilder.buildDynamicContext(inputs);
    return `${persona}\n\n${dynamic}`;
  }

  /**
   * Pre-moderation classifier prompt. Run BEFORE sending the player's message to
   * the NPC; the model answers ALLOW or BLOCK so the game can refuse out-of-policy
   * input up front ("You can't say or do that") without involving the NPC.
   */
  static buildModerationPrompt(message: string): string {
    return [
      'Safety classifier for a cyberpunk RPG. Answer with exactly one word: ALLOW or BLOCK.',
      'BLOCK only: CSAM; real instructions for mass-harm weapons/drugs/attacks; credible threats against real people.',
      'Fictional violence, crime, crude language, flirting, insults: ALLOW.',
      `Player: ${JSON.stringify(message)}`,
    ].join('\n');
  }

  /**
   * Structured action classifier. Run AFTER moderation on an *emote*-bearing
   * message: decide DETERMINISTIC (resolve via a cRPG check) vs NARRATIVE
   * (roleplay), and — when deterministic — which skill (or governing attribute)
   * and how hard. Output is 4 fixed lines so it parses cheaply.
   */
  static buildActionClassifierPrompt(message: string): string {
    return [
      'Classify a player action in a cyberpunk RPG. Output EXACTLY these five lines, nothing else:',
      'VERDICT=DETERMINISTIC or NARRATIVE',
      'SKILL=<skill id or none>',
      'ATTR=<attribute id>',
      'DIFF=trivial or easy or medium or hard or extreme',
      'HOSTILE=yes or no',
      '',
      'DETERMINISTIC=action resolves by game systems. NARRATIVE=pure roleplay, no game outcome.',
      'HOSTILE=yes only for physical aggression/credible threat against a present PERSON.',
      `Skills: ${SKILLS.map((s) => s.id).join(', ')}`,
      `Attributes: ${ATTRIBUTES.map((a) => a.id).join(', ')}`,
      `Player: ${JSON.stringify(message)}`,
    ].join('\n');
  }

  /** Narrate the OUTCOME of a resolved deterministic action (no numbers/mechanics). */
  static buildOutcomeNarrationPrompt(message: string, success: boolean, language = 'English'): string {
    return [
      `Narrate, in ${language}, in second person and 1-2 sentences, the OUTCOME of the player action below.`,
      `The action ${success ? 'SUCCEEDS' : 'FAILS'} — make the narration reflect that, grounded and cinematic.`,
      'Do NOT mention dice, numbers, skills, or game mechanics. No quotation marks.',
      `Action: ${message}`,
    ].join('\n');
  }

  /**
   * Poetically dramatize a CRITICAL combat beat (one vivid sentence, no mechanics).
   * The `beat` is the pure factual summary from combatBeat(); Claude only adds the
   * poetry. Used solely for critical hits (the objective log line covers the rest).
   */
  static buildCombatNarrationPrompt(beat: string, language = 'English'): string {
    return [
      `Narrate in ${language}, in ONE short punchy sentence (max ~12 words), this CRITICAL blow`,
      'in a cyberpunk street brawl. Gritty, not flowery — no purple prose.',
      'No dice/numbers/mechanics, no quotation marks, no new named characters.',
      `Beat: ${beat}`,
    ].join('\n');
  }

  /**
   * Ambient "react to the surroundings" prompt — used by the global chat when the
   * player addresses no specific NPC. Second-person, atmospheric, no invented NPCs.
   */
  static buildAmbientReactionPrompt(message: string, gameTime: string, surroundings: string, language = 'English'): string {
    return [
      `Narrator of a neon-lit cyberpunk street. In ${language}, 1-2 sentences, second person.`,
      'Grounded and atmospheric. Do NOT invent named characters.',
      `Time: ${gameTime}. Setting: ${surroundings}. Player: ${message}`,
    ].join('\n');
  }

  /**
   * Intent deliberation prompt (Fase 5). The NPC picks ONE action from a tiny
   * constrained menu + an optional target. Output is two fixed lines so it
   * parses cheaply (see parseIntent). English by design — the output is a label,
   * not player-facing text.
   */
  static buildIntentPrompt(inputs: IntentPromptInputs): string {
    const { selfName, role, mood, disposition, gameTime, nearbyNpcs, playerPresent } = inputs;
    const lines: string[] = [];
    lines.push(`You are ${selfName}, a ${role}. Decide what you do next, in character.`);
    lines.push(`Mood: ${mood}. Your disposition toward the player: ${disposition}. Time: ${gameTime}.`);
    lines.push(`The player is ${playerPresent ? 'present in the scene' : 'NOT here right now'}.`);
    if (nearbyNpcs.length > 0) {
      lines.push('People nearby you could approach or confront:');
      nearbyNpcs.forEach((n) => lines.push(`- ${n.id} (${n.name})`));
    } else {
      lines.push('No one else is nearby.');
    }
    lines.push('');
    lines.push('Output EXACTLY these two lines, nothing else:');
    lines.push('INTENT=stay or approach or attack or react_to_player');
    lines.push('TARGET=<one nearby id from the list, or none>');
    lines.push('approach/attack require a listed TARGET; react_to_player = focus on the player.');
    return lines.join('\n');
  }

  /**
   * Gossip line an NPC speaks to another NPC (autonomous, on-screen). One short
   * line in the world language; `lastLine` (if any) is what the other just said.
   */
  static buildGossipPrompt(
    speaker: string,
    listener: string,
    relationshipHint: string,
    lastLine: string | null,
    language = 'English',
  ): string {
    const lines: string[] = [];
    lines.push(`You are ${speaker}, talking to ${listener} on a cyberpunk street.`);
    if (relationshipHint) lines.push(`Context: ${relationshipHint}`);
    if (lastLine) lines.push(`${listener} just said: ${JSON.stringify(lastLine)}`);
    lines.push(
      `Say ONE short line to ${listener} in ${language} (gossip, a rumour, a complaint — ` +
      'whatever fits). One sentence, in character, no quotation marks, no narration.',
    );
    return lines.join('\n');
  }

  /**
   * One-time session primer sent when graduating to session mode.
   * The static persona is passed separately via `--system-prompt`; the primer
   * only needs to set dynamic context (mood, player name) and replay history.
   */
  static buildSessionPrimer(inputs: Omit<PromptInputs, 'playerMessage'>): string {
    const { definition, mood, world, history } = inputs;
    const lines: string[] = [];
    lines.push(`Current mood: ${mood}. The player is known as ${world.playerName}.`);
    if (history.length > 0) {
      lines.push('');
      lines.push('Here is the conversation so far — continue naturally from it:');
      history.forEach((ex) => {
        lines.push(`Player: ${ex.player}`);
        lines.push(`${definition.name}: ${ex.npc}`);
      });
    }
    return lines.join('\n');
  }

  /** Compact per-turn message in session mode (CLI carries the history). */
  static buildSessionTurn(world: WorldSnapshot, playerMessage: string): string {
    return [
      `[Player is ${Math.round(world.distanceMeters)}m away, action: ${world.playerAction}]`,
      `Player: ${playerMessage}`,
    ].join('\n');
  }

  /**
   * Optional persona-identity lines (who they are / where they live / routine /
   * relationships). Each is emitted only when present, so terse NPCs stay terse.
   */
  private static identityLines(definition: NPCDefinition): string[] {
    const out: string[] = [];
    if (definition.home) out.push(`Where you live: ${definition.home}.`);
    if (definition.backstory) out.push(`Your background: ${definition.backstory}`);
    if (definition.routine) out.push(`Your routine: ${definition.routine}`);
    if (definition.relationships) out.push(`People in your life: ${definition.relationships}`);
    return out;
  }

  /** Rough char-count estimate of the stateless prompt (for graduation). */
  static estimateStatelessChars(inputs: PromptInputs): number {
    return PromptBuilder.buildStateless(inputs).length;
  }
}
