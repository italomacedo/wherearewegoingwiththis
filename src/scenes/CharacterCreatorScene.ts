import {
  Engine, Color4, ArcRotateCamera, Vector3,
  HemisphericLight, Color3, PointLight,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, InputText, Slider, ScrollViewer, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import {
  CharacterData, CharacterAppearance, DEFAULT_APPEARANCE, BODY_BASES,
  SlotId, ColorKey, SkinTextureId, MorphId, SLOT_REGISTRY, MORPH_REGISTRY,
  applySlot, getHair, cloneAppearance,
} from '@entities/CharacterData';
import { CharacterAssets, listAssetKeys } from '@assets/AssetManifest';

// ─── Character-creator UI schema (pure, data-driven) ────────────────────────────

export type ControlSpec =
  | { kind: 'bodyCycler'; label: string }
  | { kind: 'swatch'; label: string; skinTextures: SkinTextureId[] }
  | { kind: 'color'; label: string; colorKey: ColorKey; presets: string[] }
  | { kind: 'cycler'; label: string; slot: SlotId; options: (string | null)[] }
  | { kind: 'slider'; label: string; morph: MorphId };

export interface CategorySpec {
  title: string;
  controls: ControlSpec[];
}

/** In-canvas colour palettes per region (native DOM pickers are unreliable over
 * the Babylon canvas — see CLAUDE.md Lesson 10). Free-form picking returns once
 * a real material/UI pass needs it. */
export const COLOR_PRESETS: Record<ColorKey, string[]> = {
  skin: ['#3B2219', '#5A3825', '#7A5230', '#8B6355', '#A57350', '#C68642', '#D7A07A', '#F0C8A0'],
  hair: ['#0A0A0A', '#1A1A1A', '#3B2A1A', '#6A4A2A', '#A86B3C', '#C9A24B', '#9A9A9A', '#E6E6E6', '#5A2A6A', '#1E6F8A'],
  eyebrow: ['#0A0A0A', '#1A1A1A', '#3B2A1A', '#6A4A2A', '#A86B3C', '#9A9A9A'],
  beard: ['#0A0A0A', '#1A1A1A', '#3B2A1A', '#6A4A2A', '#A86B3C', '#9A9A9A'],
  eye: ['#3A2A1A', '#5A4A2A', '#2A4A6A', '#3A6A4A', '#6A6A6A', '#8A3A3A', '#00A0A0'],
  makeup: ['#A03050', '#C04060', '#3A2A6A', '#202020', '#A0A030', '#00A0A0'],
};

function slotCycler(slot: SlotId, label: string): ControlSpec {
  return { kind: 'cycler', label, slot, options: [null, ...listAssetKeys(SLOT_REGISTRY[slot].manifestKey)] };
}

function colorControl(colorKey: ColorKey, label: string): ControlSpec {
  return { kind: 'color', label, colorKey, presets: COLOR_PRESETS[colorKey] };
}

/**
 * Builds the grouped control schema for the character creator from the slot +
 * morph registries and the asset manifest. Pure + unit-tested; the browser
 * widget factory consumes this so adding a slot needs no new UI code.
 */
export function buildCreatorSchema(): CategorySpec[] {
  const skinTextures = Object.keys(CharacterAssets.skinTextures) as SkinTextureId[];

  const faceSliders: ControlSpec[] = Object.values(MORPH_REGISTRY)
    .slice()
    .sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group.localeCompare(b.group)))
    .map((m) => ({ kind: 'slider', label: m.label, morph: m.id }));

  return [
    {
      title: 'Body & Skin',
      controls: [
        { kind: 'bodyCycler', label: 'Body' },
        { kind: 'swatch', label: 'Skin Texture', skinTextures },
        colorControl('skin', 'Skin Tone'),
      ],
    },
    { title: 'Face', controls: faceSliders },
    {
      title: 'Hair & Facial Hair',
      controls: [
        slotCycler('hair', 'Hair'),
        colorControl('hair', 'Hair Color'),
        slotCycler('eyebrows', 'Eyebrows'),
        colorControl('eyebrow', 'Eyebrow Color'),
        slotCycler('beard', 'Beard'),
        colorControl('beard', 'Beard Color'),
      ],
    },
    {
      title: 'Eyes & Makeup',
      controls: [
        slotCycler('eyes', 'Eyes'),
        colorControl('eye', 'Eye Color'),
        slotCycler('teeth', 'Teeth'),
        slotCycler('makeup', 'Makeup'),
        colorControl('makeup', 'Makeup Color'),
      ],
    },
    {
      title: 'Tops',
      controls: [
        slotCycler('t_shirt', 'T-Shirt'),
        slotCycler('shirt', 'Shirt'),
        slotCycler('long_sleeve', 'Long Sleeve'),
        slotCycler('jacket', 'Jacket'),
        slotCycler('coat', 'Coat'),
        slotCycler('kutte', 'Kutte'),
      ],
    },
    {
      title: 'Bottoms & Belt',
      controls: [
        slotCycler('pants', 'Pants'),
        slotCycler('skirt', 'Skirt'),
        slotCycler('shorts', 'Shorts'),
        slotCycler('belt', 'Belt'),
      ],
    },
    {
      title: 'Footwear',
      controls: [
        slotCycler('socks', 'Socks'),
        slotCycler('shoes', 'Shoes'),
        slotCycler('boots', 'Boots'),
        slotCycler('sneakers', 'Sneakers'),
      ],
    },
  ];
}
import { CharacterAssembler, AssembledCharacter } from '@systems/CharacterAssembler';
import { SaveService } from '@systems/SaveService';

