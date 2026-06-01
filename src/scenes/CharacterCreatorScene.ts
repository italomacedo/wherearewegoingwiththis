import {
  Engine, Color4, ArcRotateCamera, Vector3,
  HemisphericLight, Color3, PointLight,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, ScrollViewer, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import {
  CharacterData, DEFAULT_APPEARANCE, ColorKey, cloneAppearance,
} from '@entities/CharacterData';
import {
  CharacterStats, AttributeId, ATTRIBUTES, SKILLS, StartingSkillPick, StartTier,
  createDefaultStats, setPrimaryAttribute as applyPrimaryAttribute,
  allocateStartingSkills, isValidStartingSkills, choosePerk as applyChoosePerk,
  choosePerkReplacing, perksForTier, toggleStartingSkill, startingSkillState,
} from '@entities/CharacterStats';
import { type Gender, outfitsForGender, genderOfOutfit } from '@assets/AvatarMeshCatalog';
import { t, hasKey } from '@systems/I18n';

// Maps the pure schema's English labels to i18n keys (creator chrome).
const CREATOR_CATEGORY_KEY: Record<string, string> = {
  'Body & Skin': 'creator.bodySkin',
  Outfit: 'creator.outfit',
};
const CREATOR_LABEL_KEY: Record<string, string> = {
  Gender: 'creator.gender',
  'Skin Tone': 'creator.skinTone',
  'Eye Color': 'creator.eyeColor',
  Outfit: 'creator.outfitLabel',
  'Hair Color': 'creator.hairColor',
};

// ─── Character-creator UI schema (pure, data-driven) ────────────────────────────

export type ControlSpec =
  | { kind: 'gender'; label: string }
  | { kind: 'color'; label: string; colorKey: ColorKey; presets: string[] }
  // Cycle through the outfits (complete Quaternius characters) of the current gender.
  | { kind: 'outfit'; label: string };

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
  outfit: ['#202833', '#3A4A6B', '#6B2A2A', '#2A5A3A', '#5A2A6A', '#8A8A8A', '#C0C0C0', '#101010', '#00A0A0', '#C97A1E'],
  bottom: ['#2A2E38', '#1A1A1A', '#3B3020', '#24323F', '#4A2A2A', '#6A6A6A', '#202020', '#3A4A6B'],
  shoes: ['#1A1A1A', '#3B2A1A', '#6A6A6A', '#101010', '#5A2A2A', '#C0C0C0', '#202833'],
  hat: ['#202833', '#1A1A1A', '#6B2A2A', '#3A4A6B', '#5A2A6A', '#8A8A8A', '#C97A1E'],
};

function colorControl(colorKey: ColorKey, label: string): ControlSpec {
  return { kind: 'color', label, colorKey, presets: COLOR_PRESETS[colorKey] };
}

/**
 * Grouped control schema for the character creator (Quaternius Ultimate Modular
 * model): gender + outfit pick a complete dressed/animated character; colours
 * tint the shared semantic materials (skin, eyes, hair/eyebrows). Each outfit
 * keeps its authored clothing colours. Pure + unit-tested.
 */
