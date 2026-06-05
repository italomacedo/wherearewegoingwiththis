/**
 * Player PDA (Fase 20) — pure data + view model for the dossiers the player builds
 * by scanning/hacking NPCs (the `info` skill effect). The GUI overlay (PdaOverlay)
 * renders `buildPdaState`; SaveService persists `PdaEntry[]`. No engine deps here.
 */

export interface PdaEntry {
  subjectId: string;
  subjectName: string;
  /** Dossier facts gathered about the subject (newest scan replaces the prior one). */
  lines: string[];
}

export interface PdaView {
  entries: PdaEntry[];
  empty: boolean;
}

/** The view model for the PDA overlay (a copy, newest dossier first). */
export function buildPdaState(pda: PdaEntry[]): PdaView {
  const entries = [...pda].reverse().map((e) => ({ ...e, lines: [...e.lines] }));
  return { entries, empty: entries.length === 0 };
}

/**
 * Insert or replace the dossier for a subject (a fresh scan supersedes the old
 * one and moves it to the end = most recent). Returns a new array (pure).
 */
export function upsertPdaEntry(pda: PdaEntry[], entry: PdaEntry): PdaEntry[] {
  return [...pda.filter((e) => e.subjectId !== entry.subjectId), entry];
}
