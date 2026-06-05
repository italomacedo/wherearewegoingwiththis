import { NullEngine } from '@babylonjs/core';
import { CharacterCreatorScene, buildCreatorSchema, COLOR_PRESETS } from '../../../src/scenes/CharacterCreatorScene';
import { ServiceLocator } from '../../../src/core/ServiceLocator';
import { GameSession } from '../../../src/core/GameSession';
import { SaveService } from '../../../src/systems/SaveService';
import { DEFAULT_APPEARANCE } from '../../../src/entities/CharacterData';
import { outfitsForGender, DEFAULT_OUTFIT } from '../../../src/assets/AvatarMeshCatalog';
import { ARMOR_OUTFIT_KEYS } from '../../../src/entities/items/ItemCatalog';

const mockSceneManager = {
  loadScene: jest.fn().mockResolvedValue(undefined),
  transitionDurationMs: 0,
};

/** Make every required choice so the BEGIN gate is satisfied (Fase 20):
 *  - 1×40% primary + 1×30% secondary attribute
 *  - 2 majors + 3 minors of starting skills
 *  - a perk in EVERY unlocked tier slot (4 tier-1 + 1 tier-2 from the 40% primary —
 *    note: the tier-2 slot is always on the attribute the player chose as primary,
 *    whichever that is; this helper hardcodes forca because it sets forca as primary). */
function completeCreatorChoices(scene: CharacterCreatorScene): void {
  scene.setPrimaryAndSecondary('forca', 'destreza'); // 40% on forca → unlocks forca tier1+tier2
  scene.setStartingSkills(['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio']);
  scene.setSlotPerk('forca_t1_punho_calejado');
  scene.setSlotPerk('forca_t2_pancada_firme'); // tier-2 of the primary (would be the secondary-attr tier-2 if 'destreza' were primary)
  scene.setSlotPerk('destreza_t1_dedos_leves');
  scene.setSlotPerk('inteligencia_t1_olho_clinico');
  scene.setSlotPerk('carisma_t1_labia');
}

