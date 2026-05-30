import { contextBridge, ipcRenderer } from 'electron';

export interface ClaudeQueryParams {
  npcId: string;
  context: string;
  message: string;
  claudePath: string;
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
};

contextBridge.exposeInMainWorld('electronAPI', api);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
