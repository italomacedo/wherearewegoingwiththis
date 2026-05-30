import {
  Engine, Color4, ArcRotateCamera, Vector3,
  HemisphericLight, Color3, PointLight,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, InputText } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import { CharacterData, CharacterAppearance, DEFAULT_APPEARANCE, BODY_BASES } from '@entities/CharacterData';
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { SaveService } from '@systems/SaveService';

export class CharacterCreatorScene extends BaseScene {
  private characterData: CharacterData = {
    name: '',
    appearance: { ...DEFAULT_APPEARANCE },
  };
  private assembler: CharacterAssembler | null = null;
  private assembled: AssembledCharacter | null = null;

  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.02, 0.02, 0.06, 1);
  }

  async onEnter(): Promise<void> {
    this.setupCamera();
    this.setupLighting();
    this.assembler = new CharacterAssembler(this.babylonScene);
    await this.rebuildCharacter();
    this.buildUI();
  }

  async onExit(): Promise<void> {
    this.assembled?.dispose();
    this.assembled = null;
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  onBack(): void {
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('main-menu');
  }

  async onBegin(playerName: string): Promise<void> {
    if (!playerName.trim()) return;
    this.characterData.name = playerName.trim();

    // Persist a fresh save and hand the GameWorldScene a session carrying the
    // chosen appearance/name (and an empty NPC memory) via the ServiceLocator.
    const character = this.getCharacterData();
    const save = SaveService.createNewSave(character, character.name);
    SaveService.save(save);
    ServiceLocator.register('gameSession', GameSession.fromSave(save));

    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    await sm.loadScene('game-world');
  }

  // ─── Customization actions (testable public API) ───────────────────────────

  getCharacterData(): CharacterData {
    return { ...this.characterData, appearance: { ...this.characterData.appearance } };
  }

  setPlayerName(name: string): void {
    this.characterData.name = name;
  }

  getPlayerName(): string {
    return this.characterData.name;
  }

  async cycleBodyBase(direction: 1 | -1): Promise<void> {
    const current = BODY_BASES.indexOf(this.characterData.appearance.bodyBase as (typeof BODY_BASES)[number]);
    const next = (current + direction + BODY_BASES.length) % BODY_BASES.length;
    this.setAppearance('bodyBase', BODY_BASES[next]!);
    await this.rebuildCharacter();
  }

  async setSkinTone(hex: string): Promise<void> {
    this.setAppearance('skinTone', hex);
    await this.rebuildCharacter();
  }

  async cycleHair(direction: 1 | -1): Promise<void> {
    const hairKeys = ['hair_short_01', 'hair_long_01', 'hair_undercut_01',
      'hair_mohawk_01', 'hair_bun_01', 'hair_dreadlocks_01', null] as const;
    const current = hairKeys.indexOf(this.characterData.appearance.hair as typeof hairKeys[number]);
    const next = (current + direction + hairKeys.length) % hairKeys.length;
    const rawVal = hairKeys[next];
    const selected = (rawVal === undefined ? null : rawVal) as string | null;
    this.setAppearance('hair', selected);
    await this.rebuildCharacter();
  }

  async setHairColor(hex: string): Promise<void> {
    this.setAppearance('hairColor', hex);
    await this.rebuildCharacter();
  }

  async setClothingSlot(
    slot: 'top' | 'bottom' | 'shoes',
    value: string | null
  ): Promise<void> {
    this.setAppearance(slot, value);
    await this.rebuildCharacter();
  }

  toggleImplant(implantKey: string): void {
    const implants = [...this.characterData.appearance.implants];
    const idx = implants.indexOf(implantKey);
    if (idx === -1) implants.push(implantKey);
    else implants.splice(idx, 1);
    this.setAppearance('implants', implants);
    // implants don't require full rebuild — placeholder only changes color
  }

  private setAppearance<K extends keyof CharacterAppearance>(
    key: K,
    value: CharacterAppearance[K]
  ): void {
    this.characterData = {
      ...this.characterData,
      appearance: { ...this.characterData.appearance, [key]: value },
    };
  }

  private async rebuildCharacter(): Promise<void> {
    this.assembled?.dispose();
    this.assembled = await this.assembler!.assemble(this.characterData.appearance);
  }

  // ─── Setup (called on enter) ───────────────────────────────────────────────

  private setupCamera(): void {
    const camera = new ArcRotateCamera(
      'creator-cam', -Math.PI / 2, Math.PI / 3, 3.5,
      new Vector3(0, 1, 0), this.babylonScene
    );
    camera.lowerRadiusLimit = 1.5;
    camera.upperRadiusLimit = 6;
    camera.lowerBetaLimit = 0.2;
    camera.upperBetaLimit = Math.PI / 2;
    this.babylonScene.activeCamera = camera;

    // Enable pointer input for 360° drag rotation (browser only)
    /* istanbul ignore next */
    if (typeof document !== 'undefined') {
      camera.attachControl(this.babylonScene.getEngine().getRenderingCanvas() ?? undefined, true);
    }
  }

  private setupLighting(): void {
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.babylonScene);
    ambient.intensity = 0.5;
    ambient.diffuse = new Color3(0.8, 0.9, 1);
    ambient.groundColor = new Color3(0.1, 0.1, 0.2);

    const key = new PointLight('key', new Vector3(2, 3, -2), this.babylonScene);
    key.intensity = 1.2;
    key.diffuse = new Color3(0.9, 0.95, 1);

    const fill = new PointLight('fill', new Vector3(-2, 2, 2), this.babylonScene);
    fill.intensity = 0.5;
    fill.diffuse = new Color3(0.4, 0.5, 1);

    const rim = new PointLight('rim', new Vector3(0, 1, 3), this.babylonScene);
    rim.intensity = 0.6;
    rim.diffuse = new Color3(0, 1, 0.8);
  }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildUIBrowser();
  }

  /* istanbul ignore next */
  private buildUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('creator-ui', true, this.babylonScene);

    // Title
    const title = new TextBlock('title');
    title.text = 'CREATE YOUR OPERATIVE';
    title.color = '#00FFCC';
    title.fontSize = 28;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.verticalAlignment = 0;
    title.top = '20px';
    title.height = '40px';
    gui.addControl(title);

    // Left panel — body customization
    const leftPanel = new StackPanel('left-panel');
    leftPanel.horizontalAlignment = 0;
    leftPanel.verticalAlignment = 0;
    leftPanel.left = '20px';
    leftPanel.top = '80px';
    leftPanel.width = '200px';
    leftPanel.spacing = 10;
    gui.addControl(leftPanel);

    // Body base selector
    const bodyLabel = new TextBlock('body-label');
    bodyLabel.text = 'BODY';
    bodyLabel.color = '#AABBCC';
    bodyLabel.fontSize = 13;
    bodyLabel.fontFamily = 'monospace';
    bodyLabel.height = '20px';
    leftPanel.addControl(bodyLabel);

    const bodyRow = new StackPanel('body-row');
    bodyRow.isVertical = false;
    bodyRow.height = '36px';
    bodyRow.spacing = 4;
    leftPanel.addControl(bodyRow);

    const bodyPrev = Button.CreateSimpleButton('body-prev', '◄');
    bodyPrev.width = '36px'; bodyPrev.height = '36px';
    bodyPrev.color = '#00FFCC'; bodyPrev.background = 'rgba(0,30,40,0.8)';
    bodyPrev.onPointerUpObservable.add(() => void this.cycleBodyBase(-1));
    bodyRow.addControl(bodyPrev);

    const bodyNext = Button.CreateSimpleButton('body-next', '►');
    bodyNext.width = '36px'; bodyNext.height = '36px';
    bodyNext.color = '#00FFCC'; bodyNext.background = 'rgba(0,30,40,0.8)';
    bodyNext.onPointerUpObservable.add(() => void this.cycleBodyBase(1));
    bodyRow.addControl(bodyNext);

    // Hair selector
    const hairLabel = new TextBlock('hair-label');
    hairLabel.text = 'HAIR';
    hairLabel.color = '#AABBCC';
    hairLabel.fontSize = 13;
    hairLabel.fontFamily = 'monospace';
    hairLabel.height = '20px';
    leftPanel.addControl(hairLabel);

    const hairRow = new StackPanel('hair-row');
    hairRow.isVertical = false;
    hairRow.height = '36px';
    hairRow.spacing = 4;
    leftPanel.addControl(hairRow);

    const hairPrev = Button.CreateSimpleButton('hair-prev', '◄');
    hairPrev.width = '36px'; hairPrev.height = '36px';
    hairPrev.color = '#00FFCC'; hairPrev.background = 'rgba(0,30,40,0.8)';
    hairPrev.onPointerUpObservable.add(() => void this.cycleHair(-1));
    hairRow.addControl(hairPrev);

    const hairNext = Button.CreateSimpleButton('hair-next', '►');
    hairNext.width = '36px'; hairNext.height = '36px';
    hairNext.color = '#00FFCC'; hairNext.background = 'rgba(0,30,40,0.8)';
    hairNext.onPointerUpObservable.add(() => void this.cycleHair(1));
    hairRow.addControl(hairNext);

    // Right panel — name + begin
    const nameInput = new InputText('name-input', 'Operative');
    nameInput.width = '220px';
    nameInput.height = '40px';
    nameInput.color = '#00FFCC';
    nameInput.background = 'rgba(0,30,40,0.8)';
    nameInput.fontSize = 16;
    nameInput.fontFamily = 'monospace';
    nameInput.verticalAlignment = 2;
    nameInput.horizontalAlignment = 2;
    nameInput.paddingBottom = '100px';
    nameInput.paddingRight = '20px';
    nameInput.onBlurObservable.add(() => this.setPlayerName(nameInput.text));
    gui.addControl(nameInput);

    const beginBtn = Button.CreateSimpleButton('begin', 'BEGIN  ▶');
    beginBtn.width = '220px';
    beginBtn.height = '50px';
    beginBtn.color = '#00FFCC';
    beginBtn.background = 'rgba(0,60,50,0.9)';
    beginBtn.fontSize = 18;
    beginBtn.fontFamily = '"Courier New", monospace';
    beginBtn.fontStyle = 'bold';
    beginBtn.thickness = 1;
    beginBtn.verticalAlignment = 2;
    beginBtn.horizontalAlignment = 2;
    beginBtn.paddingBottom = '40px';
    beginBtn.paddingRight = '20px';
    beginBtn.onPointerUpObservable.add(() => void this.onBegin(nameInput.text));
    gui.addControl(beginBtn);

    const backBtn = Button.CreateSimpleButton('back', '← BACK');
    backBtn.width = '120px';
    backBtn.height = '40px';
    backBtn.color = '#888888';
    backBtn.background = 'rgba(0,20,30,0.8)';
    backBtn.fontSize = 14;
    backBtn.fontFamily = 'monospace';
    backBtn.thickness = 1;
    backBtn.verticalAlignment = 2;
    backBtn.horizontalAlignment = 0;
    backBtn.paddingBottom = '40px';
    backBtn.paddingLeft = '20px';
    backBtn.onPointerUpObservable.add(() => this.onBack());
    gui.addControl(backBtn);
  }
}
