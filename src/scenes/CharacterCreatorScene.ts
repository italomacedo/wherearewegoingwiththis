import {
  Engine, Color4, ArcRotateCamera, Vector3,
  HemisphericLight, Color3, PointLight,
} from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock, Button, StackPanel, Rectangle, Control } from '@babylonjs/gui';
import { BaseScene } from './BaseScene';
import { SceneManager } from '@core/SceneManager';
import { ServiceLocator } from '@core/ServiceLocator';
import { GameSession } from '@core/GameSession';
import {
  CharacterData, DEFAULT_APPEARANCE, ColorKey, AvatarPartRegion, cloneAppearance, resolveAvatarParts,
  keepColorForRegion, setMaterialColor,
} from '@entities/CharacterData';
import { type PaintChannel, type ChannelKind } from '@assets/AvatarPaintChannels';
import {
  CharacterStats, AttributeId, ATTRIBUTES, SKILLS, StartingSkillPick, StartTier,
  createDefaultStats,
  setPrimaryAndSecondaryAttributes as applyPrimaryAndSecondaryAttributes,
  allocateStartingSkills, isValidStartingSkills, choosePerk as applyChoosePerk,
  choosePerkReplacing, perksForTier, pendingPerkSlots, unlockedTierCount, chosenPerkAt,
  toggleStartingSkill, startingSkillState,
} from '@entities/CharacterStats';
import { type Gender, outfitsForGender, genderOfOutfit, outfitProvidesPart, isJumpsuit } from '@assets/AvatarMeshCatalog';
import { ARMOR_OUTFIT_KEYS } from '@entities/items/ItemCatalog';
import { t, hasKey } from '@systems/I18n';
import { UI } from '@systems/UiStyle';

// ─── Character-creator UI schema (pure, data-driven) ────────────────────────────

export type ControlSpec =
  | { kind: 'gender'; label: string }
  | { kind: 'color'; label: string; colorKey: ColorKey; presets: string[] }
  // Cycle through the current gender's outfits for one modular region (head/top/bottom).
  | { kind: 'part'; label: string; region: AvatarPartRegion }
  // Toggle "keep authored colours" for a region (skip recolour) — Phase 15.
  | { kind: 'keepColor'; label: string; region: AvatarPartRegion };

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
  top: ['#202833', '#3A4A6B', '#6B2A2A', '#2A5A3A', '#5A2A6A', '#8A8A8A', '#C0C0C0', '#101010', '#00A0A0', '#C97A1E'],
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
        { kind: 'part', label: 'Head', region: 'head' },
        { kind: 'part', label: 'Top', region: 'top' },
        { kind: 'part', label: 'Bottom', region: 'bottom' },
        // Per-material colours (hair/eyebrow/lips + each distinct clothing material)
        // are rendered dynamically from the loaded model — see renderPaintSection.
        { kind: 'keepColor', label: 'Head Original', region: 'head' },
        { kind: 'keepColor', label: 'Top Original', region: 'top' },
        { kind: 'keepColor', label: 'Bottom Original', region: 'bottom' },
      ],
    },
  ];
}

