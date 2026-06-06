import { parseVerbalClassification } from '@systems/actions/VerbalIntent';

describe('parseVerbalClassification', () => {
  it('parses a minimal job_request with no extra fields', () => {
    const r = parseVerbalClassification(`VERB=job_request\nTARGET=none\nITEM=none\nPRICE=none\nDIR=none`);
    expect(r.verb).toBe('job_request');
    expect(r.target).toBeNull();
    expect(r.itemId).toBeNull();
    expect(r.proposedPrice).toBeNull();
    expect(r.dir).toBeNull();
  });

  it('parses all 15 verbal verbs as-is', () => {
    const verbs = [
      'job_request', 'job_claim', 'job_accept', 'job_decline', 'job_cancel',
      'commerce_discovery', 'commerce_pricing', 'commerce_haggle', 'commerce_buy', 'commerce_sell',
      'manipulate', 'persuade', 'intimidate', 'info', 'narrative',
    ];
    verbs.forEach((v) => {
      const r = parseVerbalClassification(`VERB=${v}`);
      expect(r.verb).toBe(v);
    });
  });

  it('degrades an unknown VERB to narrative (fail-open)', () => {
    const r = parseVerbalClassification(`VERB=bogus_thing`);
    expect(r.verb).toBe('narrative');
  });

  it('degrades a missing VERB to narrative', () => {
    expect(parseVerbalClassification('').verb).toBe('narrative');
    expect(parseVerbalClassification('TARGET=npc_zara').verb).toBe('narrative');
  });

  it('is case-insensitive for verbs and keys', () => {
    const r = parseVerbalClassification(`verb=JOB_REQUEST\ntarget=NONE`);
    expect(r.verb).toBe('job_request');
    expect(r.target).toBeNull();
  });

  it('parses TARGET as a valid npc id', () => {
    const r = parseVerbalClassification(`VERB=manipulate\nTARGET=npc_mback\nDIR=down`, {
      npcIds: ['npc_zara', 'npc_mback'],
    });
    expect(r.target).toBe('npc_mback');
    expect(r.dir).toBe('down');
  });

  it('rejects an unknown TARGET when an allow-list is provided', () => {
    const r = parseVerbalClassification(`VERB=info\nTARGET=npc_ghost`, {
      npcIds: ['npc_zara', 'npc_mback'],
    });
    expect(r.target).toBeNull();
  });

  it('accepts any TARGET when no allow-list is given (lenient)', () => {
    const r = parseVerbalClassification(`VERB=info\nTARGET=npc_anyone`);
    expect(r.target).toBe('npc_anyone');
  });

  it('parses ITEM against sellableIds when provided', () => {
    const r = parseVerbalClassification(`VERB=commerce_pricing\nITEM=knife`, {
      sellableIds: ['knife', 'pipe'],
    });
    expect(r.itemId).toBe('knife');
  });

  it('drops ITEM not in sellableIds (validation)', () => {
    const r = parseVerbalClassification(`VERB=commerce_buy\nITEM=cyberdeck`, {
      sellableIds: ['knife'],
    });
    expect(r.itemId).toBeNull();
  });

  it('parses PRICE only when positive integer', () => {
    expect(parseVerbalClassification(`VERB=commerce_haggle\nPRICE=20`).proposedPrice).toBe(20);
    expect(parseVerbalClassification(`VERB=commerce_haggle\nPRICE=0`).proposedPrice).toBeNull();
    expect(parseVerbalClassification(`VERB=commerce_haggle\nPRICE=-5`).proposedPrice).toBeNull();
    expect(parseVerbalClassification(`VERB=commerce_haggle\nPRICE=abc`).proposedPrice).toBeNull();
    expect(parseVerbalClassification(`VERB=commerce_haggle\nPRICE=none`).proposedPrice).toBeNull();
    // Floors a float to integer (a model may emit "12.5").
    expect(parseVerbalClassification(`VERB=commerce_haggle\nPRICE=12.7`).proposedPrice).toBe(12);
  });

  it('only accepts dir = up | down (lowercased)', () => {
    expect(parseVerbalClassification(`VERB=manipulate\nDIR=up`).dir).toBe('up');
    expect(parseVerbalClassification(`VERB=manipulate\nDIR=DOWN`).dir).toBe('down');
    expect(parseVerbalClassification(`VERB=manipulate\nDIR=sideways`).dir).toBeNull();
    expect(parseVerbalClassification(`VERB=manipulate\nDIR=none`).dir).toBeNull();
  });

  it('ignores stray lines / extra whitespace', () => {
    const raw = `
      Just to mess with the parser:
      VERB=job_claim
      something=ignored
      TARGET=  npc_zara
      PRICE=
    `;
    const r = parseVerbalClassification(raw);
    expect(r.verb).toBe('job_claim');
    expect(r.target).toBe('npc_zara');
    expect(r.proposedPrice).toBeNull();
  });

  it('full example — commerce_haggle with everything filled', () => {
    const r = parseVerbalClassification(
      `VERB=commerce_haggle\nTARGET=none\nITEM=knife\nPRICE=18\nDIR=none`,
      { sellableIds: ['knife', 'pipe'] },
    );
    expect(r).toEqual({
      verb: 'commerce_haggle',
      target: null,
      itemId: 'knife',
      proposedPrice: 18,
      dir: null,
    });
  });
});
