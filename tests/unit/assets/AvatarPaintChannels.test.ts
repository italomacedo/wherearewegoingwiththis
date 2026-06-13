import {
  classifyMaterial,
  classifyChannels,
  channelKeyForMaterial,
  type MaterialSample,
} from '../../../src/assets/AvatarPaintChannels';

describe('classifyMaterial', () => {
  it('maps semantic materials to fixed kind keys (regardless of region)', () => {
    expect(classifyMaterial('Skin', 'top')).toMatchObject({ kind: 'skin', key: 'skin' });
    expect(classifyMaterial('Eye', 'head')).toMatchObject({ kind: 'eye', key: 'eye' });
    expect(classifyMaterial('Eyebrows', 'head')).toMatchObject({ kind: 'eyebrow', key: 'eyebrow' });
    expect(classifyMaterial('Hair_Black', 'head')).toMatchObject({ kind: 'hair', key: 'hair' });
    expect(classifyMaterial('Lips', 'head')).toMatchObject({ kind: 'lips', key: 'lips' });
    expect(classifyMaterial('Teeth', 'head')).toMatchObject({ kind: 'teeth', key: 'teeth' });
    expect(classifyMaterial('GoldRing', 'top')).toMatchObject({ kind: 'jewelry', key: 'jewelry' });
  });

  it('does not classify Eyebrows as eye', () => {
    expect(classifyMaterial('Eyebrows', 'head').kind).toBe('eyebrow');
  });

  it('uses the per-outfit hair override for themed mohawk materials', () => {
    expect(classifyMaterial('Red', 'head', 'punk').kind).toBe('hair');
    // Without the outfit key, the same material is plain clothing.
    expect(classifyMaterial('Red', 'head').kind).toBe('clothing');
    // An outfit key with no override entry → still plain clothing.
    expect(classifyMaterial('Red', 'head', 'suit').kind).toBe('clothing');
  });

  it('keys clothing materials by region+name and labels with a region prefix', () => {
    const top = classifyMaterial('Black', 'top');
    const lower = classifyMaterial('Black', 'lower');
    expect(top).toMatchObject({ kind: 'clothing', key: 'clothing:top:Black', label: 'Top · Black' });
    expect(lower).toMatchObject({ kind: 'clothing', key: 'clothing:lower:Black', label: 'Lower · Black' });
    expect(top.key).not.toBe(lower.key); // same name, different region → distinct channels
  });

  it('handles a null region for clothing', () => {
    expect(classifyMaterial('Tie', null)).toMatchObject({ key: 'clothing:none:Tie', label: 'Tie' });
  });
});

describe('channelKeyForMaterial', () => {
  it('round-trips to the same key as classifyMaterial', () => {
    expect(channelKeyForMaterial('Skin', 'top')).toBe('skin');
    expect(channelKeyForMaterial('Black', 'lower')).toBe('clothing:lower:Black');
    expect(channelKeyForMaterial('Red', 'head', 'punk')).toBe('hair');
  });
});

describe('classifyChannels', () => {
  const samples: MaterialSample[] = [
    { materialName: 'Black', region: 'top', authoredHex: '#101010' },
    { materialName: 'Skin', region: 'top', authoredHex: '#8B6355' },
    { materialName: 'Black', region: 'lower', authoredHex: '#1A1A1A' },
    { materialName: 'Skin', region: 'head', authoredHex: '#8B6355' }, // dup skin material
    { materialName: 'Hair_Black', region: 'head', authoredHex: '#0A0A0A' },
    { materialName: 'Tie', region: 'top', authoredHex: '#6B2A2A' },
  ];

  it('groups duplicates and keeps same-named clothing on different regions distinct', () => {
    const channels = classifyChannels(samples);
    const keys = channels.map((c) => c.key);
    expect(keys).toContain('clothing:top:Black');
    expect(keys).toContain('clothing:lower:Black');
    // Skin appears twice across meshes but collapses to one channel.
    expect(keys.filter((k) => k === 'skin')).toHaveLength(1);
  });

  it('uses the first sample authored colour as the channel defaultHex', () => {
    const channels = classifyChannels(samples);
    const topBlack = channels.find((c) => c.key === 'clothing:top:Black')!;
    expect(topBlack.defaultHex).toBe('#101010');
  });

  it('orders semantic channels before clothing, clothing top before lower', () => {
    const channels = classifyChannels(samples);
    const kinds = channels.map((c) => c.kind);
    // skin & hair (semantic) precede any clothing
    expect(kinds.indexOf('clothing')).toBeGreaterThan(kinds.lastIndexOf('hair'));
    expect(kinds.indexOf('clothing')).toBeGreaterThan(kinds.lastIndexOf('skin'));
    const clothing = channels.filter((c) => c.kind === 'clothing');
    const topIdx = clothing.findIndex((c) => c.region === 'top');
    const lowerIdx = clothing.findIndex((c) => c.region === 'lower');
    expect(topIdx).toBeLessThan(lowerIdx);
  });

  it('records every material name a channel paints', () => {
    const channels = classifyChannels(samples);
    expect(channels.find((c) => c.key === 'skin')!.materialNames).toEqual(['Skin']);
  });

  it('returns an empty list for no samples', () => {
    expect(classifyChannels([])).toEqual([]);
  });
});
