import { NPCDefinition, NPCMood, PlayerAction } from '@entities/NPCAgent';
import { Exchange } from './ConversationContext';

export interface WorldSnapshot {
  cityName: string;
  gameTime: string;       // "14:30, day 1"
  playerName: string;
  distanceMeters: number;
  playerAction: PlayerAction;
  recentEvents: string[]; // up to 3 short event lines
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
      'Respond in character in English. 2-3 sentences max. React to their words AND their current action. ' +
      'Do not break character. Do not mention being an AI.'
    );
    lines.push('');
    lines.push(`Player: ${playerMessage}`);

    return lines.join('\n');
  }

  /** One-time session primer sent when graduating to session mode. */
  static buildSessionPrimer(inputs: Omit<PromptInputs, 'playerMessage'>): string {
    const { definition, mood, world, history } = inputs;
    const lines: string[] = [];
    lines.push(`You are roleplaying as ${definition.name}, a ${definition.role} in ${world.cityName}'s ${definition.location}.`);
    lines.push(definition.personalityPrompt);
    lines.push(`Current mood: ${mood}. The player is known as ${world.playerName}.`);
    lines.push('Stay in character for the rest of this session. Respond in English, 2-3 sentences, never mention being an AI.');
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

  /** Rough char-count estimate of the stateless prompt (for graduation). */
  static estimateStatelessChars(inputs: PromptInputs): number {
    return PromptBuilder.buildStateless(inputs).length;
  }
}
