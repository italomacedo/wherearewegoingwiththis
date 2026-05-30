import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, InputText, StackPanel, Button, Control,
} from '@babylonjs/gui';

export interface DialogState {
  open: boolean;
  npcName: string;
  npcText: string;
  thinking: boolean;
}

/**
 * Manages the NPC dialog overlay. The state machine (open/close, streaming
 * text, thinking indicator, focus tracking) is pure and fully tested; the
 * Babylon GUI rendering (speech bubble, player input, send button) is
 * browser-only and exercised by the Electron smoke test.
 */
export class DialogSystem {
  private scene: Scene;
  private state: DialogState = {
    open: false,
    npcName: '',
    npcText: '',
    thinking: false,
  };
  private onSubmitHandler: ((message: string) => void) | null = null;
  private inputFocused = false;

  // Browser GUI handles (null in Node/Jest).
  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private nameBlock: TextBlock | null = null;
  private bodyBlock: TextBlock | null = null;
  private input: InputText | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  getState(): DialogState {
    return { ...this.state };
  }

  open(npcName: string): void {
    this.state = { open: true, npcName, npcText: '', thinking: false };
    this.render();
    this.focusInput();
  }

  close(): void {
    this.state = { open: false, npcName: '', npcText: '', thinking: false };
    this.inputFocused = false;
    this.render();
  }

  isOpen(): boolean {
    return this.state.open;
  }

  /**
   * True while the player has the message field focused. The world scene uses
   * this to stop the "interact" key from closing the dialog mid-typing.
   */
  isInputFocused(): boolean {
    return this.inputFocused;
  }

  setThinking(thinking: boolean): void {
    this.state = { ...this.state, thinking };
    this.render();
  }

  /** Append a streamed chunk to the NPC's current line. */
  appendChunk(chunk: string): void {
    this.state = {
      ...this.state,
      npcText: this.state.npcText + chunk,
      thinking: false,
    };
    this.render();
  }

  setNpcText(text: string): void {
    this.state = { ...this.state, npcText: text, thinking: false };
    this.render();
  }

  onSubmit(handler: (message: string) => void): void {
    this.onSubmitHandler = handler;
  }

  /** Called by UI (or tests) when the player submits a message. */
  submit(message: string): void {
    const trimmed = message.trim();
    if (!trimmed || !this.state.open) return;
    this.onSubmitHandler?.(trimmed);
  }

  /** The text shown in the NPC body line, including the thinking placeholder. */
  /* istanbul ignore next — browser GUI only */
  private displayText(): string {
    if (this.state.thinking && !this.state.npcText) return '. . .';
    return this.state.npcText;
  }

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
    this.input?.focus();
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('dialog-ui', true, this.scene);
    gui.layer!.layerMask = 0x10000000;
    this.gui = gui;

    // Bottom speech panel.
    const panel = new Rectangle('dialog-panel');
    panel.width = '640px';
    panel.height = '180px';
    panel.cornerRadius = 8;
    panel.thickness = 1;
    panel.color = '#00FFCC';
    panel.background = 'rgba(0,18,26,0.92)';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.paddingBottom = '24px';
    panel.isVisible = false;
    gui.addControl(panel);

    const stack = new StackPanel('dialog-stack');
    stack.paddingTop = '12px';
    stack.paddingBottom = '12px';
    stack.paddingLeft = '16px';
    stack.paddingRight = '16px';
    stack.spacing = 8;
    panel.addControl(stack);

    const nameBlock = new TextBlock('dialog-name', '');
    nameBlock.color = '#00FFCC';
    nameBlock.fontSize = 16;
    nameBlock.fontFamily = '"Courier New", monospace';
    nameBlock.fontStyle = 'bold';
    nameBlock.height = '24px';
    nameBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    stack.addControl(nameBlock);

    const bodyBlock = new TextBlock('dialog-body', '');
    bodyBlock.color = '#CCE8E0';
    bodyBlock.fontSize = 15;
    bodyBlock.fontFamily = '"Courier New", monospace';
    bodyBlock.textWrapping = true;
    bodyBlock.height = '70px';
    bodyBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bodyBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    stack.addControl(bodyBlock);

    // Input row: text field + send button.
    const row = new StackPanel('dialog-input-row');
    row.isVertical = false;
    row.height = '36px';
    row.spacing = 8;
    stack.addControl(row);

    const input = new InputText('dialog-input', '');
    input.width = '520px';
    input.height = '36px';
    input.color = '#E8FFF8';
    input.background = 'rgba(0,30,40,0.9)';
    input.focusedBackground = 'rgba(0,45,58,0.95)';
    input.fontSize = 15;
    input.fontFamily = '"Courier New", monospace';
    input.placeholderText = 'Say something…';
    input.placeholderColor = '#557';
    input.onFocusObservable.add(() => { this.inputFocused = true; });
    input.onBlurObservable.add(() => { this.inputFocused = false; });
    input.onKeyboardEventProcessedObservable.add((evt) => {
      if (evt.key === 'Enter') this.submitFromInput();
    });
    row.addControl(input);

    const send = Button.CreateSimpleButton('dialog-send', 'SEND');
    send.width = '88px';
    send.height = '36px';
    send.color = '#00FFCC';
    send.background = 'rgba(0,60,50,0.9)';
    send.fontSize = 14;
    send.fontFamily = '"Courier New", monospace';
    send.thickness = 1;
    send.onPointerUpObservable.add(() => this.submitFromInput());
    row.addControl(send);

    this.panel = panel;
    this.nameBlock = nameBlock;
    this.bodyBlock = bodyBlock;
    this.input = input;
  }

  /* istanbul ignore next — browser GUI only */
  private submitFromInput(): void {
    if (!this.input) return;
    const text = this.input.text;
    this.input.text = '';
    this.submit(text);
  }

  /* istanbul ignore next — browser GUI only */
  private renderBrowser(): void {
    if (this.panel) this.panel.isVisible = this.state.open;
    if (this.nameBlock) this.nameBlock.text = this.state.npcName;
    if (this.bodyBlock) this.bodyBlock.text = this.displayText();
    if (this.input && !this.state.open) this.input.text = '';
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
      this.bodyBlock = null;
      this.input = null;
    }
  }
}
