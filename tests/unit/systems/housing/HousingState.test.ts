import { HousingState, uniqueFurnitureKey, PlacedFurniture } from '../../../../src/systems/housing/HousingState';

describe('uniqueFurnitureKey', () => {
  it('returns the defId when free, else suffixes _2, _3, …', () => {
    const placed: PlacedFurniture[] = [];
    expect(uniqueFurnitureKey(placed, 'bed_single')).toBe('bed_single');
    placed.push({ key: 'bed_single', defId: 'bed_single', position: [0, 0, 0], rotationY: 0 });
    expect(uniqueFurnitureKey(placed, 'bed_single')).toBe('bed_single_2');
    placed.push({ key: 'bed_single_2', defId: 'bed_single', position: [0, 0, 0], rotationY: 0 });
    expect(uniqueFurnitureKey(placed, 'bed_single')).toBe('bed_single_3');
  });
});

describe('HousingState (pure)', () => {
  it('place adds a piece, selects it, and seeds the catalog default scale', () => {
    const s = new HousingState();
    const k1 = s.place('kitchen_cabinet1', [1, 0, 2]);
    expect(k1).toBe('kitchen_cabinet1');
    expect(s.selection).toBe(k1);
    expect(s.placed).toHaveLength(1);
    expect(s.selected()?.position).toEqual([1, 0, 2]);
    expect(s.selected()?.rotationY).toBe(0);
    // kitchen_cabinetsmall has a defaultScale of 1.2.
    s.place('kitchen_cabinetsmall', [0, 0, 0]);
    expect(s.selected()?.scale).toBe(1.2);
    // a piece without a default scale falls back to 1.
    s.place('bed_single', [0, 0, 0]);
    expect(s.selected()?.scale).toBe(1);
  });

  it('place uses a unique key when the same def is placed twice', () => {
    const s = new HousingState();
    expect(s.place('bed_single', [0, 0, 0])).toBe('bed_single');
    expect(s.place('bed_single', [0, 0, 0])).toBe('bed_single_2');
  });

  it('select ignores unknown keys; selected/byKey resolve', () => {
    const s = new HousingState();
    const k = s.place('bed_single', [0, 0, 0]);
    s.select('nope');
    expect(s.selection).toBeNull();
    s.select(k);
    expect(s.selected()?.key).toBe(k);
    expect(s.byKey(k)?.defId).toBe('bed_single');
    expect(s.byKey('nope')).toBeNull();
    s.select(null);
    expect(s.selected()).toBeNull();
  });

  it('setTransform writes position/rotation/scale into the selection (scale floored)', () => {
    const s = new HousingState();
    s.place('bed_single', [0, 0, 0]);
    expect(s.setTransform({ position: [3, 0, 4], rotationY: 1.5, scale: 2 })).toBe(true);
    expect(s.selected()?.position).toEqual([3, 0, 4]);
    expect(s.selected()?.rotationY).toBe(1.5);
    expect(s.selected()?.scale).toBe(2);
    s.setTransform({ scale: 0.01 });
    expect(s.selected()?.scale).toBe(0.1); // clamped to a sane minimum
  });

  it('setTransform returns false with no selection', () => {
    const s = new HousingState();
    expect(s.setTransform({ rotationY: 1 })).toBe(false);
  });

  it('removeSelected returns the defId for refund and clears the selection', () => {
    const s = new HousingState();
    s.place('bookshelf', [0, 0, 0]);
    expect(s.removeSelected()).toBe('bookshelf');
    expect(s.placed).toHaveLength(0);
    expect(s.selection).toBeNull();
    expect(s.removeSelected()).toBeNull();
  });

  it('nearestStorage finds the closest storage piece within radius (ignores decor)', () => {
    const s = new HousingState();
    s.place('kitchen_cabinet1', [0, 0, 0]); // storage at origin
    s.place('bed_single', [0.5, 0, 0]);     // decor right next to it — must be ignored
    s.place('bookshelf', [10, 0, 0]);       // storage far away
    expect(s.nearestStorage(0.5, 0, 2)?.defId).toBe('kitchen_cabinet1');
    expect(s.nearestStorage(9.5, 0, 2)?.defId).toBe('bookshelf');
    expect(s.nearestStorage(50, 0, 2)).toBeNull(); // nothing in reach
  });

  it('nearestStorage ignores a piece with an unknown defId (treated as non-storage)', () => {
    const s = new HousingState();
    s.load([{ key: 'ghost', defId: 'not_a_real_def', position: [0, 0, 0], rotationY: 0 }]);
    expect(s.nearestStorage(0, 0, 2)).toBeNull();
  });

  it('load/toState round-trips and deep-copies positions', () => {
    const s = new HousingState();
    const layout: PlacedFurniture[] = [
      { key: 'a', defId: 'bookshelf', position: [1, 0, 2], rotationY: 0.3, scale: 1 },
    ];
    s.load(layout);
    expect(s.selection).toBeNull();
    const out = s.toState();
    expect(out).toEqual(layout);
    // mutating the snapshot must not affect the live state (deep copy).
    out[0].position[0] = 99;
    expect(s.byKey('a')?.position[0]).toBe(1);
  });
});