/** Swatch palette for a discovered paint channel (curated per semantic kind; clothing → generic). */
export function presetsForChannel(channel: PaintChannel): string[] {
  const byKind: Partial<Record<ChannelKind, string[]>> = {
    hair: COLOR_PRESETS.hair,
    eyebrow: COLOR_PRESETS.eyebrow,
    skin: COLOR_PRESETS.skin,
    eye: COLOR_PRESETS.eye,
    lips: COLOR_PRESETS.makeup,
    teeth: ['#E8E4D8', '#D8D0C0', '#C0C8C8', '#FFFFFF', '#A0A0A0'],
    jewelry: ['#C9A24B', '#9A9A9A', '#E6E6E6', '#C97A1E', '#1E6F8A', '#101010'],
  };
  const palette = byKind[channel.kind] ?? COLOR_PRESETS.top;
  // Lead with the authored colour so the player can reset a channel to original.
  return [channel.defaultHex, ...palette];
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
  /** Left appearance panel body — re-rendered (gender/parts/keep/colours) on every rebuild. */
  private appearanceBody: StackPanel | null = null;
  // Native DOM name field (Babylon GUI InputText mangles non-US keyboards — Lesson 15).
  private domName: HTMLInputElement | null = null;
  private domNameWrap: HTMLDivElement | null = null;
  /** True once the starting-skill allocation is complete (2 majors + 3 minors).
   *  BEGIN is gated on this so a partial pick can't start with default (10%) skills. */
  private startingSkillsComplete = false;
  /** The BEGIN button, disabled until the allocation is complete (browser only). */
  private beginButton: import('@babylonjs/gui').Button | null = null;
  /** Callback to push a description into the bottom strip (re-bindable per build). */
  private perksShowDesc: ((title: string, body: string) => void) | null = null;
  /** Right "BUILD" frame: active tab + content panel (single column per tab → no overflow). */
  private rpgTab: 'attributes' | 'skills' | 'perks' = 'attributes';
  private rpgContent: StackPanel | null = null;
  /** Tab bar buttons, re-styled when the active tab changes. */
  private rpgTabBtns: Array<{ id: 'attributes' | 'skills' | 'perks'; btn: import('@babylonjs/gui').Button }> = [];
  /** Live starting-skill pick (hoisted so it survives tab switches). */
  private skillPick: StartingSkillPick = { majors: [], minors: [] };

  // RPG sheet — defaults: 'forca' primary (40%), 'destreza' secondary (30%), others 20%, skills 10%.
  private primaryAttribute: AttributeId = 'forca';
  private secondaryAttribute: AttributeId = 'destreza';
  private stats: CharacterStats = applyPrimaryAndSecondaryAttributes(createDefaultStats(), 'forca', 'destreza');

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
      'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'bottom:82px', 'width:220px', 'z-index:50',
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

  /**
   * True when the player may start: a complete starting-skill allocation (2 majors +
   * 3 minors) AND a tier-1 perk chosen for every attribute (no pending perk slots).
   * Gating this prevents starting with default 10% skills / no perks (owner's call).
   */
  canBegin(): boolean {
    return this.startingSkillsComplete
      && pendingPerkSlots(this.stats).length === 0
      && !!this.primaryAttribute && !!this.secondaryAttribute; // 1×40% + 1×30% required
  }

  /** Re-render the perk picker — called whenever attribute allocation changes
   *  (the 40% primary unlocks tier-2 of that attribute, changing the slot set).
   *  Only needed when the Perks tab is showing; switching to it re-renders fresh. */
  /* istanbul ignore next — browser GUI only */
  private refreshPerksUI(): void {
    if (this.rpgTab === 'perks') this.renderRpgTab();
  }

  /** Reflect `canBegin()` on the BEGIN button (enabled + dimmed). Browser-only. */
  /* istanbul ignore next — browser GUI only */
  private refreshBeginButton(): void {
    if (!this.beginButton) return;
    const ok = this.canBegin();
    this.beginButton.isEnabled = ok;
    this.beginButton.alpha = ok ? 1 : 0.4;
  }

  async onBegin(playerName: string): Promise<void> {
    if (!playerName.trim()) return;
    // Gate: every choice made — full skill allocation + all tier-1 perks — or a
    // partial pick would start with base (10%) skills / no perks (owner's call).
    if (!this.canBegin()) return;
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
      perkPoints: { ...this.stats.perkPoints },
    };
  }

  getPrimaryAttribute(): AttributeId {
    return this.primaryAttribute;
  }

  getSecondaryAttribute(): AttributeId | null {
    return this.secondaryAttribute;
  }

  /**
   * Set the 40% primary attribute (others reset; legacy 1-tier helper kept for tests).
   * Side-effect: clears the secondary (the new primary may have been the secondary).
   */
  setPrimaryAttribute(attr: AttributeId): void {
    this.primaryAttribute = attr;
    if (this.secondaryAttribute === attr) this.secondaryAttribute = null as unknown as AttributeId; // cleared
    this.stats = applyPrimaryAndSecondaryAttributes(this.stats, attr, this.secondaryAttribute);
    this.refreshPerksUI();
  }

  /** Set BOTH the primary (40%) and secondary (30%); the other two go to 20%. */
  setPrimaryAndSecondary(primary: AttributeId, secondary: AttributeId | null): void {
    if (secondary && secondary === primary) secondary = null;
    this.primaryAttribute = primary;
    this.secondaryAttribute = secondary as AttributeId;
    this.stats = applyPrimaryAndSecondaryAttributes(this.stats, primary, secondary);
    this.refreshPerksUI();
  }

  /**
   * Cycle one attribute through 20 → 30 → 40 → 20 on click (owner's UX, revised
   * for intuitiveness: you "climb" from weak to strong, not jump-then-demote).
   *   - 20% → 30%: becomes the secondary; any other secondary drops to 20% so there
   *     is always at most one 30%. The primary slot is untouched.
   *   - 30% → 40%: promotes to primary; any other primary demotes to secondary, and
   *     the previous secondary (which was THIS attribute) is replaced by that demoted
   *     primary. Net result: this attribute is 40%, the ex-primary is 30%.
   *   - 40% → 20%: just clears the primary slot (secondary kept).
   * Returns the new role of `attr` after the cycle.
   */
  cycleAttribute(attr: AttributeId): 'base' | 'primary' | 'secondary' {
    const isPrimary = this.primaryAttribute === attr;
    const isSecondary = this.secondaryAttribute === attr;
    if (isPrimary) {
      // 40% → 20%: primary slot empties; canBegin() will gate until a new 40% is set.
      this.primaryAttribute = (null as unknown) as AttributeId;
      this.stats = applyPrimaryAndSecondaryAttributes(this.stats, this.primaryAttribute, this.secondaryAttribute);
      this.refreshBeginButton();
      this.refreshPerksUI();
      return 'base';
    }
    if (isSecondary) {
      // 30% → 40%: promote to primary. The previous primary (if any) takes over the
      // secondary slot we just vacated. Keeps both slots full when possible.
      const oldPrimary = (this.primaryAttribute as AttributeId | null) ?? null;
      this.primaryAttribute = attr;
      this.secondaryAttribute = (oldPrimary ?? null) as AttributeId;
      this.stats = applyPrimaryAndSecondaryAttributes(this.stats, attr, this.secondaryAttribute);
      this.refreshBeginButton();
      this.refreshPerksUI();
      return 'primary';
    }
    // 20% → 30%: becomes the (sole) secondary; any other secondary drops to 20%.
    // Primary untouched. If there was no primary, the player still needs to click
    // a second attribute (or this one again) to set one — canBegin() enforces it.
    this.secondaryAttribute = attr;
    this.stats = applyPrimaryAndSecondaryAttributes(this.stats, this.primaryAttribute, attr);
    this.refreshBeginButton();
    this.refreshPerksUI();
    return 'secondary';
  }

  /** Legacy: cycle through the 4 attributes setting each as primary. Used by tests. */
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
    this.startingSkillsComplete = true;
    this.refreshBeginButton();
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
    this.refreshBeginButton(); // picking the last perk may enable BEGIN
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
   * Set the whole outfit (a complete Quaternius character key): anchors `bodyBase`
   * (the gender source) and clears the modular composition so every region renders
   * that outfit. Then rebuild. (Back-compat entry point; the creator UI uses the
   * per-region `setPart` below.)
   */
  async setOutfit(key: string): Promise<void> {
    this.characterData = {
      ...this.characterData,
      appearance: { ...this.characterData.appearance, bodyBase: key, avatarPieces: {} },
    };
    await this.rebuildCharacter();
  }

  /** Currently-selected whole-outfit anchor (the `top`/gender source). */
  getOutfit(): string {
    return this.characterData.appearance.bodyBase;
  }

  /**
   * Selectable outfit keys for the creator: the gender's outfits MINUS the armor
   * molds (swat/spacesuit/w_soldier/w_scifi) — those are now obtained as armor items
   * in-game (Phase 15), not chosen at creation.
   */
  private selectableKeys(gender: Gender, region?: AvatarPartRegion): string[] {
    return outfitsForGender(gender)
      .map((o) => o.key)
      .filter((k) => !ARMOR_OUTFIT_KEYS.includes(k))
      // A region picker only offers molds that provide that region (e.g. `farmer`
      // has no legs → excluded from Bottom). A whole-outfit pick needs all regions.
      .filter((k) => region
        ? outfitProvidesPart(k, region)
        : (['head', 'top', 'bottom'] as AvatarPartRegion[]).every((r) => outfitProvidesPart(k, r)));
  }

  /** Cycle the whole outfit through the current gender's outfits. */
  async cycleOutfit(dir: 1 | -1): Promise<void> {
    const keys = this.selectableKeys(this.getGender());
    if (keys.length === 0) return;
    const idx = keys.indexOf(this.getOutfit());
    const start = idx === -1 ? 0 : idx;
    await this.setOutfit(keys[(start + dir + keys.length) % keys.length]!);
  }

  /** The outfit currently donating a given modular region. */
  getPart(region: AvatarPartRegion): string {
    return resolveAvatarParts(this.characterData.appearance)[region];
  }

  /**
   * Set one modular region's donor outfit, then rebuild. The `top` pick also
   * re-anchors `bodyBase` (the gender source), so cycling Top stays in-gender.
   */
  async setPart(region: AvatarPartRegion, key: string): Promise<void> {
    const appearance = cloneAppearance(this.characterData.appearance);
    appearance.avatarPieces = { ...appearance.avatarPieces, [region]: key };
    if (region === 'top') appearance.bodyBase = key;
    this.characterData = { ...this.characterData, appearance };
    await this.rebuildCharacter();
  }

  /** Cycle one region's donor through the current gender's outfits. */
  async cyclePart(region: AvatarPartRegion, dir: 1 | -1): Promise<void> {
    const keys = this.selectableKeys(this.getGender(), region);
    if (keys.length === 0) return;
    const idx = keys.indexOf(this.getPart(region));
    const start = idx === -1 ? 0 : idx;
    await this.setPart(region, keys[(start + dir + keys.length) % keys.length]!);
  }

  /** Whether a region keeps its authored colours (no recolour). */
  getKeepColor(region: AvatarPartRegion): boolean {
    return keepColorForRegion(this.characterData.appearance, region);
  }

  /** Toggle "keep authored colours" for a region, then rebuild. */
  async toggleKeepColor(region: AvatarPartRegion): Promise<void> {
    const appearance = cloneAppearance(this.characterData.appearance);
    const keep = { ...(appearance.keepRegionColor ?? {}) };
    keep[region] = !keep[region];
    appearance.keepRegionColor = keep;
    this.characterData = { ...this.characterData, appearance };
    await this.rebuildCharacter();
  }

  /** Set a region tint (skin/eye/hair/top/bottom…) and rebuild. */
  async setColorValue(key: ColorKey, hex: string): Promise<void> {
    this.setColor(key, hex);
    await this.rebuildCharacter();
  }

  /** Switch gender — resets to the first selectable (non-armor) outfit of that gender. */
  async setGender(gender: Gender): Promise<void> {
    const first = this.selectableKeys(gender)[0];
    if (first) await this.setOutfit(first);
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
    this.playIdle(next);
    this.renderAppearanceControls();
  }

  /** Set a dynamic paint channel's colour and rebuild the preview. */
  async setMaterialColorValue(channelKey: string, hex: string): Promise<void> {
    this.characterData = {
      ...this.characterData,
      appearance: setMaterialColor(this.characterData.appearance, channelKey, hex),
    };
    await this.rebuildCharacter();
  }

  /**
   * Re-render the whole left appearance panel (gender, modular parts, keep-colour
   * toggles, and the dynamic per-material colour rows). Called on first build and
   * after every rebuild so active states / part names / discovered colour channels
   * stay in sync with the model. Skin/eye are universal rows; the rest of the
   * colour rows are discovered from the loaded model's paint channels.
   */
  /* istanbul ignore next — Babylon GUI, browser/Electron only */
  private renderAppearanceControls(): void {
    const body = this.appearanceBody;
    if (!body || typeof document === 'undefined') return;
    body.clearControls();
    const colors = this.characterData.appearance.colors;
    const mats = this.characterData.appearance.materialColors ?? {};

    // ── BODY & SKIN ──
    this.subHeader(body, t('creator.bodySkin').toUpperCase());
    this.genderRow(body);
    this.colorRow(body, 'skin', t('creator.skinTone'), COLOR_PRESETS.skin,
      (hex) => colors.skin === hex, (hex) => void this.setColorValue('skin', hex));
    this.colorRow(body, 'eye', t('creator.eyeColor'), COLOR_PRESETS.eye,
      (hex) => colors.eye === hex, (hex) => void this.setColorValue('eye', hex));

    // ── OUTFIT ──
    this.subHeader(body, t('creator.outfit').toUpperCase());
    // A jumpsuit top (e.g. farmer) covers the legs and has no separate Legs mesh,
    // so the Bottom is implicit (locked) — picking one would overlap the jumpsuit.
    const bottomLocked = isJumpsuit(this.getPart('top'));
    (['head', 'top', 'bottom'] as AvatarPartRegion[]).forEach((r) =>
      this.partRow(body, r, r === 'bottom' && bottomLocked));
    this.keepRow(body, ['head', 'top', 'bottom']);

    // ── COLOURS (discovered from the model) ──
    this.subHeader(body, t('creator.colors').toUpperCase());
    const channels = (this.assembled?.paintChannels ?? []).filter(
      (c) => c.kind !== 'skin' && c.kind !== 'eye',
    );
    for (const ch of channels) {
      this.colorRow(body, ch.key, ch.label, presetsForChannel(ch),
        (hex) => mats[ch.key] === hex, (hex) => void this.setMaterialColorValue(ch.key, hex));
    }
  }

  // ─── Styled control helpers (UiStyle identity; browser-only) ───────────────

  /** A small section sub-header (accent meta text). */
  /* istanbul ignore next — browser-only GUI */
  private subHeader(parent: StackPanel, text: string): void {
    const h = new TextBlock(`sub-${text}`, text);
    h.color = UI.textMeta;
    h.fontSize = UI.fontMeta;
    h.fontFamily = UI.font;
    h.fontStyle = 'bold';
    h.height = '22px';
    h.paddingTop = '4px';
    h.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    parent.addControl(h);
  }

  /** A neon pill button styled from UI tokens (active = highlighted). */
  /* istanbul ignore next — browser-only GUI */
  private pill(name: string, text: string, width: string, height: string, active: boolean): Button {
    const b = Button.CreateSimpleButton(name, text);
    b.width = width; b.height = height;
    b.cornerRadius = UI.cornerSm;
    b.thickness = active ? 2 : 1;
    b.fontFamily = UI.font;
    b.fontSize = UI.fontBody;
    b.color = active ? UI.accent : UI.textBody;
    b.background = active ? UI.btnBg : UI.cardBg;
    b.onPointerEnterObservable.add(() => { if (!active) b.background = UI.cardBgHover; });
    b.onPointerOutObservable.add(() => { b.background = active ? UI.btnBg : UI.cardBg; });
    return b;
  }

  /** Inline colour row: label + compact preset swatches (active swatch ringed). */
  /* istanbul ignore next — browser-only GUI */
  private colorRow(
    parent: StackPanel,
    idKey: string,
    label: string,
    presets: string[],
    isActive: (hex: string) => boolean,
    onPick: (hex: string) => void,
  ): void {
    const row = new StackPanel(`crow-${idKey}`);
    row.isVertical = false; row.height = '24px'; row.width = '100%'; row.spacing = 2;
    row.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    const lab = new TextBlock(`crl-${idKey}`, label);
    lab.color = UI.textBody; lab.fontSize = UI.fontMeta; lab.fontFamily = UI.font;
    lab.width = '92px'; lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(lab);
    for (const hex of presets) {
      const sw = new Rectangle(`crs-${idKey}-${hex}`);
      sw.width = '20px'; sw.height = '20px'; sw.background = hex;
      sw.thickness = isActive(hex) ? 2 : 1;
      sw.color = isActive(hex) ? UI.accent : UI.cardBorder;
      sw.cornerRadius = 4; sw.isPointerBlocker = true;
      sw.onPointerUpObservable.add(() => onPick(hex));
      row.addControl(sw);
    }
    parent.addControl(row);
  }

  /** Gender pick row (two split pills). */
  /* istanbul ignore next — browser-only GUI */
  private genderRow(parent: StackPanel): void {
    const cur = this.getGender();
    const row = new StackPanel('gender-row');
    row.isVertical = false; row.height = '32px'; row.width = '100%'; row.spacing = 6;
    (['female', 'male'] as const).forEach((g) => {
      const b = this.pill(`gender-${g}`, g === 'male' ? t('creator.male') : t('creator.female'), '150px', '30px', cur === g);
      b.onPointerUpObservable.add(() => void this.setGender(g));
      row.addControl(b);
    });
    parent.addControl(row);
  }

  /** Modular-part cycler row: label + ◄ + current outfit name + ►. When `locked`
   *  (jumpsuit top), the Bottom is implicit — show a note instead of a cycler. */
  /* istanbul ignore next — browser-only GUI */
  private partRow(parent: StackPanel, region: AvatarPartRegion, locked = false): void {
    const labelKey = { head: 'creator.partHead', top: 'creator.partTop', bottom: 'creator.partBottom' }[region];
    const row = new StackPanel(`part-row-${region}`);
    row.isVertical = false; row.height = '30px'; row.width = '100%'; row.spacing = 4;
    row.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    const lab = new TextBlock(`part-l-${region}`, t(labelKey));
    lab.color = UI.textBody; lab.fontSize = UI.fontMeta; lab.fontFamily = UI.font;
    lab.width = '64px'; lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(lab);

    if (locked) {
      const note = new TextBlock(`part-lock-${region}`, t('creator.jumpsuitBottom'));
      note.color = UI.textMeta; note.fontSize = UI.fontMeta; note.fontFamily = UI.font; note.fontStyle = 'italic';
      note.width = '214px'; note.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      row.addControl(note);
      parent.addControl(row);
      return;
    }

    const prev = this.pill(`prev-${region}`, '◄', '32px', '28px', false);
    prev.onPointerUpObservable.add(() => void this.cyclePart(region, -1));
    row.addControl(prev);
    const name = new TextBlock(`part-n-${region}`, this.getPart(region));
    name.color = UI.accent; name.fontSize = UI.fontMeta; name.fontFamily = UI.font;
    name.width = '150px'; name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.addControl(name);
    const next = this.pill(`next-${region}`, '►', '32px', '28px', false);
    next.onPointerUpObservable.add(() => void this.cyclePart(region, 1));
    row.addControl(next);
    parent.addControl(row);
  }

  /** "Keep original colours" toggle row — one compact pill per region. */
  /* istanbul ignore next — browser-only GUI */
  private keepRow(parent: StackPanel, regions: AvatarPartRegion[]): void {
    const wrap = new StackPanel('keep-wrap');
    wrap.isVertical = false; wrap.height = '28px'; wrap.width = '100%'; wrap.spacing = 4;
    wrap.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    const lab = new TextBlock('keep-l', t('creator.keepOriginal'));
    lab.color = UI.textMeta; lab.fontSize = UI.fontMeta; lab.fontFamily = UI.font;
    lab.width = '64px'; lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    wrap.addControl(lab);
    const short = { head: t('creator.partHead'), top: t('creator.partTop'), bottom: t('creator.partBottom') };
    regions.forEach((r) => {
      const on = this.getKeepColor(r);
      const b = this.pill(`keep-${r}`, `${on ? '☑' : '☐'} ${short[r]}`, '88px', '26px', on);
      b.onPointerUpObservable.add(() => void this.toggleKeepColor(r));
      wrap.addControl(b);
    });
    parent.addControl(wrap);
  }

  /** Loop the idle clip so the preview isn't stuck in a T-pose (browser only). */
  /* istanbul ignore next — AnimationGroup playback is browser/Electron only */
  private playIdle(assembled: AssembledCharacter): void {
    const groups = assembled.getAnimationGroups?.() ?? [];
    const idle = groups.find((g) => g.name.toLowerCase().includes('idle'));
    idle?.start(true);
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

    // Title (top, centred)
    const title = new TextBlock('title');
    title.text = t('creator.title');
    title.color = UI.accent;
    title.fontSize = UI.fontTitle + 4;
    title.fontFamily = UI.font;
    title.fontStyle = 'bold';
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    title.top = '22px';
    title.height = '36px';
    gui.addControl(title);

    const showDesc = this.buildDescStrip(gui);
    this.buildAppearanceFrame(gui);
    this.buildRpgFrame(gui, showDesc);
    this.buildBottomBar(gui);
  }

  /**
   * A framed neon card anchored to a screen edge, with a header strip + accent
   * line (mirrors the Options/PauseMenu shell). Returns the frame Rectangle so
   * the caller can place either a content body or a tab bar + content.
   */
  /* istanbul ignore next — browser-only GUI */
  private neonFrame(
    gui: AdvancedDynamicTexture, name: string, side: 'left' | 'right', width: string, titleText: string,
  ): Rectangle {
    const frame = new Rectangle(`${name}-frame`);
    frame.width = width; frame.height = '74%';
    frame.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    frame.horizontalAlignment = side === 'left'
      ? Control.HORIZONTAL_ALIGNMENT_LEFT : Control.HORIZONTAL_ALIGNMENT_RIGHT;
    frame.top = '74px';
    frame.left = side === 'left' ? '24px' : '-24px';
    frame.background = UI.frameBg; frame.color = UI.frameBorder;
    frame.thickness = 2; frame.cornerRadius = UI.cornerLg;
    gui.addControl(frame);

    const header = new Rectangle(`${name}-header`);
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = '40px'; header.background = UI.headerBg; header.thickness = 0;
    frame.addControl(header);
    const accent = new Rectangle(`${name}-accent`);
    accent.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accent.height = '2px'; accent.background = UI.accent; accent.thickness = 0;
    header.addControl(accent);
    const ht = new TextBlock(`${name}-title`, titleText);
    ht.color = UI.accent; ht.fontSize = UI.fontSub; ht.fontFamily = UI.font; ht.fontStyle = 'bold';
    ht.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT; ht.left = '16px';
    header.addControl(ht);
    return frame;
  }

  /** A top-anchored content StackPanel inside a frame at the given pixel offset. */
  /* istanbul ignore next — browser-only GUI */
  private frameBody(frame: Rectangle, name: string, topPx: number): StackPanel {
    const body = new StackPanel(`${name}-body`);
    body.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    body.top = `${topPx}px`; body.width = '90%'; body.spacing = 3;
    frame.addControl(body);
    return body;
  }

  /** Left frame — appearance (gender, modular parts, keep toggles, dynamic colours). */
  /* istanbul ignore next — browser-only GUI */
  private buildAppearanceFrame(gui: AdvancedDynamicTexture): void {
    const frame = this.neonFrame(gui, 'appearance', 'left', '400px', t('creator.appearance').toUpperCase());
    this.appearanceBody = this.frameBody(frame, 'appearance', 48);
    this.renderAppearanceControls();
  }

  /** Bottom bar — name input (DOM), BEGIN (centred), BACK (left). */
  /* istanbul ignore next — browser-only GUI */
  private buildBottomBar(gui: AdvancedDynamicTexture): void {
    this.buildDomNameInput();

    const beginBtn = Button.CreateSimpleButton('begin', `${t('common.begin')} ▶`);
    beginBtn.width = '240px';
    beginBtn.height = '46px';
    beginBtn.color = UI.btnFg;
    beginBtn.background = UI.btnBg;
    beginBtn.cornerRadius = UI.cornerMd;
    beginBtn.fontSize = 16;
    beginBtn.fontFamily = UI.font;
    beginBtn.fontStyle = 'bold';
    beginBtn.thickness = 2;
    beginBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    beginBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    beginBtn.paddingBottom = '24px';
    beginBtn.onPointerEnterObservable.add(() => { beginBtn.background = UI.cardBgHover; });
    beginBtn.onPointerOutObservable.add(() => { beginBtn.background = UI.btnBg; });
    beginBtn.onPointerUpObservable.add(() => void this.onBegin(this.domName?.value || 'Operative'));
    gui.addControl(beginBtn);
    this.beginButton = beginBtn;
    this.refreshBeginButton(); // starts disabled until skills + perks are chosen

    const backBtn = Button.CreateSimpleButton('back', `◀ ${t('common.back')}`);
    backBtn.width = '120px';
    backBtn.height = '38px';
    backBtn.color = UI.btnFg;
    backBtn.background = UI.btnBg;
    backBtn.cornerRadius = UI.cornerSm;
    backBtn.fontSize = 13;
    backBtn.fontFamily = UI.font;
    backBtn.thickness = 1;
    backBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    backBtn.paddingBottom = '28px';
    backBtn.paddingLeft = '24px';
    backBtn.onPointerEnterObservable.add(() => { backBtn.background = UI.cardBgHover; });
    backBtn.onPointerOutObservable.add(() => { backBtn.background = UI.btnBg; });
    backBtn.onPointerUpObservable.add(() => this.onBack());
    gui.addControl(backBtn);
  }

  /** Right-side scrollable panel: starting-skill picker + tier-1 perk picks + description strip. */
  /** Bottom-right description card; returns a setter to update its title+body. */
  /* istanbul ignore next — browser-only GUI */
  private buildDescStrip(gui: AdvancedDynamicTexture): (title: string, body: string) => void {
    const card = new Rectangle('rpg-desc');
    card.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    card.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    card.left = '-24px'; card.top = '-24px';
    card.width = '380px'; card.height = '94px';
    card.background = UI.cardBg; card.color = UI.cardBorder;
    card.thickness = 1; card.cornerRadius = UI.cornerMd;
    gui.addControl(card);

    const inner = new StackPanel('rpg-desc-inner');
    inner.width = '92%'; inner.paddingTop = '8px';
    card.addControl(inner);

    const descTitle = new TextBlock('rpg-desc-title', '');
    descTitle.color = UI.accent; descTitle.fontSize = UI.fontBody; descTitle.fontFamily = UI.font;
    descTitle.fontStyle = 'bold'; descTitle.height = '18px';
    descTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inner.addControl(descTitle);

    const descBody = new TextBlock('rpg-desc-body', t('creator.descHint'));
    descBody.color = UI.textBody; descBody.fontSize = UI.fontMeta; descBody.fontFamily = UI.font;
    descBody.textWrapping = true; descBody.height = '62px';
    descBody.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descBody.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    inner.addControl(descBody);

    return (title: string, body: string): void => { descTitle.text = title; descBody.text = body; };
  }

  /**
   * Right "BUILD" frame — tabbed (Attributes / Skills / Perks). Each tab renders a
   * single column into one content panel, so nothing overflows (Babylon vertical
   * StackPanels need fixed-height children — nested columns broke this). The active
   * tab re-renders on every interaction so labels/highlights stay current.
   */
  /* istanbul ignore next — browser-only GUI */
  private buildRpgFrame(gui: AdvancedDynamicTexture, showDesc: (title: string, body: string) => void): void {
    this.perksShowDesc = showDesc;
    const frame = this.neonFrame(gui, 'rpg', 'right', '470px', t('creator.build').toUpperCase());

    const tabBar = new StackPanel('rpg-tabs');
    tabBar.isVertical = false; tabBar.height = '34px'; tabBar.spacing = 6;
    tabBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP; tabBar.top = '50px';
    frame.addControl(tabBar);
    this.rpgTabBtns = [];
    const tabs: Array<{ id: 'attributes' | 'skills' | 'perks'; label: string }> = [
      { id: 'attributes', label: t('creator.tabAttributes') },
      { id: 'skills', label: t('creator.tabSkills') },
      { id: 'perks', label: t('creator.tabPerks') },
    ];
    tabs.forEach(({ id, label }) => {
      const b = Button.CreateSimpleButton(`rpg-tab-${id}`, label.toUpperCase());
      b.width = '128px'; b.height = '30px'; b.cornerRadius = UI.cornerSm;
      b.fontSize = UI.fontMeta; b.fontFamily = UI.font;
      b.onPointerUpObservable.add(() => { this.rpgTab = id; this.styleRpgTabs(); this.renderRpgTab(); });
      this.rpgTabBtns.push({ id, btn: b });
      tabBar.addControl(b);
    });
    this.styleRpgTabs();

    this.rpgContent = this.frameBody(frame, 'rpg', 94);
    this.renderRpgTab();
  }

  /** Highlight the active BUILD tab. */
  /* istanbul ignore next — browser-only GUI */
  private styleRpgTabs(): void {
    this.rpgTabBtns.forEach(({ id, btn }) => {
      const active = id === this.rpgTab;
      btn.background = active ? UI.btnBg : 'rgba(0,16,26,0.7)';
      btn.color = active ? UI.accent : UI.textMuted;
      btn.thickness = active ? 2 : 1;
    });
  }

  /** Re-render the active BUILD tab into the content panel. */
  /* istanbul ignore next — browser-only GUI */
  private renderRpgTab(): void {
    const c = this.rpgContent;
    if (!c) return;
    c.clearControls();
    if (this.rpgTab === 'attributes') this.renderAttributesTab(c);
    else if (this.rpgTab === 'skills') this.renderSkillsTab(c);
    else this.renderPerksInto(c);
  }

  /** Attributes tab — click each to cycle 20% → 30% (secondary ◆) → 40% (primary ★) → 20%. */
  /* istanbul ignore next — browser-only GUI */
  private renderAttributesTab(c: StackPanel): void {
    const hint = new TextBlock('attr-hint', t('creator.attributes'));
    hint.color = UI.textMeta; hint.fontSize = UI.fontMeta; hint.fontFamily = UI.font;
    hint.textWrapping = true; hint.height = '34px';
    hint.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    c.addControl(hint);
    for (const a of ATTRIBUTES) {
      const isPrim = a.id === this.primaryAttribute;
      const isSec = a.id === this.secondaryAttribute;
      const tag = isPrim ? ' ★' : isSec ? ' ◆' : '';
      const btn = Button.CreateSimpleButton(`attr-${a.id}`, `${t(`attr.${a.id}`)} — ${this.stats.attributes[a.id]}%${tag}`);
      btn.width = '100%'; btn.height = '34px';
      btn.cornerRadius = UI.cornerSm; btn.fontSize = UI.fontBody; btn.fontFamily = UI.font;
      btn.background = isPrim ? 'rgba(0,120,80,0.95)' : isSec ? UI.btnBg : UI.cardBg;
      btn.color = isPrim ? UI.accent : isSec ? '#7FE6CA' : UI.textBody;
      btn.thickness = isPrim || isSec ? 2 : 1;
      btn.onPointerUpObservable.add(() => {
        this.cycleAttribute(a.id); // updates BEGIN + perk slots internally
        this.renderRpgTab();
        this.perksShowDesc?.(t(`attr.${a.id}`), hasKey(`attr.${a.id}.desc`) ? t(`attr.${a.id}.desc`) : '');
      });
      c.addControl(btn);
    }
  }

  /** Skills tab — pick 2 majors (40%) + 3 minors (20%); the rest stay 10%. */
  /* istanbul ignore next — browser-only GUI */
  private renderSkillsTab(c: StackPanel): void {
    const pick = this.skillPick;
    const ok = isValidStartingSkills(pick.majors, pick.minors);
    const counter = new TextBlock('rpg-skill-count');
    counter.text = t('creator.skillCounter', { majors: pick.majors.length, minors: pick.minors.length });
    counter.color = ok ? '#00FFAA' : '#FFCC66';
    counter.fontSize = UI.fontMeta; counter.fontFamily = UI.font; counter.height = '22px';
    counter.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    c.addControl(counter);

    const tierLabel = (st: StartTier): string => (st === 'major' ? '40%' : st === 'minor' ? '20%' : '10%');
    for (const s of SKILLS) {
      const st = startingSkillState(pick, s.id);
      const btn = Button.CreateSimpleButton(`sk-${s.id}`, `${t(`skill.${s.id}`)} · ${tierLabel(st)}`);
      btn.width = '100%'; btn.height = '28px';
      btn.cornerRadius = UI.cornerSm; btn.fontSize = UI.fontMeta; btn.fontFamily = UI.font;
      btn.background = st === 'base' ? UI.cardBg : UI.btnBg;
      btn.color = st === 'base' ? UI.textBody : UI.accent;
      btn.thickness = st === 'base' ? 1 : 2;
      btn.onPointerUpObservable.add(() => {
        const next = toggleStartingSkill(pick, s.id);
        this.skillPick = { majors: next.majors, minors: next.minors };
        if (isValidStartingSkills(next.majors, next.minors)) this.setStartingSkills(next.majors, next.minors);
        else { this.startingSkillsComplete = false; this.refreshBeginButton(); }
        this.renderRpgTab();
        this.perksShowDesc?.(t(`skill.${s.id}`), hasKey(`skill.${s.id}.desc`) ? t(`skill.${s.id}.desc`) : '');
      });
      c.addControl(btn);
    }
  }

  /**
   * (Re-)render the perk picker into `container` (single column). One sub-section
   * per UNLOCKED tier of each attribute (tier 1 always; tier 2 only when that
   * attribute is the 40% primary). The chosen perk in each slot is highlighted;
   * clicking another perk in the same slot swaps it. Pure read of `this.stats`.
   */
  /* istanbul ignore next — browser-only GUI */
  private renderPerksInto(container: StackPanel): void {
    container.clearControls();
    for (const a of ATTRIBUTES) {
      const tiers = unlockedTierCount(this.stats.attributes[a.id]); // 1 or 2 at creation
      for (let tier = 1; tier <= tiers; tier++) {
        const hdr = new TextBlock(`rpg-pk-${a.id}-t${tier}`);
        hdr.text = t('creator.perkTierHeader', { attr: t(`attr.${a.id}`), tier });
        hdr.color = tier === 2 ? '#FFD700' /* gold = unlocked by 40% primary */ : UI.textMeta;
        hdr.fontSize = UI.fontMeta;
        hdr.fontFamily = UI.font;
        hdr.fontStyle = tier === 2 ? 'bold' : 'normal';
        hdr.height = '20px';
        hdr.paddingTop = '4px';
        hdr.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.addControl(hdr);

        const chosen = chosenPerkAt(this.stats, a.id, tier);
        const options = perksForTier(a.id, tier);
        const btns: Button[] = [];
        options.forEach((p) => {
          const b = Button.CreateSimpleButton(`pk-${p.id}`, hasKey(`perk.${p.id}`) ? t(`perk.${p.id}`) : p.label);
          b.width = '100%';
          b.height = '28px';
          b.color = chosen === p.id ? UI.accent : UI.textBody;
          b.background = chosen === p.id ? UI.btnBg : UI.cardBg;
          b.cornerRadius = UI.cornerSm;
          b.fontSize = UI.fontMeta;
          b.fontFamily = UI.font;
          b.thickness = chosen === p.id ? 2 : 1;
          b.onPointerUpObservable.add(() => {
            this.setSlotPerk(p.id);
            btns.forEach((other, j) => {
              const on = options[j]!.id === p.id;
              other.background = on ? UI.btnBg : UI.cardBg;
              other.color = on ? UI.accent : UI.textBody;
              other.thickness = on ? 2 : 1;
            });
            this.perksShowDesc?.(
              hasKey(`perk.${p.id}`) ? t(`perk.${p.id}`) : p.label,
              hasKey(`perk.${p.id}.desc`) ? t(`perk.${p.id}.desc`) : p.description,
            );
          });
          btns.push(b);
          container.addControl(b);
        });
      }
    }
  }

}
