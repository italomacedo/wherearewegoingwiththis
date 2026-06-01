import { Scene, TransformNode } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Rectangle, Control } from '@babylonjs/gui';

/**
 * Heads-up display for the game world: a persistent control hint, a contextual
 * action prompt ("[E] Talk to Zara" / "[F] Enter bike"), and floating name
 * labels linked to NPC/vehicle meshes. The prompt state is pure and tested; all
 * rendering is browser-only so it stays out of the headless test path.
 */
export class WorldHud {
  private scene: Scene;
  private actionPrompt: string | null = null;
  private playerHpFraction = 1;
  private vehicleStatus: string | null = null;

  private gui: AdvancedDynamicTexture | null = null;
  private promptBlock: TextBlock | null = null;
  private hpFill: Rectangle | null = null;
  private vehicleStatusBlock: TextBlock | null = null;
  private labels = new Map<string, { text: string; box: Rectangle | null; block: TextBlock | null }>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  /** Sets (or clears with null) the contextual action prompt. */
  setActionPrompt(text: string | null): void {
    if (text === this.actionPrompt) return;
    this.actionPrompt = text;
    this.render();
  }

  getActionPrompt(): string | null {
    return this.actionPrompt;
  }

  /** Hero HP as a 0..1 fraction (drives the health bar width/color). */
  setPlayerHealth(fraction: number): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (f === this.playerHpFraction) return;
    this.playerHpFraction = f;
    this.render();
  }

  getPlayerHealth(): number {
    return this.playerHpFraction;
  }

  /** Nave status text (e.g. "NAVE 45%" / "NAVE DESTROYED"), or null to hide. */
  setVehicleStatus(text: string | null): void {
    if (text === this.vehicleStatus) return;
    this.vehicleStatus = text;
    this.render();
  }

  getVehicleStatus(): string | null {
    return this.vehicleStatus;
  }

  /** Attaches a floating name label above a node, tracked by `key`. */
  addLabel(node: TransformNode, text: string, key: string): void {
    this.labels.set(key, { text, box: null, block: null });
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.addLabelBrowser(node, text, key);
  }

  /** Update a label's text (e.g. reveal an NPC's name once introduced). */
  setLabelText(key: string, text: string): void {
    const entry = this.labels.get(key);
    if (!entry) return;
    entry.text = text;
    /* istanbul ignore next — browser GUI only */
    if (entry.block) entry.block.text = text;
  }

  getLabelText(key: string): string | null {
    return this.labels.get(key)?.text ?? null;
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

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('hud-ui', true, this.scene);
    this.gui = gui;

    const controls = new TextBlock(
      'hud-controls',
      'WASD move · MMB-drag camera · E talk · F vehicle · ESC pause'
    );
    controls.color = '#4A6E78';
    controls.fontSize = 13;
    controls.fontFamily = '"Courier New", monospace';
    controls.height = '24px';
    controls.top = '-12px';
    controls.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    gui.addControl(controls);

    const prompt = new TextBlock('hud-prompt', '');
    prompt.color = '#00FFCC';
    prompt.fontSize = 18;
    prompt.fontFamily = '"Courier New", monospace';
    prompt.fontStyle = 'bold';
    prompt.height = '30px';
    prompt.top = '-44px';
    prompt.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    prompt.isVisible = false;
    gui.addControl(prompt);
    this.promptBlock = prompt;

    // Hero HP bar (top-left).
    const bar = new Rectangle('hud-hp');
    bar.width = '220px';
    bar.height = '18px';
    bar.thickness = 1;
    bar.color = '#0A3A40';
    bar.background = 'rgba(0,12,16,0.7)';
    bar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    bar.left = '18px';
    bar.top = '18px';
    gui.addControl(bar);

    const fill = new Rectangle('hud-hp-fill');
    fill.height = '100%';
    fill.thickness = 0;
    fill.background = '#00FFAA';
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    bar.addControl(fill);
    this.hpFill = fill;

    const vstatus = new TextBlock('hud-vehicle', '');
    vstatus.color = '#FF8A5C';
    vstatus.fontSize = 14;
    vstatus.fontFamily = '"Courier New", monospace';
    vstatus.height = '22px';
    vstatus.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    vstatus.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    vstatus.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    vstatus.left = '18px';
    vstatus.top = '40px';
    vstatus.isVisible = false;
    gui.addControl(vstatus);
    this.vehicleStatusBlock = vstatus;
  }

  /* istanbul ignore next — browser GUI only */
  private renderBrowser(): void {
    if (this.promptBlock) {
      this.promptBlock.text = this.actionPrompt ?? '';
      this.promptBlock.isVisible = this.actionPrompt !== null;
    }
    if (this.hpFill) {
      this.hpFill.width = `${Math.round(this.playerHpFraction * 100)}%`;
      this.hpFill.background = this.playerHpFraction <= 0.3 ? '#FF3355'
        : this.playerHpFraction <= 0.6 ? '#FFCC33' : '#00FFAA';
    }
    if (this.vehicleStatusBlock) {
      this.vehicleStatusBlock.text = this.vehicleStatus ?? '';
      this.vehicleStatusBlock.isVisible = this.vehicleStatus !== null;
    }
  }

  /* istanbul ignore next — browser GUI only */
  private addLabelBrowser(node: TransformNode, text: string, key: string): void {
    if (!this.gui) return;
    const label = new Rectangle(`label-${key}`);
    label.width = '120px';
    label.height = '26px';
    label.cornerRadius = 6;
    label.thickness = 1;
    label.color = '#00FFCC';
    label.background = 'rgba(0,18,26,0.7)';
    this.gui.addControl(label);
    label.linkWithMesh(node);
    label.linkOffsetY = -70;

    const tb = new TextBlock(`label-text-${key}`, text);
    tb.color = '#CCFFF4';
    tb.fontSize = 14;
    tb.fontFamily = '"Courier New", monospace';
    label.addControl(tb);
    this.labels.set(key, { text, box: label, block: tb });
  }

  dispose(): void {
    this.actionPrompt = null;
    this.vehicleStatus = null;
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.promptBlock = null;
      this.hpFill = null;
      this.vehicleStatusBlock = null;
    }
    this.labels.clear();
  }
}
