import { parseGalleryManifest, entriesByCategory, labelFromPath } from '@systems/sceneeditor/GalleryManifest';

const good = { path: 'world/guns/pistol_sci.glb', category: 'guns', label: 'Pistol Sci' };

describe('GalleryManifest', () => {
  test('parses valid entries and drops malformed ones', () => {
    const raw = {
      entries: [
        good,
        { path: 'items/knife.glb', category: 'items', label: 'Knife' },
        { path: 'world/x/no_label.glb', category: 'x', label: '' },
        { path: 'world/x/not_a_glb.png', category: 'x', label: 'X' },
        { path: 'world/x/a.glb', category: '', label: 'A' },
        { path: 42, category: 'x', label: 'X' },
        null,
        'string',
      ],
    };
    const entries = parseGalleryManifest(raw);
    expect(entries).toEqual([good, { path: 'items/knife.glb', category: 'items', label: 'Knife' }]);
  });

  test.each([
    ['null', null],
    ['non-object', 7],
    ['missing entries', {}],
    ['entries not array', { entries: 'x' }],
  ])('returns [] for %s', (_l, raw) => {
    expect(parseGalleryManifest(raw)).toEqual([]);
  });

  test('entriesByCategory groups and sorts categories', () => {
    const entries = [
      { path: 'world/nature/tree.glb', category: 'nature', label: 'Tree' },
      good,
      { path: 'world/guns/rifle.glb', category: 'guns', label: 'Rifle' },
    ];
    const map = entriesByCategory(entries);
    expect([...map.keys()]).toEqual(['guns', 'nature']);
    expect(map.get('guns')).toHaveLength(2);
  });

  test('labelFromPath title-cases the file stem', () => {
    expect(labelFromPath('world/guns/pistol_sci.glb')).toBe('Pistol Sci');
    expect(labelFromPath('big-old-crate.glb')).toBe('Big Old Crate');
    expect(labelFromPath('plain')).toBe('Plain');
  });
});
