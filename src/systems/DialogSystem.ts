import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, StackPanel, Control, Grid, ScrollViewer,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';

export type DialogRole = 'player' | 'npc' | 'system' | 'narration';

export interface DialogLine {
  role: DialogRole;
  text: string;
}

export type DialogSegmentKind = 'speech' | 'emote';

export interface DialogSegment {
  kind: DialogSegmentKind;
  text: string;
}

export interface DialogState {
  open: boolean;
  npcName: string;
  lines: DialogLine[];
  thinking: boolean;
  /** Convenience: text of the most recent NPC line ('' if none). */
  npcText: string;
}

/**
 * Generic, reusable NPC conversation overlay. Works for ANY NPC: open it with a
 * display name and optional seeded history, append player/NPC lines, and it
 * renders a scrollable, cinematic transcript distinguishing *emotes* from
 * "speech". The state machine + segment parsing are pure and fully tested; the
 * Babylon GUI rendering is browser-only.
 */
export class DialogSystem {
  private scene: Scene;
  private opened = false;
  private npcName = '';
  private lines: DialogLine[] = [];
  private thinking = false;
  private inputFocused = false;
  private onSubmitHandler: ((message: string) => void) | null = null;

  // Browser GUI handles (null in Node/Jest).
  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private nameBlock: TextBlock | null = null;
  private historyStack: StackPanel | null = null;
  private scroll: ScrollViewer | null = null;
  // A native DOM <input> is used (not Babylon's GUI InputText) so non-US keyboard
  // layouts, accents (ç ã é), dead keys, IME and paste all work — the GUI
  // InputText reconstructs text from key events and drops chars like '?'.
  private domInput: HTMLInputElement | null = null;
  private domWrap: HTMLDivElement | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  getState(): DialogState {
    return {
      open: this.opened,
      npcName: this.npcName,
      lines: this.lines.map((l) => ({ ...l })),
      thinking: this.thinking,
      npcText: this.lastNpcText(),
    };
  }

  /** Open the dialog for an NPC, optionally seeding prior conversation lines. */
  open(npcName: string, seed: DialogLine[] = []): void {
    this.opened = true;
    this.npcName = npcName;
    this.lines = seed.map((l) => ({ ...l }));
    this.thinking = false;
    this.render();
    this.focusInput();
  }

  close(): void {
    this.opened = false;
    this.npcName = '';
    this.lines = [];
    this.thinking = false;
    this.inputFocused = false;
    this.render();
  }

  isOpen(): boolean {
    return this.opened;
  }

  isInputFocused(): boolean {
    return this.inputFocused;
  }

  setThinking(thinking: boolean): void {
    this.thinking = thinking;
    this.render();
  }

  /** Append a line for what the player just said. */
  addPlayerLine(text: string): void {
    this.lines.push({ role: 'player', text });
    this.render();
  }

  /** Append an out-of-world system notice (e.g. a moderation refusal). */
  addSystemLine(text: string): void {
    this.lines.push({ role: 'system', text });
    this.thinking = false;
    this.render();
  }

  /** Append a diegetic narration line (emote outcome / ambient reaction). */
  addNarrationLine(text: string): void {
    this.lines.push({ role: 'narration', text });
    this.thinking = false;
    this.render();
  }

  /** Append a streamed chunk to the current NPC line (creating one if needed). */
  appendChunk(chunk: string): void {
    const last = this.lines[this.lines.length - 1];
    if (last && last.role === 'npc') {
      last.text += chunk;
    } else {
      this.lines.push({ role: 'npc', text: chunk });
    }
    this.thinking = false;
    this.render();
  }

  /** Replace the current NPC line's text (errors / non-streamed replies). */
  setNpcText(text: string): void {
    const last = this.lines[this.lines.length - 1];
    if (last && last.role === 'npc') {
      last.text = text;
    } else {
      this.lines.push({ role: 'npc', text });
    }
    this.thinking = false;
    this.render();
  }

  /** Update the speaker name live (e.g. once the NPC introduces itself). */
  setNpcName(name: string): void {
    this.npcName = name;
    this.render();
  }

  onSubmit(handler: (message: string) => void): void {
    this.onSubmitHandler = handler;
  }

  /** Called by UI (or tests) when the player submits a message. */
  submit(message: string): void {
    const trimmed = message.trim();
    if (!trimmed || !this.opened) return;
    this.onSubmitHandler?.(trimmed);
  }

