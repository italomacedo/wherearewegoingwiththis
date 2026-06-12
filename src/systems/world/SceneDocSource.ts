/**
 * SceneDocSource — loads every authored SceneDoc for the game/editor.
 *
 * Primary path: the Electron scene:* IPC bridge (window.electronAPI). Fallback
 * (browser preview, no preload): fetch /scenes/index.json then each /scenes/<id>.json
 * — the same serving path as /assets/, so it works in dev AND packaged.
 *
 * Every raw doc passes through validateSceneDoc + migrateSceneDoc; corrupt docs
 * are skipped. The sanitize step is pure and tested; the IPC/fetch wrappers are
 * browser-only.
 */
import { SceneDoc, validateSceneDoc, migrateSceneDoc } from '@systems/sceneeditor/SceneDoc';

/** Validate+migrate a batch of raw docs, dropping invalid ones. De-dupes by id (last wins). */
export function sanitizeSceneDocs(raws: unknown[]): SceneDoc[] {
  const byId = new Map<string, SceneDoc>();
  for (const raw of raws) {
    const doc = validateSceneDoc(raw);
    if (doc) byId.set(doc.id, migrateSceneDoc(doc));
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/* istanbul ignore next -- browser/Electron I/O; the sanitize logic above is tested */
export async function loadAllSceneDocs(): Promise<SceneDoc[]> {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.sceneList) {
      return sanitizeSceneDocs(await window.electronAPI.sceneList());
    }
    if (typeof fetch === 'undefined') return [];
    const idx = await fetch('/scenes/index.json');
    if (!idx.ok) return [];
    const { ids } = (await idx.json()) as { ids?: string[] };
    if (!Array.isArray(ids)) return [];
    const raws = await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(`/scenes/${id}.json`);
        return res.ok ? await res.json() : null;
      } catch { return null; }
    }));
    return sanitizeSceneDocs(raws.filter((r) => r !== null));
  } catch {
    return []; // fail-open: no authored scenes, procedural world unaffected
  }
}

/* istanbul ignore next -- Electron IPC wrapper */
export async function writeSceneDoc(doc: SceneDoc): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.sceneWrite) {
    return window.electronAPI.sceneWrite(doc);
  }
  return false; // browser preview cannot write project files
}

/* istanbul ignore next -- Electron IPC wrapper */
export async function deleteSceneDoc(sceneId: string): Promise<boolean> {
  if (typeof window !== 'undefined' && window.electronAPI?.sceneDelete) {
    return window.electronAPI.sceneDelete(sceneId);
  }
  return false;
}
