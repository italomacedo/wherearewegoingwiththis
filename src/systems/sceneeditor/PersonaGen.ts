/**
 * PersonaGen — prompt + parser for the Edit-NPC modal's "Generate (AI)" button:
 * one cheap Claude CLI call (ClaudeNPCService.narrate — Haiku, low effort,
 * ONE_SHOT_SYSTEM, fail-open) drafts Personality/Backstory/Routine from the
 * NPC's name/role/look. Personas are authored in ENGLISH like the rest of the
 * cast (NPC replies follow the game language at runtime). Pure, 100% tested.
 */
import { ATTRIBUTES } from '@entities/CharacterStats';
import type { SceneNpcDoc } from './SceneDoc';

export interface GeneratedPersona {
  personalityPrompt: string;
  backstory: string;
  routine: string;
}

export function buildPersonaPrompt(npc: SceneNpcDoc, sceneName: string): string {
  const attrs = ATTRIBUTES
    .map((a) => `${a.id} ${npc.attributes?.[a.id] ?? 20}`)
    .join(', ');
  return [
    'Draft a cyberpunk RPG NPC persona. Respond EXACTLY in this format, in English, nothing else:',
    'PERSONALITY: <2-3 sentences, second person ("You are ..."), voice + worldview>',
    'BACKSTORY: <1-2 sentences of personal history>',
    'ROUTINE: <1 sentence describing a typical day>',
    '',
    `NPC: "${npc.name}", ${npc.role}, look "${npc.outfit}", disposition ${npc.initialDisposition},`,
    `attributes (${attrs}), found in "${sceneName}".`,
  ].join('\n');
}

/** Tolerant section parser; null when any of the three sections is missing. */
export function parsePersonaResponse(raw: string): GeneratedPersona | null {
  const grab = (label: string): string | null => {
    // [ \t]* (not \s*) after the colon — \s would swallow the newline and let an
    // EMPTY section capture the next header line as its content.
    const re = new RegExp(`${label}\\s*:[ \\t]*([\\s\\S]*?)(?=\\n\\s*(?:PERSONALITY|BACKSTORY|ROUTINE)\\s*:|$)`, 'i');
    const m = re.exec(raw);
    const text = m?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
    return text.length > 0 ? text : null;
  };
  const personalityPrompt = grab('PERSONALITY');
  const backstory = grab('BACKSTORY');
  const routine = grab('ROUTINE');
  if (!personalityPrompt || !backstory || !routine) return null;
  return { personalityPrompt, backstory, routine };
}
