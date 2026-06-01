/**
 * ClaudeCallQueue — the Fase 5 cost safeguard. EVERY *autonomous* Claude call an
 * NPC wants to make (deliberation, gossip, reaction) is enqueued here and only
 * dispatched when the throttle allows it. Player-driven turns do NOT go through
 * this queue — they're human-paced and call Claude directly with priority.
 *
 * Pure & deterministic: the clock is injected (`now()` → ms), so tests drive time
 * by hand. The queue never executes anything itself; the caller pulls a job with
 * `tryDispatch(now)` and runs its opaque `payload`. Three independent gates:
 *   1. global min-gap     — at least `minGapMs` between any two dispatches;
 *   2. per-minute cap      — at most `maxPerMinute` dispatches in any 60s window;
 *   3. per-key cooldown    — a job's `cooldownKey` is blocked for `cooldownMs`
 *                            after it dispatches (e.g. one deliberation per NPC
 *                            every X min; one gossip per pair every 10 min).
 *
 * Enqueue is deduped by `cooldownKey`: if a pending or still-cooling job shares
 * the key, the new request is dropped (returns false) so nothing piles up.
 */

export interface QueuedCall<T = unknown> {
  /** Unique-ish id for tracing/logging. */
  id: string;
  /** Opaque payload the caller runs when this job dispatches. */
  payload: T;
  /** Optional throttle key (e.g. `zara:deliberation`). Deduped + cooldown-tracked. */
  cooldownKey?: string;
  /** How long `cooldownKey` stays blocked after dispatch (ms). Default 0. */
  cooldownMs?: number;
}

export interface QueueConfig {
  /** Minimum ms between any two dispatches. */
  minGapMs: number;
  /** Max dispatches allowed within any rolling 60s window. */
  maxPerMinute: number;
}

const WINDOW_MS = 60_000;

export class ClaudeCallQueue<T = unknown> {
  private pending: QueuedCall<T>[] = [];
  private cooldownUntil = new Map<string, number>();
  private dispatchTimes: number[] = [];
  private lastDispatchAt = -Infinity;

  constructor(private config: QueueConfig, private now: () => number = () => 0) {}

  /** Replace the throttle config live (e.g. when Options change). */
  configure(config: QueueConfig): void {
    this.config = config;
  }

  /**
   * Add a job. Returns false (dropped) when another job with the same
   * `cooldownKey` is already pending or the key is still cooling down — this is
   * the anti-pile-up guard. Keyless jobs are always accepted.
   */
  enqueue(call: QueuedCall<T>): boolean {
    if (call.cooldownKey) {
      const now = this.now();
      if ((this.cooldownUntil.get(call.cooldownKey) ?? -Infinity) > now) return false;
      if (this.pending.some((c) => c.cooldownKey === call.cooldownKey)) return false;
    }
    this.pending.push(call);
    return true;
  }

  /**
   * Pull the next runnable job, or null if the throttle blocks all of them right
   * now. Honours global min-gap + per-minute cap first (cheap), then scans the
   * FIFO for the first job whose cooldownKey is free. On dispatch it records the
   * time and arms the job's cooldown.
   */
  tryDispatch(nowArg?: number): QueuedCall<T> | null {
    const now = nowArg ?? this.now();
    this.prune(now);
    if (now - this.lastDispatchAt < this.config.minGapMs) return null;
    if (this.dispatchTimes.length >= this.config.maxPerMinute) return null;

    const idx = this.pending.findIndex(
      (c) => !c.cooldownKey || (this.cooldownUntil.get(c.cooldownKey) ?? -Infinity) <= now,
    );
    if (idx === -1) return null;

    const [job] = this.pending.splice(idx, 1);
    this.lastDispatchAt = now;
    this.dispatchTimes.push(now);
    if (job.cooldownKey && job.cooldownMs) {
      this.cooldownUntil.set(job.cooldownKey, now + job.cooldownMs);
    }
    return job;
  }

  /** Whether a cooldown key is currently blocked. */
  isCoolingDown(key: string, nowArg?: number): boolean {
    const now = nowArg ?? this.now();
    return (this.cooldownUntil.get(key) ?? -Infinity) > now;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending = [];
    this.dispatchTimes = [];
    this.cooldownUntil.clear();
    this.lastDispatchAt = -Infinity;
  }

  /** Drop dispatch timestamps older than the rolling window. */
  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    this.dispatchTimes = this.dispatchTimes.filter((t) => t > cutoff);
  }
}

/**
 * Build a QueueConfig from the player's Options. `maxPerMinute` is the configured
 * ceiling; `minGapMs` is the larger of a hard 6s floor and an even spread of the
 * per-minute budget — so a low budget also spaces calls out.
 */
export function queueConfigFromSettings(callsPerMinute: number): QueueConfig {
  const evenSpread = Math.floor(WINDOW_MS / Math.max(1, callsPerMinute));
  return { minGapMs: Math.max(6_000, evenSpread), maxPerMinute: callsPerMinute };
}

/**
 * Proactive-reflection delay with jitter so NPCs don't all deliberate in lockstep.
 * Returns `baseMs` scaled by `1 ± jitterFrac`, using an injected [0,1) random.
 */
export function nextReflectionDelay(baseMs: number, jitterFrac: number, rand: () => number): number {
  const span = baseMs * jitterFrac;
  return Math.round(baseMs - span + rand() * span * 2);
}
