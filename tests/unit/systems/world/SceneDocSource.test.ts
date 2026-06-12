import { sanitizeSceneDocs } from '@systems/world/SceneDocSource';
import { emptySceneDoc } from '@systems/sceneeditor/SceneDoc';

describe('SceneDocSource.sanitizeSceneDocs', () => {
  test('keeps valid docs, drops invalid, sorts by id', () => {
    const docs = sanitizeSceneDocs([
      emptySceneDoc('zeta', 'quadrant'),
      { junk: true },
      null,
      emptySceneDoc('alley', 'interior'),
    ]);
    expect(docs.map((d) => d.id)).toEqual(['alley', 'zeta']);
  });

  test('migrates old versions and de-dupes by id (last wins)', () => {
    const v0 = { ...emptySceneDoc('alley', 'quadrant'), version: 0 };
    const newer = { ...emptySceneDoc('alley', 'interior'), name: 'Alley 2' };
    const docs = sanitizeSceneDocs([v0, newer]);
    expect(docs).toHaveLength(1);
    expect(docs[0].kind).toBe('interior');
    expect(docs[0].version).toBe(1);
  });

  test('empty input → empty output', () => {
    expect(sanitizeSceneDocs([])).toEqual([]);
  });
});
