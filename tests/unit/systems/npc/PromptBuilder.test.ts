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
      expect(p).toContain('Do not mention being an AI');
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

    it('injects identity into the session primer too', () => {
      const primer = PromptBuilder.buildSessionPrimer({
        definition: richDef, mood: 'suspicious', world, history: [],
      });
      expect(primer).toContain('Where you live: a capsule flat above the noodle bar');
      expect(primer).toContain('Your routine: works the stall from dusk till the small hours');
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
      expect(p).toContain('Usage Policy');
      expect(p).toContain('got any chips?');
    });

    it('allows fictional cyberpunk content explicitly', () => {
      const p = PromptBuilder.buildModerationPrompt('x');
      expect(p).toContain('ALLOWED');
    });
  });

  describe('buildActionClassifierPrompt', () => {
    it('asks for the 4 structured lines and includes the message + skill/attr lists', () => {
      const p = PromptBuilder.buildActionClassifierPrompt('*picks the lock*');
      expect(p).toContain('VERDICT=DETERMINISTIC or NARRATIVE');
      expect(p).toContain('SKILL=');
      expect(p).toContain('ATTR=');
      expect(p).toContain('DIFF=');
      expect(p).toContain('picks the lock');
      expect(p).toContain('armas_de_fogo'); // a real skill id is listed
      expect(p).toContain('inteligencia'); // a real attribute id is listed
    });
  });

  describe('buildOutcomeNarrationPrompt', () => {
    it('frames success vs failure and forbids numbers/mechanics', () => {
      expect(PromptBuilder.buildOutcomeNarrationPrompt('*pick the lock*', true)).toContain('SUCCEEDS');
      const fail = PromptBuilder.buildOutcomeNarrationPrompt('*pick the lock*', false);
      expect(fail).toContain('FAILS');
      expect(fail).toContain('pick the lock');
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

  describe('buildSessionPrimer', () => {
    it('includes persona and history', () => {
      const primer = PromptBuilder.buildSessionPrimer({
        definition: def,
        mood: 'suspicious',
        world,
        history: [{ player: 'hi', npc: 'hello there' }],
      });
      expect(primer).toContain('Zara');
      expect(primer).toContain('hello there');
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