export class CharacterCreatorScene extends BaseScene {
  private characterData: CharacterData = {
    name: '',
    appearance: cloneAppearance(DEFAULT_APPEARANCE),
  };

  /** Legacy clothing-slot aliases → concrete new slot ids. */
  private static readonly CLOTHING_SLOT_ALIAS: Record<'top' | 'bottom' | 'shoes', SlotId> = {
    top: 'shirt',
    bottom: 'pants',
    shoes: 'boots',
  };

  private static readonly HAIR_OPTIONS: (string | null)[] = [
    'hair_short_01', 'hair_long_01', 'hair_undercut_01',
    'hair_mohawk_01', 'hair_bun_01', 'hair_dreadlocks_01', null,
  ];
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
    return { ...this.characterData, appearance: cloneAppearance(this.characterData.appearance) };
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
    this.setColor('skin', hex);
    await this.rebuildCharacter();
  }

  async cycleHair(direction: 1 | -1): Promise<void> {
    const opts = CharacterCreatorScene.HAIR_OPTIONS;
    const current = opts.indexOf(getHair(this.characterData.appearance));
    const next = (current + direction + opts.length) % opts.length;
    this.setSlot('hair', opts[next] ?? null);
    await this.rebuildCharacter();
  }

  async setHairColor(hex: string): Promise<void> {
    this.setColor('hair', hex);
    await this.rebuildCharacter();
  }

  /** Set a slot directly by its id (exclusion-aware). */
  async setSlotValue(slot: SlotId, value: string | null): Promise<void> {
    this.setSlot(slot, value);
    await this.rebuildCharacter();
  }

  /** Set a region tint (skin/hair/eyebrow/eye/beard/makeup) and rebuild. */
  async setColorValue(key: ColorKey, hex: string): Promise<void> {
    this.setColor(key, hex);
    await this.rebuildCharacter();
  }

  /** Choose one of the four skin textures and rebuild. */
  async setSkinTextureChoice(id: SkinTextureId): Promise<void> {
    this.characterData = {
      ...this.characterData,
      appearance: { ...this.characterData.appearance, skinTexture: id },
    };
    await this.rebuildCharacter();
  }

  /**
   * Set a morph slider value (0..1). Morphs are applied LIVE to the assembled
   * character (no full rebuild) — in placeholder mode there are no morph targets,
   * so this is a visible no-op until a real GLB base is loaded.
   */
  async setMorph(morph: string, value: number): Promise<void> {
    this.characterData = {
      ...this.characterData,
      appearance: {
        ...this.characterData.appearance,
        morphs: { ...this.characterData.appearance.morphs, [morph]: value },
      },
    };
    this.assembled?.setMorph?.(morph, value);
  }

  async setClothingSlot(
    slot: 'top' | 'bottom' | 'shoes',
    value: string | null
  ): Promise<void> {
    this.setSlot(CharacterCreatorScene.CLOTHING_SLOT_ALIAS[slot], value);
    await this.rebuildCharacter();
  }

  private setColor(key: ColorKey, hex: string): void {
    this.characterData = {
      ...this.characterData,
      appearance: {
        ...this.characterData.appearance,
        colors: { ...this.characterData.appearance.colors, [key]: hex },
      },
    };
  }

  private setSlot(slot: SlotId, value: string | null): void {
    this.characterData = {
      ...this.characterData,
      appearance: {
        ...this.characterData.appearance,
        slots: applySlot(this.characterData.appearance.slots, slot, value),
      },
    };
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

  private rebuildSeq = 0;

  /**
   * Reassemble the preview. Serialized so rapid edits (cycling, swatches) can't
   * race: each call takes a sequence number, and a build whose number is stale
   * by the time it resolves is discarded instead of disposing the live one.
   */
  private async rebuildCharacter(): Promise<void> {
    const seq = ++this.rebuildSeq;
    const next = await this.assembler!.assemble(this.characterData.appearance);
    if (seq !== this.rebuildSeq) {
      next.dispose(); // a newer rebuild superseded this one
      return;
    }
    this.assembled?.dispose();
    this.assembled = next;
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

    // Left panel — scrollable, schema-driven customization categories
    const scroll = new ScrollViewer('creator-scroll');
    scroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.left = '20px';
    scroll.top = '80px';
    scroll.width = '300px';
    scroll.height = '70%';
    scroll.thickness = 1;
    scroll.barColor = '#00FFCC';
    gui.addControl(scroll);

    const panel = new StackPanel('creator-panel');
    panel.spacing = 6;
    panel.paddingTop = '6px';
    panel.paddingBottom = '6px';
    scroll.addControl(panel);

    for (const category of buildCreatorSchema()) {
      const header = new TextBlock(`cat-${category.title}`);
      header.text = category.title.toUpperCase();
      header.color = '#00FFCC';
      header.fontSize = 14;
      header.fontFamily = 'monospace';
      header.fontStyle = 'bold';
      header.height = '26px';
      panel.addControl(header);
      if (category.title === 'Face' && !CharacterAssembler.useGltf) {
        const note = new TextBlock('face-note');
        note.text = '(facial sliders apply to the 3D model — load a real base to see them)';
        note.color = '#778899';
        note.fontSize = 10;
        note.fontFamily = 'monospace';
        note.textWrapping = true;
        note.height = '28px';
        panel.addControl(note);
      }
      for (const control of category.controls) this.buildControl(control, panel);
    }

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

  /** Builds one widget for a control spec and wires it to a pure setter. */
  /* istanbul ignore next — browser-only GUI widget factory */
  private buildControl(spec: ControlSpec, parent: StackPanel): void {
    const label = new TextBlock(`lbl-${spec.label}`);
    label.text = spec.label;
    label.color = '#AABBCC';
    label.fontSize = 12;
    label.fontFamily = 'monospace';
    label.height = '18px';
    parent.addControl(label);

    if (spec.kind === 'slider') {
      const slider = new Slider(`sld-${spec.morph}`);
      slider.minimum = 0; slider.maximum = 1;
      slider.value = this.characterData.appearance.morphs[spec.morph] ?? MORPH_REGISTRY[spec.morph]?.defaultValue ?? 0.5;
      slider.height = '18px'; slider.width = '260px';
      slider.color = '#00FFCC'; slider.background = 'rgba(0,30,40,0.8)';
      slider.onValueChangedObservable.add((v) => void this.setMorph(spec.morph, v));
      parent.addControl(slider);
      return;
    }

    if (spec.kind === 'color') {
      // In-canvas swatch row (reliable; native DOM colour pickers don't play
      // well over the Babylon canvas — CLAUDE.md Lesson 10).
      const row = new StackPanel(`col-${spec.colorKey}`);
      row.isVertical = false; row.height = '26px'; row.spacing = 3;
      for (const hex of spec.presets) {
        const sw = Button.CreateSimpleButton(`sw-${spec.colorKey}-${hex}`, '');
        sw.width = '26px'; sw.height = '26px';
        sw.background = hex; sw.color = '#00000000'; sw.thickness = 1;
        sw.onPointerUpObservable.add(() => void this.setColorValue(spec.colorKey, hex));
        row.addControl(sw);
      }
      parent.addControl(row);
      return;
    }

    if (spec.kind === 'swatch') {
      const row = new StackPanel(`sw-${spec.label}`);
      row.isVertical = false; row.height = '30px'; row.spacing = 4;
      for (const id of spec.skinTextures) {
        const b = Button.CreateSimpleButton(`sw-${id}`, id.replace('skin_', ''));
        b.width = '60px'; b.height = '30px';
        b.color = '#00FFCC'; b.background = 'rgba(0,30,40,0.8)';
        b.onPointerUpObservable.add(() => void this.setSkinTextureChoice(id));
        row.addControl(b);
      }
      parent.addControl(row);
      return;
    }

    // cycler / bodyCycler — ◄ value ► row
    const row = new StackPanel(`row-${spec.label}`);
    row.isVertical = false; row.height = '30px'; row.spacing = 4;
    const prev = Button.CreateSimpleButton(`prev-${spec.label}`, '◄');
    const next = Button.CreateSimpleButton(`next-${spec.label}`, '►');
    [prev, next].forEach((b) => {
      b.width = '40px'; b.height = '30px';
      b.color = '#00FFCC'; b.background = 'rgba(0,30,40,0.8)';
    });
    if (spec.kind === 'bodyCycler') {
      prev.onPointerUpObservable.add(() => void this.cycleBodyBase(-1));
      next.onPointerUpObservable.add(() => void this.cycleBodyBase(1));
    } else {
      prev.onPointerUpObservable.add(() => void this.cycleSlotOption(spec.slot, spec.options, -1));
      next.onPointerUpObservable.add(() => void this.cycleSlotOption(spec.slot, spec.options, 1));
    }
    row.addControl(prev);
    row.addControl(next);
    parent.addControl(row);
  }

  /* istanbul ignore next — browser-only convenience used by the cycler widget */
  private async cycleSlotOption(slot: SlotId, options: (string | null)[], dir: 1 | -1): Promise<void> {
    const current = this.characterData.appearance.slots[slot] ?? null;
    const idx = options.indexOf(current);
    const start = idx === -1 ? 0 : idx;
    const nextVal = options[(start + dir + options.length) % options.length] ?? null;
    await this.setSlotValue(slot, nextVal);
  }
}
