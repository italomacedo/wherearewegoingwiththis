import { checkLine } from '@systems/skills/CheckLine';
import { setLocale, resetLocale } from '@systems/I18n';
import { SettingsService } from '@systems/SettingsService';

describe('checkLine', () => {
  afterEach(() => {
    resetLocale();
    SettingsService.reset();
  });

  it('formats a success in English', () => {
    setLocale('en');
    expect(checkLine('Furtividade', 23, 0.65, true, false)).toBe('Furtividade: 23 vs 65% — SUCCESS');
  });

  it('formats a failure in pt-BR', () => {
    setLocale('pt-BR');
    expect(checkLine('Furtividade', 82, 0.4, false, false)).toBe('Furtividade: 82 vs 40% — FALHA');
  });

  it('appends the critical marker only on a critical', () => {
    setLocale('en');
    expect(checkLine('Comércio', 2, 0.5, true, true)).toBe('Comércio: 2 vs 50% — SUCCESS · CRITICAL');
    setLocale('pt-BR');
    expect(checkLine('Comércio', 2, 0.5, true, true)).toBe('Comércio: 2 vs 50% — SUCESSO · CRÍTICO');
  });

  it('rounds the roll and the probability percentage', () => {
    setLocale('en');
    expect(checkLine('Medicina', 22.6, 0.654, false, false)).toBe('Medicina: 23 vs 65% — FAILURE');
  });
});
