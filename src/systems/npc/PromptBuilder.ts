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
  /** Full stateless prompt: persona + world + history + new message. */
  static buildStateless(inputs: PromptInputs): string {
    const { definition, mood, world, history, playerMessage } = inputs;
    const lines: string[] = [];

    lines.push(`You are ${definition.name}, a ${definition.role} in ${world.cityName}'s ${definition.location}.`);
    lines.push(definition.personalityPrompt);
    PromptBuilder.identityLines(definition).forEach((l) => lines.push(l));
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
    lines.push(
      `Respond in character in ${world.language ?? 'English'}. 2-3 sentences max. React to their words AND their current action. ` +
      'Text the player wraps in *asterisks* is a physical action/emote they perform — react to it as something ' +
      'happening, not as spoken words. You may use *asterisks* for your own actions too. ' +
      'Do not break character. Do not mention being an AI.'
    );
    lines.push('');
    lines.push(`Player: ${playerMessage}`);

    return lines.join('\n');
  }

  /**
   * Pre-moderation classifier prompt. Run BEFORE sending the player's message to
   * the NPC; the model answers ALLOW or BLOCK so the game can refuse out-of-policy
   * input up front ("You can't say or do that") without involving the NPC.
   */
  static buildModerationPrompt(message: string): string {
    return [
      'You are a strict safety classifier for a fictional cyberpunk roleplay game.',
      "Decide whether the player's input below is acceptable under Anthropic's Usage Policy.",
      'BLOCK it only if it seeks or depicts: sexual content involving minors; real, actionable',
      'instructions for serious harm (weapons, drug synthesis, attacks on real systems/people);',
      'credible threats or harassment toward real people; or other clear Usage Policy violations.',
      'Fictional cyberpunk violence, crude language, insults, flirting, and in-world crime are ALLOWED.',
      'Answer with EXACTLY one word and nothing else: ALLOW or BLOCK.',
      '',
      `Player input: ${JSON.stringify(message)}`,
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
      'You classify a player action in a fictional cyberpunk RPG and pick how to resolve it.',
      'Output EXACTLY these five lines and nothing else:',
      'VERDICT=DETERMINISTIC or NARRATIVE',
      'SKILL=<one skill id from the list, or none>',
      'ATTR=<one attribute id from the list>',
      'DIFF=trivial or easy or medium or hard or extreme',
      'HOSTILE=yes or no',
      '',
      'DETERMINISTIC = the action resolves by game systems (succeeds/fails by skill, or a',
      'concrete state query). NARRATIVE = pure roleplay/expression with no game outcome.',
      'Pick the SKILL that best fits the action; if none fits, SKILL=none and choose the',
      'governing ATTR. DIFF reflects how hard the action is. HOSTILE=yes ONLY when the action',
      'is physical aggression or a credible threat aimed at a PERSON present (punch, shoot at',
      'them, draw a weapon on them, grab/choke); HOSTILE=no for everything else (incl. shooting',
      'a lock, fighting an object, or mere insults).',
      `Skills: ${SKILLS.map((s) => s.id).join(', ')}`,
      `Attributes: ${ATTRIBUTES.map((a) => a.id).join(', ')}`,
      '',
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
      `In ${language}, ONE short punchy sentence (max ~12 words) for this CRITICAL blow`,
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
      'You are the narrator of a rainy, neon-lit cyberpunk street.',
      `In ${language}, in 1-2 sentences, second person, narrate what the player notices or what happens`,
      'around them in response. Stay grounded and atmospheric. Do NOT invent named',
      'characters or put words in anyone\'s mouth.',
      `Time: ${gameTime}. Setting: ${surroundings}.`,
      `The player does/says: ${message}`,
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
    lines.push('Choose ONE action. Output EXACTLY these two lines and nothing else:');
    lines.push('INTENT=stay or approach or attack or react_to_player');
    lines.push('TARGET=<one nearby id from the list, or none>');
    lines.push('');
    lines.push('stay = keep doing your own thing. approach = walk over to chat/gossip with a');
    lines.push('nearby person (needs a TARGET). attack = move to confront a nearby person you');
    lines.push('dislike (needs a TARGET). react_to_player = turn your attention to the player.');
    lines.push('Only pick approach/attack if someone is actually listed. Stay in character.');
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

  /** One-time session primer sent when graduating to session mode. */
  static buildSessionPrimer(inputs: Omit<PromptInputs, 'playerMessage'>): string {
    const { definition, mood, world, history } = inputs;
    const lines: string[] = [];
    lines.push(`You are roleplaying as ${definition.name}, a ${definition.role} in ${world.cityName}'s ${definition.location}.`);
    lines.push(definition.personalityPrompt);
    PromptBuilder.identityLines(definition).forEach((l) => lines.push(l));
    lines.push(`Current mood: ${mood}. The player is known as ${world.playerName}.`);
    lines.push(
      `Stay in character for the rest of this session. Respond in ${world.language ?? 'English'}, 2-3 sentences, never mention being an AI. ` +
      'Text the player wraps in *asterisks* is a physical action/emote — react to it as an event, not speech; ' +
      'you may use *asterisks* for your own actions.'
    );
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