  private lastNpcText(): string {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i]!.role === 'npc') return this.lines[i]!.text;
    }
    return '';
  }

  /**
   * Split an NPC line into ordered segments: *emotes* vs. the surrounding
   * speech. Pure + tested; the renderer styles each segment differently.
   */
  static parseSegments(text: string): DialogSegment[] {
    const segments: DialogSegment[] = [];
    const re = /\*([^*]+)\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        const speech = text.slice(last, m.index).trim();
        if (speech) segments.push({ kind: 'speech', text: speech });
      }
      const emote = m[1]!.trim();
      if (emote) segments.push({ kind: 'emote', text: emote });
      last = re.lastIndex;
    }
    if (last < text.length) {
      const speech = text.slice(last).trim();
      if (speech) segments.push({ kind: 'speech', text: speech });
    }
    return segments;
  }

  // ─── Browser GUI (istanbul-ignored) ─────────────────────────────────────────

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.buildUIBrowser();
  }

  private render(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.renderBrowser();
  }

  private focusInput(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.domInput?.focus();
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('dialog-ui', true, this.scene);
    this.gui = gui;

    const panel = new Rectangle('dialog-panel');
    panel.width = '760px';
    panel.height = '340px';
    panel.cornerRadius = 10;
    panel.thickness = 1;
    panel.color = 'rgba(0,255,204,0.55)';
    panel.background = 'rgba(2,10,14,0.94)';
    panel.shadowColor = '#00FFCC';
    panel.shadowBlur = 24;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.paddingBottom = '36px';
    panel.isVisible = false;
    gui.addControl(panel);
    this.panel = panel;

    const grid = new Grid('dialog-grid');
    grid.paddingTop = '12px';
    grid.paddingBottom = '12px';
    grid.paddingLeft = '18px';
    grid.paddingRight = '18px';
    grid.addRowDefinition(34, true);   // name
    grid.addRowDefinition(8, true);    // divider
    grid.addRowDefinition(1, false);   // history (fills)
    grid.addRowDefinition(46, true);   // input row
    panel.addControl(grid);

    const nameBlock = new TextBlock('dialog-name', '');
    nameBlock.color = '#00FFCC';
    nameBlock.fontSize = 18;
    nameBlock.fontFamily = '"Courier New", monospace';
    nameBlock.fontStyle = 'bold';
    nameBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    grid.addControl(nameBlock, 0, 0);
    this.nameBlock = nameBlock;

    const divider = new Rectangle('dialog-divider');
    divider.height = '1px';
    divider.background = 'rgba(0,255,204,0.25)';
    divider.thickness = 0;
    divider.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    grid.addControl(divider, 1, 0);

    const scroll = new ScrollViewer('dialog-scroll');
    scroll.thickness = 0;
    scroll.barColor = '#0A8A7A';
    scroll.barBackground = 'rgba(0,40,40,0.4)';
    scroll.wheelPrecision = 0.02;
    grid.addControl(scroll, 2, 0);
    this.scroll = scroll;

    const historyStack = new StackPanel('dialog-history');
    historyStack.isVertical = true;
    historyStack.spacing = 8;
    historyStack.paddingRight = '10px';
    historyStack.width = '700px';
    scroll.addControl(historyStack);
    this.historyStack = historyStack;

    // The input row is a native DOM overlay (see buildDomInput) — the canvas
    // grid just reserves the bottom row's space so the history doesn't run under it.
    this.buildDomInput();
  }

  /* istanbul ignore next — browser GUI only */
  private buildDomInput(): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:54px', 'transform:translateX(-50%)',
      'width:712px', 'max-width:92vw', 'display:none', 'gap:8px',
      'z-index:50', 'font-family:"Courier New",monospace',
    ].join(';');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('dialog.inputPlaceholder');
    input.style.cssText = [
      'flex:1', 'height:40px', 'box-sizing:border-box', 'padding:0 12px',
      'background:rgba(0,26,32,0.96)', 'color:#E8FFF8', 'caret-color:#00FFCC',
      'border:1px solid rgba(0,255,204,0.5)', 'border-radius:6px', 'outline:none',
      'font:15px "Courier New",monospace',
    ].join(';');
    input.addEventListener('focus', () => { this.inputFocused = true; });
    input.addEventListener('blur', () => { this.inputFocused = false; });
    // Keep typed keys out of the game InputSystem; Enter submits.
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.submitFromInput(); }
    });

    const send = document.createElement('button');
    send.textContent = t('dialog.send');
    send.style.cssText = [
      'width:90px', 'height:40px', 'cursor:pointer',
      'background:rgba(0,60,50,0.95)', 'color:#00FFCC',
      'border:1px solid rgba(0,255,204,0.6)', 'border-radius:6px',
      'font:bold 14px "Courier New",monospace',
    ].join(';');
    send.addEventListener('click', () => this.submitFromInput());

    wrap.appendChild(input);
    wrap.appendChild(send);
    document.body.appendChild(wrap);
    this.domWrap = wrap;
    this.domInput = input;
  }

  /* istanbul ignore next — browser GUI only */
  private submitFromInput(): void {
    if (!this.domInput) return;
    const text = this.domInput.value;
    this.domInput.value = '';
    this.submit(text);
  }

  /* istanbul ignore next — browser GUI only */
  private renderBrowser(): void {
    if (this.panel) this.panel.isVisible = this.opened;
    if (this.nameBlock) this.nameBlock.text = this.npcName;
    if (this.domWrap) this.domWrap.style.display = this.opened ? 'flex' : 'none';
    if (this.domInput && !this.opened) this.domInput.value = '';
    if (!this.historyStack) return;

    this.historyStack.clearControls();
    for (const line of this.lines) {
      if (line.role === 'system') {
        this.historyStack.addControl(this.buildSystemLine(line.text));
        continue;
      }
      if (line.role === 'narration') {
        this.historyStack.addControl(this.buildNarrationLine(line.text));
        continue;
      }
      // Both player and NPC lines parse *emotes* vs "speech"; styling is keyed
      // by speaker so you can roleplay actions and dialogue freely on either side.
      const segments = DialogSystem.parseSegments(line.text);
      segments.forEach((seg, i) => {
        this.historyStack!.addControl(this.buildSegment(seg, line.role as DialogRole, i === 0));
      });
    }
    if (this.thinking) this.historyStack.addControl(this.buildThinking());

    // Scroll to the latest line.
    if (this.scroll && this.scroll.verticalBar) {
      this.scroll.verticalBar.value = this.scroll.verticalBar.maximum;
    }
  }

  /* istanbul ignore next — browser GUI only */
  private buildSegment(seg: DialogSegment, role: DialogRole, isFirst: boolean): TextBlock {
    const isPlayer = role === 'player';
    const marker = isFirst && isPlayer ? '› ' : '';
    const body = seg.kind === 'emote' ? `❝ ${seg.text} ❞` : seg.text;
    const tb = new TextBlock('', `${marker}${body}`);
    tb.fontFamily = '"Courier New", monospace';
    tb.textWrapping = true;
    tb.resizeToFit = true;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    if (seg.kind === 'emote') {
      tb.fontStyle = 'italic';
      tb.fontSize = 14;
      tb.color = isPlayer ? '#59D0B8' : '#9A7BD6'; // player teal / NPC violet actions
    } else {
      tb.fontSize = 16;
      tb.color = isPlayer ? '#2FD9FF' : '#E8FFF8'; // player cyan / NPC near-white speech
    }
    return tb;
  }

  /* istanbul ignore next — browser GUI only */
  private buildSystemLine(text: string): TextBlock {
    const tb = new TextBlock('', `⚠ ${text}`);
    tb.color = '#FF6B6B';
    tb.fontSize = 14;
    tb.fontStyle = 'italic';
    tb.fontFamily = '"Courier New", monospace';
    tb.textWrapping = true;
    tb.resizeToFit = true;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    return tb;
  }

  /* istanbul ignore next — browser GUI only */
  private buildNarrationLine(text: string): TextBlock {
    const tb = new TextBlock('', `— ${text}`);
    tb.color = '#8FB7C2'; // muted cyan-grey, diegetic narration (not a red warning)
    tb.fontSize = 14;
    tb.fontStyle = 'italic';
    tb.fontFamily = '"Courier New", monospace';
    tb.textWrapping = true;
    tb.resizeToFit = true;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    return tb;
  }

  /* istanbul ignore next — browser GUI only */
  private buildThinking(): TextBlock {
    const tb = new TextBlock('', '. . .');
    tb.color = '#5A7E86';
    tb.fontSize = 16;
    tb.fontFamily = '"Courier New", monospace';
    tb.resizeToFit = true;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    return tb;
  }

  dispose(): void {
    this.onSubmitHandler = null;
    this.inputFocused = false;
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.panel = null;
      this.nameBlock = null;
      this.historyStack = null;
      this.scroll = null;
      this.domWrap?.remove();
      this.domWrap = null;
      this.domInput = null;
    }
  }
}
