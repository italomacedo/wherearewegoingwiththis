import { Scene, TransformNode, AbstractMesh } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, Control, ScrollViewer,
} from '@babylonjs/gui';
import { t } from '@systems/I18n';
import { CombatController, CombatLogEntry, isCriticalHit, objectiveLogLine } from './CombatController';
import { CombatOutcome } from './CombatEncounter';
import { CombatPortraits, PortraitEntry } from './CombatPortraits';

export interface CombatOverlayHandlers {
  /** Called once when the encounter resolves (won/lost/fled). */
  onEnd?: (outcome: CombatOutcome) => void;
  /** Optional Claude dramatization of a beat; only fired for critical hits. */
  narrate?: (beat: string) => Promise<string>;
  /** Fired for every applied combat event (the scene plays the matching animation). */
  onBeat?: (entry: CombatLogEntry) => void;
  /**
   * Player clicked Attack: the scene enters 3-D target-picking and, once the player
   * clicks a combatant in range, calls back submitPlayerAction({attack, targetId}).
   */
  onRequestTarget?: (attackKind: 'melee' | 'ranged' | undefined) => void;
  /**
   * Player clicked Move: the scene enters ground-targeting (the on-ground trail)
   * and, once the player clicks a reachable point, calls submitPlayerAction({move,to}).
   */
  onRequestMove?: () => void;
}

/**
 * Baldur's-Gate-style combat overlay: a top strip of 3D portraits (initiative
 * order + turn marker, via CombatPortraits), the player's action buttons at the
 * bottom, and a transient caption that surfaces a Claude-narrated line ONLY on a
 * critical hit. There is no chat-log box — the 3D action + animations carry it.
 *
 * The open/close flag is pure (the scene gates the world on it like pause); every
 * Babylon GUI / camera path is browser-only and `istanbul ignore`d — all combat
 * logic lives in the pure CombatController/CombatEncounter (fully unit-tested).
 */
export class CombatOverlay {
  private scene: Scene;
  private open = false;
  private controller: CombatController | null = null;
  private handlers: CombatOverlayHandlers = {};
  private finished = false;
  private portraitSources: Record<string, TransformNode | AbstractMesh> = {};

  private gui: AdvancedDynamicTexture | null = null;
  private panel: Rectangle | null = null;
  private statusText: TextBlock | null = null;
  private caption: TextBlock | null = null;
  private logStack: StackPanel | null = null;
  private buttonsRow: StackPanel | null = null;
  private portraits: CombatPortraits;

  constructor(scene: Scene) {
    this.scene = scene;
    this.portraits = new CombatPortraits(scene);
    this.buildUI();
  }

