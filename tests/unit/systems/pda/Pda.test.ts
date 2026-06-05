import { buildPdaState, upsertPdaEntry, PdaEntry } from '../../../../src/systems/pda/Pda';

const entry = (id: string, name = id): PdaEntry => ({ subjectId: id, subjectName: name, lines: [`${name} dossier`] });

describe('Pda (pure)', () => {
  it('buildPdaState reports empty for no entries', () => {
    const v = buildPdaState([]);
    expect(v.empty).toBe(true);
    expect(v.entries).toEqual([]);
  });

  it('buildPdaState returns entries newest-first as copies', () => {
    const pda = [entry('a'), entry('b')];
    const v = buildPdaState(pda);
    expect(v.empty).toBe(false);
    expect(v.entries.map((e) => e.subjectId)).toEqual(['b', 'a']); // newest first
    v.entries[0]!.lines.push('mutated'); // copy — must not touch the source
    expect(pda[1]!.lines).toEqual(['b dossier']);
  });

  it('upsertPdaEntry adds a new subject', () => {
    const next = upsertPdaEntry([entry('a')], entry('b'));
    expect(next.map((e) => e.subjectId)).toEqual(['a', 'b']);
  });

  it('propagates the deceased flag through buildPdaState', () => {
    const dead: PdaEntry = { subjectId: 'm', subjectName: 'Mback', lines: ['Role: fixer'], deceased: true };
    const v = buildPdaState([dead]);
    expect(v.entries[0]!.deceased).toBe(true);
  });

  it('upsertPdaEntry replaces an existing subject and moves it to the end', () => {
    const updated: PdaEntry = { subjectId: 'a', subjectName: 'Ana', lines: ['new'] };
    const next = upsertPdaEntry([entry('a'), entry('b')], updated);
    expect(next.map((e) => e.subjectId)).toEqual(['b', 'a']);
    expect(next.find((e) => e.subjectId === 'a')!.lines).toEqual(['new']);
  });
});
