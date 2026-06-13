/**
 * DowntownDoc — builds the SceneDoc for the static downtown (tile 0,0) from the
 * authored catalogs, replicating EXACTLY what MercadoSombrasZone.loadRealAssets
 * places in mosaic mode (openEast): wall/sidewalk/door props skipped, buildings
 * re-slotted into the interior block slots with their per-mold scale + paired
 * door molds, manholes seeded with the zone's fixed rng. Local == world here
 * (tile (0,0)'s centre is the origin).
 *
 * `public/scenes/downtown.json` is generated from this builder (see the
 * DowntownDoc test's EXPORT_DOWNTOWN env hook) and becomes the editable source
 * the game loads; this builder remains the regeneration path. Pure, tested.
 */
import {
  MERCADO_PROPS, moldScaleFor, doorPlacementForSlot, DOOR_MODELS,
} from '@assets/WorldAssetCatalog';
import { interiorBuildingSlots, manholeSpots } from '@assets/world/CityFrame';
import { mulberry32 } from '@systems/world/SeededRng';
import { createZara } from '@entities/npcs/zara';
import { createMback } from '@entities/npcs/mback';
import type { NPCDefinition } from '@entities/NPCAgent';
import {
  SceneDoc, ScenePropDoc, SceneNpcDoc, SCENE_DOC_VERSION,
} from '@systems/sceneeditor/SceneDoc';

/** Mirrors the zone's SOLID_PROP rule (which props get a box collider). */
export const DOWNTOWN_SOLID = /^(bld-|wall-|vendor-shelf|prop-bollard|prop-acunit|prop-planter)/;

const MANHOLE_RNG_SEED = 99; // the zone's fixed manhole seed

/** The EFFECTIVE mosaic-mode prop list (what the zone actually places). */
export function effectiveDowntownProps(): ScenePropDoc[] {
  const out: ScenePropDoc[] = [];
  const slots = interiorBuildingSlots(0, 0);
  let bldIdx = 0;
  for (const p of MERCADO_PROPS) {
    if (/^(wall-|sidewalk-|door-)/.test(p.key)) continue;
    if (p.key.startsWith('bld-')) {
      if (bldIdx >= slots.length) continue;
      const slot = slots[bldIdx];
      const scale = moldScaleFor(p.model);
      out.push({
        key: p.key, model: p.model, position: slot.position,
        rotationY: slot.rotationY, scale, solid: true,
      });
      const door = doorPlacementForSlot({
        key: `door-${p.key}`, buildingModel: p.model,
        doorModel: DOOR_MODELS[bldIdx % DOOR_MODELS.length],
        slotPos: slot.position, slotRotY: slot.rotationY, finalScale: scale,
      });
      out.push({ ...door, solid: false });
      bldIdx += 1;
      continue;
    }
    out.push({ ...p, solid: DOWNTOWN_SOLID.test(p.key) });
  }
  manholeSpots(0, 0, mulberry32(MANHOLE_RNG_SEED)).forEach((spot, i) => {
    out.push({
      key: `manhole-${i}`, model: 'world/downtown/prop_manholecover.glb',
      position: spot, solid: false,
    });
  });
  return out;
}

/** Flatten an authored NPCDefinition into a full-fidelity SceneNpcDoc. */
function npcDoc(def: NPCDefinition): SceneNpcDoc {
  return {
    id: def.id, // legacy runtime id preserved so existing saves' npcMemory matches
    name: def.name,
    role: def.role,
    personalityPrompt: def.personalityPrompt,
    backstory: def.backstory,
    routine: def.routine,
    relationships: def.relationships,
    defaultMood: def.defaultMood,
    initialDisposition: def.initialDisposition ?? 'neutral',
    outfit: def.appearance?.bodyBase ?? 'casual_hoodie',
    loadout: def.loadout?.map((s) => ({ ...s })),
    position: [...def.position] as [number, number, number],
    appearance: def.appearance,
    home: def.home,
    location: def.location,
    npcRelationships: def.npcRelationships,
    dealer: def.dealer,
    addict: def.addict,
  };
}

/** The whole downtown as an editable quadrant SceneDoc. */
export function buildDowntownSceneDoc(): SceneDoc {
  return {
    version: SCENE_DOC_VERSION,
    id: 'downtown',
    kind: 'quadrant',
    name: 'Mercado das Sombras',
    props: effectiveDowntownProps(),
    items: [],
    npcs: [createZara(), createMback()].map(npcDoc),
    doorTriggers: [],
  };
}