describe('CharacterCreatorScene (Quaternius outfits)', () => {
  let engine: NullEngine;
  let scene: CharacterCreatorScene;

  beforeEach(() => {
    engine = new NullEngine();
    ServiceLocator.register('sceneManager', mockSceneManager);
    scene = new CharacterCreatorScene(engine);
    mockSceneManager.loadScene.mockClear();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    ServiceLocator.clear();
    SaveService.reset();
  });

  it('constructs and enters/exits without error', async () => {
    expect(scene.babylonScene).toBeDefined();
    await expect(scene.onEnter()).resolves.toBeUndefined();
    await expect(scene.onExit()).resolves.toBeUndefined();
  });

  it('player name starts empty and can be set', () => {
    expect(scene.getPlayerName()).toBe('');
    scene.setPlayerName('Kai');
    expect(scene.getPlayerName()).toBe('Kai');
  });

  it('defaults to the default outfit (male)', async () => {
    await scene.onEnter();
    expect(scene.getOutfit()).toBe(DEFAULT_APPEARANCE.bodyBase);
    expect(scene.getOutfit()).toBe(DEFAULT_OUTFIT);
    expect(scene.getGender()).toBe('male');
  });

  it('setOutfit / getOutfit selects a complete character', async () => {
    await scene.onEnter();
    await scene.setOutfit('punk');
    expect(scene.getOutfit()).toBe('punk');
    expect(scene.getCharacterData().appearance.bodyBase).toBe('punk');
  });

  it('cycleOutfit walks the current gender outfits and wraps', async () => {
    await scene.onEnter();
    const keys = outfitsForGender('male').map((o) => o.key);
    await scene.setOutfit(keys[0]!);
    await scene.cycleOutfit(1);
    expect(scene.getOutfit()).toBe(keys[1]);
    await scene.setOutfit(keys[0]!);
    await scene.cycleOutfit(-1);
    expect(scene.getOutfit()).toBe(keys[keys.length - 1]);
  });

  it('setGender picks the first outfit of that gender', async () => {
    await scene.onEnter();
    await scene.setGender('male');
    expect(scene.getGender()).toBe('male');
    expect(scene.getOutfit()).toBe(outfitsForGender('male')[0]!.key);
  });

  it('setPart composes head/top/bottom independently; top re-anchors gender', async () => {
    await scene.onEnter();
    await scene.setPart('head', 'suit');
    await scene.setPart('bottom', 'adventurer');
    await scene.setPart('top', 'punk');
    expect(scene.getPart('head')).toBe('suit');
    expect(scene.getPart('top')).toBe('punk');
    expect(scene.getPart('bottom')).toBe('adventurer');
    const pieces = scene.getCharacterData().appearance.avatarPieces;
    expect(pieces).toMatchObject({ head: 'suit', top: 'punk', bottom: 'adventurer' });
    expect(scene.getCharacterData().appearance.bodyBase).toBe('punk'); // top anchors gender
    expect(scene.getGender()).toBe('male');
  });

  it('cyclePart walks the current gender outfits for one region and wraps', async () => {
    await scene.onEnter();
    const keys = outfitsForGender('male').map((o) => o.key);
    await scene.setPart('head', keys[0]!);
    await scene.cyclePart('head', 1);
    expect(scene.getPart('head')).toBe(keys[1]);
    await scene.setPart('head', keys[0]!);
    await scene.cyclePart('head', -1);
    expect(scene.getPart('head')).toBe(keys[keys.length - 1]);
  });

  it('cyclers never select an armor mold (swat/spacesuit/w_soldier/w_scifi)', async () => {
    await scene.onEnter();
    // Walk a full lap of the head cycler and confirm no armor mold ever appears.
    await scene.setPart('head', DEFAULT_OUTFIT);
    const seen = new Set<string>();
    for (let i = 0; i < outfitsForGender('male').length + 2; i++) {
      await scene.cyclePart('head', 1);
      seen.add(scene.getPart('head'));
    }
    for (const armor of ARMOR_OUTFIT_KEYS) expect(seen.has(armor)).toBe(false);
    // Females too.
    await scene.setGender('female');
    const seenF = new Set<string>();
    for (let i = 0; i < outfitsForGender('female').length + 2; i++) {
      await scene.cyclePart('top', 1);
      seenF.add(scene.getPart('top'));
    }
    for (const armor of ARMOR_OUTFIT_KEYS) expect(seenF.has(armor)).toBe(false);
  });

  it('the Bottom cycler never selects farmer (it has no legs mesh)', async () => {
    await scene.onEnter();
    await scene.setGender('male');
    const seen = new Set<string>();
    for (let i = 0; i < outfitsForGender('male').length + 2; i++) {
      await scene.cyclePart('bottom', 1);
      seen.add(scene.getPart('bottom'));
    }
    expect(seen.has('farmer')).toBe(false);
    // farmer is still available for head/top (it only lacks legs).
    const headSeen = new Set<string>();
    for (let i = 0; i < outfitsForGender('male').length + 2; i++) {
      await scene.cyclePart('head', 1);
      headSeen.add(scene.getPart('head'));
    }
    expect(headSeen.has('farmer')).toBe(true);
  });

  it('toggleKeepColor flips the per-region keep-colour flag', async () => {
    await scene.onEnter();
    expect(scene.getKeepColor('top')).toBe(false);
    await scene.toggleKeepColor('top');
    expect(scene.getKeepColor('top')).toBe(true);
    expect(scene.getCharacterData().appearance.keepRegionColor?.top).toBe(true);
    await scene.toggleKeepColor('top');
    expect(scene.getKeepColor('top')).toBe(false);
  });

  it('setOutfit resets the modular composition to a whole outfit', async () => {
    await scene.onEnter();
    await scene.setPart('head', 'suit');
    await scene.setOutfit('punk');
    expect(scene.getPart('head')).toBe('punk');
    expect(scene.getPart('top')).toBe('punk');
    expect(scene.getPart('bottom')).toBe('punk');
    expect(scene.getCharacterData().appearance.avatarPieces).toEqual({});
  });

  it('setSkinTone / setHairColor / setColorValue update colours', async () => {
    await scene.onEnter();
    await scene.setSkinTone('#FF0000');
    await scene.setHairColor('#FF00FF');
    await scene.setColorValue('eye', '#00FF00');
    const c = scene.getCharacterData().appearance.colors;
    expect(c.skin).toBe('#FF0000');
    expect(c.hair).toBe('#FF00FF');
    expect(c.eye).toBe('#00FF00');
  });

  it('onBack navigates to main-menu; onBegin needs a non-empty name', async () => {
    await scene.onEnter();
    scene.onBack();
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('main-menu');
    mockSceneManager.loadScene.mockClear();
    await scene.onBegin('   ');
    expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
    // Incomplete sheet → BEGIN is gated even with a valid name (Fase 20).
    await scene.onBegin('Kai');
    expect(mockSceneManager.loadScene).not.toHaveBeenCalled();
    completeCreatorChoices(scene);
    await scene.onBegin('Kai');
    expect(mockSceneManager.loadScene).toHaveBeenCalledWith('game-world');
  });

  it('onBegin creates a save and registers a GameSession carrying the outfit', async () => {
    await scene.onEnter();
    await scene.setOutfit('swat');
    completeCreatorChoices(scene);
    await scene.onBegin('Kai');
    expect(SaveService.listMeta()).toHaveLength(1);
    const session = ServiceLocator.get<GameSession>('gameSession');
    expect(session.character.name).toBe('Kai');
    expect(session.character.appearance.bodyBase).toBe('swat');
  });

  it('serializes overlapping rebuilds — latest edit wins', async () => {
    await scene.onEnter();
    await Promise.all([scene.setSkinTone('#111111'), scene.setSkinTone('#222222')]);
    expect(scene.getCharacterData().appearance.colors.skin).toBe('#222222');
  });

  // ─── RPG sheet (Phase 3) ────────────────────────────────────────────────────

  it('starts with a valid default RPG sheet (Força 40% primary, Destreza 30% secondary)', () => {
    const stats = scene.getStats();
    expect(scene.getPrimaryAttribute()).toBe('forca');
    expect(scene.getSecondaryAttribute()).toBe('destreza');
    expect(stats.attributes.forca).toBe(40);
    expect(stats.attributes.destreza).toBe(30);
    expect(stats.attributes.inteligencia).toBe(20);
    expect(stats.attributes.carisma).toBe(20);
    expect(Object.values(stats.skills).every((v) => v === 10)).toBe(true);
  });

  it('cyclePrimaryAttribute moves the 40% around the four attributes (legacy 1-tier)', () => {
    expect(scene.cyclePrimaryAttribute()).toBe('destreza');
    expect(scene.getStats().attributes.destreza).toBe(40);
  });

  it('cycleAttribute cycles 20 → 40 → 30 → 20 (Fase 20)', () => {
    scene.setPrimaryAndSecondary('forca', 'destreza'); // baseline
    // Clicking 'inteligencia' (was 20): becomes the new primary (40); old primary 'forca' demotes to secondary (30); old secondary 'destreza' drops to 20.
    expect(scene.cycleAttribute('inteligencia')).toBe('primary');
    expect(scene.getStats().attributes.inteligencia).toBe(40);
    expect(scene.getStats().attributes.forca).toBe(30);
    expect(scene.getStats().attributes.destreza).toBe(20);
    // Clicking 'inteligencia' again (was 40 primary) → 30 secondary; primary is now empty.
    expect(scene.cycleAttribute('inteligencia')).toBe('secondary');
    expect(scene.getStats().attributes.inteligencia).toBe(30);
    expect(scene.getPrimaryAttribute()).toBeNull();
    expect(scene.canBegin()).toBe(false); // gated: no 40%
    // Clicking 'inteligencia' once more (was 30) → back to 20; secondary slot empties.
    expect(scene.cycleAttribute('inteligencia')).toBe('base');
    expect(scene.getStats().attributes.inteligencia).toBe(20);
    expect(scene.getSecondaryAttribute()).toBeNull();
  });

  it('setStartingSkills validates and applies 2x40 + 3x20', () => {
    expect(scene.setStartingSkills(['armas_de_fogo'], ['x'])).toBe(false); // invalid
    expect(scene.setStartingSkills(['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio'])).toBe(true);
    const s = scene.getStats();
    expect(s.skills.armas_de_fogo).toBe(40);
    expect(s.skills.furtividade).toBe(20);
  });

  it('choosePerk takes an unlocked tier-1 perk', () => {
    expect(scene.choosePerk('forca_t1_punho_calejado')).toBe(true);
    expect(scene.getStats().perks).toContain('forca_t1_punho_calejado');
    expect(scene.choosePerk('does_not_exist')).toBe(false);
  });

  it('setSlotPerk swaps the pick within the forca tier-1 slot', () => {
    expect(scene.setSlotPerk('forca_t1_punho_calejado')).toBe(true);
    expect(scene.setSlotPerk('forca_t1_folego_de_rua')).toBe(true);
    const perks = scene.getStats().perks;
    expect(perks).toContain('forca_t1_folego_de_rua');
    expect(perks).not.toContain('forca_t1_punho_calejado');
  });

  it('the extra tier-2 perk slot follows whichever attribute is the 40% primary', () => {
    // With Inteligência as primary (40%) the extra perk slot is INTELIGENCIA t2,
    // not forca t2. Choosing the wrong attribute's tier-2 doesn't satisfy the gate.
    scene.setPrimaryAndSecondary('inteligencia', 'destreza');
    scene.setStartingSkills(['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio']);
    scene.setSlotPerk('inteligencia_t1_olho_clinico');
    scene.setSlotPerk('destreza_t1_dedos_leves');
    scene.setSlotPerk('forca_t1_punho_calejado');
    scene.setSlotPerk('carisma_t1_labia');
    expect(scene.canBegin()).toBe(false); // missing inteligencia t2
    // Choosing forca_t2 would NOT satisfy it (forca is at 20%, tier-2 still locked).
    scene.setSlotPerk('forca_t2_pancada_firme'); // no-op: forca tier-2 is locked
    expect(scene.canBegin()).toBe(false);
    // The right slot to fill is inteligencia tier-2:
    scene.setSlotPerk('inteligencia_t2_leitura_de_rede');
    expect(scene.canBegin()).toBe(true);
  });

  it('canBegin requires attrs (40+30) + skills (2+3) + EVERY unlocked perk slot (Fase 20)', () => {
    // 40% primary unlocks BOTH tier-1 and tier-2 of that attribute → 5 perk slots
    // total (forca t1 + forca t2 + 1 t1 each for the other three).
    scene.setPrimaryAndSecondary('forca', null); // 40 set, 30 empty
    expect(scene.canBegin()).toBe(false); // missing secondary + skills + perks
    scene.setPrimaryAndSecondary('forca', 'destreza'); // both attrs set
    expect(scene.canBegin()).toBe(false); // skills + perks still missing
    scene.setStartingSkills(['armas_de_fogo', 'medicina'], ['furtividade', 'persuasao', 'comercio']);
    expect(scene.canBegin()).toBe(false); // skills done, perks still pending
    scene.setSlotPerk('forca_t1_punho_calejado');
    scene.setSlotPerk('destreza_t1_dedos_leves');
    scene.setSlotPerk('inteligencia_t1_olho_clinico');
    scene.setSlotPerk('carisma_t1_labia');
    expect(scene.canBegin()).toBe(false); // 4 of 5 — tier-2 of the 40% primary still open
    scene.setSlotPerk('forca_t2_pancada_firme');
    expect(scene.canBegin()).toBe(true); // all 5 slots filled
  });

  it('onBegin persists the RPG sheet onto the saved character', async () => {
    await scene.onEnter();
    completeCreatorChoices(scene); // forca 40 primary, destreza 30 secondary
    await scene.onBegin('Kai');
    const session = ServiceLocator.get<GameSession>('gameSession');
    expect(session.character.stats!.attributes.forca).toBe(40);
    expect(session.character.stats!.attributes.destreza).toBe(30);
  });
});

