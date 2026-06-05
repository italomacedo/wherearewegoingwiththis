import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, Rectangle } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { SaveService, SaveMeta } from '@systems/SaveService';
import { t } from '@systems/I18n';

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

    const title = new TextBlock('title');
    title.text = t('load.title');
    title.color = '#00FFCC';
    title.fontSize = 32;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.verticalAlignment = 0;
    title.top = '30px';
    title.height = '50px';
    gui.addControl(title);

    const saveList = new StackPanel('save-list');
    saveList.verticalAlignment = 0;
    saveList.horizontalAlignment = 1; // center
    saveList.top = '100px';
    saveList.width = '600px';
    saveList.spacing = 8;
    gui.addControl(saveList);

    if (this.saves.length === 0) {
      const empty = new TextBlock('empty');
      empty.text = t('load.empty');
      empty.color = '#667788';
      empty.fontSize = 18;
      empty.height = '40px';
      saveList.addControl(empty);
    } else {
      this.saves.forEach((meta) => {
        const row = new Rectangle(`save-${meta.saveId}`);
        row.height = '60px';
        row.thickness = 1;
        row.color = '#004455';
        row.background = 'rgba(0,20,30,0.7)';
        saveList.addControl(row);

        const nameText = new TextBlock(`name-${meta.saveId}`);
        nameText.text = `${meta.saveName}  |  ${SaveService.formatGameTime(meta.gameTimeSeconds)}`;
        nameText.color = '#CCDDEE';
        nameText.fontSize = 15;
        nameText.textHorizontalAlignment = 0;
        nameText.horizontalAlignment = 0;
        nameText.left = '12px';
        row.addControl(nameText);

        const loadBtn = Button.CreateSimpleButton(`load-${meta.saveId}`, t('load.load'));
        loadBtn.width = '80px';
        loadBtn.height = '36px';
        loadBtn.color = '#00FFCC';
        loadBtn.background = 'transparent';
        loadBtn.fontSize = 13;
        loadBtn.horizontalAlignment = 2;
        loadBtn.left = '-100px';
        loadBtn.onPointerUpObservable.add(() => void this.onLoadSave(meta.saveId));
        row.addControl(loadBtn);

        const delBtn = Button.CreateSimpleButton(`del-${meta.saveId}`, '✕');
        delBtn.width = '40px';
        delBtn.height = '36px';
        delBtn.color = '#FF4466';
        delBtn.background = 'transparent';
        delBtn.fontSize = 16;
        delBtn.horizontalAlignment = 2;
        delBtn.left = '-16px';
        delBtn.onPointerUpObservable.add(() => {
          this.requestDelete(meta.saveId);
          this.confirmDelete();
        });
        row.addControl(delBtn);
      });
    }

    const backBtn = Button.CreateSimpleButton('back', t('common.back'));
    backBtn.width = '120px';
    backBtn.height = '40px';
    backBtn.color = '#888888';
    backBtn.background = 'rgba(0,20,30,0.8)';
    backBtn.fontSize = 14;
    backBtn.fontFamily = 'monospace';
    backBtn.verticalAlignment = 2;
    backBtn.horizontalAlignment = 0;
    backBtn.paddingBottom = '30px';
    backBtn.paddingLeft = '30px';
    backBtn.onPointerUpObservable.add(() => this.onBack());
    gui.addControl(backBtn);
  }
}
