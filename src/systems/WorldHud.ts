import { Scene, TransformNode } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Rectangle, Control } from '@babylonjs/gui';
import { t } from '@systems/I18n';
import { UI } from '@systems/UiStyle';
import { ToastQueue, TOAST_TTL_MS } from '@systems/hud/ToastQueue';

/**
 * Heads-up display for the game world: a persistent control hint, a contextual
 * action prompt ("[E] Talk to Zara" / "[F] Enter bike"), floating name labels
 * linked to NPC/vehicle meshes, a top-left status-bar stack (HP / Stamina /
 * Hunger — owner reverted the "diegetic-only condition" rule, ADR-0033), and
 * ephemeral gain toasts ("+0.1 Pilotagem"). All state is pure and tested;
 * rendering is browser-only so it stays out of the headless test path.
 */

/** Fade window at the tail of a toast's life (ms). */
const TOAST_FADE_MS = 500;

export class WorldHud {
  private scene: Scene;
  private actionPrompt: string | null = null;
  private playerHpFraction = 1;
  private playerStaminaFraction = 1;
  private playerHungerFraction = 1;
  private vehicleStatus: string | null = null;
  private toasts = new ToastQueue();

  private hudTextVisible = true;

  private gui: AdvancedDynamicTexture | null = null;
  private controlsBlock: TextBlock | null = null;
  private promptBlock: TextBlock | null = null;
  private vehicleStatusBlock: TextBlock | null = null;
  private barFills: { hp: Rectangle | null; stamina: Rectangle | null; hunger: Rectangle | null } = {
    hp: null, stamina: null, hunger: null,
  };
  private barTracks: Rectangle[] = [];
  private barLabels: TextBlock[] = [];
  private statusPanel: Rectangle | null = null;
  private toastBlocks: Rectangle[] = [];
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

  /** Pure: HP bar colour for a fraction — green > 0.5, amber > 0.25, red below. */
  static healthBarColor(fraction: number): string {
    if (fraction > 0.5) return UI.hpHigh;
    if (fraction > 0.25) return UI.hpMid;
    return UI.hpLow;
  }

