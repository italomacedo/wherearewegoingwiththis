import {
  ConversationContext, GRADUATION_THRESHOLD_CHARS, MAX_PERSISTED_EXCHANGES,
} from '../../../../src/systems/npc/ConversationContext';

describe('ConversationContext', () => {
  let ctx: ConversationContext;

  beforeEach(() => {
    ctx = new ConversationContext();
  });

  it('starts in stateless mode with no session', () => {
    expect(ctx.getMode()).toBe('stateless');
    expect(ctx.getSessionId()).toBeNull();
    expect(ctx.getHistoryCount()).toBe(0);
  });

  it('recordExchange appends to history', () => {
    ctx.recordExchange('hi', 'hello');
    expect(ctx.getHistoryCount()).toBe(1);
    expect(ctx.getFullHistory()[0]).toEqual({ player: 'hi', npc: 'hello' });
  });

  it('getRecentHistory returns last N exchanges', () => {
    for (let i = 0; i < 10; i++) ctx.recordExchange(`p${i}`, `n${i}`);
    const recent = ctx.getRecentHistory(3);
    expect(recent).toHaveLength(3);
    expect(recent[2].player).toBe('p9');
  });

  it('caps history at maxPersisted', () => {
    for (let i = 0; i < MAX_PERSISTED_EXCHANGES + 10; i++) {
      ctx.recordExchange(`p${i}`, `n${i}`);
    }
    expect(ctx.getHistoryCount()).toBe(MAX_PERSISTED_EXCHANGES);
    // oldest dropped — most recent retained
    expect(ctx.getFullHistory().at(-1)!.player).toBe(`p${MAX_PERSISTED_EXCHANGES + 9}`);
  });

  it('does not graduate below threshold', () => {
    const factory = jest.fn(() => 'session-1');
    const graduated = ctx.evaluateGraduation(100, factory);
    expect(graduated).toBe(false);
    expect(ctx.getMode()).toBe('stateless');
    expect(factory).not.toHaveBeenCalled();
  });

  it('graduates above threshold and allocates a session id', () => {
    const factory = jest.fn(() => 'session-xyz');
    const graduated = ctx.evaluateGraduation(GRADUATION_THRESHOLD_CHARS + 1, factory);
    expect(graduated).toBe(true);
    expect(ctx.getMode()).toBe('session');
    expect(ctx.getSessionId()).toBe('session-xyz');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('stays in session mode once graduated (idempotent)', () => {
    const factory = jest.fn(() => 'session-1');
    ctx.evaluateGraduation(GRADUATION_THRESHOLD_CHARS + 1, factory);
    const again = ctx.evaluateGraduation(10, factory);
    expect(again).toBe(true);
    expect(ctx.getMode()).toBe('session');
    expect(factory).toHaveBeenCalledTimes(1); // not re-allocated
  });

  it('respects a custom graduation threshold', () => {
    const custom = new ConversationContext({ graduationThreshold: 50 });
    custom.evaluateGraduation(51, () => 's');
    expect(custom.getMode()).toBe('session');
  });

  it('respects a custom maxPersisted', () => {
    const custom = new ConversationContext({ maxPersisted: 2 });
    custom.recordExchange('a', '1');
    custom.recordExchange('b', '2');
    custom.recordExchange('c', '3');
    expect(custom.getHistoryCount()).toBe(2);
  });

  // ─── Serialization ──────────────────────────────────────────────────────

  it('toState serializes mode, session, and history', () => {
    ctx.recordExchange('hi', 'hello');
    ctx.evaluateGraduation(GRADUATION_THRESHOLD_CHARS + 1, () => 'sess-1');
    const state = ctx.toState();
    expect(state.mode).toBe('session');
    expect(state.sessionId).toBe('sess-1');
    expect(state.history).toHaveLength(1);
  });

  it('fromState restores a context', () => {
    const restored = ConversationContext.fromState({
      mode: 'session',
      sessionId: 'sess-9',
      history: [{ player: 'a', npc: 'b' }],
    });
    expect(restored.getMode()).toBe('session');
    expect(restored.getSessionId()).toBe('sess-9');
    expect(restored.getHistoryCount()).toBe(1);
  });

  it('toState/fromState round-trips', () => {
    ctx.recordExchange('q', 'a');
    ctx.recordExchange('q2', 'a2');
    const restored = ConversationContext.fromState(ctx.toState());
    expect(restored.getFullHistory()).toEqual(ctx.getFullHistory());
  });

  it('toState returns an independent history copy', () => {
    ctx.recordExchange('a', 'b');
    const state = ctx.toState();
    state.history.push({ player: 'x', npc: 'y' });
    expect(ctx.getHistoryCount()).toBe(1);
  });

  it('reset clears mode, session, and history', () => {
    ctx.recordExchange('a', 'b');
    ctx.evaluateGraduation(GRADUATION_THRESHOLD_CHARS + 1, () => 's');
    ctx.reset();
    expect(ctx.getMode()).toBe('stateless');
    expect(ctx.getSessionId()).toBeNull();
    expect(ctx.getHistoryCount()).toBe(0);
  });

  it('getFullHistory returns an independent copy', () => {
    ctx.recordExchange('a', 'b');
    const copy = ctx.getFullHistory();
    copy.push({ player: 'x', npc: 'y' });
    expect(ctx.getHistoryCount()).toBe(1);
  });
});
