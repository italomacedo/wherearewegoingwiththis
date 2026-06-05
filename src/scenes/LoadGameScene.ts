import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, ScrollViewer, Rectangle, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { SaveService, SaveMeta } from '@systems/SaveService';
import { t } from '@systems/I18n';
import { UI } from '@systems/UiStyle';

export class LoadGameScene extends BaseScene {
  private saves: SaveMeta[] = [];
  private pendingDelete: string | null = null;
  /** The fullscreen GUI — disposed before each rebuild so a deleted row doesn't
   *  linger under a freshly-stacked second GUI (the "delete doesn't remove the row" bug). */
  private gui: AdvancedDynamicTexture | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
  }

  async onEnter(): Promise<void> {
    new FreeCamera('load-cam', Vector3.Zero(), this.babylonScene);
    this.saves = SaveService.listMeta();
    this.buildUI();
  }

  async onExit(): Promise<void> {
    this.pendingDelete = null;
    /* istanbul ignore next — browser GUI cleanup */
    if (this.gui) { this.gui.dispose(); this.gui = null; }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  onBack(): void {
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('main-menu');
  }

  async onLoadSave(saveId: string): Promise<void> {
    const save = SaveService.load(saveId);
    if (!save) return;
    // Carry the loaded appearance + NPC memory + world position into the world.
    ServiceLocator.register('gameSession', GameSession.fromSave(save));
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    await sm.loadScene('game-world');
  }

  requestDelete(saveId: string): void {
    this.pendingDelete = saveId;
  }

  confirmDelete(): boolean {
    if (!this.pendingDelete) return false;
    const deleted = SaveService.delete(this.pendingDelete);
    this.pendingDelete = null;
    this.saves = SaveService.listMeta();
    this.rebuildUI();
    return deleted;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  getPendingDelete(): string | null {
    return this.pendingDelete;
  }

  getSaves(): SaveMeta[] {
    return [...this.saves];
  }

  // ─── Build UI ─────────────────────────────────────────────────────────────

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildUIBrowser();
  }

  private rebuildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildUIBrowser();
  }

  /* istanbul ignore next */
  private buildUIBrowser(): void {
    // Dispose the previous GUI first — otherwise rebuildUI() (after a delete) stacks a
    // second fullscreen layer over the old one and the deleted row stays visible.
    if (this.gui) this.gui.dispose();
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('load-ui', true, this.babylonScene);
    this.gui = gui;

    // Full-screen dim scrim behind the panel (same shell as Character Sheet / PDA).
    const scrim = new Rectangle('load-scrim');
    scrim.width = '100%'; scrim.height = '100%';
    scrim.background = UI.scrim;
    scrim.thickness = 0;
    gui.addControl(scrim);

    // Centred panel frame (responsive: % of the screen).
    const frame = new Rectangle('load-frame');
    frame.width = '78%'; frame.height = '86%';
    frame.background = UI.frameBg;
    frame.color = UI.frameBorder;
    frame.thickness = 2;
    frame.cornerRadius = UI.cornerLg;
    scrim.addControl(frame);

    // ── Header bar ──
    const header = new Rectangle('load-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = UI.headerHeight;
    header.background = UI.headerBg;
    header.thickness = 0;
    frame.addControl(header);

    const accent = new Rectangle('load-accent');
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = UI.accent; accent.thickness = 0;
    header.addControl(accent);

    const title = new TextBlock('title');
    title.text = t('load.title');
    title.color = UI.accent;
    title.fontSize = UI.fontTitle;
    title.fontFamily = UI.font;
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.left = '24px';
    header.addControl(title);

    const backBtn = Button.CreateSimpleButton('back', t('common.back'));
    backBtn.width = '116px'; backBtn.height = '34px';
    backBtn.color = UI.btnFg; backBtn.background = UI.btnBg;
    backBtn.cornerRadius = UI.cornerSm;
    backBtn.fontSize = 13; backBtn.fontFamily = 'monospace';
    backBtn.thickness = 1;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    backBtn.left = '-16px';
    backBtn.onPointerUpObservable.add(() => this.onBack());
    header.addControl(backBtn);

    // ── Body: scrollable save list (or an empty note) ──
    // (No calc() — Lesson 48; top offset + percentage height.)
    const scroll = new ScrollViewer('load-scroll');
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.top = '64px';
    scroll.width = '94%';
    scroll.height = '82%';
    scroll.thickness = 0;
    scroll.barColor = '#00FFCC55';
    scroll.barBackground = 'rgba(255,255,255,0.05)';
    frame.addControl(scroll);

    const list = new StackPanel('load-list');
    list.width = '100%';
    list.spacing = 10;
    list.paddingTop = '8px';
    list.paddingBottom = '12px';
    scroll.addControl(list);

    if (this.saves.length === 0) {
      const empty = new TextBlock('empty');
      empty.text = t('load.empty');
      empty.color = '#6f879b';
      empty.fontSize = 14;
      empty.fontFamily = 'monospace';
      empty.textWrapping = true;
      empty.height = '60px';
      list.addControl(empty);
    } else {
      this.saves.forEach((meta) => this.buildSaveCard(meta, list));
    }
  }

  /** One save card: name + meta + Load + delete. Hover lifts the border. */
  /* istanbul ignore next — browser GUI only */
  private buildSaveCard(meta: SaveMeta, parent: StackPanel): void {
    const card = new Rectangle(`save-${meta.saveId}`);
    card.width = '96%';
    card.height = '72px';
    card.thickness = 1;
    card.color = '#1d3b46';
    card.background = 'rgba(0,18,28,0.7)';
    card.cornerRadius = 8;
    parent.addControl(card);

    card.onPointerEnterObservable.add(() => { card.color = '#00FFCC'; card.background = 'rgba(0,28,40,0.9)'; });
    card.onPointerOutObservable.add(() => { card.color = '#1d3b46'; card.background = 'rgba(0,18,28,0.7)'; });

    // Save name (top line, neon)
    const name = new TextBlock(`name-${meta.saveId}`);
    name.text = `▸ ${meta.saveName}`;
    name.color = '#00FFCC';
    name.fontSize = 15;
    name.fontFamily = '"Courier New", monospace';
    name.fontStyle = 'bold';
    name.height = '22px';
    name.top = '10px';
    name.left = '18px';
    name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    name.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    card.addControl(name);

    // Meta (bottom line: in-game time · last save date)
    const date = (() => {
      try { return new Date(meta.updatedAt).toLocaleString(); } catch { return meta.updatedAt; }
    })();
    const sub = new TextBlock(`meta-${meta.saveId}`);
    sub.text = `${SaveService.formatGameTime(meta.gameTimeSeconds)}  ·  ${date}`;
    sub.color = '#7d93a6';
    sub.fontSize = 11;
    sub.fontFamily = 'monospace';
    sub.height = '18px';
    sub.top = '36px';
    sub.left = '18px';
    sub.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    sub.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    card.addControl(sub);

    const loadBtn = Button.CreateSimpleButton(`load-${meta.saveId}`, t('load.load'));
    loadBtn.width = '96px';
    loadBtn.height = '34px';
    loadBtn.color = '#00FFCC';
    loadBtn.background = 'rgba(0,40,50,0.9)';
    loadBtn.cornerRadius = 6;
    loadBtn.thickness = 1;
    loadBtn.fontSize = 12;
    loadBtn.fontFamily = 'monospace';
    loadBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    loadBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    loadBtn.left = '-66px';
    loadBtn.onPointerUpObservable.add(() => void this.onLoadSave(meta.saveId));
    card.addControl(loadBtn);

    const delBtn = Button.CreateSimpleButton(`del-${meta.saveId}`, '✕');
    delBtn.width = '40px';
    delBtn.height = '34px';
    delBtn.color = '#ff6680';
    delBtn.background = 'rgba(40,0,10,0.7)';
    delBtn.cornerRadius = 6;
    delBtn.thickness = 1;
    delBtn.fontSize = 16;
    delBtn.fontFamily = 'monospace';
    delBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    delBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    delBtn.left = '-18px';
    delBtn.onPointerEnterObservable.add(() => { delBtn.background = 'rgba(120,0,20,0.95)'; delBtn.color = '#ffaabb'; });
    delBtn.onPointerOutObservable.add(() => { delBtn.background = 'rgba(40,0,10,0.7)'; delBtn.color = '#ff6680'; });
    delBtn.onPointerUpObservable.add(() => {
      this.requestDelete(meta.saveId);
      this.confirmDelete();
    });
    card.addControl(delBtn);
  }
}
