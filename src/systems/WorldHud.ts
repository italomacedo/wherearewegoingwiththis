import { Scene, TransformNode } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Rectangle, Control } from '@babylonjs/gui';
import { t } from '@systems/I18n';

/**
 * Heads-up display for the game world: a persistent control hint, a contextual
 * action prompt ("[E] Talk to Zara" / "[F] Enter bike"), and floating name
 * labels linked to NPC/vehicle meshes. The prompt state is pure and tested; all
 * rendering is browser-only so it stays out of the headless test path.
 *
 * Note: there is intentionally NO on-screen hero HP bar (immersion — the player
 * learns their condition diegetically via a self-inspection emote or a medic NPC).
 * The health *state* (`set/getPlayerHealth`) is kept as a pure value so callers
 * and tests stay stable, but it is not rendered.
 */
export class WorldHud {
  private scene: Scene;
  private actionPrompt: string | null = null;
  private playerHpFraction = 1;
  private vehicleStatus: string | null = null;

  private hudTextVisible = true;

  private gui: AdvancedDynamicTexture | null = null;
  private controlsBlock: TextBlock | null = null;
  private promptBlock: TextBlock | null = null;
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

  /** Hero HP as a 0..1 fraction. Tracked as pure state; not rendered (no HP bar). */
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

  /**
   * Show/hide the bottom HUD text (control hint + contextual prompt). Hidden during
   * combat so the centred combat action bar doesn't collide with the key hints.
   */
  setHudTextVisible(visible: boolean): void {
    if (this.hudTextVisible === visible) return;
    this.hudTextVisible = visible;
    this.render();
  }

  isHudTextVisible(): boolean {
    return this.hudTextVisible;
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

    const controls = new TextBlock('hud-controls', t('hud.controls'));
    controls.color = '#4A6E78';
    controls.fontSize = 13;
    controls.fontFamily = '"Courier New", monospace';
    controls.height = '24px';
    controls.top = '-12px';
    controls.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    gui.addControl(controls);
    this.controlsBlock = controls;

    const prompt = new TextBlock('hud-prompt', '');
    prompt.color = '#00FFCC';
    prompt.fontSize = 18;
    prompt.fontFamily = '"Courier New", monospace';
    prompt.fontStyle = 'bold';
    prompt.height = '30px';
    // Above the control hint (-12) AND the action ribbon (-44, ~36px tall) so the
    // three bottom bands never overlap (Phase 11).
    prompt.top = '-92px';
    prompt.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    prompt.isVisible = false;
    gui.addControl(prompt);
    this.promptBlock = prompt;

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
    if (this.controlsBlock) this.controlsBlock.isVisible = this.hudTextVisible;
    if (this.promptBlock) {
      this.promptBlock.text = this.actionPrompt ?? '';
      this.promptBlock.isVisible = this.hudTextVisible && this.actionPrompt !== null;
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
      this.vehicleStatusBlock = null;
    }
    this.labels.clear();
  }
}
