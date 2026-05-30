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
