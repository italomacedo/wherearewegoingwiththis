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
  'menu.sceneEditor': e('SCENE EDITOR', 'EDITOR DE CENAS'),

  // ─── Scene Editor ────────────────────────────────────────────────────────
  'editor.title': e('SCENE EDITOR', 'EDITOR DE CENAS'),
  'editor.backToMenu': e('← MENU', '← MENU'),
  'editor.newQuadrant': e('NEW QUADRANT', 'NOVO QUADRANTE'),
  'editor.newInterior': e('NEW INTERIOR', 'NOVO INTERIOR'),
  'editor.save': e('SAVE', 'SALVAR'),
  'editor.saved': e('Scene saved.', 'Cena salva.'),
  'editor.saveFailed': e('Save FAILED (Electron only).', 'FALHA ao salvar (só no Electron).'),
  'editor.load': e('LOAD', 'CARREGAR'),
  'editor.tab.models': e('Models', 'Modelos'),
  'editor.tab.items': e('Items', 'Itens'),
  'editor.tab.npcs': e('NPCs', 'NPCs'),
  'editor.tab.doors': e('Doors', 'Portas'),
  'editor.generateNpc': e('+ Generate NPC', '+ Gerar NPC'),
  'editor.addDoor': e('+ Door Trigger', '+ Gatilho de Porta'),
  'editor.delete': e('Delete', 'Excluir'),
  'editor.duplicate': e('Duplicate', 'Duplicar'),
  'editor.solid': e('Solid (collides)', 'Sólido (colide)'),
  'editor.doorTarget': e('Target scene:', 'Cena alvo:'),
  'editor.doorNoTarget': e('(no target)', '(sem alvo)'),
  'editor.ground': e('Ground', 'Chão'),
  'editor.sceneId': e('id', 'id'),
  'editor.sceneName': e('name', 'nome'),
  'editor.npcName': e('NPC name', 'Nome do NPC'),
  'editor.search': e('⌕ Search…', '⌕ Buscar…'),
  'editor.npcEdit': e('Edit NPC…', 'Editar NPC…'),
  'editor.npcEditTitle': e('EDIT NPC', 'EDITAR NPC'),
  'editor.personality': e('Personality', 'Personalidade'),
  'editor.backstory': e('Backstory', 'História'),
  'editor.routine': e('Routine', 'Rotina'),
  'editor.loadout': e('Inventory', 'Inventário'),
  'editor.relationships': e('Relationships', 'Relacionamentos'),
  'editor.addItem': e('add', 'add'),
  'editor.generatePersona': e('⚡ Generate (AI)', '⚡ Gerar (IA)'),
  'editor.generateFailed': e('AI draft failed (Electron + Claude CLI required).', 'Falha ao gerar (requer Electron + Claude CLI).'),
  'editor.hint': e('LMB select · MMB orbit · RMB pan · wheel zoom · WASD/arrows pan · Z/C orbit · R/F zoom · 1/2/3 move/rotate/scale · T turn 90° · Del · Ctrl+D · ESC menu',
    'BEM seleciona · BMM orbita · BDM pan · roda zoom · WASD/setas pan · Z/C orbita · R/F zoom · 1/2/3 mover/girar/escalar · T gira 90° · Del · Ctrl+D · ESC menu'),

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
  'options.masterVolume': e('Master Volume:', 'Volume Mestre:'),
  'options.musicVolume': e('Music Volume:', 'Volume da Música:'),
  'options.sfxVolume': e('SFX Volume:', 'Volume de SFX:'),
  'options.voiceVolume': e('Voice Volume:', 'Volume da Voz:'),
  'options.musicEnabled': e('Music:', 'Música:'),
  'options.sfxEnabled': e('Sound Effects:', 'Efeitos Sonoros:'),
  'options.ttsEnabled': e('NPC Voice (TTS):', 'Voz dos NPCs (TTS):'),
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
    'WASD move · Shift run · Z/C turn cam · E talk · T chat · I inventory · K sheet · O adjust · F vehicle · Space/Ctrl altitude · ESC pause',
    'WASD mover · Shift correr · Z/C girar câmera · E falar · T chat · I inventário · K ficha · O ajustar · F veículo · Espaço/Ctrl altitude · ESC pausar'
  ),
  'hud.talkTo': e('[E] Interact with {name}', '[E] Interagir com {name}'),
  'hud.searchTo': e('[E] Search {name}', '[E] Revistar {name}'),
  'hud.enterCar': e('[F] Enter car', '[F] Entrar no carro'),
  'hud.exitCar': e('[F] Exit car', '[F] Sair do carro'),
  'hud.pickUp': e('[E] Pick up {name}', '[E] Pegar {name}'),
  'hud.carStatus': e('CAR {pct}%', 'CARRO {pct}%'),
  'hud.carDestroyed': e('CAR DESTROYED', 'CARRO DESTRUÍDO'),
  'hud.hp': e('HP', 'HP'),
  'hud.stamina': e('STA', 'STA'),
  'hud.hunger': e('HUN', 'FOME'),
  'toast.skillGain': e('{skill} +{amount}', '{skill} +{amount}'),
  'toast.perkPoint': e('+1 Perk Point — {attr}', '+1 Ponto de Perk — {attr}'),
  'skill.checkLine': e('{skill}: {roll} vs {chance}% — {outcome}', '{skill}: {roll} vs {chance}% — {outcome}'),
  'skill.checkSuccess': e('SUCCESS', 'SUCESSO'),
  'skill.checkFailure': e('FAILURE', 'FALHA'),
  'skill.checkCrit': e('· CRITICAL', '· CRÍTICO'),

  // ─── Action ribbon (Phase 11) ────────────────────────────────────────────────
  'ribbon.attackRanged': e('Shoot', 'Atirar'),
  'ribbon.attackMelee': e('Strike', 'Golpear'),
  'ribbon.talk': e('Talk', 'Falar'),
  'ribbon.inventory': e('Inventory', 'Inventário'),
  'ribbon.characterSheet': e('Character', 'Ficha'),
  'ribbon.pda': e('PDA', 'PDA'),
  'ribbon.adjustSeat': e('Adjust Seat', 'Ajustar Assento'),

  // ─── PDA (Fase 20) ───────────────────────────────────────────────────────────
  'pda.title': e('PDA — DOSSIERS', 'PDA — DOSSIÊS'),
  'pda.close': e('Close [P]', 'Fechar [P]'),
  'pda.empty': e('No intel yet. Scan or hack someone to build a dossier.', 'Sem informações ainda. Escaneie ou hackeie alguém para montar um dossiê.'),
  'pda.role': e('Role: {role}', 'Função: {role}'),
  'pda.disposition': e('Attitude toward you: {value}', 'Atitude com você: {value}'),
  'pda.credits': e('Credits on hand: {n}', 'Créditos com ele: {n}'),
  'pda.carrying': e('Carrying: {items}', 'Carrega: {items}'),
  'pda.carryingNothing': e('Carrying nothing of note.', 'Não carrega nada de relevante.'),

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
  'item.spice': e('Spice', 'Spice'),
  'item.cyberdeck': e('Cyberdeck', 'Cyberdeck'),
  'item.credstick': e('Credstick', 'Cartão de Créditos'),
  // Armor pieces (Phase 15) — tactical (25% set) / space (50% set).
  'item.armor_tac_head': e('Tactical Helmet', 'Capacete Tático'),
  'item.armor_tac_top': e('Tactical Vest', 'Colete Tático'),
  'item.armor_tac_legs': e('Tactical Greaves', 'Perneiras Táticas'),
  'item.armor_spc_head': e('Spaceframe Helm', 'Elmo Espacial'),
  'item.armor_spc_top': e('Spaceframe Cuirass', 'Couraça Espacial'),
  'item.armor_spc_legs': e('Spaceframe Greaves', 'Perneiras Espaciais'),
  // Economy (Phase 16) — chat-driven trade + kill-contracts.
  // Skill actions (Fase 20)
  'skill.needTool': e("You lack the gear for that.", 'Você não tem o equipamento para isso.'),
  'skill.outOfRange': e('They are too far to reach.', 'Está longe demais para alcançar.'),
  'skill.noTarget': e('There is no one here to do that to.', 'Não há ninguém aqui para fazer isso.'),
  'skill.deadTarget': e('There is nothing more to be done to them.', 'Não há mais nada a fazer com ele.'),
  'skill.cannot': e("You can't pull that off here.", 'Você não consegue fazer isso aqui.'),
  'skill.wired': e('You siphon {n} credits onto your chip.', 'Você desvia {n} créditos para o seu chip.'),
  'skill.lifted': e('You lift a {item}.', 'Você surrupia {item}.'),
  'skill.scanned': e('Your deck cracks their file: {name}, {role}.', 'Seu deck abre o arquivo: {name}, {role}.'),
  'skill.crafted': e('You fashion a {item} from {n} scrap.', 'Você forja {item} com {n} de sucata.'),
  'skill.noScrap': e('Not enough scrap for that.', 'Sucata insuficiente para isso.'),
  'skill.sabotageBlows': e("{name}'s rigged gear blows in their hands!", 'O equipamento adulterado de {name} explode nas mãos dele!'),
  'skill.haggled': e('You talk them into a better price.', 'Você convence ele a um preço melhor.'),
  'skill.appraised': e('You size up the worth of your gear.', 'Você avalia o valor do seu equipamento.'),
  'skill.marketRead': e('Market read', 'Avaliação de mercado'),

  // ─── Loading screen ──────────────────────────────────────────────────────
  'loading.didyouknow': e('DID YOU KNOW?', 'VOCÊ SABIA?'),
  'loading.label.physics': e('Initializing physics…', 'Inicializando física…'),
  'loading.label.zone': e('Loading the city…', 'Carregando a cidade…'),
  'loading.label.player': e('Spawning your character…', 'Criando seu personagem…'),
  'loading.label.npcs': e('Waking up the locals…', 'Acordando os locais…'),
  'loading.label.ui': e('Setting up overlays…', 'Configurando overlays…'),
  'loading.label.done': e('Ready.', 'Pronto.'),

  'economy.bought': e('Bought {item} for {price} credits.', 'Comprou {item} por {price} créditos.'),
  'economy.noCredits': e("You can't afford that.", 'Você não tem créditos suficientes.'),
  'economy.missionAccepted': e('Contract accepted: take out {target}.', 'Contrato aceito: elimine {target}.'),
  'economy.missionComplete': e('Contract paid out by {giver}.', 'Contrato pago por {giver}.'),
  'economy.standingImproved': e('Your standing with {giver} improved.', 'Sua reputação com {giver} melhorou.'),
  'economy.missionDeclined': e('Contract declined.', 'Contrato recusado.'),
  'economy.missionCancelled': e("Contract cancelled. {giver} won't forget this.", 'Contrato cancelado. {giver} não vai esquecer.'),
  'economy.targetStillAlive': e("{target} is still walking around.", '{target} ainda está por aí.'),
  'economy.haggled': e('Haggled — {item} now {price} cr.', 'Pechinchou — {item} agora {price} cr.'),
  'economy.haggleFailed': e("The price stands.", 'O preço está firme.'),
  'economy.commerceDiscoveryHint': e('They have stock to offer — ask about prices.', 'Eles têm mercadoria — pergunte os preços.'),
  'pda.sellsFor': e('Sells {item} for {price} cr.', 'Vende {item} por {price} cr.'),
  'economy.itemNotForSale': e("They don't carry that — no deal.", 'Eles não têm isso à venda — nada feito.'),
  'economy.deceasedNpc': e("They don't answer. They're dead.", 'Eles não respondem. Estão mortos.'),
  // Spice-trafficking job (Fase 22).
  'spice.bought': e('Bought {qty}× spice for {price} credits.', 'Comprou {qty}× spice por {price} créditos.'),
  'spice.sold': e('Sold {qty}× spice for {price} credits.', 'Vendeu {qty}× spice por {price} créditos.'),
  'spice.noSpiceToSell': e("You have no spice to move.", 'Você não tem spice para passar adiante.'),
  'spice.buyerBroke': e("They want it, but they're tapped out.", 'Eles querem, mas estão sem grana.'),
  'spice.notDealer': e("They're not moving any spice for you.", 'Eles não vão te passar spice nenhuma.'),
  'spice.notAddict': e("They're not a user — they won't touch it.", 'Eles não usam — não vão chegar perto disso.'),
  'spice.outOfStock': e("They're out of spice right now.", 'Eles estão sem spice no momento.'),
  'spice.cantAfford': e("You can't even cover one dose.", 'Você não cobre nem uma dose.'),
  'spice.reported': e('You tell {giver} you moved it all. They respect that.', 'Você diz a {giver} que passou tudo. Eles respeitam isso.'),
  'spice.noContract': e("You have no spice running for them.", 'Você não tem spice rolando pra eles.'),
  'spice.haggledUp': e('Haggled the spice up to {price} cr/dose.', 'Negociou a spice para {price} cr/dose.'),
  'spice.haggledDown': e('Haggled the spice down to {price} cr/dose.', 'Pechinchou a spice para {price} cr/dose.'),
  'spice.haggleFailed': e("They won't budge on the price.", 'Eles não cedem no preço.'),
  'spice.quotedBuy': e('{qty} doses of spice offered at {price} cr each.', '{qty} doses de spice oferecidas a {price} cr cada.'),
  'spice.quotedSell': e('They size up your spice — ~{price} cr a dose.', 'Eles avaliam sua spice — ~{price} cr a dose.'),

  // ─── Dialog ────────────────────────────────────────────────────────────────
  'dialog.openChannel': e('Open channel', 'Canal aberto'),
  'dialog.inputPlaceholder': e('Speak, or *perform an action*…', 'Fale, ou *realize uma ação*…'),
  'dialog.send': e('SEND', 'ENVIAR'),
  'dialog.cantSay': e("You can't say or do that.", 'Você não pode dizer ou fazer isso.'),
  'dialog.noReply': e(
    '( … no reply. Is the Claude CLI path set in Options → Game? )',
    '( … sem resposta. O caminho do Claude CLI está definido em Opções → Jogo? )'
  ),

  // ─── Roxane (car AI dashboard status) ──────────────────────────────────────
  'roxane.online': e('ROXANE  ·  ONLINE', 'ROXANE  ·  ONLINE'),
  'roxane.listening': e('ROXANE  ·  LISTENING…', 'ROXANE  ·  OUVINDO…'),
  'roxane.speaking': e('ROXANE  ·  ▮▮▮ SPEAKING', 'ROXANE  ·  ▮▮▮ FALANDO'),

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
  'creator.partHead': e('Head', 'Cabeça'),
  'creator.partTop': e('Top', 'Parte de Cima'),
  'creator.partBottom': e('Bottom', 'Parte de Baixo'),
  'creator.topColor': e('Top Color', 'Cor de Cima'),
  'creator.bottomColor': e('Bottom Color', 'Cor de Baixo'),
  'creator.hairColor': e('Hair Color', 'Cor do Cabelo'),
  'creator.headOriginal': e('Head Colors', 'Cores da Cabeça'),
  'creator.topOriginal': e('Top Colors', 'Cores de Cima'),
  'creator.bottomOriginal': e('Bottom Colors', 'Cores de Baixo'),
  'creator.original': e('Original', 'Original'),
  'creator.custom': e('Custom', 'Personalizado'),
  'creator.attributes': e('ATTRIBUTES — click to cycle: 20% → 30% ◆ → 40% ★ → 20%', 'ATRIBUTOS — clique para ciclar: 20% → 30% ◆ → 40% ★ → 20%'),
  'creator.startingSkills': e('STARTING SKILLS', 'SKILLS INICIAIS'),
  'creator.skillCounter': e('Majors {majors}/2 · Minors {minors}/3', 'Maiores {majors}/2 · Menores {minors}/3'),
  'creator.tier1Perks': e('TIER-1 PERKS', 'PERKS DE TIER 1'),
  'creator.perks': e('PERKS — choose one per unlocked tier', 'PERKS — escolha um por tier desbloqueado'),
  'creator.perkTierHeader': e('{attr} — Tier {tier}', '{attr} — Tier {tier}'),

  // ─── Attributes ────────────────────────────────────────────────────────────
  'attr.forca': e('Strength', 'Força'),
  'attr.destreza': e('Dexterity', 'Destreza'),
  'attr.inteligencia': e('Intelligence', 'Inteligência'),
  'attr.carisma': e('Charisma', 'Carisma'),
  'attr.forca.desc': e(
    'Raw physical power and toughness. Scales melee damage (+1 per 10 pts). Governs Melee Combat, Athletics, Endurance.',
    'Força bruta e resistência física. Escala o dano corpo-a-corpo (+1 a cada 10 pts). Rege Combate C-a-C, Atletismo, Resistência.'),
  'attr.destreza.desc': e(
    'Speed, reflexes, and precision. Sets combat Action Points; scales ranged damage. Governs Firearms, Stealth, Piloting, Perception.',
    'Velocidade, reflexos e precisão. Define os Pontos de Ação no combate; escala dano à distância. Rege Armas de Fogo, Furtividade, Pilotagem, Percepção.'),
  'attr.inteligencia.desc': e(
    'Analytical capacity and technical knowledge. Governs IT, Engineering, and Medicine checks.',
    'Capacidade analítica e conhecimento técnico. Rege verificações de TI, Engenharia e Medicina.'),
  'attr.carisma.desc': e(
    'Presence, persuasion, and social influence. Governs Persuasion, Intimidation, and Commerce checks.',
    'Presença, persuasão e influência social. Rege verificações de Persuasão, Intimidação e Comércio.'),

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
  'skill.combate_corpo_a_corpo.desc': e(
    'Unarmed and bladed close-quarters fighting. Determines hit chance in melee combat. Grows by fighting.',
    'Combate desarmado e com lâminas. Determina a chance de acerto no combate melee. Cresce lutando.'),
  'skill.atletismo.desc': e(
    'Physical prowess: running, jumping, climbing. Increases sprint speed.',
    'Proeza física: correr, saltar, escalar. Aumenta a velocidade de corrida.'),
  'skill.resistencia.desc': e(
    'Stamina and tolerance to pain and toxins. Affects endurance and survival checks.',
    'Resistência a esforço, dor e toxinas. Afeta verificações de sobrevivência.'),
  'skill.armas_de_fogo.desc': e(
    'Proficiency with ranged weapons. Determines hit chance in ranged combat.',
    'Proficiência com armas de fogo. Determina a chance de acerto no combate à distância.'),
  'skill.furtividade.desc': e(
    'Moving unseen and unheard through hostile territory. Used in stealth checks.',
    'Mover-se sem ser visto ou ouvido. Usado em verificações de furtividade.'),
  'skill.pilotagem.desc': e(
    'Operating vehicles safely and at high speed. Increases vehicle max speed.',
    'Operar veículos com segurança e em alta velocidade. Aumenta a velocidade máxima do veículo.'),
  'skill.percepcao.desc': e(
    'Awareness of surroundings and threat detection. Sets defense value against attacks.',
    'Consciência situacional e detecção de ameaças. Define o valor de defesa contra ataques.'),
  'skill.tecnologia_informacao.desc': e(
    'Hacking networks and cracking security systems. Used in digital intrusion checks.',
    'Hackear redes e sistemas de segurança. Usado em verificações de intrusão digital.'),
  'skill.engenharia.desc': e(
    'Building, repairing, and modifying gear. Used in crafting and repair checks.',
    'Construir, reparar e modificar equipamentos. Usado em verificações de criação e reparo.'),
  'skill.medicina.desc': e(
    'First aid, diagnosis, and emergency treatment. Used in self-diagnosis and healing checks.',
    'Primeiros socorros, diagnóstico e tratamento de emergência. Usado em diagnóstico e cura.'),
  'skill.persuasao.desc': e(
    'Convincing others through argument or charm. Used in negotiation and diplomacy.',
    'Convencer com argumentos ou charme. Usado em negociação e diplomacia.'),
  'skill.intimidacao.desc': e(
    'Making others comply through fear or authority. Used in coercion checks.',
    'Fazer outros obedecerem por medo ou autoridade. Usado em verificações de coerção.'),
  'skill.comercio.desc': e(
    'Buying, selling, and reading markets. Affects trade and commerce interactions.',
    'Comprar, vender e analisar mercados. Afeta interações de comércio.'),

  // ─── Character sheet (Phase 19) ────────────────────────────────────────────
  'sheet.title': e('CHARACTER SHEET', 'FICHA DO PERSONAGEM'),
  'sheet.attributes': e('ATTRIBUTES', 'ATRIBUTOS'),
  'sheet.skills': e('SKILLS', 'SKILLS'),
  'sheet.perks': e('PERKS', 'PERKS'),
  'sheet.close': e('Close [K]', 'Fechar [K]'),
  'sheet.perkPoints': e('Available points: {n}', 'Pontos disponíveis: {n}'),
  'sheet.locked': e('Locked (need {pct}% {attr})', 'Bloqueado (requer {pct}% em {attr})'),
  'sheet.pick': e('Pick', 'Escolher'),
  'sheet.chosen': e('Chosen', 'Escolhido'),
  'sheet.tierN': e('Tier {n}', 'Tier {n}'),
  'sheet.perkPointHint': e('⬆ K — perk point available', '⬆ K — ponto de perk disponível'),
  'creator.descHint': e('Select a skill, attribute, or perk to see its description.', 'Selecione uma skill, atributo ou perk para ver a descrição.'),

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

  // ─── Perk descriptions (id.desc → flavor + effect) ────────────────────────
  'perk.forca_t1_punho_calejado.desc': e('Unarmed strikes deal slightly more damage.', 'Golpes desarmados doem um pouco mais.'),
  'perk.forca_t1_folego_de_rua.desc': e('Run and carry loads for longer without tiring.', 'Corre e carrega por mais tempo sem cansar.'),
  'perk.forca_t2_pancada_firme.desc': e('Heavy blows have a chance to stun the target.', 'Golpes pesados têm chance de atordoar o alvo.'),
  'perk.forca_t2_equilibrio_felino.desc': e('Harder to knock down or push back.', 'Mais difícil de derrubar ou empurrar.'),
  'perk.forca_t3_quebra_guarda.desc': e('Ignores part of the target\'s melee defense.', 'Ignora parte da defesa corpo-a-corpo do alvo.'),
  'perk.forca_t3_limiar_de_dor.desc': e('Keep fighting effectively even when badly hurt.', 'Continua lutando bem mesmo gravemente ferido.'),
  'perk.forca_t4_investida_brutal.desc': e('Charge forward, hurling nearby enemies aside.', 'Avança e arremessa inimigos próximos.'),
  'perk.forca_t4_pele_de_couro.desc': e('Reduce incoming physical damage.', 'Reduz o dano físico recebido.'),
  'perk.forca_t5_furia_cibernetica.desc': e('Burst of strength that briefly multiplies damage.', 'Surto de força que multiplica o dano por instantes.'),
  'perk.forca_t5_tanque_de_carne.desc': e('Greatly increased max HP and toughness.', 'Vida máxima e resistência muito ampliadas.'),
  'perk.destreza_t1_dedos_leves.desc': e('Small bonus to pickpocketing and lockpicking.', 'Pequeno bônus ao furtar e arrombar.'),
  'perk.destreza_t1_passo_macio.desc': e('Make less noise while moving.', 'Faz menos ruído ao se mover.'),
  'perk.destreza_t2_mira_estavel.desc': e('Less spread when firing from a standstill.', 'Menos dispersão ao atirar parado.'),
  'perk.destreza_t2_reflexo_rapido.desc': e('Improved initiative and dodge in combat.', 'Melhora a iniciativa e a esquiva no combate.'),
  'perk.destreza_t3_saque_veloz.desc': e('Draw and reload weapons faster.', 'Saca e recarrega armas mais rápido.'),
  'perk.destreza_t3_sombra.desc': e('Stay hidden for longer while moving.', 'Permanece oculto por mais tempo em movimento.'),
  'perk.destreza_t4_tiro_certeiro.desc': e('Increased critical hit chance at range.', 'Chance ampliada de acerto crítico à distância.'),
  'perk.destreza_t4_piloto_nato.desc': e('Vehicles handle better and take less damage.', 'Veículos respondem melhor e sofrem menos dano.'),
  'perk.destreza_t5_bullet_time.desc': e('Time seems to slow while aiming.', 'O tempo parece desacelerar ao mirar.'),
  'perk.destreza_t5_fantasma.desc': e('Almost undetectable while crouching.', 'Quase indetectável enquanto agachado.'),
  'perk.inteligencia_t1_olho_clinico.desc': e('Read vitals and statuses with greater clarity.', 'Lê sinais vitais e estados com mais clareza.'),
  'perk.inteligencia_t1_bricolagem.desc': e('Repair simple items using scrap.', 'Conserta itens simples com sucata.'),
  'perk.inteligencia_t2_leitura_de_rede.desc': e('Detect hackable nodes and cameras nearby.', 'Detecta nós e câmeras hackeáveis por perto.'),
  'perk.inteligencia_t2_improviso_tecnico.desc': e('Craft useful improvised tools in the field.', 'Fabrica gambiarras úteis em campo.'),
  'perk.inteligencia_t3_intrusao.desc': e('Breach systems with less resistance.', 'Invade sistemas com menos resistência.'),
  'perk.inteligencia_t3_cirurgiao_de_campo.desc': e('Stabilize and heal serious wounds.', 'Estabiliza e cura ferimentos graves.'),
  'perk.inteligencia_t4_daemon.desc': e('Plant routines that weaken networked targets.', 'Implanta rotinas que enfraquecem alvos em rede.'),
  'perk.inteligencia_t4_engenheiro_chefe.desc': e('Create and upgrade advanced equipment.', 'Cria e melhora equipamentos avançados.'),
  'perk.inteligencia_t5_netrunner.desc': e('Master of cyberspace; intrusions nearly trivial.', 'Domina o ciberespaço; intrusões quase triviais.'),
  'perk.inteligencia_t5_tecnomante.desc': e('Control multiple systems simultaneously.', 'Controla múltiplos sistemas ao mesmo tempo.'),
  'perk.carisma_t1_labia.desc': e('Small bonus when persuading others.', 'Pequeno bônus ao persuadir.'),
  'perk.carisma_t1_cara_de_pau.desc': e('Lie with greater conviction.', 'Mente com mais convicção.'),
  'perk.carisma_t2_pechincha.desc': e('Better prices when buying and selling.', 'Melhores preços ao comprar e vender.'),
  'perk.carisma_t2_presenca.desc': e('Make yourself noticed and respected in a room.', 'Faz-se notar e respeitar numa sala.'),
  'perk.carisma_t3_manipulador.desc': e('Sway others\' attitudes in your favour.', 'Inclina atitudes alheias a seu favor.'),
  'perk.carisma_t3_intimidador.desc': e('Make enemies hesitate or back down.', 'Faz inimigos hesitarem ou recuarem.'),
  'perk.carisma_t4_negociador_frio.desc': e('Close deals even under pressure.', 'Fecha acordos mesmo sob pressão.'),
  'perk.carisma_t4_carisma_magnetico.desc': e('Attract allies and goodwill easily.', 'Atrai aliados e simpatia com facilidade.'),
  'perk.carisma_t5_mente_mestra.desc': e('Orchestrate people like pieces of a plan.', 'Orquestra pessoas como peças de um plano.'),
  'perk.carisma_t5_idolo_da_rua.desc': e('Your reputation opens doors across the city.', 'Sua reputação abre portas em toda a cidade.'),
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
