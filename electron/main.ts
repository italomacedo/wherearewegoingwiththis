import { app, BrowserWindow, ipcMain, shell, crashReporter } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, ChildProcess, SpawnOptions } from 'node:child_process';

interface ClaudeInvocation {
  command: string;
  spawnArgs: string[];
  options: SpawnOptions;
}

/**
 * Resolves how to launch the Claude CLI robustly across platforms.
 *
 * On Windows, `claude` is a `.cmd` shim that calls `node cli.js` — but if Node
 * isn't on the PATH the Electron child inherits (common), the shim fails with
 * "...cli.js is not recognized". To avoid both the shim and the Node-on-PATH
 * dependency, we locate the package's `cli.js` and run it with Electron's own
 * bundled Node (`ELECTRON_RUN_AS_NODE=1`, via process.execPath).
 */
function resolveClaudeInvocation(claudePath: string, args: string[]): ClaudeInvocation {
  // Resolve the real entry point (a .js to run with Node, or a native .exe).
  const entry = resolveEntry(claudePath);
  if (entry) {
    if (/\.[cm]?js$/i.test(entry)) {
      // Run the JS entry with Electron's bundled Node — no shim, no Node-on-PATH.
      return {
        command: process.execPath,
        spawnArgs: [entry, ...args],
        options: { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
      };
    }
    // A native executable (e.g. bin/claude.exe) — spawn it directly.
    return { command: entry, spawnArgs: args, options: { env: { ...process.env } } };
  }

  if (process.platform === 'win32') {
    // Last resort: let cmd.exe resolve the .cmd shim (needs Node on PATH).
    const command = /\s/.test(claudePath) ? `"${claudePath}"` : claudePath;
    return { command, spawnArgs: args, options: { env: { ...process.env }, shell: true } };
  }

  // macOS/Linux: the `claude` bin is an executable (shebang) — spawn directly.
  return { command: claudePath, spawnArgs: args, options: { env: { ...process.env } } };
}

/**
 * Resolve the Claude Code entry point (`cli.js` or a native `claude.exe`) from
 * whatever the user configured — handling clean paths, a typo'd suffix, and
 * reading the shim on PATH. Returns an existing file path or null.
 */
function resolveEntry(claudePath: string): string | null {
  // A clean path straight to a JS or EXE entry.
  if (/\.([cm]?js|exe)$/i.test(claudePath)) {
    try { if (fs.existsSync(claudePath)) return claudePath; } catch { /* ignore */ }
  }
  // A path that points *inside* the claude-code package but has a typo/suffix
  // (e.g. "...\@anthropic-ai\claude-code\cli.jsclaude") → recover a real entry.
  const marker = `@anthropic-ai${path.sep}claude-code`;
  const idx = claudePath.indexOf(marker);
  if (idx !== -1) {
    const pkgDir = claudePath.slice(0, idx + marker.length);
    for (const rel of ['cli.js', path.join('bin', 'claude.exe'), 'cli.mjs']) {
      const cand = path.join(pkgDir, rel);
      try { if (fs.existsSync(cand)) return cand; } catch { /* ignore */ }
    }
  }
  // Otherwise locate it from the shim on PATH (Windows npm-global installs).
  if (process.platform === 'win32') return findWindowsClaudeCli(claudePath);
  return null;
}

/** Synchronous `which`: find an executable on PATH honoring PATHEXT (Windows). */
function whichSync(name: string): string | null {
  // Already an absolute/relative path with a separator → use as-is.
  if (name.includes('\\') || name.includes('/')) {
    try { if (fs.existsSync(name)) return name; } catch { /* ignore */ }
  }
  // On Windows try real extensions FIRST so we resolve `claude.cmd` (whose
  // `%dp0%` entry path we can read) before the extension-less bash shim.
  const exts = process.platform === 'win32'
    ? [...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';'), '']
    : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
    }
  }
  return null;
}

/**
 * Reads a Windows `.cmd`/`.bat` npm shim and extracts the real JS entry it
 * invokes (ground truth — no guessing the file name/location). The shim's line
 * looks like `"%_prog%"  "%dp0%\node_modules\...\cli.js" %*`.
 */
