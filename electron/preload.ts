import { contextBridge, ipcRenderer } from 'electron';

export interface ClaudeQueryParams {
  npcId: string;
  prompt: string;
  claudePath: string;
  sessionId?: string;
  useSession?: boolean;
  /** Continue an existing session (--resume) instead of creating it (--session-id). */
  resumeSession?: boolean;
  /** Static NPC persona — passed as --system-prompt arg for prompt caching. */
  systemPrompt?: string;
  /** Model alias (e.g. 'haiku') for --model — cheap model for game NPC calls. */
  model?: string;
  /** Reasoning effort (e.g. 'low') for --effort — minimizes thinking tokens. */
  effort?: string;
}

export interface ElectronAPI {
  claudeQuery: (params: ClaudeQueryParams) => Promise<void>;
  claudeCancel: (npcId: string) => Promise<void>;
  onClaudeResponseChunk: (callback: (data: { npcId: string; chunk: string }) => void) => () => void;
  onClaudeResponseDone: (callback: (data: { npcId: string; code: number | null }) => void) => () => void;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  /** Save games persisted as JSON files in userData/saves (ADR-0006). */
  saveList: () => Promise<unknown[]>;
  saveLoad: (saveId: string) => Promise<unknown | null>;
  saveWrite: (saveGame: unknown) => Promise<boolean>;
  saveDelete: (saveId: string) => Promise<boolean>;
  /** Scene Editor docs persisted as JSON files in public/scenes (dev) / userData overlay (packaged). */
  sceneList: () => Promise<unknown[]>;
  sceneLoad: (sceneId: string) => Promise<unknown | null>;
  sceneWrite: (doc: unknown) => Promise<boolean>;
  sceneDelete: (sceneId: string) => Promise<boolean>;
}

const api: ElectronAPI = {
  claudeQuery: (params) => ipcRenderer.invoke('claude-query', params),
  claudeCancel: (npcId) => ipcRenderer.invoke('claude-cancel', { npcId }),

  onClaudeResponseChunk: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { npcId: string; chunk: string }) =>
      callback(data);
    ipcRenderer.on('claude-response-chunk', listener);
    return () => ipcRenderer.removeListener('claude-response-chunk', listener);
  },

  onClaudeResponseDone: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { npcId: string; code: number | null }) =>
      callback(data);
    ipcRenderer.on('claude-response-done', listener);
    return () => ipcRenderer.removeListener('claude-response-done', listener);
  },

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  saveList: () => ipcRenderer.invoke('save:list'),
  saveLoad: (saveId) => ipcRenderer.invoke('save:load', saveId),
  saveWrite: (saveGame) => ipcRenderer.invoke('save:write', saveGame),
  saveDelete: (saveId) => ipcRenderer.invoke('save:delete', saveId),

  sceneList: () => ipcRenderer.invoke('scene:list'),
  sceneLoad: (sceneId) => ipcRenderer.invoke('scene:load', sceneId),
  sceneWrite: (doc) => ipcRenderer.invoke('scene:write', doc),
  sceneDelete: (sceneId) => ipcRenderer.invoke('scene:delete', sceneId),
};

contextBridge.exposeInMainWorld('electronAPI', api);

// Forward any uncaught renderer error/rejection to the main process so it lands in
// the terminal log even if the window dies before the console flushes (crash diag).
window.addEventListener('error', (e) => {
  const m = e.error?.stack || `${e.message} @ ${e.filename}:${e.lineno}`;
  ipcRenderer.send('renderer-fatal', `error: ${m}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  ipcRenderer.send('renderer-fatal', `unhandledrejection: ${r?.stack || String(r)}`);
});

// The renderer-side global Window.electronAPI typing lives in src/vite-env.d.ts
// (declared optional, since it is undefined until the preload runs).
