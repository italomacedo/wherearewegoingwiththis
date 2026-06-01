import { t, getLocale, setLocale, resetLocale, languageName, hasKey, LANGUAGE_LABELS } from '../../../src/systems/I18n';
import { SettingsService } from '../../../src/systems/SettingsService';

describe('I18n', () => {
  beforeEach(() => {
    SettingsService.reset();
    SettingsService.clearMemoryStore();
    resetLocale();
  });
  afterEach(() => {
    SettingsService.reset();
    SettingsService.clearMemoryStore();
    resetLocale();
  });

  it('defaults to English', () => {
    expect(getLocale()).toBe('en');
    expect(t('menu.newGame')).toBe('NEW GAME');
  });

  it('returns pt-BR after setLocale and persists it', () => {
    setLocale('pt-BR');
    expect(getLocale()).toBe('pt-BR');
    expect(t('menu.newGame')).toBe('NOVO JOGO');
    expect(SettingsService.get('language')).toBe('pt-BR');
  });

  it('reads the locale lazily from settings', () => {
    SettingsService.set('language', 'pt-BR');
    resetLocale();
    expect(getLocale()).toBe('pt-BR');
    expect(t('pause.resume')).toBe('Continuar');
  });

  it('interpolates {params}', () => {
    expect(t('hud.talkTo', { name: 'Zara' })).toBe('[E] Talk to Zara');
    setLocale('pt-BR');
    expect(t('hud.talkTo', { name: 'Zara' })).toBe('[E] Falar com Zara');
  });

  it('unknown key falls back to the key itself', () => {
    expect(t('nope.nope')).toBe('nope.nope');
    expect(hasKey('nope.nope')).toBe(false);
    expect(hasKey('menu.quit')).toBe(true);
  });

  it('languageName for the NPC prompt', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('pt-BR')).toBe('Brazilian Portuguese');
  });

  it('has labels for both locales', () => {
    expect(LANGUAGE_LABELS.en).toBeTruthy();
    expect(LANGUAGE_LABELS['pt-BR']).toBeTruthy();
  });

  it('translates RPG ids (attr/skill/perk)', () => {
    expect(t('attr.forca')).toBe('Strength');
    expect(t('skill.armas_de_fogo')).toBe('Firearms');
    setLocale('pt-BR');
    expect(t('attr.forca')).toBe('Força');
    expect(t('skill.armas_de_fogo')).toBe('Armas de Fogo');
  });
});