function readShimEntry(shimPath: string): string | null {
  try {
    const content = fs.readFileSync(shimPath, 'utf8');
    const dir = path.dirname(shimPath);
    // First quoted path ending in .js/.mjs/.cjs or .exe (the package entry).
    const m = content.match(/"([^"]*\.(?:[cm]?js|exe))"/i);
    if (!m) return null;
    let entry = m[1]
      .replace(/%~?dp0%?/gi, dir + path.sep) // dp0 → shim directory
      .replace(/[\\/]{2,}/g, path.sep);      // collapse doubled separators
    if (!path.isAbsolute(entry)) entry = path.join(dir, entry);
    return fs.existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

/**
 * Locate the Claude Code JS entry on Windows. Finds the `claude` shim on PATH
 * (independent of any mis-typed configured path), reads it for the true entry,
 * then falls back to dirname/well-known derivations. Does NOT depend on
 * %APPDATA% nor on the configured path being correct.
 */
function findWindowsClaudeCli(claudePath: string): string | null {
  const shims: string[] = [];
  if (/\.(cmd|bat|ps1)$/i.test(claudePath)) {
    try { if (fs.existsSync(claudePath)) shims.push(claudePath); } catch { /* ignore */ }
  }
  const onPath = whichSync('claude'); // search PATH for the shim by bare name
  if (onPath) shims.push(onPath);

  const rels = [
    path.join('node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    path.join('node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    path.join('node_modules', '@anthropic-ai', 'claude-code', 'cli.mjs'),
  ];
  for (const shim of shims) {
    const fromShim = readShimEntry(shim);
    if (fromShim) return fromShim;
    for (const rel of rels) {
      const derived = path.join(path.dirname(shim), rel);
      try { if (fs.existsSync(derived)) return derived; } catch { /* ignore */ }
    }
  }

  const baseDirs = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs') : null,
  ].filter((d): d is string => d !== null);
  for (const base of baseDirs) {
    for (const rel of rels) {
      const candidate = path.join(base, rel);
      try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
    }
  }
  return null;
}

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

// Write native minidumps locally for ANY hard crash (renderer/GPU/utility/main) —
// a Havok/V8/GPU abort kills the process without a JS stack, so the only trace is a
// dump under <userData>/Crashpad/. Never upload. (Crash diagnostics, Fase 18.)
crashReporter.start({ uploadToServer: false, compress: true });

// Safety net: a single-player desktop game's MAIN process should never die from a
// stray async error (e.g. a broken child-process pipe). Log and keep running.
/* eslint-disable no-console */
process.on('uncaughtException', (err) => console.error('[main] uncaughtException (kept alive):', err));
process.on('unhandledRejection', (reason) => console.error('[main] unhandledRejection:', reason));
// Distinguish a clean shutdown from a vanish: a native abort exits with a non-zero
// code and skips will-quit; a normal quit logs both.
process.on('exit', (code) => console.error(`[main] process exit code=${code}`));
app.on('will-quit', () => console.error('[main] app will-quit (clean shutdown)'));
/* eslint-enable no-console */

// A renderer JS error/rejection can be lost if the console flush races the crash —
// forward it over IPC so it always reaches this terminal log before the window dies.
ipcMain.on('renderer-fatal', (_e, msg: string) => {
  // eslint-disable-next-line no-console
  console.error('[renderer-fatal]', msg);
});

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
      // Single-player desktop game: let the branding/menu music start before
      // the first user gesture (Chromium blocks audio autoplay by default).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toISOString());
  });

  // Surface hard crashes (renderer/GPU/native) in the terminal log — these never
  // produce a JS stack in the DevTools console, so capture the reason here.
  /* eslint-disable no-console */
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[CRASH] render-process-gone:', JSON.stringify(details));
  });
  win.webContents.on('unresponsive', () => console.error('[CRASH] renderer unresponsive (hang)'));
  /* eslint-enable no-console */

  // Block Chromium's built-in keyboard accelerators that would wreck a game session:
  // Ctrl/Cmd+W CLOSES the window — but W is "move forward" and Ctrl is "descend the
  // nave", so flying down-and-forward quit the whole app (looked like a random crash).
  // Also block reload (Ctrl/Cmd+R, F5) so a stray keypress can't nuke the play session.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    const key = (input.key || '').toLowerCase();
    // Ctrl/Cmd+W closes the window — never wanted in a game; block it always.
    if (mod && key === 'w') { event.preventDefault(); return; }
    // Reload (Ctrl/Cmd+R, F5) nukes the play session — block in the packaged build,
    // but keep it in dev for HMR / manual reload.
    if (!VITE_DEV_SERVER_URL && ((mod && key === 'r') || key === 'f5')) event.preventDefault();
  });
  /* eslint-disable no-console */
  // Forward the RENDERER console to this terminal so the last error before a hard
  // crash (e.g. a Havok/WASM abort) survives the window closing — the in-window
  // DevTools dies with the renderer, but the main-process terminal persists.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${line})`); // 2=warning,3=error
  });
  /* eslint-enable no-console */

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
  async (_event, { npcId, prompt, claudePath, sessionId, useSession, resumeSession, systemPrompt, model, effort }: {
    npcId: string;
    prompt: string;
    claudePath: string;
    sessionId?: string;
    useSession?: boolean;
    resumeSession?: boolean;
    systemPrompt?: string;
    model?: string;
    effort?: string;
  }) => {
    return new Promise<void>((resolve, reject) => {
      // `--print` runs Claude non-interactively and emits plain text to stdout
      // (no markdown rendering when piped), reading the prompt from stdin.
      const args = ['--print'];
      if (useSession && sessionId) {
        // --session-id CREATES a session with that UUID (graduation call); reusing
        // it errors "already in use", so CONTINUE with --resume on later turns.
        if (resumeSession) {
          args.unshift('--resume', sessionId);
        } else {
          args.unshift('--session-id', sessionId);
        }
      }
      // Static NPC persona passed as --system-prompt so the Claude API can cache
      // it across calls (same text = cache hit within 5 minutes). This also
      // REPLACES Claude Code's large default coding-agent system prompt. (Fase 14C.)
      if (systemPrompt) {
        args.push('--system-prompt', systemPrompt);
      }
      // Use the cheapest model tier (Haiku) for all in-game NPC calls. (Fase 14E.)
      if (model) {
        args.push('--model', model);
      }
      // Minimize reasoning/thinking tokens (cheaper + faster) — ample for short
      // NPC dialogue + the trivial classifiers. Levels: low|medium|high|xhigh|max. (Fase 14E.)
      if (effort) {
        args.push('--effort', effort);
      }
      // Resolve a robust launch strategy (prefers running cli.js with Electron's
      // bundled Node). The prompt is fed via stdin — never interpolated into the
      // command line — so there's no shell-injection risk.
      const { command, spawnArgs, options } = resolveClaudeInvocation(claudePath, args);
      // Run from a neutral temp dir so Claude Code does NOT auto-discover and
      // inject the project's large CLAUDE.md (~15k tokens) into every NPC call.
      // (--bare would do this too but breaks OAuth/keychain auth; cwd is safe.) (Fase 14E.)
      options.cwd = os.tmpdir();
      let configuredExists = false;
      try { configuredExists = fs.existsSync(claudePath); } catch { /* ignore */ }
      console.log(
        `[Claude NPC] claudePath=${JSON.stringify(claudePath)} exists=${configuredExists} | ` +
        `whichClaude=${JSON.stringify(whichSync('claude'))} | command=${JSON.stringify(command)} | ` +
        `args=${JSON.stringify(spawnArgs)} | mode=${options.shell ? 'SHELL' : 'direct(node)'}`
      );
      const proc = spawn(command, spawnArgs, options);

      claudeProcesses.set(npcId, proc);

      // CRITICAL: a failed/early-closed child makes the stdin pipe emit 'error'
      // (EPIPE/ENOENT). An UNHANDLED stream 'error' is an uncaught exception that
      // crashes the whole Electron MAIN process (observed: app dies after an
      // autonomous NPC call, no renderer stack). Handle it + guard the write;
      // the child's own 'error'/'close' below still rejects the promise.
      proc.stdin?.on('error', () => { /* swallowed — handled via proc 'error'/'close' */ });
      // Same for the read streams: an 'error' on stdout/stderr (e.g. the child dies
      // mid-pipe) is otherwise an unhandled stream event. Swallow — 'close' resolves.
      proc.stdout?.on('error', () => { /* swallowed */ });
      proc.stderr?.on('error', () => { /* swallowed */ });
      try {
        proc.stdin?.write(prompt);
        proc.stdin?.end();
      } catch {
        /* child already gone — proc 'error'/'close' handles the rejection */
      }

      let stderrBuf = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        win?.webContents.send('claude-response-chunk', { npcId, chunk: chunk.toString() });
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderrBuf += text;
        console.error(`[Claude NPC ${npcId}] stderr:`, text);
      });

      proc.on('close', (code) => {
        claudeProcesses.delete(npcId);
        win?.webContents.send('claude-response-done', { npcId, code });
        if (code === 0 || code === null) {
          resolve();
        } else {
          // Surface the real reason (invalid flag, not logged in, etc.).
          const detail = stderrBuf.trim().slice(0, 300);
          reject(new Error(`Claude exited with code ${code}${detail ? `: ${detail}` : ''}`));
        }
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        claudeProcesses.delete(npcId);
        if (err.code === 'ENOENT') {
          reject(new Error(
            `Claude CLI not found (tried "${claudePath}"). Install it and/or set the ` +
            `full path in Options → Game → Claude CLI path.`
          ));
          return;
        }
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

// ─── Save games: JSON files in userData/saves (ADR-0006) ──────────────────────
// The renderer cannot touch fs, so all save I/O goes through these handlers. This
// replaces the old localStorage backend, which has a ~5 MB per-origin quota that
// the procedural world's growing npcMemory blew (QuotaExceeded → save silently
// lost). Disk files have no such cap. Writes go temp-then-rename = atomic.
function savesDir(): string {
  const dir = path.join(app.getPath('userData'), 'saves');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

ipcMain.handle('save:list', () => {
  try {
    const dir = savesDir();
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); }
        catch { return null; }
      })
      .filter((s) => s !== null);
  } catch { return []; }
});