  setHandlers(handlers: CombatOverlayHandlers): void { this.handlers = handlers; }
  /** The scene supplies the per-combatant world meshes to subproject as portraits. */
  setPortraitSources(sources: Record<string, TransformNode | AbstractMesh>): void { this.portraitSources = sources; }
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
    this.closeBrowser();
  }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next — browser GUI only */
    this.buildUIBrowser();
  }

  /* istanbul ignore next — browser GUI only */
  private closeBrowser(): void {
    if (this.panel) this.panel.isVisible = false;
    if (this.caption) this.caption.isVisible = false;
    this.portraits.dispose();
  }

  /* istanbul ignore next — browser GUI only */
  private startBrowser(): void {
    if (this.panel) this.panel.isVisible = true;
    if (this.caption) this.caption.isVisible = false;
    if (this.logStack) this.logStack.clearControls();
    this.finished = false;
    this.buildPortraits();
    // Turn pacing (AI/spectator stepping) is driven by the scene's tick — just render
    // the opening state; if an NPC won initiative the scene steps it on the next tick.
    this.refresh();
  }

  /* istanbul ignore next — browser GUI only */
  private buildPortraits(): void {
    const c = this.controller;
    if (!c || !this.gui) return;
    const entries: PortraitEntry[] = c.getState().combatants
      .map((cb) => {
        const head = this.portraitSources[cb.id];
        return head ? { id: cb.id, name: cb.name, head } : null;
      })
      .filter((e): e is PortraitEntry => e !== null);
    this.portraits.build(entries, this.gui);
  }

  /**
   * Render a batch of resulting log entries (player's action or one AI turn the
   * scene stepped): play each beat, refresh the HUD, and finish once if the fight
   * has resolved. Public so the scene's timed turn driver can feed AI entries.
   */
  /* istanbul ignore next — browser GUI only */
  renderEntries(entries: CombatLogEntry[]): void {
    entries.forEach((e) => this.appendBeat(e));
    this.refresh();
    const c = this.controller;
    if (c && c.isOver()) this.finish(c.outcome());
  }

  /* istanbul ignore next — browser GUI only */
  private refresh(): void {
    const c = this.controller;
    if (!c || !this.statusText || !this.buttonsRow) return;
    const st = c.getState();
    const me = st.combatants.find((x) => x.isPlayer && !x.removed);
    const playerStanding = !!me && me.alive;
    const turn = c.isPlayerTurn() ? t('combat.yourTurn') : t('combat.enemyTurn');
    // N-way HP roster: every still-standing combatant as "Name hp%".
    const roster = st.combatants
      .filter((x) => x.alive && !x.removed)
      .map((x) => `${x.name} ${Math.round((x.hp.current / x.hp.max) * 100)}%`)
      .join('   ');
    const apPart = playerStanding ? `${t('combat.ap')} ${me!.ap}/${me!.maxAp}   ·   ` : '';
    this.statusText.text = `${turn}   ·   ${apPart}${roster}`;

    this.portraits.setActive(st.activeId);

    // Buttons only on the player's own turn; spectator / AI turns show none.
    this.buttonsRow.clearControls();
    if (!playerStanding || !c.isPlayerTurn()) return;
    c.options().forEach((opt) => {
      const btn = Button.CreateSimpleButton(`combat-${opt.labelKey}`, t(opt.labelKey));
      btn.width = '104px';
      btn.height = '38px';
      btn.color = opt.enabled ? '#00FFCC' : '#557';
      btn.background = opt.enabled ? 'rgba(0,40,50,0.92)' : 'rgba(10,14,20,0.8)';
      btn.fontSize = 12;
      btn.fontFamily = '"Courier New", monospace';
      btn.thickness = 1;
      btn.isEnabled = opt.enabled;
      btn.onPointerUpObservable.add(() => this.onPlayerAction(opt));
      this.buttonsRow!.addControl(btn);
    });
  }

  /* istanbul ignore next — browser GUI only */
  private onPlayerAction(opt: { action: import('./CombatController').PlayerActionOption['action'] }): void {
    const c = this.controller;
    if (!c || !c.isPlayerTurn() || c.isOver()) return;
    // Attack/Move need a 3-D target/destination → hand off to the scene's targeting
    // mode, which calls submitPlayerAction() once the player clicks. Everything else
    // (cover/hunker/reload/flee/end_turn) applies immediately.
    if (opt.action.type === 'attack') { this.handlers.onRequestTarget?.(opt.action.attackKind); return; }
    if (opt.action.type === 'move') { this.handlers.onRequestMove?.(); return; }
    this.submitPlayerAction(opt.action);
  }

  /**
   * Apply a fully-resolved player action (target/destination filled in by the
   * scene's targeting), append its beats, and advance. Called by the overlay for
   * instant actions and by the scene after a 3-D pick.
   */
  /* istanbul ignore next — browser GUI only */
  submitPlayerAction(action: import('./CombatController').PlayerActionOption['action']): void {
    const c = this.controller;
    if (!c || !c.isPlayerTurn() || c.isOver()) return;
    // Apply only the player's action; AI turns are stepped by the scene's timed driver.
    this.renderEntries(c.takePlayerAction(action));
  }

  /* istanbul ignore next — browser GUI only */
  private appendBeat(entry: CombatLogEntry): void {
    this.handlers.onBeat?.(entry); // scene plays the matching avatar animation
    const ol = objectiveLogLine(entry);
    if (!ol) return; // mechanics-only (end_turn) → nothing in the log
    // Objective line: "A hits B — N dmg". On a critical hit, replace it with a
    // poetic Claude line when it resolves.
    const line = this.addLogLine(t(ol.key, ol.params), entry.isPlayerActor);
    if (isCriticalHit(entry) && this.handlers.narrate) {
      void this.handlers.narrate(entry.beat).then((text) => {
        if (text && line) { line.text = text; line.color = '#FFE48A'; }
      }).catch(() => { /* keep the objective line */ });
    }
  }

  /* istanbul ignore next — browser GUI only */
  private addLogLine(text: string, byPlayer: boolean): TextBlock | null {
    if (!this.logStack) return null;
    const tb = new TextBlock(`combat-log-${this.logStack.children.length}`, text);
    tb.color = byPlayer ? '#9CFFE9' : '#FF9C9C';
    tb.fontSize = 13;
    tb.fontFamily = '"Courier New", monospace';
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.textWrapping = true;
    tb.resizeToFit = true;
    tb.paddingTop = '3px';
    this.logStack.addControl(tb);
    return tb;
  }

  /* istanbul ignore next — browser GUI only */
  private showCaption(text: string): void {
    if (!this.caption) return;
    this.caption.text = text;
    this.caption.isVisible = true;
    setTimeout(() => { if (this.caption) this.caption.isVisible = false; }, 4000);
  }

  /* istanbul ignore next — browser GUI only */
  private finish(outcome: CombatOutcome): void {
    if (this.finished) return;
    this.finished = true;
    const key = outcome === 'player_won' ? 'combat.won'
      : outcome === 'player_lost' ? 'combat.lost'
        : outcome === 'fled' ? 'combat.fled'
          : 'combat.over'; // 'resolved' — a player-absent fight ended
    this.showCaption(t(key));
    if (this.buttonsRow) this.buttonsRow.clearControls();
    this.handlers.onEnd?.(outcome);
  }

  /* istanbul ignore next — browser GUI only */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('combat-ui', true, this.scene);
    this.gui = gui;

    // Light vignette so the 3D action stays visible (BG-style), not a dark scrim.
    const scrim = new Rectangle('combat-scrim');
    scrim.width = '100%';
    scrim.height = '100%';
    scrim.background = 'rgba(2,0,4,0.22)';
    scrim.thickness = 0;
    scrim.isVisible = false;
    gui.addControl(scrim);
    this.panel = scrim;

    // Transient critical-hit caption (upper third).
    const caption = new TextBlock('combat-caption', '');
    caption.color = '#FFE48A';
    caption.fontSize = 18;
    caption.fontFamily = '"Courier New", monospace';
    caption.textWrapping = true;
    caption.width = '70%';
    caption.height = '60px';
    caption.top = '-26%';
    caption.isVisible = false;
    scrim.addControl(caption); // child of the scrim → hidden with the overlay
    this.caption = caption;

    // Combat log — a column down the RIGHT edge so it never covers the fighters.
    const logScroll = new ScrollViewer('combat-log-scroll');
    logScroll.width = '300px';
    logScroll.height = '58%';
    logScroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    logScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    logScroll.top = '25%'; // below the top portrait strip (~22%) so it never overlaps
    logScroll.left = '-12px';
    logScroll.thickness = 1;
    logScroll.color = 'rgba(0,80,90,0.5)';
    logScroll.barColor = '#0AA';
    logScroll.background = 'rgba(2,10,14,0.45)';
    scrim.addControl(logScroll); // child of the scrim → only shows during combat
    const log = new StackPanel('combat-log');
    log.width = '280px';
    log.isVertical = true;
    log.paddingTop = '4px';
    log.paddingLeft = '6px';
    logScroll.addControl(log);
    this.logStack = log;

    // Bottom panel: status line + action buttons (top of screen is left for portraits + action).
    const bottom = new StackPanel('combat-bottom');
    bottom.width = '980px';
    bottom.spacing = 8;
    bottom.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    bottom.top = '-18px';
    scrim.addControl(bottom); // child of the scrim → only shows during combat

    const status = new TextBlock('combat-status', '');
    status.color = '#CFE';
    status.fontSize = 15;
    status.fontFamily = '"Courier New", monospace';
    status.height = '24px';
    bottom.addControl(status);
    this.statusText = status;

    const buttons = new StackPanel('combat-buttons');
    buttons.isVertical = false;
    buttons.height = '44px';
    buttons.width = '980px';
    bottom.addControl(buttons);
    this.buttonsRow = buttons;
  }

  dispose(): void {
    this.handlers = {};
    this.controller = null;
    this.portraits.dispose();
    /* istanbul ignore next — browser GUI only */
    if (this.gui) {
      this.gui.dispose();
      this.gui = null;
      this.panel = null;
      this.statusText = null;
      this.caption = null;
      this.logStack = null;
      this.buttonsRow = null;
    }
  }
}
