import { SettingsService } from '@systems/SettingsService';

/**
 * Tiny in-house i18n. A flat catalog maps a key → per-locale string; `t(key)`
 * resolves against the current locale (from SettingsService.language), falling
 * back to English then to the key itself. Supports `{name}` interpolation.
 *
 * The current locale is cached so `t()` is cheap; `setLocale` updates both the
 * cache and the persisted setting, and `resetLocale` clears the cache (tests).
 */

export type Locale = 'en' | 'pt-BR';
export const LOCALES: readonly Locale[] = ['en', 'pt-BR'];

export const LANGUAGE_LABELS: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português (BR)',
};

/** Human-readable language name injected into NPC/narration prompts. */
export function languageName(loc: Locale = getLocale()): string {
  return loc === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
}

type Entry = Record<Locale, string>;
const e = (en: string, pt: string): Entry => ({ en, 'pt-BR': pt });

/** The string catalog. Keyed by stable dotted ids. */
export const STRINGS: Record<string, Entry> = {
  // ─── Common ───────────────────────────────────────────────────────────────
  'common.back': e('← BACK', '← VOLTAR'),
  'common.begin': e('BEGIN  ▶', 'COMEÇAR  ▶'),
  'common.language': e('Language', 'Idioma'),

  // ─── Main menu ──────────────────────────────────────────────────────────
  'menu.newGame': e('NEW GAME', 'NOVO JOGO'),
  'menu.loadGame': e('LOAD GAME', 'CARREGAR JOGO'),
  'menu.options': e('OPTIONS', 'OPÇÕES'),
  'menu.quit': e('QUIT', 'SAIR'),

  // ─── Options ───────────────────────────────────────────────────────────
  'options.title': e('OPTIONS', 'OPÇÕES'),
  'options.tab.game': e('Game', 'Jogo'),
  'options.tab.display': e('Display', 'Vídeo'),
  'options.tab.video': e('Video', 'Gráficos'),
  'options.tab.audio': e('Audio', 'Áudio'),
  'options.claudePath': e('Claude CLI Path:', 'Caminho do Claude CLI:'),
  'options.skillGain': e('Skill Gain Rate:', 'Ganho de Skill:'),
  'options.npcAutonomy': e('Living NPCs:', 'NPCs vivos:'),
  'options.npcReflection': e('NPC Reflection:', 'Reflexão do NPC:'),
  'options.npcBudget': e('NPC Call Budget:', 'Orçamento de Chamadas:'),
  'options.combatApPerDex': e('Combat AP scale:', 'Escala de PA:'),
  'options.combatPrimaryCost': e('Primary action:', 'Ação principal:'),
  'options.combatSecondaryCost': e('Secondary action:', 'Ação secundária:'),
  'options.combatMoveCost': e('Move cost:', 'Custo de mover:'),
  'combat.title': e('COMBAT', 'COMBATE'),
  'combat.shoot': e('Shoot', 'Atirar'),
  'combat.strike': e('Strike', 'Golpear'),
  'combat.move': e('Move', 'Mover'),
  'combat.pickTarget': e('Click a target to attack', 'Clique no alvo para atacar'),
  'combat.pickDestination': e('Click a destination to move', 'Clique no destino para mover'),
  'combat.outOfRange': e('Out of range', 'Fora de alcance'),
  'combat.cover': e('Take cover', 'Cobertura'),
  'combat.hunker': e('Hunker down', 'Agachar'),
  'combat.reload': e('Reload', 'Recarregar'),
  'combat.flee': e('Flee', 'Fugir'),
  'combat.endTurn': e('End turn', 'Encerrar turno'),
  'combat.ap': e('AP', 'PA'),
  'combat.distance': e('Distance', 'Distância'),
  'combat.yourTurn': e('Your turn', 'Seu turno'),
  'combat.enemyTurn': e('Enemy turn', 'Turno do inimigo'),
  'gameover.title': e('GAME OVER', 'FIM DE JOGO'),
  'gameover.load': e('Load Last Save', 'Carregar Último Save'),
  'gameover.menu': e('Return to Main Menu', 'Voltar ao Menu'),
  'combat.won': e('You won the fight.', 'Você venceu o combate.'),
  'combat.lost': e('You were taken down.', 'Você foi derrubado.'),
  'combat.fled': e('You fled the fight.', 'Você fugiu do combate.'),
  'combat.over': e('The fight is over.', 'O combate terminou.'),
  'combat.log': e('Combat log', 'Registro de combate'),
  'combat.logHit': e('{a} HITS {b} with {weapon} — {dmg} dmg  ({chance}% to hit, rolled {roll})', '{a} ACERTA {b} com {weapon} — {dmg} de dano  ({chance}% de acerto, rolou {roll})'),
  'combat.logKill': e('{a} DROPS {b} with {weapon} — {dmg} dmg  ({chance}% to hit, rolled {roll})', '{a} DERRUBA {b} com {weapon} — {dmg} de dano  ({chance}% de acerto, rolou {roll})'),
  'combat.logMiss': e('{a} MISSES {b} with {weapon}  ({chance}% to hit, rolled {roll})', '{a} ERRA {b} com {weapon}  ({chance}% de acerto, rolou {roll})'),
  'combat.logMove': e('{a} repositions', '{a} reposiciona'),
  'combat.logCover': e('{a} takes cover', '{a} busca cobertura'),
  'combat.logHunker': e('{a} hunkers down', '{a} se agacha'),
  'combat.logReload': e('{a} reloads', '{a} recarrega'),
  'combat.logFlee': e('{a} flees', '{a} foge'),
  'common.on': e('ON', 'LIGADO'),
  'common.off': e('OFF', 'DESLIGADO'),

  // ─── Pause menu ──────────────────────────────────────────────────────────
  'pause.title': e('PAUSED', 'PAUSADO'),
  'pause.resume': e('Resume', 'Continuar'),
  'pause.save': e('Save Game', 'Salvar Jogo'),
  'pause.load': e('Load Game', 'Carregar Jogo'),
  'pause.quit': e('Quit to Main Menu', 'Sair para o Menu'),
  'pause.saved': e('Game saved ✓', 'Jogo salvo ✓'),
  // ─── Load game ─────────────────────────────────────────────────────────────
  'load.title': e('LOAD GAME', 'CARREGAR JOGO'),
  'load.empty': e('No saves found.', 'Nenhum save encontrado.'),
  'load.load': e('LOAD', 'CARREGAR'),

  // ─── HUD ──────────────────────────────────────────────────────────────────
  'hud.controls': e(
    'WASD move · Shift run · Z/C turn cam · E talk · T chat · I inventory · O adjust · F vehicle · Space/Ctrl altitude · ESC pause',
    'WASD mover · Shift correr · Z/C girar câmera · E falar · T chat · I inventário · O ajustar · F veículo · Espaço/Ctrl altitude · ESC pausar'
  ),
  'hud.talk': e('[E] Interact', '[E] Interagir'),
  'hud.talkTo': e('[E] Interact with {name}', '[E] Interagir com {name}'),
  'hud.search': e('[E] Search the body', '[E] Revistar o corpo'),
  'hud.searchTo': e('[E] Search {name}', '[E] Revistar {name}'),
  'hud.enterBike': e('[F] Enter bike', '[F] Entrar na nave'),
  'hud.exitBike': e('[F] Exit bike', '[F] Sair da nave'),
  'hud.naveStatus': e('NAVE {pct}%', 'NAVE {pct}%'),
  'hud.naveDestroyed': e('NAVE DESTROYED', 'NAVE DESTRUÍDA'),

  // ─── Action ribbon (Phase 11) ────────────────────────────────────────────────
  'ribbon.attackRanged': e('Shoot', 'Atirar'),
  'ribbon.attackMelee': e('Strike', 'Golpear'),
  'ribbon.talk': e('Talk', 'Falar'),
  'ribbon.inventory': e('Inventory', 'Inventário'),

  // ─── Inventory (Phase 9) ─────────────────────────────────────────────────────
  'inventory.title': e('Inventory', 'Inventário'),
  'inventory.lootTitle': e('Search {name}', 'Revistar {name}'),
  'inventory.corpseUnknown': e('the body', 'o corpo'),
  'inventory.close': e('Close', 'Fechar'),
  'inventory.equip': e('Equip', 'Equipar'),
  'inventory.unequip': e('Unequip', 'Desequipar'),
  'inventory.use': e('Use', 'Usar'),
  'inventory.drop': e('Drop', 'Largar'),
  'inventory.take': e('Take', 'Pegar'),
  'inventory.takeAll': e('Take all', 'Pegar tudo'),
  'inventory.adjust': e('Adjust', 'Ajustar'),
  'hunger.growl': e('Your stomach growls — you should eat something.', 'Seu estômago ronca — você devia comer algo.'),
  // Item names
  'item.fists': e('fists', 'punhos'),
  'item.knife': e('Knife', 'Faca'),
  'item.pipe': e('Lead Pipe', 'Cano de Chumbo'),
  'item.bat': e('Baseball Bat', 'Taco de Beisebol'),
  'item.medkit': e('Medkit', 'Kit Médico'),
  'item.scrap': e('Scrap', 'Sucata'),
  'item.credstick': e('Credstick', 'Cartão de Créditos'),

  // ─── Dialog ────────────────────────────────────────────────────────────────
  'dialog.openChannel': e('Open channel', 'Canal aberto'),
  'dialog.inputPlaceholder': e('Speak, or *perform an action*…', 'Fale, ou *realize uma ação*…'),
  'dialog.send': e('SEND', 'ENVIAR'),
  'dialog.cantSay': e("You can't say or do that.", 'Você não pode dizer ou fazer isso.'),
  'dialog.noReply': e(
    '( … no reply. Is the Claude CLI path set in Options → Game? )',
    '( … sem resposta. O caminho do Claude CLI está definido em Opções → Jogo? )'
  ),

  // ─── Character creator ──────────────────────────────────────────────────
  'creator.title': e('CREATE YOUR OPERATIVE', 'CRIE SEU OPERATIVO'),
  'creator.bodySkin': e('BODY & SKIN', 'CORPO & PELE'),
  'creator.gender': e('Gender', 'Gênero'),
  'creator.female': e('FEMALE', 'FEMININO'),
  'creator.male': e('MALE', 'MASCULINO'),
  'creator.skinTone': e('Skin Tone', 'Tom de Pele'),
  'creator.eyeColor': e('Eye Color', 'Cor dos Olhos'),
  'creator.outfit': e('OUTFIT', 'ROUPA'),
  'creator.outfitLabel': e('Outfit', 'Roupa'),
  'creator.hairColor': e('Hair Color', 'Cor do Cabelo'),
  'creator.attributes': e('ATTRIBUTES — pick your primary (30%)', 'ATRIBUTOS — escolha o primário (30%)'),
  'creator.startingSkills': e('STARTING SKILLS', 'SKILLS INICIAIS'),
  'creator.skillCounter': e('Majors {majors}/2 · Minors {minors}/3', 'Maiores {majors}/2 · Menores {minors}/3'),
  'creator.tier1Perks': e('TIER-1 PERKS', 'PERKS DE TIER 1'),

  // ─── Attributes ────────────────────────────────────────────────────────────
  'attr.forca': e('Strength', 'Força'),
  'attr.destreza': e('Dexterity', 'Destreza'),
  'attr.inteligencia': e('Intelligence', 'Inteligência'),
  'attr.carisma': e('Charisma', 'Carisma'),

  // ─── Skills ────────────────────────────────────────────────────────────────
  'skill.combate_corpo_a_corpo': e('Melee Combat', 'Combate Corpo-a-Corpo'),
  'skill.atletismo': e('Athletics', 'Atletismo'),
  'skill.resistencia': e('Endurance', 'Resistência'),
  'skill.armas_de_fogo': e('Firearms', 'Armas de Fogo'),
  'skill.furtividade': e('Stealth', 'Furtividade'),
  'skill.pilotagem': e('Piloting', 'Pilotagem'),
  'skill.percepcao': e('Perception', 'Percepção'),
  'skill.tecnologia_informacao': e('Information Technology', 'Tecnologia da Informação'),
  'skill.engenharia': e('Engineering', 'Engenharia'),
  'skill.medicina': e('Medicine', 'Medicina'),
  'skill.persuasao': e('Persuasion', 'Persuasão'),
  'skill.intimidacao': e('Intimidation', 'Intimidação'),
  'skill.comercio': e('Commerce', 'Comércio'),

  // ─── Perks (id → name) ─────────────────────────────────────────────────────
  'perk.forca_t1_punho_calejado': e('Calloused Fist', 'Punho Calejado'),
  'perk.forca_t1_folego_de_rua': e('Street Wind', 'Fôlego de Rua'),
  'perk.forca_t2_pancada_firme': e('Solid Hit', 'Pancada Firme'),
  'perk.forca_t2_equilibrio_felino': e('Cat Balance', 'Equilíbrio Felino'),
  'perk.forca_t3_quebra_guarda': e('Guard Breaker', 'Quebra-Guarda'),
  'perk.forca_t3_limiar_de_dor': e('Pain Threshold', 'Limiar de Dor'),
  'perk.forca_t4_investida_brutal': e('Brutal Charge', 'Investida Brutal'),
  'perk.forca_t4_pele_de_couro': e('Leather Skin', 'Pele de Couro'),
  'perk.forca_t5_furia_cibernetica': e('Cyber Rage', 'Fúria Cibernética'),
  'perk.forca_t5_tanque_de_carne': e('Meat Tank', 'Tanque de Carne'),
  'perk.destreza_t1_dedos_leves': e('Light Fingers', 'Dedos Leves'),
  'perk.destreza_t1_passo_macio': e('Soft Step', 'Passo Macio'),
  'perk.destreza_t2_mira_estavel': e('Steady Aim', 'Mira Estável'),
  'perk.destreza_t2_reflexo_rapido': e('Quick Reflex', 'Reflexo Rápido'),
  'perk.destreza_t3_saque_veloz': e('Fast Draw', 'Saque Veloz'),
  'perk.destreza_t3_sombra': e('Shadow', 'Sombra'),
  'perk.destreza_t4_tiro_certeiro': e('Dead Eye', 'Tiro Certeiro'),
  'perk.destreza_t4_piloto_nato': e('Natural Pilot', 'Piloto Nato'),
  'perk.destreza_t5_bullet_time': e('Bullet Time', 'Bullet Time'),
  'perk.destreza_t5_fantasma': e('Ghost', 'Fantasma'),
  'perk.inteligencia_t1_olho_clinico': e('Clinical Eye', 'Olho Clínico'),
  'perk.inteligencia_t1_bricolagem': e('Tinkerer', 'Bricolagem'),
  'perk.inteligencia_t2_leitura_de_rede': e('Net Read', 'Leitura de Rede'),
  'perk.inteligencia_t2_improviso_tecnico': e('Field Improv', 'Improviso Técnico'),
  'perk.inteligencia_t3_intrusao': e('Intrusion', 'Intrusão'),
  'perk.inteligencia_t3_cirurgiao_de_campo': e('Field Surgeon', 'Cirurgião de Campo'),
  'perk.inteligencia_t4_daemon': e('Daemon', 'Daemon'),
  'perk.inteligencia_t4_engenheiro_chefe': e('Chief Engineer', 'Engenheiro-Chefe'),
  'perk.inteligencia_t5_netrunner': e('Netrunner', 'Netrunner'),
  'perk.inteligencia_t5_tecnomante': e('Technomancer', 'Tecnomante'),
  'perk.carisma_t1_labia': e('Silver Tongue', 'Lábia'),
  'perk.carisma_t1_cara_de_pau': e('Bald-Faced', 'Cara de Pau'),
  'perk.carisma_t2_pechincha': e('Haggler', 'Pechincha'),
  'perk.carisma_t2_presenca': e('Presence', 'Presença'),
  'perk.carisma_t3_manipulador': e('Manipulator', 'Manipulador'),
  'perk.carisma_t3_intimidador': e('Intimidator', 'Intimidador'),
  'perk.carisma_t4_negociador_frio': e('Cold Negotiator', 'Negociador Frio'),
  'perk.carisma_t4_carisma_magnetico': e('Magnetic Charm', 'Carisma Magnético'),
  'perk.carisma_t5_mente_mestra': e('Mastermind', 'Mente-Mestra'),
  'perk.carisma_t5_idolo_da_rua': e('Street Idol', 'Ídolo da Rua'),
};

/** True when the catalog has an entry for the key (graceful fallbacks). */
export function hasKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}

let current: Locale | null = null;

function normalize(lang: string | undefined): Locale {
  return lang === 'pt-BR' ? 'pt-BR' : 'en';
}

export function getLocale(): Locale {
  if (current === null) current = normalize(SettingsService.get('language') as string | undefined);
  return current;
}

export function setLocale(loc: Locale): void {
  current = loc;
  SettingsService.set('language', loc);
}

/** Clears the cached locale (call in test teardown / when settings reset). */
export function resetLocale(): void {
  current = null;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  const loc = getLocale();
  let s = entry ? (entry[loc] ?? entry.en) : key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
    }
  }
  return s;
}
