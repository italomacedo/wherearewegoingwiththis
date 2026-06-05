import { Engine, Color4, FreeCamera, Vector3 } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, ScrollViewer, Rectangle, InputText, Control } from '@babylonjs/gui';
import { UI } from '@systems/UiStyle';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { SettingsService, GameSettings } from '@systems/SettingsService';
import { t, getLocale, setLocale, LANGUAGE_LABELS, Locale } from '@systems/I18n';
import { playSfxCue } from '@systems/UiSound';

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

  // ─── Audio (Sound tab) ─────────────────────────────────────────────────────

  /** Discrete volume steps the cyclers walk through. */
  static readonly VOLUME_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

  /** Snap a volume to the nearest step, then advance one step (wrapping). */
  static nextVolume(v: number): number {
    const steps = OptionsScene.VOLUME_STEPS;
    let nearest = 0;
    for (let i = 1; i < steps.length; i++) {
      if (Math.abs(steps[i]! - v) < Math.abs(steps[nearest]! - v)) nearest = i;
    }
    return steps[(nearest + 1) % steps.length]!;
  }

  /** Volume shown as a whole percentage. */
  static volumeLabel(v: number): string {
    return `${Math.round(v * 100)}%`;
  }

  /** Advance a volume bus to the next step, persist it, and refresh live audio. */
  cycleVolume(key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'npcVoiceVolume'): number {
    const next = OptionsScene.nextVolume(this.getSetting(key) as number);
    this.setSetting(key, next);
    SettingsService.set(key, next);
    this.notifyAudioChanged();
    return next;
  }

  /** Toggle the music bus mute and persist it. */
  cycleMusicEnabled(): boolean {
    const next = !this.getSetting('musicEnabled');
    this.setSetting('musicEnabled', next);
    SettingsService.set('musicEnabled', next);
    this.notifyAudioChanged();
    return next;
  }

  /** Toggle the SFX bus mute and persist it. */
  cycleSfxEnabled(): boolean {
    const next = !this.getSetting('sfxEnabled');
    this.setSetting('sfxEnabled', next);
    SettingsService.set('sfxEnabled', next);
    this.notifyAudioChanged();
    return next;
  }

  /** Toggle the TTS voice service on/off and persist it. */
  cycleTtsEnabled(): boolean {
    const next = !this.getSetting('ttsEnabled');
    this.setSetting('ttsEnabled', next);
    SettingsService.set('ttsEnabled', next);
    this.notifyAudioChanged();
    return next;
  }

  /** Push the new audio settings to the live mixer if the service is present. */
  private notifyAudioChanged(): void {
    const audio = ServiceLocator.tryGet<{ refreshFromSettings(): void }>('audio');
    audio?.refreshFromSettings();
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

    // ── Shell (scrim + centred frame + header) — unified visual identity ──
    const scrim = new Rectangle('opt-scrim');
    scrim.width = '100%'; scrim.height = '100%';
    scrim.background = UI.scrim; scrim.thickness = 0;
    gui.addControl(scrim);

    const frame = new Rectangle('opt-frame');
    frame.width = '82%'; frame.height = '88%';
    frame.background = UI.frameBg; frame.color = UI.frameBorder;
    frame.thickness = 2; frame.cornerRadius = UI.cornerLg;
    scrim.addControl(frame);

    const header = new Rectangle('opt-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = UI.headerHeight;
    header.background = UI.headerBg; header.thickness = 0;
    frame.addControl(header);

    const accent = new Rectangle('opt-accent');
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = UI.accent; accent.thickness = 0;
    header.addControl(accent);

    const title = new TextBlock('title');
    title.text = t('options.title');
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
    backBtn.onPointerUpObservable.add(() => { playSfxCue('ui_click'); this.onBack(); });
    header.addControl(backBtn);

    // ── Tab bar (right under the header) ──
    const tabBar = new StackPanel('tab-bar');
    tabBar.isVertical = false;
    tabBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tabBar.top = '68px';
    tabBar.height = '36px';
    tabBar.spacing = 6;
    frame.addControl(tabBar);

    const tabLabels: Array<{ id: OptionsTab; label: string }> = [
      { id: 'game', label: t('options.tab.game').toUpperCase() },
      { id: 'display', label: t('options.tab.display').toUpperCase() },
      { id: 'video', label: t('options.tab.video').toUpperCase() },
      { id: 'audio', label: t('options.tab.audio').toUpperCase() },
    ];

    tabLabels.forEach(({ id, label }) => {
      const tab = Button.CreateSimpleButton(`tab-${id}`, label);
      tab.width = '120px';
      tab.height = '32px';
      tab.color = id === this.activeTab ? UI.accent : UI.textMuted;
      tab.background = id === this.activeTab ? UI.btnBg : 'rgba(0,16,26,0.7)';
      tab.cornerRadius = UI.cornerSm;
      tab.fontSize = 12;
      tab.fontFamily = UI.font;
      tab.thickness = id === this.activeTab ? 2 : 1;
      tab.onPointerUpObservable.add(() => {
        playSfxCue('ui_click');
        this.selectTab(id);
        this.rebuildUI();
      });
      tabBar.addControl(tab);
    });

    // ── Scrollable content area inside the frame (no calc — Lesson 48) ──
    const scroll = new ScrollViewer('opt-scroll');
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.top = '110px';
    scroll.width = '94%';
    scroll.height = '76%';
    scroll.thickness = 0;
    scroll.barColor = UI.accentSoft;
    scroll.barBackground = UI.accentBgSoft;
    frame.addControl(scroll);

    const content = new StackPanel('content');
    content.width = '100%';
    content.spacing = 10;
    content.paddingTop = '8px';
    content.paddingBottom = '12px';
    content.paddingLeft = '24px';
    content.paddingRight = '24px';
    scroll.addControl(content);

    // Generic label + cycling-button row helper.
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
        playSfxCue('ui_click');
        const next = onClick();
        if (btn.textBlock) btn.textBlock.text = next;
      });
      row.addControl(btn);
    };

    if (this.activeTab === 'game') {
      // Language toggle
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
        playSfxCue('ui_click');
        const next = this.cycleLanguage();
        if (langBtn.textBlock) langBtn.textBlock.text = LANGUAGE_LABELS[next];
        // Re-translate the screen so the change is visible immediately.
        this.rebuildUI();
      });
      langRow.addControl(langBtn);

      // Claude CLI path input
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

      // Skill-gain multiplier cycler — anti-grind pacing.
      mkCycler(
        'gain', 'options.skillGain',
        `${this.settings.skillGainMultiplier}x`,
        () => `${this.cycleSkillGainMultiplier()}x`,
      );

      // Living-NPC autonomy throttle.
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

      // Turn-based combat economy.
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
    }

    if (this.activeTab === 'audio') {
      // Volume cyclers (Master / Music / SFX / Voice).
      mkCycler(
        'vol-master', 'options.masterVolume',
        OptionsScene.volumeLabel(this.settings.masterVolume),
        () => OptionsScene.volumeLabel(this.cycleVolume('masterVolume')),
      );
      mkCycler(
        'vol-music', 'options.musicVolume',
        OptionsScene.volumeLabel(this.settings.musicVolume),
        () => OptionsScene.volumeLabel(this.cycleVolume('musicVolume')),
      );
      mkCycler(
        'vol-sfx', 'options.sfxVolume',
        OptionsScene.volumeLabel(this.settings.sfxVolume),
        () => OptionsScene.volumeLabel(this.cycleVolume('sfxVolume')),
      );
      mkCycler(
        'vol-voice', 'options.voiceVolume',
        OptionsScene.volumeLabel(this.settings.npcVoiceVolume),
        () => OptionsScene.volumeLabel(this.cycleVolume('npcVoiceVolume')),
      );

      // Mute / service toggles (Music / SFX / TTS).
      mkCycler(
        'mute-music', 'options.musicEnabled',
        this.settings.musicEnabled ? t('common.on') : t('common.off'),
        () => (this.cycleMusicEnabled() ? t('common.on') : t('common.off')),
      );
      mkCycler(
        'mute-sfx', 'options.sfxEnabled',
        this.settings.sfxEnabled ? t('common.on') : t('common.off'),
        () => (this.cycleSfxEnabled() ? t('common.on') : t('common.off')),
      );
      mkCycler(
        'tts', 'options.ttsEnabled',
        this.settings.ttsEnabled ? t('common.on') : t('common.off'),
        () => (this.cycleTtsEnabled() ? t('common.on') : t('common.off')),
      );
    }

    // (BACK button is in the header now, top-right of the frame.)
  }
}