ipcMain.handle('save:load', (_event, saveId: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(savesDir(), `${saveId}.json`), 'utf-8'));
  } catch { return null; }
});

ipcMain.handle('save:write', (_event, saveGame: { saveId: string }) => {
  try {
    const final = path.join(savesDir(), `${saveGame.saveId}.json`);
    const tmp = `${final}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(saveGame));
    fs.renameSync(tmp, final);
    return true;
  } catch (err) { console.error('[Save] write failed:', err); return false; }
});

ipcMain.handle('save:delete', (_event, saveId: string) => {
  try { fs.rmSync(path.join(savesDir(), `${saveId}.json`), { force: true }); return true; }
  catch { return false; }
});

// ─── Scene Editor docs: JSON files in public/scenes (dev) ─────────────────────
// Authored scenes are GAME CONTENT: in dev the editor writes straight into the
// project's public/scenes (git-versioned, served by Vite at /scenes/...). In the
// packaged build the bundled scenes ship read-only under dist/scenes; edits go
// to a userData overlay and scene:list merges the two (userData wins by id).
const SCENE_ID_RE = /^[a-z0-9_-]+$/;

function bundledScenesDir(): string {
  // Dev: app.getAppPath() = project root under vite-plugin-electron.
  const dir = VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), 'public', 'scenes')
    : path.join(RENDERER_DIST, 'scenes');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

function writableScenesDir(): string {
  if (VITE_DEV_SERVER_URL) return bundledScenesDir();
  const dir = path.join(app.getPath('userData'), 'scenes');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return dir;
}

function readSceneDocs(dir: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  let files: string[] = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      if (doc && typeof doc.id === 'string') out.set(doc.id, doc);
    } catch { /* skip corrupt */ }
  }
  return out;
}

/** Regenerate public/scenes/index.json ({ids}) so the no-IPC browser preview can discover scenes. */
function rewriteSceneIndex(): void {
  try {
    const dir = writableScenesDir();
    const ids = [...readSceneDocs(dir).keys()].sort();
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ ids }));
  } catch (err) { console.error('[Scene] index rewrite failed:', err); }
}

ipcMain.handle('scene:list', () => {
  const merged = readSceneDocs(bundledScenesDir());
  if (writableScenesDir() !== bundledScenesDir()) {
    for (const [id, doc] of readSceneDocs(writableScenesDir())) merged.set(id, doc);
  }
  return [...merged.values()];
});

ipcMain.handle('scene:load', (_event, sceneId: string) => {
  if (!SCENE_ID_RE.test(sceneId)) return null;
  for (const dir of [writableScenesDir(), bundledScenesDir()]) {
    try { return JSON.parse(fs.readFileSync(path.join(dir, `${sceneId}.json`), 'utf-8')); }
    catch { /* try next */ }
  }
  return null;
});

ipcMain.handle('scene:write', (_event, doc: { id: string }) => {
  try {
    if (!doc || typeof doc.id !== 'string' || !SCENE_ID_RE.test(doc.id)) return false;
    const final = path.join(writableScenesDir(), `${doc.id}.json`);
    const tmp = `${final}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 1));
    fs.renameSync(tmp, final);
    rewriteSceneIndex();
    console.log('[Scene] wrote', final);
    return true;
  } catch (err) { console.error('[Scene] write failed:', err); return false; }
});

ipcMain.handle('scene:delete', (_event, sceneId: string) => {
  try {
    if (!SCENE_ID_RE.test(sceneId)) return false;
    fs.rmSync(path.join(writableScenesDir(), `${sceneId}.json`), { force: true });
    rewriteSceneIndex();
    return true;
  } catch { return false; }
});

/* eslint-disable-next-line no-console */
app.on('child-process-gone', (_e, details) => console.error('[CRASH] child-process-gone:', JSON.stringify(details)));

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