describe('buildCreatorSchema (pure)', () => {
  const schema = buildCreatorSchema();

  it('has the outfit-model categories', () => {
    expect(schema.map((c) => c.title)).toEqual(['Body & Skin', 'Outfit']);
  });

  it('Body & Skin exposes gender + skin/eye colours', () => {
    expect(schema[0]!.controls.map((c) => c.kind)).toEqual(['gender', 'color', 'color']);
  });

  it('Outfit category has three modular part cyclers + top/bottom/hair colours', () => {
    const controls = schema.find((c) => c.title === 'Outfit')!.controls;
    const parts = controls.filter((c) => c.kind === 'part');
    expect(parts.map((c) => (c.kind === 'part' ? c.region : null))).toEqual(['head', 'top', 'bottom']);
    const colorKeys = controls.flatMap((c) => (c.kind === 'color' ? [c.colorKey] : []));
    expect(colorKeys).toEqual(expect.arrayContaining(['top', 'bottom', 'hair']));
  });

  it('Outfit category has a keep-colour toggle for each region', () => {
    const controls = schema.find((c) => c.title === 'Outfit')!.controls;
    const keeps = controls.flatMap((c) => (c.kind === 'keepColor' ? [c.region] : []));
    expect(keeps).toEqual(['head', 'top', 'bottom']);
  });

  it('every colour control has a non-empty preset palette', () => {
    const colors = schema.flatMap((c) => c.controls).filter((c) => c.kind === 'color');
    for (const c of colors) {
      if (c.kind === 'color') expect(COLOR_PRESETS[c.colorKey].length).toBeGreaterThan(0);
    }
  });
});
