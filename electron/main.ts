import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;
const claudeProcesses = new Map<string, ChildProcess>();

function createWindow() {
  win = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toISOString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// Claude CLI NPC integration
ipcMain.handle(
  'claude-query',
  async (_event, { npcId, prompt, claudePath, sessionId, useSession }: {
    npcId: string;
    prompt: string;
    claudePath: string;
    sessionId?: string;
    useSession?: boolean;
  }) => {
    return new Promise<void>((resolve, reject) => {
      const args = ['--print', '--no-markdown'];
      if (useSession && sessionId) {
        args.unshift('--session-id', sessionId);
      }
      const proc = spawn(claudePath, args, {
        env: { ...process.env },
      });

      claudeProcesses.set(npcId, proc);

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        win?.webContents.send('claude-response-chunk', { npcId, chunk: chunk.toString() });
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        console.error(`[Claude NPC ${npcId}] stderr:`, chunk.toString());
      });

      proc.on('close', (code) => {
        claudeProcesses.delete(npcId);
        win?.webContents.send('claude-response-done', { npcId, code });
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`Claude process exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        claudeProcesses.delete(npcId);
        reject(err);
      });
    });
  }
);

ipcMain.handle('claude-cancel', (_event, { npcId }: { npcId: string }) => {
  const proc = claudeProcesses.get(npcId);
  if (proc) {
    proc.kill();
    claudeProcesses.delete(npcId);
  }
});

ipcMain.handle('window-minimize', () => win?.minimize());
ipcMain.handle('window-maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.handle('window-close', () => win?.close());

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

app.on('window-all-closed', () => {
  claudeProcesses.forEach((proc) => proc.kill());
  claudeProcesses.clear();
  if (process.platform !== 'darwin') app.quit();
  win = null;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(createWindow);
