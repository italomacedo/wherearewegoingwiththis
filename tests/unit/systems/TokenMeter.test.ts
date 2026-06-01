import { estimateTokens, CHARS_PER_TOKEN } from '../../../src/systems/TokenMeter';

describe('TokenMeter.estimateTokens', () => {
  it('approximates ~4 chars per token (ceil)', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('x'.repeat(4 * CHARS_PER_TOKEN))).toBe(CHARS_PER_TOKEN);
  });

  it('handles nullish input safely', () => {
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });
});
