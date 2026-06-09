import { PromptBuilder, WorldSnapshot, PromptInputs } from '../../../../src/systems/npc/PromptBuilder';
import { NPCDefinition } from '../../../../src/entities/NPCAgent';

const def: NPCDefinition = {
  id: 'npc_test',
  name: 'Zara',
  role: 'vendor',
  location: 'Stall 7',
  personalityPrompt: 'Wary but fair.',
  defaultMood: 'suspicious',
  interactionRadius: 8,
  conversationRadius: 3,
  position: [0, 0, 0],
};

const world: WorldSnapshot = {
  cityName: 'NeoBeiraRio',
  gameTime: '14:30, day 1',
  playerName: 'Kai',
  distanceMeters: 2.4,
  playerAction: 'idle',
  recentEvents: [],
};

const baseInputs: PromptInputs = {
  definition: def,
  mood: 'suspicious',
  world,
  history: [],
  playerMessage: 'Got any data chips?',
};

describe('PromptBuilder', () => {
  describe('buildStateless', () => {
    it('includes NPC name, role, and city', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).toContain('Zara');
      expect(p).toContain('vendor');
      expect(p).toContain('NeoBeiraRio');
    });

    it('includes personality and mood', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).toContain('Wary but fair.');
      expect(p).toContain('suspicious');
    });

    it('includes player name and message', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).toContain('Kai');
      expect(p).toContain('Got any data chips?');
    });

    it('includes rounded distance and action', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).toContain('2m away');
      expect(p).toContain('idle');
    });

    it('includes recent events when present', () => {
      const p = PromptBuilder.buildStateless({
        ...baseInputs,
        world: { ...world, recentEvents: ['a fight broke out', 'sirens passed'] },
      });
      expect(p).toContain('a fight broke out');
    });

    it('omits recent events section when empty', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).not.toContain('Recent events you witnessed');
    });

    it('includes conversation history when present', () => {
      const p = PromptBuilder.buildStateless({
        ...baseInputs,
        history: [{ player: 'hi', npc: 'what do you want' }],
      });
      expect(p).toContain('Conversation so far:');
      expect(p).toContain('what do you want');
    });

    it('limits recent events to 3', () => {
      const p = PromptBuilder.buildStateless({
        ...baseInputs,
        world: { ...world, recentEvents: ['e1', 'e2', 'e3', 'e4', 'e5'] },
      });
      expect(p).toContain('e3');
      expect(p).not.toContain('e4');
    });

    it('instructs English, in-character, no AI mention', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).toContain('English');
      expect(p).toContain('mention being an AI');
    });

    it('instructs the NPC to reply in the world language when set', () => {
      const p = PromptBuilder.buildStateless({ ...baseInputs, world: { ...world, language: 'Brazilian Portuguese' } });
      expect(p).toContain('Brazilian Portuguese');
    });

    it('explains that *asterisks* are player actions/emotes', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).toContain('*asterisks*');
      expect(p).toContain('action');
    });
  });

  describe('persona identity injection (who/what/where)', () => {
    const richDef: NPCDefinition = {
      ...def,
      home: 'a capsule flat above the noodle bar',
      backstory: 'lost her brother to a corpo data-raid',
      routine: 'works the stall from dusk till the small hours',
      relationships: 'owes a favour to Old Mback',
      initialDisposition: 'wary',
    };

    it('injects home/backstory/routine/relationships into the stateless prompt', () => {
      const p = PromptBuilder.buildStateless({ ...baseInputs, definition: richDef });
      expect(p).toContain('Where you live: a capsule flat above the noodle bar');
      expect(p).toContain('Your background: lost her brother to a corpo data-raid');
      expect(p).toContain('Your routine: works the stall from dusk till the small hours');
      expect(p).toContain('People in your life: owes a favour to Old Mback');
    });

    it('injects identity into buildStaticPersona (sent as --system-prompt)', () => {
      const persona = PromptBuilder.buildStaticPersona(richDef, 'English', 'NeoBeiraRio');
      expect(persona).toContain('Where you live: a capsule flat above the noodle bar');
      expect(persona).toContain('Your routine: works the stall from dusk till the small hours');
    });

    it('omits identity lines entirely when the NPC defines none', () => {
      const p = PromptBuilder.buildStateless(baseInputs);
      expect(p).not.toContain('Where you live:');
      expect(p).not.toContain('Your background:');
      expect(p).not.toContain('Your routine:');
      expect(p).not.toContain('People in your life:');
    });
  });

  describe('buildModerationPrompt', () => {
    it('asks for a one-word ALLOW/BLOCK verdict and includes the message', () => {
      const p = PromptBuilder.buildModerationPrompt('got any chips?');
      expect(p).toContain('ALLOW or BLOCK');
      expect(p).toContain('got any chips?');
    });

    it('allows fictional cyberpunk content explicitly', () => {
      const p = PromptBuilder.buildModerationPrompt('x');
      expect(p).toContain('ALLOW');
      expect(p).toContain('crime');
    });
  });

  describe('buildActionClassifierPrompt', () => {
    it('asks for the structured lines and includes the message + skill/attr lists', () => {
      const p = PromptBuilder.buildActionClassifierPrompt('*picks the lock*');
      expect(p).toContain('VERDICT=DETERMINISTIC or NARRATIVE');
      expect(p).toContain('SKILL=');
      expect(p).toContain('ATTR=');
      expect(p).toContain('DIFF=');
      expect(p).toContain('EFFECT='); // Fase 20 mechanical effect
      expect(p).toContain('TARGET2=');
      expect(p).toContain('DIR=');
      expect(p).toContain('picks the lock');
      expect(p).toContain('armas_de_fogo'); // a real skill id is listed
      expect(p).toContain('inteligencia'); // a real attribute id is listed
    });
    it('teaches the slim Fase 21 emote vocabulary (14 verbs incl. narrative)', () => {
      const p = PromptBuilder.buildActionClassifierPrompt('*action*');
      // Slim vocab — these MUST appear in the EFFECT list.
      [
        'attack', 'steal', 'info', 'coerce', 'medicine_treat', 'sabotage', 'repair', 'craft',
        'persuade', 'intimidate', 'disarm', 'medicine_check', 'narrate_time', 'narrative',
      ].forEach((v) => expect(p).toContain(v));
    });
    it('no longer teaches the legacy verbs (Fase 21 slim — relationship/disposition/haggle/appraise/traverse/none)', () => {
      const p = PromptBuilder.buildActionClassifierPrompt('*action*');
      // The EFFECT= line lists vocab — legacy names must NOT appear there.
      // We do this by grabbing only the EFFECT line and asserting against it
      // (the legacy words could appear elsewhere as English text, e.g. "relationship" in
      // a context line — what matters is that they aren't in the vocabulary list).
      const effectLine = p.split('\n').find((l) => l.startsWith('EFFECT='))!;
      expect(effectLine).not.toContain('relationship');
      expect(effectLine).not.toContain('disposition');
      expect(effectLine).not.toContain('haggle');
      expect(effectLine).not.toContain('appraise');
      expect(effectLine).not.toContain('traverse');
      // 'none' is renamed to 'narrative' — must NOT be in EFFECT= options anymore.
      expect(effectLine).not.toContain(' none ');
      expect(effectLine).not.toMatch(/\bnone\b/);
    });
  });

  describe('buildOutcomeNarrationPrompt', () => {
    it('frames success vs failure and forbids numbers/mechanics', () => {
      expect(PromptBuilder.buildOutcomeNarrationPrompt('*pick the lock*', true)).toContain('SUCCEEDS');
      const fail = PromptBuilder.buildOutcomeNarrationPrompt('*pick the lock*', false);
      expect(fail).toContain('FAILS');
      expect(fail).toContain('pick the lock');
    });

    it('lifts a critical success to a "show-stopping" tone', () => {
      const crit = PromptBuilder.buildOutcomeNarrationPrompt('*pick the lock*', true, 'English', true);
      expect(crit).toMatch(/SUCCEEDS SPECTACULARLY|show-stopping/);
      // Critical narration is reserved for SUCCESS only; failure path stays plain.
      const failCritArg = PromptBuilder.buildOutcomeNarrationPrompt('*pick the lock*', false, 'English', true);
      // The crit flag still adds the spectacular tone (caller is responsible for
      // only passing critical=true on a success). Still must mention what to do.
      expect(failCritArg).toContain('Narrate');
    });
  });

  describe('buildAmbientReactionPrompt', () => {
    it('includes time, setting, and the player line', () => {
      const p = PromptBuilder.buildAmbientReactionPrompt('look around', '22:00 (night)', 'a rainy street');
      expect(p).toContain('22:00 (night)');
      expect(p).toContain('a rainy street');
      expect(p).toContain('look around');
    });
  });

  describe('buildCombatNarrationPrompt', () => {
    it('embeds the beat, sets the language, and forbids mechanics', () => {
      const p = PromptBuilder.buildCombatNarrationPrompt('Hero lands a hit on Zara.', 'Portuguese');
      expect(p).toContain('Hero lands a hit on Zara.');
      expect(p).toContain('Portuguese');
      expect(p).toContain('No dice');
    });
    it('defaults to English', () => {
      expect(PromptBuilder.buildCombatNarrationPrompt('Zara reloads.')).toContain('in English');
    });
  });

  describe('buildStaticPersona', () => {
    it('includes name, role, location, personality, and response rules', () => {
      const p = PromptBuilder.buildStaticPersona(def, 'English', 'NeoBeiraRio');
      expect(p).toContain('Zara');
      expect(p).toContain('vendor');
      expect(p).toContain('NeoBeiraRio');
      expect(p).toContain('Wary but fair.');
      expect(p).toContain('English');
      expect(p).toContain('mention being an AI');
      // Anti-hallucination: the only mission is a kill-contract on a present rival.
      expect(p).toContain('Never invent jobs');
    });

    it('uses the provided language', () => {
      const p = PromptBuilder.buildStaticPersona(def, 'Brazilian Portuguese', 'NeoBeiraRio');
      expect(p).toContain('Brazilian Portuguese');
    });

    it('includes identity lines when present', () => {
      const richDef2 = { ...def, home: 'a capsule above the noodle bar', backstory: 'lost everything' };
      const p = PromptBuilder.buildStaticPersona(richDef2, 'English', 'NeoBeiraRio');
      expect(p).toContain('Where you live: a capsule above the noodle bar');
      expect(p).toContain('Your background: lost everything');
    });

    it('does NOT include dynamic context (mood, game time, message)', () => {
      const p = PromptBuilder.buildStaticPersona(def, 'English', 'NeoBeiraRio');
      expect(p).not.toContain('mood');
      expect(p).not.toContain('Game time');
      expect(p).not.toContain('Player:');
    });
  });

  describe('buildDynamicContext', () => {
    it('includes mood, game time, distance, and player message', () => {
      const p = PromptBuilder.buildDynamicContext(baseInputs);
      expect(p).toContain('suspicious');
      expect(p).toContain('14:30, day 1');
      expect(p).toContain('2m away');
      expect(p).toContain('Got any data chips?');
    });

    it('does NOT include the NPC persona or personality', () => {
      const p = PromptBuilder.buildDynamicContext(baseInputs);
      expect(p).not.toContain('Wary but fair.');
      expect(p).not.toContain('English');
    });

    it('includes history when present', () => {
      const p = PromptBuilder.buildDynamicContext({
        ...baseInputs,
        history: [{ player: 'hi', npc: 'what do you want' }],
      });
      expect(p).toContain('Conversation so far:');
      expect(p).toContain('what do you want');
    });

    it('lists nearby NPCs physically present with the speaker (so they know who is here)', () => {
      const p = PromptBuilder.buildDynamicContext({
        ...baseInputs,
        world: {
          ...baseInputs.world,
          nearbyNpcs: [
            { id: 'npc_mback', name: 'Mback', distanceMeters: 1.4, relationship: 'hostile' },
            { id: 'npc_tek', name: 'Tek', distanceMeters: 6.7, relationship: 'neutral' },
          ],
        },
      });
      expect(p).toContain('Also physically present with you right now');
      expect(p).toContain('Mback (1m, you see them as hostile)');
      expect(p).toContain('Tek (7m, you see them as neutral)');
    });

    it('omits the nearby-NPC line when no one else is present (clean prompt)', () => {
      const p = PromptBuilder.buildDynamicContext({
        ...baseInputs,
        world: { ...baseInputs.world, nearbyNpcs: [] },
      });
      expect(p).not.toContain('Also physically present');
    });

    it('renders a replyDirective LAST, after the player line, as a high-priority DIRECTOR note', () => {
      const p = PromptBuilder.buildDynamicContext({
        ...baseInputs,
        world: { ...baseInputs.world, replyDirective: 'Offer them the contract on Mback for 100 credits.' },
      });
      expect(p).toContain('[DIRECTOR');
      expect(p).toContain('Offer them the contract on Mback for 100 credits.');
      expect(p).toContain('Do not deflect');
      // It must come AFTER the player's message so the model acts on it.
      expect(p.indexOf('[DIRECTOR')).toBeGreaterThan(p.indexOf('Got any data chips?'));
    });

    it('omits the DIRECTOR note when there is no directive', () => {
      const p = PromptBuilder.buildDynamicContext(baseInputs);
      expect(p).not.toContain('[DIRECTOR');
    });
  });

  describe('buildCommerceContext (Phase 16)', () => {
    it('lists sellable items with prices + rivals + reward, and a gating instruction', () => {
      const p = PromptBuilder.buildCommerceContext({
        sellable: [{ name: 'Knife', price: 12 }],
        rivals: ['Mback'],
        payableCredits: 20,
        payableItems: ['Medkit'],
      });
      expect(p).toContain('Knife (12 cr)');
      expect(p).toContain('Mback');
      expect(p).toContain('20 credits');
      expect(p).toContain('Medkit');
      expect(p).toContain('leads there');
      // The contract is bounded to killing a present rival — no invented heists.
      expect(p).toContain('KILLING');
      expect(p).toContain('Do NOT invent');
      // Fase 21 fix: NPCs must quote literal prices + not invent stock.
      expect(p).toMatch(/EXACTLY|exactly/);
      expect(p).toMatch(/never invent/i);
    });
    it('returns empty when nothing to sell and no rivals', () => {
      expect(PromptBuilder.buildCommerceContext({ sellable: [], rivals: [], payableCredits: 0, payableItems: [] })).toBe('');
    });
    it('a rival with no payable reward falls back to "a favour"', () => {
      const p = PromptBuilder.buildCommerceContext({ sellable: [], rivals: ['Rook'], payableCredits: 0, payableItems: [] });
      expect(p).toContain('Rook');
      expect(p).toContain('a favour');
    });
  });

  describe('buildSpiceContext (Fase 22)', () => {
    it('floats a shipment for a willing dealer with the price + lot', () => {
      const p = PromptBuilder.buildSpiceContext({ offer: true, crave: false, awaitingReport: false, buyPrice: 7, lot: 5 });
      expect(p).toContain('SPICE');
      expect(p).toContain('5 doses');
      expect(p).toContain('7 cr');
      expect(p).toContain('leads there');
    });
    it('nudges for a report when a contract is unsettled', () => {
      const p = PromptBuilder.buildSpiceContext({ offer: false, crave: false, awaitingReport: true, buyPrice: 0, lot: 0 });
      expect(p).toMatch(/moved it all/i);
    });
    it('hints an addict would buy', () => {
      const p = PromptBuilder.buildSpiceContext({ offer: false, crave: true, awaitingReport: false, buyPrice: 0, lot: 0 });
      expect(p).toMatch(/buy any the player is holding/i);
    });
    it('is empty when no lever applies', () => {
      expect(PromptBuilder.buildSpiceContext({ offer: false, crave: false, awaitingReport: false, buyPrice: 0, lot: 0 })).toBe('');
    });
  });

  describe('buildVerbalClassifierPrompt (Fase 21)', () => {
    it('asks for the 5 fixed lines and lists the full verb vocabulary', () => {
      const p = PromptBuilder.buildVerbalClassifierPrompt(
        'Got any work?', 'Zara', ['knife'], ['npc_mback'],
      );
      // Required output shape
      expect(p).toContain('VERB=');
      expect(p).toContain('TARGET=');
      expect(p).toContain('ITEM=');
      expect(p).toContain('PRICE=');
      expect(p).toContain('DIR=');
      // All verbs listed (incl. the Fase 22 spice job)
      const verbs = [
        'job_request', 'job_claim', 'job_accept', 'job_decline', 'job_cancel',
        'spice_buy', 'spice_sell', 'spice_report',
        'commerce_discovery', 'commerce_pricing', 'commerce_haggle', 'commerce_buy', 'commerce_sell',
        'manipulate', 'persuade', 'intimidate', 'info', 'narrative',
      ];
      verbs.forEach((v) => expect(p).toContain(v));
      // Context lists
      expect(p).toContain('knife');
      expect(p).toContain('npc_mback');
      expect(p).toContain('Zara');
      expect(p).toContain('Got any work?');
    });

    it('lists "none" when sellable/rival lists are empty', () => {
      const p = PromptBuilder.buildVerbalClassifierPrompt('Hi.', 'Zara', [], []);
      expect(p).toContain('Sellable item ids: none');
      expect(p).toContain('Rival npc ids');
      expect(p).toContain(': none');
    });

    it('explains each verb category briefly so the classifier disambiguates', () => {
      const p = PromptBuilder.buildVerbalClassifierPrompt('msg', 'Zara', [], []);
      expect(p).toMatch(/job_request:/i);
      expect(p).toMatch(/commerce_haggle:/i);
      expect(p).toMatch(/manipulate:/i);
      expect(p).toMatch(/info:/i);
      expect(p).toMatch(/narrative:/i);
    });

    it('reports pending offers from the NPC so accept/decline disambiguate', () => {
      const p = PromptBuilder.buildVerbalClassifierPrompt(
        "I'm in", 'Zara', ['knife'], ['npc_mback'],
        [{ kind: 'mission', status: 'pending', targetId: 'npc_mback' }, { kind: 'trade', itemId: 'knife' }],
      );
      expect(p).toContain('On file with this NPC');
      expect(p).toContain('pending mission offer(kill npc_mback)');
      expect(p).toContain('pending trade offer(knife)');
    });

    it('reports an ACTIVE accepted contract so claim/cancel disambiguate', () => {
      const p = PromptBuilder.buildVerbalClassifierPrompt(
        'It is done, pay up', 'Zara', [], ['npc_mback'],
        [{ kind: 'mission', status: 'active', targetId: 'npc_mback' }],
      );
      expect(p).toContain('ACTIVE contract you accepted (kill npc_mback)');
      expect(p).toContain('claimable/cancellable');
    });

    it('reports "No pending offers" when the list is empty', () => {
      const p = PromptBuilder.buildVerbalClassifierPrompt('Hi.', 'Zara', [], []);
      expect(p).toContain('No pending offers or active contracts with this NPC');
    });
  });

  describe('buildCommerceClassifierPrompt (Phase 16)', () => {
    it('asks for the 6 fixed lines and lists valid ids + both messages', () => {
      const p = PromptBuilder.buildCommerceClassifierPrompt('I can sell you a knife.', 'deal', ['knife'], ['zara']);
      expect(p).toContain('OFFER=trade or mission or none');
      expect(p).toContain('ITEM=');
      expect(p).toContain('TARGET=');
      expect(p).toContain('REWARD_CREDITS=');
      expect(p).toContain('ACCEPT=yes or no');
      expect(p).toContain('knife');
      expect(p).toContain('zara');
      expect(p).toContain('deal');
    });
    it('lists "none" when there are no sellable ids or rivals', () => {
      const p = PromptBuilder.buildCommerceClassifierPrompt('hello', 'hi', [], []);
      expect(p).toContain('Sellable ids: none');
      expect(p).toContain('Rival ids: none');
    });
  });

  describe('buildSessionPrimer', () => {
    it('includes dynamic context (mood + player name) and history', () => {
      const primer = PromptBuilder.buildSessionPrimer({
        definition: def,
        mood: 'suspicious',
        world,
        history: [{ player: 'hi', npc: 'hello there' }],
      });
      expect(primer).toContain('suspicious');
      expect(primer).toContain('hello there');
    });

    it('does NOT include NPC persona (sent separately as --system-prompt)', () => {
      const primer = PromptBuilder.buildSessionPrimer({
        definition: def, mood: 'suspicious', world, history: [],
      });
      expect(primer).not.toContain('Wary but fair.');
      expect(primer).not.toContain('vendor');
    });

    it('omits history section when empty', () => {
      const primer = PromptBuilder.buildSessionPrimer({
        definition: def, mood: 'suspicious', world, history: [],
      });
      expect(primer).not.toContain('conversation so far');
    });
  });

  describe('buildSessionTurn', () => {
    it('is compact: action context + player message', () => {
      const turn = PromptBuilder.buildSessionTurn(world, 'where are the chips');
      expect(turn).toContain('where are the chips');
      expect(turn).toContain('idle');
      expect(turn.length).toBeLessThan(200);
    });

    it('carries a replyDirective so a graduated NPC still obeys the staged outcome', () => {
      const turn = PromptBuilder.buildSessionTurn(
        { ...world, replyDirective: 'Confirm the contract on Mback is on.' },
        'I am in',
      );
      expect(turn).toContain('[DIRECTOR');
      expect(turn).toContain('Confirm the contract on Mback is on.');
    });
  });

  describe('estimateStatelessChars', () => {
    it('returns the length of the stateless prompt', () => {
      const chars = PromptBuilder.estimateStatelessChars(baseInputs);
      expect(chars).toBe(PromptBuilder.buildStateless(baseInputs).length);
    });

    it('grows with longer history', () => {
      const short = PromptBuilder.estimateStatelessChars(baseInputs);
      const long = PromptBuilder.estimateStatelessChars({
        ...baseInputs,
        history: Array.from({ length: 5 }, (_, i) => ({ player: `p${i}`, npc: `n${i}` })),
      });
      expect(long).toBeGreaterThan(short);
    });
  });
});