  /** Hero HP as a 0..1 fraction (drives the top-left HP bar). */
  setPlayerHealth(fraction: number): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (f === this.playerHpFraction) return;
    this.playerHpFraction = f;
    this.render();
  }

  getPlayerHealth(): number {
    return this.playerHpFraction;
  }

  /** Sprint stamina as a 0..1 fraction (drives the stamina bar). */
  setPlayerStamina(fraction: number): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (f === this.playerStaminaFraction) return;
    this.playerStaminaFraction = f;
    this.render();
  }

  getPlayerStamina(): number {
    return this.playerStaminaFraction;
  }

  /** Hunger as a 0..1 fraction (drives the hunger bar). */
  setPlayerHunger(fraction: number): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (f === this.playerHungerFraction) return;
    this.playerHungerFraction = f;
    this.render();
  }

  getPlayerHunger(): number {
    return this.playerHungerFraction;
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
   * Show/hide the bottom HUD text (control hint + contextual prompt) and the
   * status bars. Hidden during combat so the combat UI doesn't collide.
   */
  setHudTextVisible(visible: boolean): void {
    if (this.hudTextVisible === visible) return;
    this.hudTextVisible = visible;
    this.render();
  }

  isHudTextVisible(): boolean {
    return this.hudTextVisible;
  }

  // ─── Gain toasts ────────────────────────────────────────────────────────────

  /** Show an ephemeral gain notification ("+0.1 Pilotagem"). */
  pushToast(text: string, nowMs = Date.now()): void {
    this.toasts.push(text, nowMs);
    this.render();
  }

  /** Visible toast texts, oldest → newest (pure, for tests). */
  getToastTexts(): string[] {
    return this.toasts.getToasts().map((toast) => toast.text);
  }

  /** Per-frame: drop expired toasts and refresh the fade. */
  updateToasts(nowMs = Date.now()): void {
    const changed = this.toasts.prune(nowMs);
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    if (changed) this.renderBrowser();
    /* istanbul ignore next — browser GUI only */
    this.fadeToastsBrowser(nowMs);
  }

  /** Attaches a floating name label above a node, tracked by `key`. */
  addLabel(node: TransformNode, text: string, key: string): void {
    this.labels.set(key, { text, box: null, block: null });
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.addLabelBrowser(node, text, key);
  }

  /** Update a label's text. */
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
    controls.color = UI.textMuted;
    controls.fontSize = 13;
    controls.fontFamily = UI.font;
    controls.height = '24px';
    controls.top = '-12px';
    controls.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    gui.addControl(controls);
    this.controlsBlock = controls;

    const prompt = new TextBlock('hud-prompt', '');
    prompt.color = UI.accent;
    prompt.fontSize = 18;
    prompt.fontFamily = UI.font;
    prompt.fontStyle = 'bold';
    prompt.height = '30px';
    // Above the control hint (-12) AND the action ribbon (-44, ~36px tall) so the
    // three bottom bands never overlap (Phase 11).
    prompt.top = '-92px';
    prompt.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    prompt.isVisible = false;
    gui.addControl(prompt);
    this.promptBlock = prompt;

    // Status bars: HP / Stamina / Hunger stacked top-left on a card panel
    // (same neon card pattern as the overlays — UiStyle tokens).
    const panel = new Rectangle('hud-status-panel');
    panel.width = '212px';
    panel.height = '58px';
    panel.cornerRadius = UI.cornerMd;
    panel.thickness = 1;
    panel.color = UI.cardBorder;
    panel.background = UI.cardBg;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.left = '10px';
    panel.top = '30px';
    gui.addControl(panel);
    this.statusPanel = panel;

    this.barFills.hp = this.buildBarBrowser(gui, 'hp', 38);
    this.barFills.stamina = this.buildBarBrowser(gui, 'stamina', 54);
    this.barFills.hunger = this.buildBarBrowser(gui, 'hunger', 70);

    const vstatus = new TextBlock('hud-vehicle', '');
    vstatus.color = UI.warnOrange;
    vstatus.fontSize = 14;
    vstatus.fontFamily = UI.font;
    vstatus.height = '22px';
    vstatus.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    vstatus.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    vstatus.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    vstatus.left = '18px';
    vstatus.top = '96px'; // below the status-bar stack
    vstatus.isVisible = false;
    gui.addControl(vstatus);
    this.vehicleStatusBlock = vstatus;
  }

  /** Labelled track + fill row (Lesson 48 pattern — % width, no calc()). */
  /* istanbul ignore next — browser GUI only */
  private buildBarBrowser(gui: AdvancedDynamicTexture, key: string, topPx: number): Rectangle {
    const label = new TextBlock(`hud-bar-${key}-label`, t(`hud.${key}`));
    label.color = UI.textMeta;
    label.fontSize = UI.fontMeta;
    label.fontFamily = UI.font;
    label.width = '36px';
    label.height = '12px';
    label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    label.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    label.left = '18px';
    label.top = `${topPx - 1}px`;
    gui.addControl(label);
    this.barLabels.push(label);

    const track = new Rectangle(`hud-bar-${key}`);
    track.width = '150px';
    track.height = '10px';
    track.cornerRadius = UI.cornerSm;
    track.thickness = 0;
    track.background = UI.barTrack;
    track.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    track.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    track.left = '58px';
    track.top = `${topPx}px`;
    gui.addControl(track);
    this.barTracks.push(track);

    const fill = new Rectangle(`hud-bar-${key}-fill`);
    fill.height = '100%';
    fill.width = '100%';
    fill.cornerRadius = UI.cornerSm;
    fill.thickness = 0;
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    track.addControl(fill);
    return fill;
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
    if (this.statusPanel) this.statusPanel.isVisible = this.hudTextVisible;
    for (const track of this.barTracks) track.isVisible = this.hudTextVisible;
    for (const label of this.barLabels) label.isVisible = this.hudTextVisible;
    this.renderBarBrowser(this.barFills.hp, this.playerHpFraction, WorldHud.healthBarColor(this.playerHpFraction));
    this.renderBarBrowser(this.barFills.stamina, this.playerStaminaFraction, UI.accent);
    this.renderBarBrowser(this.barFills.hunger, this.playerHungerFraction, UI.warnOrange);
    this.renderToastsBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private renderBarBrowser(fill: Rectangle | null, fraction: number, color: string): void {
    if (!fill) return;
    fill.width = `${Math.round(fraction * 100)}%`;
    fill.background = color;
    fill.isVisible = fraction > 0.005; // a 0% fill still paints a sliver — hide it
  }

  /* istanbul ignore next — browser GUI only */
  private renderToastsBrowser(): void {
    if (!this.gui) return;
    for (const block of this.toastBlocks) block.dispose();
    this.toastBlocks = [];
    const list = this.toasts.getToasts();
    for (let i = 0; i < list.length; i++) {
      // Card-backed row (same neon card pattern as the overlay lists).
      const card = new Rectangle(`hud-toast-${list[i].id}`);
      card.height = '22px';
      card.cornerRadius = UI.cornerSm;
      card.thickness = 1;
      card.color = UI.cardBorder;
      card.background = UI.cardBg;
      card.adaptWidthToChildren = true;
      card.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      card.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      card.left = '-18px';
      card.top = `${40 + i * 26}px`;
      const tb = new TextBlock(`hud-toast-text-${list[i].id}`, list[i].text);
      tb.color = UI.textPrimary;
      tb.fontSize = UI.fontBody;
      tb.fontFamily = UI.font;
      tb.resizeToFit = true;
      tb.paddingLeft = '8px';
      tb.paddingRight = '8px';
      card.addControl(tb);
      this.gui.addControl(card);
      this.toastBlocks.push(card);
    }
  }

  /** Per-frame alpha fade over the toast tail without rebuilding the blocks. */
  /* istanbul ignore next — browser GUI only */
  private fadeToastsBrowser(nowMs: number): void {
    const list = this.toasts.getToasts();
    for (let i = 0; i < this.toastBlocks.length && i < list.length; i++) {
      const life = ToastQueue.lifeFraction(list[i], nowMs);
      this.toastBlocks[i].alpha = Math.min(1, life / (TOAST_FADE_MS / TOAST_TTL_MS));
    }
  }

  /* istanbul ignore next — browser GUI only */
  private addLabelBrowser(node: TransformNode, text: string, key: string): void {
    if (!this.gui) return;
    const label = new Rectangle(`label-${key}`);
    label.width = '120px';
    label.height = '26px';
    label.cornerRadius = UI.cornerSm;
    label.thickness = 1;
    label.color = UI.accent;
    label.background = UI.cardBg;
    this.gui.addControl(label);
    label.linkWithMesh(node);
    label.linkOffsetY = -70;

    const tb = new TextBlock(`label-text-${key}`, text);
    tb.color = UI.textPrimary;
    tb.fontSize = 14;
    tb.fontFamily = UI.font;
    label.addControl(tb);
    this.labels.set(key, { text, box: label, block: tb });
  }

  dispose(): void {
    this.actionPrompt = null;
    this.vehicleStatus = null;
    this.toasts.clear();
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.promptBlock = null;
      this.vehicleStatusBlock = null;
      this.barFills = { hp: null, stamina: null, hunger: null };
      this.barTracks = [];
      this.barLabels = [];
      this.statusPanel = null;
      this.toastBlocks = [];
    }
    this.labels.clear();
  }
}
