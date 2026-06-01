import {
  Engine, Color4, Color3, ArcRotateCamera, Vector3,
  HemisphericLight, PointLight, MeshBuilder,
  StandardMaterial, ParticleSystem, Texture, GlowLayer,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, Rectangle } from '@babylonjs/gui';
import { t } from '@systems/I18n';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';

export class MainMenuScene extends BaseScene {
  constructor(engine: Engine) {
    super(engine);
    this.babylonScene.clearColor = new Color4(0.01, 0.01, 0.04, 1);
  }

  async onEnter(): Promise<void> {
    this.setupCamera();
    this.buildCityscape();
    this.buildMenuUI();
  }

  async onExit(): Promise<void> {
    this.babylonScene.particleSystems.forEach((ps) => ps.stop());
  }

  // ─── Navigation actions (public + testable) ───────────────────────────────

  onNewGame(): void {
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('character-creator');
  }

  onLoadGame(): void {
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('load-game');
  }

  onOptions(): void {
    const sm = ServiceLocator.get<SceneManager>('sceneManager');
    void sm.loadScene('options');
  }

  onQuit(): void {
    /* istanbul ignore next — Electron-only, tested via smoke test */
    if (typeof window !== 'undefined' && window.electronAPI) {
      void window.electronAPI.windowClose();
    }
  }

  // ─── Private build methods ────────────────────────────────────────────────

  private setupCamera(): void {
    const camera = new ArcRotateCamera(
      'menu-cam', -Math.PI / 2, Math.PI / 3, 30,
      new Vector3(0, 5, 0), this.babylonScene
    );
    this.babylonScene.activeCamera = camera;
  }

  private buildCityscape(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildCityscapeBrowser();
  }

  /* istanbul ignore next */
  private buildCityscapeBrowser(): void {
    const scene = this.babylonScene;

    // Ambient light (dim, blue-tinted)
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.15;
    ambient.diffuse = new Color3(0.3, 0.4, 0.8);
    ambient.groundColor = new Color3(0.05, 0.05, 0.1);

    // Neon accent lights
    const colors: Color3[] = [
      new Color3(0, 1, 0.8),  // cyan
      new Color3(0.5, 0, 1),  // purple
      new Color3(1, 0.2, 0.5), // pink
    ];
    colors.forEach((c, i) => {
      const light = new PointLight(`neon-${i}`, new Vector3((i - 1) * 12, 6, 8), scene);
      light.diffuse = c;
      light.specular = c;
      light.intensity = 2;
      light.range = 25;
    });

    // Procedural buildings
    const buildingPositions = [
      [-18, 0], [-12, 0], [-6, 0], [0, 0], [6, 0], [12, 0], [18, 0],
      [-15, 8], [-9, 8], [-3, 8], [3, 8], [9, 8], [15, 8],
      [-20, 16], [-14, 16], [-7, 16], [0, 16], [7, 16], [14, 16], [20, 16],
    ];

    buildingPositions.forEach(([x, z], i) => {
      const w = 2.5 + (i % 3) * 0.8;
      const h = 4 + (i % 7) * 3;
      const d = 2 + (i % 4) * 0.6;

      const box = MeshBuilder.CreateBox(`building-${i}`, { width: w, height: h, depth: d }, scene);
      box.position.set(x ?? 0, h / 2, z ?? 0);

      const mat = new StandardMaterial(`mat-${i}`, scene);
      mat.diffuseColor = new Color3(0.08, 0.08, 0.12);
      mat.emissiveColor = new Color3(0, (i % 5) * 0.06, (i % 4) * 0.08);
      mat.specularColor = Color3.Black();
      box.material = mat;
    });

    // Ground plane
    const ground = MeshBuilder.CreateGround('ground', { width: 60, height: 60 }, scene);
    const groundMat = new StandardMaterial('ground-mat', scene);
    groundMat.diffuseColor = new Color3(0.05, 0.05, 0.08);
    groundMat.specularColor = new Color3(0.2, 0.2, 0.3);
    ground.material = groundMat;

    // Glow layer for emissive neon pop
    const glow = new GlowLayer('glow', scene);
    glow.intensity = 1.2;

    // Rain particle system
    this.buildRain();
  }

