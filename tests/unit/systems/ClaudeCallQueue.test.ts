import {
  ClaudeCallQueue,
  queueConfigFromSettings,
  nextReflectionDelay,
} from '@systems/ClaudeCallQueue';

function makeClock(start = 0) {
  const ref = { t: start };
  return { ref, now: () => ref.t };
}

describe('ClaudeCallQueue', () => {
  it('dispatches a single enqueued job immediately', () => {
    const q = new ClaudeCallQueue({ minGapMs: 6000, maxPerMinute: 8 }, () => 0);
    expect(q.enqueue({ id: 'a', payload: 1 })).toBe(true);
    const job = q.tryDispatch(0);
    expect(job?.id).toBe('a');
    expect(q.pendingCount()).toBe(0);
  });

  it('returns null when nothing is pending', () => {
    const q = new ClaudeCallQueue({ minGapMs: 6000, maxPerMinute: 8 });
    expect(q.tryDispatch(0)).toBeNull();
  });

  it('enforces the global min-gap between dispatches', () => {
    const q = new ClaudeCallQueue({ minGapMs: 6000, maxPerMinute: 100 });
    q.enqueue({ id: 'a', payload: 1 });
    q.enqueue({ id: 'b', payload: 2 });
    expect(q.tryDispatch(0)?.id).toBe('a');
    expect(q.tryDispatch(3000)).toBeNull(); // too soon
    expect(q.tryDispatch(6000)?.id).toBe('b'); // gap satisfied
  });

  it('enforces the per-minute cap with a rolling window', () => {
    const q = new ClaudeCallQueue({ minGapMs: 0, maxPerMinute: 2 });
    q.enqueue({ id: 'a', payload: 1 });
    q.enqueue({ id: 'b', payload: 2 });
    q.enqueue({ id: 'c', payload: 3 });
    expect(q.tryDispatch(0)?.id).toBe('a');
    expect(q.tryDispatch(100)?.id).toBe('b');
    expect(q.tryDispatch(200)).toBeNull(); // cap of 2 hit within the window
    // after the window slides past the first two, capacity frees up
    expect(q.tryDispatch(60_001)?.id).toBe('c');
  });

  it('respects per-key cooldown and dedupes pending by key', () => {
    const clock = makeClock(0);
    const q = new ClaudeCallQueue({ minGapMs: 0, maxPerMinute: 100 }, clock.now);
    expect(q.enqueue({ id: 'd1', payload: 1, cooldownKey: 'zara:delib', cooldownMs: 10_000 })).toBe(true);
    // a second pending job with the same key is dropped
    expect(q.enqueue({ id: 'd2', payload: 2, cooldownKey: 'zara:delib', cooldownMs: 10_000 })).toBe(false);
    expect(q.tryDispatch(0)?.id).toBe('d1');
    expect(q.isCoolingDown('zara:delib', 5_000)).toBe(true);
    // enqueue while cooling is rejected
    expect(q.enqueue({ id: 'd3', payload: 3, cooldownKey: 'zara:delib', cooldownMs: 10_000 })).toBe(false);
    // after cooldown, accepted again
    clock.ref.t = 10_001;
    expect(q.enqueue({ id: 'd4', payload: 4, cooldownKey: 'zara:delib', cooldownMs: 10_000 })).toBe(true);
    expect(q.tryDispatch(10_001)?.id).toBe('d4');
  });

  it('skips a cooling job to dispatch a later free one (FIFO with cooldown skip)', () => {
    const q = new ClaudeCallQueue({ minGapMs: 0, maxPerMinute: 100 }, () => 0);
    q.enqueue({ id: 'a', payload: 1, cooldownKey: 'k', cooldownMs: 100_000 });
    expect(q.tryDispatch(0)?.id).toBe('a'); // arms cooldown on 'k'
    // now a fresh keyless job and another 'k' job; 'k' is cooling, keyless wins
    q.enqueue({ id: 'b', payload: 2 });
    expect(q.tryDispatch(10)?.id).toBe('b');
  });

  it('clear() empties pending and resets throttle state', () => {
    const q = new ClaudeCallQueue({ minGapMs: 6000, maxPerMinute: 1 }, () => 0);
    q.enqueue({ id: 'a', payload: 1 });
    q.tryDispatch(0);
    q.clear();
    expect(q.pendingCount()).toBe(0);
    q.enqueue({ id: 'b', payload: 2 });
    expect(q.tryDispatch(0)?.id).toBe('b'); // cap/gap state was reset
  });

  it('configure() swaps the throttle live', () => {
    const q = new ClaudeCallQueue({ minGapMs: 100_000, maxPerMinute: 1 }, () => 0);
    q.enqueue({ id: 'a', payload: 1 });
    q.enqueue({ id: 'b', payload: 2 });
    expect(q.tryDispatch(0)?.id).toBe('a');
    expect(q.tryDispatch(1000)).toBeNull(); // big gap blocks
    q.configure({ minGapMs: 0, maxPerMinute: 100 });
    expect(q.tryDispatch(1000)?.id).toBe('b');
  });
});

describe('queueConfigFromSettings', () => {
  it('caps per minute and floors the gap at 6s', () => {
    expect(queueConfigFromSettings(8)).toEqual({ minGapMs: 7500, maxPerMinute: 8 });
  });

  it('spreads a low budget wider than the 6s floor', () => {
    expect(queueConfigFromSettings(4)).toEqual({ minGapMs: 15000, maxPerMinute: 4 });
  });

  it('keeps the 6s floor when the budget is high', () => {
    expect(queueConfigFromSettings(12)).toEqual({ minGapMs: 6000, maxPerMinute: 12 });
  });
});

describe('nextReflectionDelay', () => {
  it('returns base with no jitter', () => {
    expect(nextReflectionDelay(480_000, 0, () => 0.5)).toBe(480_000);
  });

  it('returns the low bound when rand=0', () => {
    expect(nextReflectionDelay(480_000, 0.25, () => 0)).toBe(360_000);
  });

  it('returns the high bound when rand→1', () => {
    expect(nextReflectionDelay(480_000, 0.25, () => 1)).toBe(600_000);
  });
});
