import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control, ScrollViewer,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';
import { CombatController, CombatLogEntry, isCriticalHit } from './CombatController';
import { CombatOutcome } from './CombatEncounter';

export interface CombatOverlayHandlers {
  /** Called once when the encounter resolves (won/lost/fled). */
  onEnd?: (outcome: CombatOutcome) => void;
  /** Optional Claude dramatization of a factual beat; falls back to the beat. */
  narrate?: (beat: string) => Promise<string>;
}

/**
 * Browser overlay that renders a CombatController: HP/AP/distance readouts, a
 * scrolling beat log, and the player's action buttons. The open/close flag is
 * pure (so the scene can gate the world on it like the pause menu); every Babylon
 * GUI path is browser-only and `istanbul ignore`d — all combat logic lives in the
 * pure CombatController/CombatEncounter (fully unit-tested).
 */
export class CombatOverlay {
  private scene: Scene;
  private open = false;
  private controller: CombatController | null = null;
  private handlers: CombatOverlayHandlers = {};

  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private statusText: TextBlock | null = null;
  private logStack: StackPanel | null = null;
  private buttonsRow: StackPanel | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildUI();
  }

  setHandlers(handlers: CombatOverlayHandlers): void { this.handlers = handlers; }
  isOpen(): boolean { return this.open; }
  getController(): CombatController | null { return this.controller; }

  /** Start an encounter: adopt the controller, show the overlay, render turn 1. */
  start(controller: CombatController): void {
    this.controller = controller;
    this.open = true;
    /* istanbul ignore next — browser GUI only */
    if (typeof document !== 'undefined') this.startBrowser();
  }

  close(): void {
    this.open = false;
    this.controller = null;
    /* istanbul ignore next — browser GUI only */
    if (this.panel) this.panel.isVisible = false;
  }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.buildUIBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private startBrowser(): void {
    if (this.panel) this.panel.isVisible = true;
    if (this.logStack) this.logStack.clearControls();
    // If the enemy won initiative, play out its turn(s) before handing control over.
    this.pumpEnemyTurns();
  }

  /** Run enemy turns until it's the player's turn (or the fight ends), then render. */
  /* istanbul ignore next — browser GUI only */
  private pumpEnemyTurns(): void {
    const c = this.controller;
    if (!c) return;
    let guard = 0;
    while (!c.isOver() && !c.isPlayerTurn() && guard++ < 20) {
      c.runEnemyTurn().forEach((e) => this.appendBeat(e));
    }
    this.refresh();
    if (c.isOver()) this.finish(c.outcome());
  }

  /* istanbul ignore next — browser GUI only */
  private refresh(): void {
    const c = this.controller;
    if (!c || !this.statusText || !this.buttonsRow) return;
    const st = c.getState();
    const me = st.combatants.find((x) => x.isPlayer);
    const foe = st.combatants.find((x) => !x.isPlayer);
    const turn = c.isPlayerTurn() ? t('combat.yourTurn') : t('combat.enemyTurn');
    const hp = (n: { name: string; hp: { current: number; max: number } } | undefined) =>
      n ? `${n.name} ${Math.round((n.hp.current / n.hp.max) * 100)}%` : '';
    this.statusText.text =
      `${turn}   ·   ${t('combat.ap')} ${me?.ap ?? 0}/${me?.maxAp ?? 0}   ·   ` +
      `${t('combat.distance')} ${Math.round(st.distance)}m\n${hp(me)}    vs    ${hp(foe)}`;

    this.buttonsRow.clearControls();
    c.options().forEach((opt) => {
      const btn = Button.CreateSimpleButton(`combat-${opt.labelKey}`, t(opt.labelKey));
      btn.width = '104px';
      btn.height = '38px';
      btn.color = opt.enabled ? '#00FFCC' : '#557';
      btn.background = opt.enabled ? 'rgba(0,40,50,0.9)' : 'rgba(10,14,20,0.7)';
      btn.fontSize = 12;
      btn.fontFamily = '"Courier New", monospace';
      btn.thickness = 1;
      btn.isEnabled = opt.enabled && c.isPlayerTurn();
      btn.onPointerUpObservable.add(() => this.onPlayerAction(opt));
      this.buttonsRow!.addControl(btn);
    });
  }

  /* istanbul ignore next — browser GUI only */
  private onPlayerAction(opt: { action: import('./CombatController').PlayerActionOption['action'] }): void {
    const c = this.controller;
    if (!c || !c.isPlayerTurn() || c.isOver()) return;
    const entries = c.takePlayerAction(opt.action);
    entries.forEach((e) => this.appendBeat(e));
    this.refresh();
    if (c.isOver()) this.finish(c.outcome());
  }

  /* istanbul ignore next — browser GUI only */
  private appendBeat(entry: CombatLogEntry): void {
    const line = this.addLogLine(entry.beat, entry.isPlayerActor);
    // Dramatize via Claude ONLY on a critical hit (landed blow with P>90%) — bounded
    // cost + cinematic punch. Fall back to the factual beat silently.
    if (isCriticalHit(entry) && this.handlers.narrate) {
      void this.handlers.narrate(entry.beat).then((text) => {
        if (text && line) line.text = `• ${text}`;
      }).catch(() => { /* keep the factual beat */ });
    }
  }

  /* istanbul ignore next — browser GUI only */
  private addLogLine(text: string, byPlayer: boolean): TextBlock | null {
    if (!this.logStack) return null;
    const tb = new TextBlock(`combat-log-${this.logStack.children.length}`, `• ${text}`);
    tb.color = byPlayer ? '#9CFFE9' : '#FF9C9C';
    tb.fontSize = 14;
    tb.fontFamily = '"Courier New", monospace';
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.textWrapping = true;
    tb.resizeToFit = true;
    tb.paddingTop = '2px';
    this.logStack.addControl(tb);
    return tb;
  }

  /* istanbul ignore next — browser GUI only */
  private finish(outcome: CombatOutcome): void {
    const key = outcome === 'player_won' ? 'combat.won' : outcome === 'player_lost' ? 'combat.lost' : 'combat.fled';
    this.addLogLine(t(key), true);
    if (this.buttonsRow) this.buttonsRow.clearControls();
    this.handlers.onEnd?.(outcome);
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('combat-ui', true, this.scene);
    this.gui = gui;

    const scrim = new Rectangle('combat-scrim');
    scrim.width = '100%';
    scrim.height = '100%';
    scrim.background = 'rgba(2,0,4,0.72)';
    scrim.thickness = 0;
    scrim.isVisible = false;
    gui.addControl(scrim);
    this.panel = scrim;

    const stack = new StackPanel('combat-stack');
    stack.width = '980px';
    stack.spacing = 10;
    scrim.addControl(stack);

    const title = new TextBlock('combat-title', t('combat.title'));
    title.color = '#FF4466';
    title.fontSize = 30;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.height = '44px';
    stack.addControl(title);

    const status = new TextBlock('combat-status', '');
    status.color = '#CFE';
    status.fontSize = 16;
    status.fontFamily = '"Courier New", monospace';
    status.height = '52px';
    stack.addControl(status);
    this.statusText = status;

    const scroll = new ScrollViewer('combat-log-scroll');
    scroll.width = '960px';
    scroll.height = '220px';
    scroll.thickness = 1;
    scroll.color = '#234';
    scroll.barColor = '#0AA';
    stack.addControl(scroll);
    const log = new StackPanel('combat-log');
    log.width = '940px';
    log.isVertical = true;
    scroll.addControl(log);
    this.logStack = log;

    const buttons = new StackPanel('combat-buttons');
    buttons.isVertical = false;
    buttons.height = '44px';
    buttons.width = '980px';
    stack.addControl(buttons);
    this.buttonsRow = buttons;

    scrim.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    scrim.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  }

  dispose(): void {
    this.handlers = {};
    this.controller = null;
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.panel = null;
      this.statusText = null;
      this.logStack = null;
      this.buttonsRow = null;
    }
  }
}