export function buildCreatorSchema(): CategorySpec[] {
  return [
    {
      title: 'Body & Skin',
      controls: [
        { kind: 'gender', label: 'Gender' },
        colorControl('skin', 'Skin Tone'),
        colorControl('eye', 'Eye Color'),
      ],
    },
    {
      title: 'Outfit',
      controls: [
        { kind: 'outfit', label: 'Outfit' },
        colorControl('hair', 'Hair Color'),
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

  private assembler: CharacterAssembler | null = null;
  private assembled: AssembledCharacter | null = null;
  // Native DOM name field (Babylon GUI InputText mangles non-US keyboards — Lesson 15).
  private domName: HTMLInputElement | null = null;
  private domNameWrap: HTMLDivElement | null = null;

  // RPG sheet — a valid default (primary 'forca' = 30%, others 20%, skills 10%).
  private primaryAttribute: AttributeId = 'forca';
  private stats: CharacterStats = applyPrimaryAttribute(createDefaultStats(), 'forca');

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
    /* istanbul ignore next — DOM overlay only exists in the browser */
    if (this.domNameWrap) {
      this.domNameWrap.remove();
      this.domNameWrap = null;
      this.domName = null;
    }
  }

  /**
   * Native DOM name field overlaid on the canvas. Babylon GUI InputText mangles
   * non-US keyboards / accents (Lesson 15) — the chat input solved this the same way.
   */
  /* istanbul ignore next — browser DOM overlay only */
  private buildDomNameInput(): void {
    if (typeof document === 'undefined') return;
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed', 'right:24px', 'bottom:92px', 'width:220px', 'z-index:50',
    ].join(';');

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Operative';
    input.value = this.characterData.name || '';
    input.maxLength = 24;
    input.style.cssText = [
      'width:100%', 'height:40px', 'box-sizing:border-box', 'padding:0 12px',
      'background:rgba(0,30,40,0.92)', 'color:#00FFCC', 'caret-color:#00FFCC',
      'border:1px solid rgba(0,255,204,0.6)', 'border-radius:6px', 'outline:none',
      'font:16px "Courier New",monospace', 'text-align:center',
    ].join(';');
    // Keep typed keys out of the game input; Enter begins.
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); void this.onBegin(input.value || 'Operative'); }
    });
    input.addEventListener('input', () => this.setPlayerName(input.value));

    wrap.appendChild(input);
    document.body.appendChild(wrap);
    this.domNameWrap = wrap;
    this.domName = input;
    input.focus();
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
    return {
      ...this.characterData,
      appearance: cloneAppearance(this.characterData.appearance),
      stats: this.getStats(),
    };
  }

  // ─── RPG allocation (pure, testable) ──────────────────────────────────────

  /** A deep copy of the current RPG sheet. */
  getStats(): CharacterStats {
    return {
      attributes: { ...this.stats.attributes },
      skills: { ...this.stats.skills },
      perks: [...this.stats.perks],
    };
  }

  getPrimaryAttribute(): AttributeId {
    return this.primaryAttribute;
  }

  /** Set the 30% primary attribute (others 20%). */
  setPrimaryAttribute(attr: AttributeId): void {
    this.primaryAttribute = attr;
    this.stats = applyPrimaryAttribute(this.stats, attr);
  }

  /** Cycle the primary attribute through the four, returning the new one. */
  cyclePrimaryAttribute(): AttributeId {
    const ids = ATTRIBUTES.map((a) => a.id);
    const next = ids[(ids.indexOf(this.primaryAttribute) + 1) % ids.length]!;
    this.setPrimaryAttribute(next);
    return next;
  }

  /** Apply the starting skill allocation (2 majors @40%, 3 minors @20%). Returns false if invalid. */
  setStartingSkills(majorIds: string[], minorIds: string[]): boolean {
    if (!isValidStartingSkills(majorIds, minorIds)) return false;
    this.stats = allocateStartingSkills(this.stats, majorIds, minorIds);
    return true;
  }

  /** Choose an unlocked perk (no-op if invalid). Returns true if it took. */
  choosePerk(perkId: string): boolean {
    const before = this.stats.perks.length;
    this.stats = applyChoosePerk(this.stats, perkId);
    return this.stats.perks.length > before;
  }

  /** Choose a perk for its slot, replacing any prior pick in that (attr,tier). */
  setSlotPerk(perkId: string): boolean {
    const before = JSON.stringify(this.stats.perks);
    this.stats = choosePerkReplacing(this.stats, perkId);
    return JSON.stringify(this.stats.perks) !== before;
  }

  setPlayerName(name: string): void {
    this.characterData.name = name;
  }

  getPlayerName(): string {
    return this.characterData.name;
  }

  async setSkinTone(hex: string): Promise<void> {
    this.setColor('skin', hex);
    await this.rebuildCharacter();
  }

  async setHairColor(hex: string): Promise<void> {
    this.setColor('hair', hex);
    await this.rebuildCharacter();
  }

  /**
   * Set the current outfit (a complete Quaternius character key), then rebuild.
   */
  async setOutfit(key: string): Promise<void> {
    this.characterData = {
      ...this.characterData,
      appearance: { ...this.characterData.appearance, bodyBase: key },
    };
    await this.rebuildCharacter();
  }

  /** Currently-selected outfit key. */
  getOutfit(): string {
    return this.characterData.appearance.bodyBase;
  }

  /** Cycle through the current gender's outfits. */
  async cycleOutfit(dir: 1 | -1): Promise<void> {
    const keys = outfitsForGender(this.getGender()).map((o) => o.key);
    if (keys.length === 0) return;
    const idx = keys.indexOf(this.getOutfit());
    const start = idx === -1 ? 0 : idx;
    await this.setOutfit(keys[(start + dir + keys.length) % keys.length]!);
  }

  /** Set a region tint (skin/eye/hair…) and rebuild. */
  async setColorValue(key: ColorKey, hex: string): Promise<void> {
    this.setColor(key, hex);
    await this.rebuildCharacter();
  }

  /** Switch gender — picks the first outfit of that gender. */
  async setGender(gender: Gender): Promise<void> {
    const first = outfitsForGender(gender)[0];
    if (first) await this.setOutfit(first.key);
  }

  getGender(): Gender {
    return genderOfOutfit(this.characterData.appearance.bodyBase);
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
    // alpha = +π/2 puts the camera on the +Z side looking toward −Z, so it faces
    // the FRONT of the Mixamo-rigged model (which faces +Z). See the orientation
    // note in CharacterAssembler.assembleGltf.
    const camera = new ArcRotateCamera(
      'creator-cam', Math.PI / 2, Math.PI / 3, 3.5,
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
    title.text = t('creator.title');
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
      const catKey = CREATOR_CATEGORY_KEY[category.title];
      header.text = (catKey ? t(catKey) : category.title).toUpperCase();
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

    // Right-side RPG panel — starting skills + tier-1 perks.
    this.buildRpgPanel(gui);

    // Right panel — name (native DOM input, see Lesson 15) + begin
    this.buildDomNameInput();

    const beginBtn = Button.CreateSimpleButton('begin', t('common.begin'));
    beginBtn.width = '220px';
    beginBtn.height = '50px';
    beginBtn.color = '#00FFCC';
    beginBtn.background = 'rgba(0,60,50,0.9)';
    beginBtn.fontSize = 18;
    beginBtn.fontFamily = '"Courier New", monospace';
    beginBtn.fontStyle = 'bold';
    beginBtn.thickness = 1;
    beginBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    beginBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    beginBtn.paddingBottom = '30px';
    beginBtn.paddingRight = '24px';
    beginBtn.onPointerUpObservable.add(() => void this.onBegin(this.domName?.value || 'Operative'));
    gui.addControl(beginBtn);

    const backBtn = Button.CreateSimpleButton('back', t('common.back'));
    backBtn.width = '120px';
    backBtn.height = '40px';
    backBtn.color = '#888888';
    backBtn.background = 'rgba(0,20,30,0.8)';
    backBtn.fontSize = 14;
    backBtn.fontFamily = 'monospace';
    backBtn.thickness = 1;
    backBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    backBtn.horizontalAlignment = 0;
    backBtn.paddingBottom = '40px';
    backBtn.paddingLeft = '20px';
    backBtn.onPointerUpObservable.add(() => this.onBack());
    gui.addControl(backBtn);
  }

  /** Right-side scrollable panel: starting-skill picker + tier-1 perk picks. */
  /* istanbul ignore next — browser-only GUI */
  private buildRpgPanel(gui: AdvancedDynamicTexture): void {
    const scroll = new ScrollViewer('rpg-scroll');
    scroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.left = '-20px';
    scroll.top = '80px';
    scroll.width = '300px';
    scroll.height = '58%';
    scroll.thickness = 1;
    scroll.barColor = '#00FFCC';
    gui.addControl(scroll);

    const panel = new StackPanel('rpg-panel');
    panel.spacing = 4;
    panel.paddingTop = '6px';
    panel.paddingBottom = '6px';
    scroll.addControl(panel);

    const addHeader = (text: string): void => {
      const h = new TextBlock(`rpg-h-${text}`);
      h.text = text;
      h.color = '#00FFCC';
      h.fontSize = 13;
      h.fontFamily = 'monospace';
      h.fontStyle = 'bold';
      h.height = '24px';
      panel.addControl(h);
    };

    // ── Attributes (click one to make it the 30% primary; others 20%) ──
    addHeader(t('creator.attributes'));
    const attrLabelOf = (id: AttributeId): string => t(`attr.${id}`);
    const attrBtns: Array<{ id: AttributeId; btn: Button }> = [];
    const refreshAttrs = (): void => {
      attrBtns.forEach(({ id, btn }) => {
        if (btn.textBlock) btn.textBlock.text = `${attrLabelOf(id)} — ${this.stats.attributes[id]}%`;
        btn.background = id === this.primaryAttribute ? 'rgba(0,80,60,0.95)' : 'rgba(0,30,40,0.7)';
      });
    };
    for (const a of ATTRIBUTES) {
      const btn = Button.CreateSimpleButton(`attr-${a.id}`, `${attrLabelOf(a.id)} — ${this.stats.attributes[a.id]}%`);
      btn.width = '270px';
      btn.height = '28px';
      btn.color = '#9FD8FF';
      btn.fontSize = 12;
      btn.fontFamily = 'monospace';
      btn.thickness = 1;
      btn.onPointerUpObservable.add(() => {
        this.setPrimaryAttribute(a.id);
        refreshAttrs();
      });
      attrBtns.push({ id: a.id, btn });
      panel.addControl(btn);
    }
    refreshAttrs();

    // ── Starting skills (2 majors @40%, 3 minors @20%) ──
    addHeader(t('creator.startingSkills'));
    const counter = new TextBlock('rpg-skill-count');
    counter.fontSize = 11;
    counter.fontFamily = 'monospace';
    counter.height = '20px';
    panel.addControl(counter);

    const pick: StartingSkillPick = { majors: [], minors: [] };
    const tierLabel = (st: StartTier): string =>
      st === 'major' ? '40%' : st === 'minor' ? '20%' : '10%';
    const refresh = (): void => {
      const ok = isValidStartingSkills(pick.majors, pick.minors);
      counter.text = t('creator.skillCounter', { majors: pick.majors.length, minors: pick.minors.length });
      counter.color = ok ? '#00FFAA' : '#FFCC66';
      if (ok) this.setStartingSkills(pick.majors, pick.minors);
    };
    for (const s of SKILLS) {
      const btn = Button.CreateSimpleButton(`sk-${s.id}`, `${t(`skill.${s.id}`)} — 10%`);
      btn.width = '270px';
      btn.height = '26px';
      btn.color = '#CFE';
      btn.background = 'rgba(0,30,40,0.7)';
      btn.fontSize = 11;
      btn.fontFamily = 'monospace';
      btn.thickness = 1;
      btn.onPointerUpObservable.add(() => {
        const next = toggleStartingSkill(pick, s.id);
        pick.majors = next.majors;
        pick.minors = next.minors;
        const st = startingSkillState(pick, s.id);
        if (btn.textBlock) btn.textBlock.text = `${t(`skill.${s.id}`)} — ${tierLabel(st)}`;
        refresh();
      });
      panel.addControl(btn);
    }
    refresh();

    // ── Tier-1 perks (one choice per attribute, unlocked at creation) ──
    addHeader(t('creator.tier1Perks'));
    for (const a of ATTRIBUTES) {
      const lbl = new TextBlock(`rpg-pk-${a.id}`);
      lbl.text = t(`attr.${a.id}`);
      lbl.color = '#9FD8FF';
      lbl.fontSize = 11;
      lbl.fontFamily = 'monospace';
      lbl.height = '18px';
      panel.addControl(lbl);

      const options = perksForTier(a.id, 1);
      const btns: Button[] = [];
      options.forEach((p) => {
        const b = Button.CreateSimpleButton(`pk-${p.id}`, hasKey(`perk.${p.id}`) ? t(`perk.${p.id}`) : p.label);
        b.width = '270px';
        b.height = '26px';
        b.color = '#CFE';
        b.background = 'rgba(0,30,40,0.7)';
        b.fontSize = 11;
        b.fontFamily = 'monospace';
        b.thickness = 1;
        b.onPointerUpObservable.add(() => {
          this.setSlotPerk(p.id);
          btns.forEach((other, i) => {
            other.background = options[i]!.id === p.id ? 'rgba(0,80,60,0.9)' : 'rgba(0,30,40,0.7)';
          });
        });
        btns.push(b);
        panel.addControl(b);
      });
    }
  }

  /** Builds one widget for a control spec and wires it to a pure setter. */
  /* istanbul ignore next — browser-only GUI widget factory */
  private buildControl(spec: ControlSpec, parent: StackPanel): void {
    const label = new TextBlock(`lbl-${spec.label}`);
    label.text = CREATOR_LABEL_KEY[spec.label] ? t(CREATOR_LABEL_KEY[spec.label]!) : spec.label;
    label.color = '#AABBCC';
    label.fontSize = 12;
    label.fontFamily = 'monospace';
    label.height = '18px';
    parent.addControl(label);

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

    if (spec.kind === 'gender') {
      const row = new StackPanel('gender-row');
      row.isVertical = false; row.height = '32px'; row.spacing = 6;
      (['female', 'male'] as const).forEach((g) => {
        const b = Button.CreateSimpleButton(`gender-${g}`, g === 'male' ? t('creator.male') : t('creator.female'));
        b.width = '120px'; b.height = '32px';
        b.color = '#00FFCC'; b.background = 'rgba(0,40,60,0.9)';
        b.fontFamily = 'monospace';
        b.onPointerUpObservable.add(() => void this.setGender(g));
        row.addControl(b);
      });
      parent.addControl(row);
      return;
    }

    // outfit — ◄ ► row cycling the current gender's outfits
    const row = new StackPanel(`row-${spec.label}`);
    row.isVertical = false; row.height = '30px'; row.spacing = 4;
    const prev = Button.CreateSimpleButton(`prev-${spec.label}`, '◄');
    const next = Button.CreateSimpleButton(`next-${spec.label}`, '►');
    [prev, next].forEach((b) => {
      b.width = '40px'; b.height = '30px';
      b.color = '#00FFCC'; b.background = 'rgba(0,30,40,0.8)';
    });
    prev.onPointerUpObservable.add(() => void this.cycleOutfit(-1));
    next.onPointerUpObservable.add(() => void this.cycleOutfit(1));
    row.addControl(prev);
    row.addControl(next);
    parent.addControl(row);
  }
}
