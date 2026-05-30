# ADR-0005 — Asset Pipeline: Sketchfab MCP + Poly Haven + fab.com

**Status:** Accepted  
**Date:** 2026-05-30

## Context

The developer has zero artistic skills. All visual assets must be sourced from external repositories. Requirements:
- 3D models in GLTF/GLB format (Babylon.js native)
- Humanoid characters with Mixamo-compatible rigs
- Cyberpunk aesthetic: neon, dark streets, technology
- Textures: PBR (albedo, normal, roughness, metalness)
- Audio: SFX and music (CC0 or royalty-free)
- Assets must be sourceable autonomously by AI agent where possible

## Decision

**Three-tier asset pipeline:**

### Tier 1 — Autonomous AI Search (primary)

**Sketchfab MCP** (`gregkop/sketchfab-mcp-server`):
- MCP server for programmatic Sketchfab access
- Search by keyword, license (CC0/CC-BY), format
- Download directly as GLB
- Setup: `npx sketchfab-mcp-server` + Sketchfab API token in settings

**Poly Haven API** (`api.polyhaven.com`):
- No authentication required
- CC0 HDRIs for environment lighting
- PBR texture sets (asphalt, concrete, metal, neon-emissive)
- Some 3D models
- Direct HTTP download, no SDK needed

### Tier 2 — Browser-Assisted Search

**Claude in Chrome MCP**: browse fab.com, OpenGameArt, Kenney.nl
- Use for assets not found in Tier 1
- User approves before download

### Tier 3 — Manual (user action required)

**Mixamo** (animations):
- Free Adobe service — requires login, no API
- Download FBX → convert to GLTF with `gltf-transform`
- User downloads animations; Claude integrates them

### Workflow

```
1. Claude searches Tier 1 autonomously
2. Presents 3 candidates with preview URLs to user
3. User approves (or requests alternatives)
4. Claude downloads + places in src/assets/[category]/
5. Claude creates/updates AssetManifest.ts reference
6. ADR updated with asset decision
```

### Rule: No paid assets without user approval

Any asset requiring purchase must be presented to the user with price before acquiring.

## Consequences

**Positive:**
- Autonomous asset discovery reduces iteration friction
- CC0 assets = no licensing risk
- Sketchfab MCP makes 1M+ models searchable programmatically

**Negative:**
- Quality variance in free assets — curation effort needed
- Mixamo is manual — animation integration requires user action
- fab.com has no API — best assets may require manual purchase

## Related

- [ADR-0003](0003-character-modular-gltf.md) — Character asset structure
- [docs/systems/ASSET_LOADING.md](../systems/ASSET_LOADING.md) — Runtime loading system
