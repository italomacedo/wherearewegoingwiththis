# Character System Design

## Overview

The player character is assembled from modular GLTF parts at runtime. Every combination is valid — from a completely nude base body to a fully augmented, armored operative.

---

## Customization Layers (in render order)

| Layer | Options | Format |
|---|---|---|
| 1. Base Body | 8 variants (4 ethnicities × 2 body types) | GLB with skeleton |
| 2. Skin Tone | Color picker (hex) applied to body material | PBR texture tint |
| 3. Body Details | Tattoos, scars (texture overlays) | PNG overlay |
| 4. Underwear/Nude | Default coverage (always present under clothes) | GLB mesh |
| 5. Bottom clothing | Pants, shorts, skirts | GLB mesh |
| 6. Top clothing | Shirts, jackets, armor | GLB mesh |
| 7. Shoes | Boots, sneakers, bare feet | GLB mesh |
| 8. Accessories | Glasses, hats, belts, bags | GLB mesh |
| 9. Hair | Separate mesh per style | GLB mesh |
| 10. Hair Color | Color picker applied to hair material | PBR tint |
| 11. Face Features | Eyebrows, eyelashes, beard | GLB mesh or blendshape |
| 12. Visible Implants | Eye mods, neck ports, facial chrome | GLB mesh |
| 13. Body Augmentations | Arm blades, spinal rigs | GLB mesh |

---

## Body Base Variants

All base bodies share the **same Mixamo humanoid skeleton** — this guarantees all animations work with all combinations.

| Asset Key | Description |
|---|---|
| `body_female_asian` | |
| `body_female_black` | |
| `body_female_latina` | |
| `body_female_white` | |
| `body_male_asian` | |
| `body_male_black` | |
| `body_male_latino` | |
| `body_male_white` | |

> Asset selection for each variant is done in Phase 4 using Sketchfab MCP.

---

## Runtime Assembly (Babylon.js)

```typescript
async function assembleCharacter(data: CharacterData, scene: Scene): Promise<AbstractMesh[]> {
  const meshes: AbstractMesh[] = [];

  // 1. Load base body (contains skeleton)
  const base = await SceneLoader.ImportMeshAsync('', 'assets/characters/base/', `${data.bodyBase}.glb`, scene);
  const skeleton = base.skeletons[0];
  meshes.push(...base.meshes);

  // 2. Load and attach each clothing/hair piece
  for (const part of getActiveParts(data)) {
    const result = await SceneLoader.ImportMeshAsync('', 'assets/characters/', `${part.path}.glb`, scene);
    result.meshes.forEach(m => {
      m.skeleton = skeleton; // share skeleton for animation sync
      meshes.push(m);
    });
  }

  // 3. Apply color tints
  applyColorTints(meshes, data);

  return meshes;
}
```

---

## Character Creator UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  [← Back to Menu]           CHARACTER CREATOR           │
├─────────────────────────────────────────────────────────┤
│                    │                                     │
│  BODY              │         3D PREVIEW                  │
│  [Asian ▼] [F/M]   │    (rotatable, full body)           │
│  Skin: [████]      │                                     │
│                    │                                     │
│  FACE              │                                     │
│  Eyes: [◄ ►]       │                                     │
│  Hair: [◄ ►]       │                                     │
│  Color: [████]     │                                     │
│                    │                                     │
│  CLOTHES           │                                     │
│  Top: [◄ ►]        │                                     │
│  Bottom: [◄ ►]     │                                     │
│  Shoes: [◄ ►]      │                                     │
│                    │                                     │
│  AUGMENTATIONS     │                                     │
│  [+ Add implant]   │                                     │
│                    │                                     │
│  Name: [_______]   │                                     │
│                    │     [BEGIN →]                       │
└─────────────────────────────────────────────────────────┘
```

---

## Serialization → Save File

See [ADR-0006](../ADR/0006-save-system.md) for the full save schema.
