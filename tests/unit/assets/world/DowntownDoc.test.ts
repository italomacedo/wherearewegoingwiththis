/**
 * DowntownDoc parity/invariant tests + the downtown.json generation hook.
 *
 * Regenerate the committed doc after changing the downtown catalogs:
 *   PowerShell:  $env:EXPORT_DOWNTOWN='1'; npx jest tests/unit/assets/world/DowntownDoc.test.ts; Remove-Item Env:EXPORT_DOWNTOWN
 * (Jest is the runner because it already resolves the @ path aliases.)
 *
 * NOTE: once the owner edits downtown.json in the Scene Editor, the JSON is the
 * source of truth — these tests assert structural invariants (valid doc, legacy
 * NPC ids present), NOT byte-equality with the builder, so editor changes don't
 * break CI.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildDowntownSceneDoc, effectiveDowntownProps, DOWNTOWN_SOLID } from '@assets/world/DowntownDoc';
import { interiorBuildingSlots } from '@assets/world/CityFrame';
import { MERCADO_PROPS } from '@assets/WorldAssetCatalog';
import { validateSceneDoc } from '@systems/sceneeditor/SceneDoc';

const JSON_PATH = path.resolve(__dirname, '../../../../public/scenes/downtown.json');

describe('effectiveDowntownProps', () => {
  const props = effectiveDowntownProps();

  test('skips the legacy wall/sidewalk/door catalog entries', () => {
    expect(props.some((p) => /^(wall-|sidewalk-)/.test(p.key))).toBe(false);
  });

  test('slots every building (≤6) at the interior block slots, each with a door', () => {
    const slots = interiorBuildingSlots(0, 0);
    const blds = props.filter((p) => p.key.startsWith('bld-'));
    expect(blds.length).toBeGreaterThan(0);
    expect(blds.length).toBeLessThanOrEqual(slots.length);
    blds.forEach((b, i) => {
      expect(b.position).toEqual(slots[i].position);
      expect(b.rotationY).toBe(slots[i].rotationY);
      expect(b.solid).toBe(true);
      const door = props.find((p) => p.key === `door-${b.key}`);
      expect(door).toBeDefined();
      expect(door!.solid).toBe(false);
    });
  });

  test('keeps the non-building catalog props with the zone solid rule', () => {
    const shelf = props.find((p) => p.key === 'vendor-shelf');
    if (shelf) expect(shelf.solid).toBe(true);
    for (const p of props) {
      if (p.key.startsWith('bld-') || p.key.startsWith('door-') || p.key.startsWith('manhole-')) continue;
      expect(p.solid).toBe(DOWNTOWN_SOLID.test(p.key));
      // Verbatim from the catalog.
      const src = MERCADO_PROPS.find((m) => m.key === p.key);
      expect(src).toBeDefined();
      expect(p.position).toEqual(src!.position);
    }
  });

  test('seeds 2..4 manhole covers deterministically', () => {
    const manholes = props.filter((p) => p.key.startsWith('manhole-'));
    expect(manholes.length).toBeGreaterThanOrEqual(2);
    expect(manholes.length).toBeLessThanOrEqual(4);
    expect(effectiveDowntownProps()).toEqual(props); // stable across calls
  });
});

describe('buildDowntownSceneDoc', () => {
  const doc = buildDowntownSceneDoc();

  test('is a valid quadrant SceneDoc', () => {
    expect(validateSceneDoc(doc)).not.toBeNull();
    expect(doc.id).toBe('downtown');
    expect(doc.kind).toBe('quadrant');
  });

  test('carries Zara and Mback with their LEGACY ids + full fidelity', () => {
    const zara = doc.npcs.find((n) => n.id === 'npc_zara_vendor_01');
    const mback = doc.npcs.find((n) => n.id === 'npc_mback_fence_01');
    expect(zara).toBeDefined();
    expect(mback).toBeDefined();
    expect(zara!.outfit).toBe('w_punk');
    expect(zara!.appearance?.colors.hair).toBe('#C81E5A');
    expect(zara!.addict).toBe(true);
    expect(zara!.npcRelationships).toEqual({ npc_mback_fence_01: 'wary' });
    expect(mback!.dealer).toBe(true);
    expect(mback!.loadout?.some((s) => s.id === 'credstick' && s.qty === 1000)).toBe(true);
  });
});

describe('committed public/scenes/downtown.json', () => {
  test('generation hook (EXPORT_DOWNTOWN=1 writes the file)', () => {
    if (process.env.EXPORT_DOWNTOWN === '1') {
      fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
      fs.writeFileSync(JSON_PATH, JSON.stringify(buildDowntownSceneDoc(), null, 1));
    }
    expect(true).toBe(true);
  });

  test('validates and keeps the legacy NPC ids (when present)', () => {
    if (!fs.existsSync(JSON_PATH)) return; // pre-export checkout — game falls back to catalog
    const doc = validateSceneDoc(JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')));
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('downtown');
    expect(doc!.kind).toBe('quadrant');
    expect(doc!.npcs.some((n) => n.id === 'npc_zara_vendor_01')).toBe(true);
    expect(doc!.npcs.some((n) => n.id === 'npc_mback_fence_01')).toBe(true);
    expect(doc!.props.length).toBeGreaterThan(10);
  });
});
