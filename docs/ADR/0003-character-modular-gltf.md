# ADR-0003 — Character System: Modular GLTF

**Status:** Accepted  
**Date:** 2026-05-30

## Context

The game requires full character customization from a nude base body to a completely clothed character, including:
- Multiple ethnicities and body types
- Hair styles (separate mesh per style)
- Facial features (eyes, nose, mouth)
- Clothing (tops, bottoms, shoes, jackets, accessories)
- Cyberpunk augmentations and visible implants
- All pieces must work with a shared animation rig (Mixamo-compatible humanoid)

Options evaluated:
- **Ready Player Me SDK** — cloud-based, fast to implement, limited cyberpunk customization, sends data to RPM servers
- **Local modular GLTF** — all assets local, full control, more implementation work

## Decision

Use a **local modular GLTF system**: each clothing/hair/accessory piece is a separate `.glb` file that attaches to a base humanoid skeleton.

### Asset Structure

```
src/assets/characters/
  base/          # body meshes per ethnicity/gender — shared Mixamo rig
  hair/          # hair mesh files
  face/          # eyebrow, eyelash, beard meshes + blendshapes
  clothes/
    tops/        # shirts, jackets, armor
    bottoms/     # pants, skirts, shorts
    shoes/       # boots, sneakers
    accessories/ # glasses, hats, jewelry
  cyberpunk/
    implants_visible/   # facial implants, eye mods, neck ports
    augmentations/      # arm blades, spinal rigs
  animations/    # shared AnimationGroup clips (idle, walk, run, etc.)
```

### Runtime Assembly

Each character is assembled at runtime by:
1. Loading the base body GLTF (skeleton + skin mesh)
2. Loading and attaching additional meshes to their bone attachment points
3. Applying material overrides (skin tone, hair color) via StandardMaterial/PBR parameters

### Serialization

Character customization data stored as JSON in the save file:
```json
{
  "bodyBase": "body_female_black",
  "skinTone": "#8B5E3C",
  "hair": "hair_undercut_01",
  "hairColor": "#1A1A1A",
  "eyes": "eyes_cyber_blue",
  "clothes": {
    "top": "jacket_neon_bomber",
    "bottom": "pants_tactical",
    "shoes": "boots_platform_chrome",
    "accessories": ["glasses_visor_red"]
  },
  "implants": ["eye_mod_left_optical", "neck_data_port"]
}
```

## Consequences

**Positive:**
- Fully offline, no external dependencies
- Complete control over cyberpunk aesthetic
- All assets are owned/CC0 — no licensing complications
- Rig compatibility: all pieces share the same Mixamo humanoid skeleton → animations work on all combinations

**Negative:**
- More asset sourcing work upfront (Sketchfab MCP + manual curation)
- Runtime mesh swapping requires careful LOD/draw call management
- Blendshapes for facial customization need careful setup

## Related

- [ADR-0005](0005-asset-pipeline.md) — How assets are sourced
- [docs/design/CHARACTER_SYSTEM.md](../design/CHARACTER_SYSTEM.md) — Full system spec
