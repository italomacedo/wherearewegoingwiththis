import {
  OUTFITS, DEFAULT_OUTFIT, LOCO_CLIPS, COMBAT_CLIPS, combatClipFor, attackClipFor, combatStanceClip,
  LOCO_CLIP_GROUND_SPEED, LOCO_SPEED_RATIO_MIN, LOCO_SPEED_RATIO_MAX, computeLocoSpeedRatio,
  outfitsForGender, outfitByKey, genderOfOutfit, tintRoleForMaterial,
  partRegionOf, isStrippableMesh, tintRoleForMaterialInRegion, HAIR_MATERIAL_OVERRIDES,
  planModularLoad, outfitProvidesPart, OUTFIT_MISSING_PARTS, POSE_CLIPS, isJumpsuit,
} from '../../../src/assets/AvatarMeshCatalog';

describe('AvatarMeshCatalog — Quaternius Ultimate Modular outfits (pure)', () => {
  it('every outfit has key, gender, label and a GLB path', () => {
    for (const o of OUTFITS) {
      expect(o.key.length).toBeGreaterThan(0);
      expect(['male', 'female']).toContain(o.gender);
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.path).toMatch(/^characters\/quaternius\/(men|women)\/.+\.glb$/);
    }
  });

  it('outfit keys are unique', () => {
    const keys = OUTFITS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('DEFAULT_OUTFIT exists in the catalog', () => {
    expect(outfitByKey(DEFAULT_OUTFIT)).toBeDefined();
  });

  it('outfitsForGender filters by gender and includes known cyberpunk outfits', () => {
    const male = outfitsForGender('male').map((o) => o.key);
    expect(male).toEqual(expect.arrayContaining(['punk', 'swat', 'suit', 'casual_hoodie']));
    expect(outfitsForGender('male').every((o) => o.gender === 'male')).toBe(true);
    const female = outfitsForGender('female').map((o) => o.key);
    expect(female).toEqual(expect.arrayContaining(['w_scifi', 'w_soldier', 'w_punk']));
    expect(outfitsForGender('female').every((o) => o.gender === 'female')).toBe(true);
  });

  it('outfitProvidesPart: farmer has no bottom (legs) mesh; others provide all', () => {
    expect(OUTFIT_MISSING_PARTS.farmer).toEqual(['bottom']);
    expect(outfitProvidesPart('farmer', 'bottom')).toBe(false);
    expect(outfitProvidesPart('farmer', 'head')).toBe(true);
    expect(outfitProvidesPart('farmer', 'top')).toBe(true);
    expect(outfitProvidesPart('suit', 'bottom')).toBe(true);
    expect(outfitProvidesPart('unknown', 'bottom')).toBe(true); // unknown = assume provides
  });

  it('outfitByKey / genderOfOutfit resolve', () => {
    expect(outfitByKey('punk')?.gender).toBe('male');
    expect(outfitByKey('nope')).toBeUndefined();
    expect(genderOfOutfit('punk')).toBe('male');
    expect(genderOfOutfit('unknown')).toBe('male'); // safe default
  });

  it('LOCO_CLIPS maps states to the exact embedded clip names', () => {
    expect(LOCO_CLIPS).toEqual({ idle: 'Idle', walk: 'Walk', run: 'Run', interact: 'Interact' });
  });

  it('COMBAT_CLIPS maps to embedded Quaternius clip names; combatClipFor picks by kind', () => {
    expect(COMBAT_CLIPS).toEqual({
      punch: 'Punch_Right', kick: 'Kick_Right', shoot: 'Gun_Shoot',
      aim: 'Idle_Gun_Pointing', hit: 'HitRecieve', death: 'Death', slash: 'Sword_Slash',
    });
    expect(combatClipFor('melee')).toBe('punch');
    expect(combatClipFor('ranged')).toBe('shoot');
  });

  it('POSE_CLIPS keeps pose/alternate-idle sources incl. the fighting stances', () => {
    expect(POSE_CLIPS).toEqual({
      roll: 'Roll', idle_gun: 'Idle_Gun',
      stance_unarmed: 'Idle_Neutral', stance_blade: 'Idle_Sword',
    });
  });

  it('combatStanceClip picks the fighting stance by weapon', () => {
    expect(combatStanceClip('ranged')).toBe('aim');               // gun pointing
    expect(combatStanceClip('ranged', true)).toBe('aim');         // armed flag irrelevant for ranged
    expect(combatStanceClip('melee', true)).toBe('stance_blade'); // blade-ready
    expect(combatStanceClip('melee', false)).toBe('stance_unarmed'); // boxing/ready
    expect(combatStanceClip('melee')).toBe('stance_unarmed');     // defaults to bare-fisted
  });

  it('attackClipFor: slash when armed melee, punch bare-fisted, shoot when ranged', () => {
    expect(attackClipFor('melee', false)).toBe('punch');     // bare fists
    expect(attackClipFor('melee', true)).toBe('slash');       // armed (knife/axe/…)
    expect(attackClipFor('melee', true, 'kick')).toBe('kick'); // per-weapon override
    expect(attackClipFor('ranged')).toBe('shoot');
    expect(attackClipFor('ranged', true)).toBe('shoot');      // armed irrelevant for ranged
  });

  describe('computeLocoSpeedRatio — match clip cadence to ground speed', () => {
    it('idle and interact always play at the authored rate (1)', () => {
      expect(computeLocoSpeedRatio('idle', 0)).toBe(1);
      expect(computeLocoSpeedRatio('idle', 4)).toBe(1);
      expect(computeLocoSpeedRatio('interact', 8)).toBe(1);
    });

    it('walk/run scale by actualSpeed / clipGroundSpeed', () => {
      expect(computeLocoSpeedRatio('walk', LOCO_CLIP_GROUND_SPEED.walk)).toBeCloseTo(1, 6);
      expect(computeLocoSpeedRatio('walk', 4)).toBeCloseTo(4 / LOCO_CLIP_GROUND_SPEED.walk, 6);
      expect(computeLocoSpeedRatio('run', 8)).toBeCloseTo(8 / LOCO_CLIP_GROUND_SPEED.run, 6);
    });

    it('zero/negative speed falls back to the authored rate (no frozen division)', () => {
      expect(computeLocoSpeedRatio('walk', 0)).toBe(1);
      expect(computeLocoSpeedRatio('run', -3)).toBe(1);
    });

    it('clamps to the sane ratio range', () => {
      expect(computeLocoSpeedRatio('run', 9999)).toBe(LOCO_SPEED_RATIO_MAX);
      expect(computeLocoSpeedRatio('walk', 0.0001)).toBe(LOCO_SPEED_RATIO_MIN);
    });

    it('LOCO_CLIP_GROUND_SPEED has positive reference speeds', () => {
      expect(LOCO_CLIP_GROUND_SPEED.walk).toBeGreaterThan(0);
      expect(LOCO_CLIP_GROUND_SPEED.run).toBeGreaterThan(LOCO_CLIP_GROUND_SPEED.walk);
    });
  });

  describe('tintRoleForMaterial', () => {
    it('maps semantic material names to colour roles', () => {
      expect(tintRoleForMaterial('Skin')).toBe('skin');
      expect(tintRoleForMaterial('Eye')).toBe('eye');
      expect(tintRoleForMaterial('Eyebrows')).toBe('hair');
      expect(tintRoleForMaterial('Hair_Black')).toBe('hair'); // women's hair material
    });
    it('leaves clothing materials untinted (null)', () => {
      expect(tintRoleForMaterial('White')).toBeNull();
      expect(tintRoleForMaterial('LightBlue')).toBeNull();
    });
  });

  describe('partRegionOf (modular mesh classification)', () => {
    it('classifies the four region meshes by name suffix', () => {
      expect(partRegionOf('Adventurer_Head')).toBe('head');
      expect(partRegionOf('Punk_Body')).toBe('top');
      expect(partRegionOf('Suit_Legs')).toBe('lower');
      expect(partRegionOf('SciFi_Feet')).toBe('lower');
    });
    it('classifies weapons and accessories', () => {
      expect(partRegionOf('Pistol')).toBe('weapon');
      expect(partRegionOf('Sword')).toBe('weapon');
      expect(partRegionOf('Backpack')).toBe('accessory');
    });
    it('returns null for skeleton/root nodes', () => {
      expect(partRegionOf('CharacterArmature')).toBeNull();
      expect(partRegionOf('__root__')).toBeNull();
      expect(partRegionOf('Hips')).toBeNull();
    });
    it('isStrippableMesh removes weapons and accessories only', () => {
      expect(isStrippableMesh('Pistol')).toBe(true);
      expect(isStrippableMesh('Backpack')).toBe(true);
      expect(isStrippableMesh('Punk_Body')).toBe(false);
      expect(isStrippableMesh('Adventurer_Head')).toBe(false);
    });
  });

  describe('tintRoleForMaterialInRegion (region-aware + hair override)', () => {
    it('semantic names win regardless of region (exposed skin stays skin)', () => {
      expect(tintRoleForMaterialInRegion('Skin', 'top')).toBe('skin');
      expect(tintRoleForMaterialInRegion('Skin', 'lower')).toBe('skin');
      expect(tintRoleForMaterialInRegion('Eye', 'head')).toBe('eye');
      expect(tintRoleForMaterialInRegion('Eyebrows', 'head')).toBe('hair');
    });
    it('clothing on the body becomes top; on legs/feet becomes bottom', () => {
      expect(tintRoleForMaterialInRegion('Tie', 'top')).toBe('top');
      expect(tintRoleForMaterialInRegion('Suit', 'top')).toBe('top');
      expect(tintRoleForMaterialInRegion('Brown2', 'lower')).toBe('bottom');
      expect(tintRoleForMaterialInRegion('Black', 'lower')).toBe('bottom');
    });
    it('themed hair materials recolour via the per-outfit override (punk mohawk)', () => {
      expect(tintRoleForMaterialInRegion('Red', 'head', 'punk')).toBe('hair');
      expect(tintRoleForMaterialInRegion('Red_Dark', 'head', 'punk')).toBe('hair');
      // without the override key, Red is just an authored colour on the head
      expect(tintRoleForMaterialInRegion('Red', 'head')).toBeNull();
      expect(HAIR_MATERIAL_OVERRIDES.w_punk).toContain('Hair_Brown');
    });
    it('head accessories / unknown materials keep their authored colour (null)', () => {
      expect(tintRoleForMaterialInRegion('Earrings', 'head', 'punk')).toBeNull();
      expect(tintRoleForMaterialInRegion('Gold', 'weapon')).toBeNull();
      expect(tintRoleForMaterialInRegion('Whatever', null)).toBeNull();
    });
  });

  describe('planModularLoad (dedup + donor)', () => {
    it('collapses all-equal picks to a single load carrying every region (donor)', () => {
      const plan = planModularLoad({ head: 'suit', top: 'suit', bottom: 'suit' });
      expect(plan).toHaveLength(1);
      expect(plan[0].outfitKey).toBe('suit');
      expect(plan[0].isSkeletonDonor).toBe(true);
      expect(new Set(plan[0].regions)).toEqual(new Set(['top', 'head', 'lower']));
      expect(plan[0].path).toBe(outfitByKey('suit')!.path);
    });

    it('three distinct picks → three loads, donor on the top outfit', () => {
      const plan = planModularLoad({ head: 'suit', top: 'punk', bottom: 'adventurer' });
      expect(plan.map((p) => p.outfitKey)).toEqual(['punk', 'suit', 'adventurer']); // donor first
      const donor = plan.find((p) => p.isSkeletonDonor)!;
      expect(donor.outfitKey).toBe('punk');
      expect(donor.regions).toEqual(['top']);
      expect(plan.find((p) => p.outfitKey === 'suit')!.regions).toEqual(['head']);
      expect(plan.find((p) => p.outfitKey === 'adventurer')!.regions).toEqual(['lower']);
      expect(plan.filter((p) => p.isSkeletonDonor)).toHaveLength(1);
    });

    it('merges a repeated outfit across regions (head == bottom)', () => {
      const plan = planModularLoad({ head: 'king', top: 'punk', bottom: 'king' });
      expect(plan).toHaveLength(2);
      expect(new Set(plan.find((p) => p.outfitKey === 'king')!.regions)).toEqual(
        new Set(['head', 'lower']),
      );
    });

    it('unknown keys fall back to the default outfit GLB', () => {
      const plan = planModularLoad({ head: 'nope', top: 'nope', bottom: 'nope' });
      expect(plan).toHaveLength(1);
      expect(plan[0].path).toBe(outfitByKey(DEFAULT_OUTFIT)!.path);
    });

    it('a jumpsuit top (farmer) forces the lower region to the jumpsuit (no overlap)', () => {
      // farmer covers the legs via its Body + has no Legs mesh; a foreign bottom
      // would superimpose, so the lower region is forced to the jumpsuit.
      const plan = planModularLoad({ head: 'farmer', top: 'farmer', bottom: 'punk' });
      expect(plan.some((p) => p.outfitKey === 'punk')).toBe(false);
      const farmer = plan.find((p) => p.outfitKey === 'farmer')!;
      expect(new Set(farmer.regions)).toEqual(new Set(['top', 'head', 'lower']));
    });

    it('a non-jumpsuit top keeps the chosen bottom', () => {
      const plan = planModularLoad({ head: 'punk', top: 'punk', bottom: 'adventurer' });
      expect(plan.find((p) => p.outfitKey === 'adventurer')!.regions).toEqual(['lower']);
    });
  });

  describe('isJumpsuit', () => {
    it('is true only for outfits that provide a top but no bottom', () => {
      expect(isJumpsuit('farmer')).toBe(true); // Body covers legs, no Legs mesh
      expect(isJumpsuit('suit')).toBe(false);
      expect(isJumpsuit('punk')).toBe(false);
    });
  });
});