  /* istanbul ignore next */
  private buildRain(): void {
    const scene = this.babylonScene;
    const rain = new ParticleSystem('rain', 3000, scene);

    rain.particleTexture = new Texture(
      'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      scene
    );

    rain.emitter = new Vector3(0, 25, 10);
    rain.minEmitBox = new Vector3(-30, 0, -20);
    rain.maxEmitBox = new Vector3(30, 0, 20);
    rain.direction1 = new Vector3(-0.3, -1, -0.1);
    rain.direction2 = new Vector3(0.3, -1, 0.1);
    rain.minSize = 0.01;
    rain.maxSize = 0.03;
    rain.minLifeTime = 0.8;
    rain.maxLifeTime = 1.5;
    rain.emitRate = 1500;
    rain.minEmitPower = 8;
    rain.maxEmitPower = 14;
    rain.color1 = new Color4(0.5, 0.7, 1, 0.7);
    rain.color2 = new Color4(0.3, 0.5, 0.9, 0.5);
    rain.colorDead = new Color4(0, 0, 0, 0);
    rain.start();
  }

  private buildMenuUI(): void {
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildMenuUIBrowser();
  }

  /* istanbul ignore next */
  private buildMenuUIBrowser(): void {
    const gui = AdvancedDynamicTexture.CreateFullscreenUI('menu-ui', true, this.babylonScene);

    // Game title
    const title = new TextBlock('title');
    title.text = 'WHERE ARE WE\nGOING WITH THIS';
    title.color = '#00FFCC';
    title.fontSize = 48;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = 0; // left
    title.verticalAlignment = 0; // top
    title.top = '60px';
    title.left = '80px';
    title.height = '150px';
    title.width = '600px';
    gui.addControl(title);

    const subtitle = new TextBlock('subtitle');
    subtitle.text = '— NeoBeiraRio, 2087';
    subtitle.color = '#8844FF';
    subtitle.fontSize = 16;
    subtitle.fontFamily = '"Courier New", monospace';
    subtitle.verticalAlignment = 0;
    subtitle.horizontalAlignment = 0;
    subtitle.top = '200px';
    subtitle.left = '80px';
    subtitle.height = '30px';
    gui.addControl(subtitle);

    // Menu panel
    const menuPanel = new StackPanel('menu-panel');
    menuPanel.verticalAlignment = 2; // bottom
    menuPanel.horizontalAlignment = 0; // left
    menuPanel.left = '80px';
    menuPanel.top = '-100px';
    menuPanel.width = '260px';
    menuPanel.spacing = 8;
    gui.addControl(menuPanel);

    const btnDefs: Array<{ label: string; action: () => void }> = [
      { label: `▶  ${t('menu.newGame')}`,  action: () => this.onNewGame() },
      { label: `⊙  ${t('menu.loadGame')}`, action: () => this.onLoadGame() },
      { label: `⚙  ${t('menu.options')}`,  action: () => this.onOptions() },
      { label: `✕  ${t('menu.quit')}`,     action: () => this.onQuit() },
    ];

    btnDefs.forEach(({ label, action }) => {
      const container = new Rectangle(`btn-${label}`);
      container.height = '48px';
      container.thickness = 1;
      container.color = '#004444';
      container.background = 'rgba(0,20,30,0.7)';

      const btn = Button.CreateSimpleButton(`btn-inner-${label}`, label);
      btn.color = '#00CCAA';
      btn.fontSize = 16;
      btn.fontFamily = '"Courier New", monospace';
      btn.background = 'transparent';
      btn.thickness = 0;
      btn.height = '48px';
      btn.onPointerUpObservable.add(action);
      btn.onPointerEnterObservable.add(() => {
        container.color = '#00FFCC';
        btn.color = '#FFFFFF';
      });
      btn.onPointerOutObservable.add(() => {
        container.color = '#004444';
        btn.color = '#00CCAA';
      });

      container.addControl(btn);
      menuPanel.addControl(container);
    });

    // Version tag
    const version = new TextBlock('version');
    version.text = 'v0.1.0-phase2';
    version.color = '#334444';
    version.fontSize = 12;
    version.fontFamily = 'monospace';
    version.verticalAlignment = 2; // bottom
    version.horizontalAlignment = 2; // right
    version.paddingBottom = '16px';
    version.paddingRight = '16px';
    version.height = '30px';
    gui.addControl(version);
  }
}
