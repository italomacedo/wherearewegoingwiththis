import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, Rectangle, InputText } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { SettingsService, GameSettings } from '@systems/SettingsService';
import { t, getLocale, setLocale, LANGUAGE_LABELS, Locale } from '@systems/I18n';

export type OptionsTab = 'game' | 'display' | 'video' | 'audio';

export class OptionsScene extends BaseScene {
  private activeTab: OptionsTab = 'game';
  private settings: GameSettings = SettingsService.load();
  private gui: AdvancedDynamicTexture | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
  }

  async onEnter(): Promise<void> {
    new FreeCamera('options-cam', Vector3.Zero(), this.babylonScene);
    this.settings = SettingsService.load();
    this.buildUI();
  }

  async onExit(): Promise<void> {
    /* istanbul ignore next — browser GUI only */
    if (this.gui) { this.gui.dispose(); this.gui = null; }
  }

  // ─── Navigation ──────────────────────────────────────────────────────────

  onBack(): void {
    SettingsService.save(this.settings);
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('main-menu');
  }

  // ─── Tab management ───────────────────────────────────────────────────────

  selectTab(tab: OptionsTab): void {
    this.activeTab = tab;
  }

  getActiveTab(): OptionsTab {
    return this.activeTab;
  }

  // ─── Setting mutators (used by UI controls) ───────────────────────────────

  setSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.settings = { ...this.settings, [key]: value };
  }

  getSetting<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.settings[key];
  }

  /** Toggle the UI + NPC language (en ↔ pt-BR) and persist it. */
  cycleLanguage(): Locale {
    const next: Locale = getLocale() === 'en' ? 'pt-BR' : 'en';
    setLocale(next); // updates the i18n cache + persists to settings
    this.setSetting('language', next);
    return next;
  }

  /** Cycle the skill-gain multiplier 1 → 3 → 10 → 1 and persist it. */
  cycleSkillGainMultiplier(): 1 | 3 | 10 {
    const order: Array<1 | 3 | 10> = [1, 3, 10];
    const cur = this.getSetting('skillGainMultiplier');
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    this.setSetting('skillGainMultiplier', next);
    SettingsService.set('skillGainMultiplier', next);
    return next;
  }

  /** Toggle autonomous NPC behaviour on/off and persist it. */
  cycleNpcAutonomy(): boolean {
    const next = !this.getSetting('npcAutonomy');
    this.setSetting('npcAutonomy', next);
    SettingsService.set('npcAutonomy', next);
    return next;
  }

  /** Cycle the proactive-reflection interval 4 → 8 → 15 → 4 (minutes) and persist. */
  cycleNpcReflectionMinutes(): 4 | 8 | 15 {
    const order: Array<4 | 8 | 15> = [4, 8, 15];
    const cur = this.getSetting('npcReflectionMinutes');
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    this.setSetting('npcReflectionMinutes', next);
    SettingsService.set('npcReflectionMinutes', next);
    return next;
  }

  /** Cycle the autonomous calls/minute budget 4 → 8 → 12 → 4 and persist. */
  cycleNpcCallsPerMinute(): 4 | 8 | 12 {
    const order: Array<4 | 8 | 12> = [4, 8, 12];
    const cur = this.getSetting('npcCallsPerMinute');
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    this.setSetting('npcCallsPerMinute', next);
    SettingsService.set('npcCallsPerMinute', next);
    return next;
  }

  /** Cycle the AP-per-Dexterity divisor 5 → 10 → 20 → 5 and persist (combat tempo). */
  cycleCombatApPerDexterity(): 5 | 10 | 20 {
    const order: Array<5 | 10 | 20> = [5, 10, 20];
    const cur = this.getSetting('combatApPerDexterity');
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    this.setSetting('combatApPerDexterity', next);
    SettingsService.set('combatApPerDexterity', next);
    return next;
  }

  /** Cycle the primary-action AP cost 1 → 2 → 3 → 1 and persist. */
  cycleCombatPrimaryCost(): 1 | 2 | 3 {
    const order: Array<1 | 2 | 3> = [1, 2, 3];
    const cur = this.getSetting('combatPrimaryCost');
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    this.setSetting('combatPrimaryCost', next);
    SettingsService.set('combatPrimaryCost', next);
    return next;
  }

  /** Cycle the secondary-action AP cost 1 → 2 → 1 and persist. */
  cycleCombatSecondaryCost(): 1 | 2 {
    const next: 1 | 2 = this.getSetting('combatSecondaryCost') === 1 ? 2 : 1;
    this.setSetting('combatSecondaryCost', next);
    SettingsService.set('combatSecondaryCost', next);
    return next;
  }

  /** Cycle the movement cost 0.5 → 1 → 0.5 AP/m (0.5 = 1 AP moves 2 m) and persist. */
  cycleCombatMoveApPerMeter(): 0.5 | 1 {
    const next: 0.5 | 1 = this.getSetting('combatMoveApPerMeter') === 0.5 ? 1 : 0.5;
    this.setSetting('combatMoveApPerMeter', next);
    SettingsService.set('combatMoveApPerMeter', next);
    return next;
  }

  /** Movement cost shown as whole metres per AP (the inverse of AP/m) for clarity. */
  static metresPerApLabel(apPerMetre: number): string {
    return `${apPerMetre > 0 ? Math.round(1 / apPerMetre) : 0} m/AP`;
  }

  validateAndSaveClaudePath(path: string): { valid: boolean; reason?: string } {
    const result = SettingsService.validateClaudePath(path);
    if (result.valid) {
      this.setSetting('claudeCliPath', path);
    }
    return result;
  }

  // ─── Build UI (browser only) ──────────────────────────────────────────────

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildUIBrowser();
  }

  /** Re-translate the screen in place (after a language toggle). Browser-only. */
  /* istanbul ignore next — browser GUI only */
  private rebuildUI(): void {
    if (this.gui) { this.gui.dispose(); this.gui = null; }
    this.buildUIBrowser();
  }

  /* istanbul ignore next */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('options-ui', true, this.babylonScene);
    this.gui = gui;

    // Title
    const title = new TextBlock('title');
    title.text = t('options.title');
    title.color = '#00FFCC';
    title.fontSize = 32;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.verticalAlignment = 0;
    title.top = '30px';
    title.height = '50px';
    gui.addControl(title);

    // Tab bar
    const tabBar = new StackPanel('tab-bar');
    tabBar.isVertical = false;
    tabBar.verticalAlignment = 0;
    tabBar.top = '90px';
    tabBar.height = '40px';
    tabBar.spacing = 4;
    gui.addControl(tabBar);

    const tabLabels: Array<{ id: OptionsTab; label: string }> = [
      { id: 'game', label: t('options.tab.game').toUpperCase() },
      { id: 'display', label: t('options.tab.display').toUpperCase() },
      { id: 'video', label: t('options.tab.video').toUpperCase() },
      { id: 'audio', label: t('options.tab.audio').toUpperCase() },
    ];

    tabLabels.forEach(({ id, label }) => {
      const tab = Button.CreateSimpleButton(`tab-${id}`, label);
      tab.width = '120px';
      tab.height = '36px';
      tab.color = id === this.activeTab ? '#00FFCC' : '#446666';
      tab.background = id === this.activeTab ? 'rgba(0,80,60,0.5)' : 'transparent';
      tab.fontSize = 13;
      tab.fontFamily = '"Courier New", monospace';
      tab.thickness = 1;
      tab.onPointerUpObservable.add(() => {
        this.selectTab(id);
      });
      tabBar.addControl(tab);
    });

    // Content panel
    const content = new StackPanel('content');
    content.verticalAlignment = 0;
    content.top = '150px';
    content.left = '80px';
    content.width = '600px';
    content.spacing = 12;
    content.horizontalAlignment = 0;
    gui.addControl(content);

    // Language toggle (Game tab)
    const langRow = new Rectangle('lang-row');
    langRow.height = '40px';
    langRow.thickness = 0;
    content.addControl(langRow);

    const langLabel = new TextBlock('lang-label');
    langLabel.text = `${t('common.language')}:`;
    langLabel.color = '#AABBCC';
    langLabel.fontSize = 14;
    langLabel.fontFamily = 'monospace';
    langLabel.horizontalAlignment = 0;
    langLabel.textHorizontalAlignment = 0;
    langLabel.width = '180px';
    langRow.addControl(langLabel);

    const langBtn = Button.CreateSimpleButton('lang-btn', LANGUAGE_LABELS[getLocale()]);
    langBtn.width = '160px';
    langBtn.height = '32px';
    langBtn.left = '190px';
    langBtn.horizontalAlignment = 0;
    langBtn.color = '#00FFCC';
    langBtn.background = 'rgba(0,30,40,0.8)';
    langBtn.fontSize = 13;
    langBtn.fontFamily = 'monospace';
    langBtn.thickness = 1;
    langBtn.onPointerUpObservable.add(() => {
      const next = this.cycleLanguage();
      if (langBtn.textBlock) langBtn.textBlock.text = LANGUAGE_LABELS[next];
      // Re-translate the screen so the change is visible immediately.
      this.rebuildUI();
    });
    langRow.addControl(langBtn);

    // Claude CLI path input (Game tab)
    const pathRow = new Rectangle('path-row');
    pathRow.height = '40px';
    pathRow.thickness = 0;
    content.addControl(pathRow);

    const pathLabel = new TextBlock('path-label');
    pathLabel.text = t('options.claudePath');
    pathLabel.color = '#AABBCC';
    pathLabel.fontSize = 14;
    pathLabel.fontFamily = 'monospace';
    pathLabel.horizontalAlignment = 0;
    pathLabel.textHorizontalAlignment = 0;
    pathLabel.left = '0px';
    pathLabel.width = '180px';
    pathRow.addControl(pathLabel);

    const pathInput = new InputText('path-input', this.settings.claudeCliPath);
    pathInput.width = '300px';
    pathInput.height = '32px';
    pathInput.color = '#00FFCC';
    pathInput.background = 'rgba(0,30,40,0.8)';
    pathInput.fontSize = 13;
    pathInput.fontFamily = 'monospace';
    pathInput.left = '190px';
    pathInput.horizontalAlignment = 0;
    pathInput.onBlurObservable.add(() => {
      this.validateAndSaveClaudePath(pathInput.text);
    });
    pathRow.addControl(pathInput);

    // Skill-gain multiplier cycler (Game tab) — anti-grind pacing.
    const gainRow = new Rectangle('gain-row');
    gainRow.height = '40px';
    gainRow.thickness = 0;
    content.addControl(gainRow);

    const gainLabel = new TextBlock('gain-label');
    gainLabel.text = t('options.skillGain');
    gainLabel.color = '#AABBCC';
    gainLabel.fontSize = 14;
    gainLabel.fontFamily = 'monospace';
    gainLabel.horizontalAlignment = 0;
    gainLabel.textHorizontalAlignment = 0;
    gainLabel.width = '180px';
    gainRow.addControl(gainLabel);

    const gainBtn = Button.CreateSimpleButton('gain-btn', `${this.settings.skillGainMultiplier}x`);
    gainBtn.width = '90px';
    gainBtn.height = '32px';
    gainBtn.left = '190px';
    gainBtn.horizontalAlignment = 0;
    gainBtn.color = '#00FFCC';
    gainBtn.background = 'rgba(0,30,40,0.8)';
    gainBtn.fontSize = 13;
    gainBtn.fontFamily = 'monospace';
    gainBtn.thickness = 1;
    gainBtn.onPointerUpObservable.add(() => {
      const next = this.cycleSkillGainMultiplier();
      if (gainBtn.textBlock) gainBtn.textBlock.text = `${next}x`;
    });
    gainRow.addControl(gainBtn);

    // ─── Living-NPC autonomy throttle (Game tab) ────────────────────────────
    const mkCycler = (
      name: string,
      labelKey: string,
      initial: string,
      onClick: () => string,
    ): void => {
      const row = new Rectangle(`${name}-row`);
      row.height = '40px';
      row.thickness = 0;
      content.addControl(row);

      const label = new TextBlock(`${name}-label`);
      label.text = t(labelKey);
      label.color = '#AABBCC';
      label.fontSize = 14;
      label.fontFamily = 'monospace';
      label.horizontalAlignment = 0;
      label.textHorizontalAlignment = 0;
      label.width = '180px';
      row.addControl(label);

      const btn = Button.CreateSimpleButton(`${name}-btn`, initial);
      btn.width = '120px';
      btn.height = '32px';
      btn.left = '190px';
      btn.horizontalAlignment = 0;
      btn.color = '#00FFCC';
      btn.background = 'rgba(0,30,40,0.8)';
      btn.fontSize = 13;
      btn.fontFamily = 'monospace';
      btn.thickness = 1;
      btn.onPointerUpObservable.add(() => {
        const next = onClick();
        if (btn.textBlock) btn.textBlock.text = next;
      });
      row.addControl(btn);
    };

    mkCycler(
      'autonomy', 'options.npcAutonomy',
      this.settings.npcAutonomy ? t('common.on') : t('common.off'),
      () => (this.cycleNpcAutonomy() ? t('common.on') : t('common.off')),
    );
    mkCycler(
      'reflect', 'options.npcReflection',
      `${this.settings.npcReflectionMinutes} min`,
      () => `${this.cycleNpcReflectionMinutes()} min`,
    );
    mkCycler(
      'budget', 'options.npcBudget',
      `${this.settings.npcCallsPerMinute}/min`,
      () => `${this.cycleNpcCallsPerMinute()}/min`,
    );

    // ─── Turn-based combat economy (Game tab) ───────────────────────────────
    mkCycler(
      'combat-ap', 'options.combatApPerDex',
      `Dex/${this.settings.combatApPerDexterity}`,
      () => `Dex/${this.cycleCombatApPerDexterity()}`,
    );
    mkCycler(
      'combat-primary', 'options.combatPrimaryCost',
      `${this.settings.combatPrimaryCost} AP`,
      () => `${this.cycleCombatPrimaryCost()} AP`,
    );
    mkCycler(
      'combat-secondary', 'options.combatSecondaryCost',
      `${this.settings.combatSecondaryCost} AP`,
      () => `${this.cycleCombatSecondaryCost()} AP`,
    );
    mkCycler(
      'combat-move', 'options.combatMoveCost',
      OptionsScene.metresPerApLabel(this.settings.combatMoveApPerMeter),
      () => OptionsScene.metresPerApLabel(this.cycleCombatMoveApPerMeter()),
    );

    // Back button
    const backBtn = Button.CreateSimpleButton('back', t('common.back'));
    backBtn.width = '140px';
    backBtn.height = '44px';
    backBtn.color = '#00CCAA';
    backBtn.background = 'rgba(0,20,30,0.8)';
    backBtn.fontSize = 16;
    backBtn.fontFamily = '"Courier New", monospace';
    backBtn.thickness = 1;
    backBtn.verticalAlignment = 2;
    backBtn.horizontalAlignment = 0;
    backBtn.left = '80px';
    backBtn.top = '-40px';
    backBtn.onPointerUpObservable.add(() => this.onBack());
    gui.addControl(backBtn);
  }
}
