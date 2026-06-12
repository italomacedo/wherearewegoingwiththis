import { ToastQueue, TOAST_TTL_MS, TOAST_MAX } from '@systems/hud/ToastQueue';

describe('ToastQueue', () => {
  it('pushes toasts in order with unique ids and the default ttl', () => {
    const q = new ToastQueue();
    const a = q.push('a', 1000);
    const b = q.push('b', 1500);
    expect(q.getToasts().map((t) => t.text)).toEqual(['a', 'b']);
    expect(a.id).not.toBe(b.id);
    expect(a.expiresAt).toBe(1000 + TOAST_TTL_MS);
  });

  it('evicts the oldest beyond TOAST_MAX', () => {
    const q = new ToastQueue();
    for (let i = 0; i < TOAST_MAX + 2; i++) q.push(`t${i}`, 0);
    expect(q.getToasts()).toHaveLength(TOAST_MAX);
    expect(q.getToasts()[0].text).toBe('t2');
  });

  it('prune drops expired toasts and reports whether the set changed', () => {
    const q = new ToastQueue();
    q.push('a', 0);
    q.push('b', 1000);
    expect(q.prune(500)).toBe(false); // none expired yet
    expect(q.prune(TOAST_TTL_MS + 1)).toBe(true); // 'a' expired
    expect(q.getToasts().map((t) => t.text)).toEqual(['b']);
  });

  it('lifeFraction runs 1 → 0 across the ttl, clamped at both ends', () => {
    const q = new ToastQueue();
    const t = q.push('a', 0);
    expect(ToastQueue.lifeFraction(t, 0)).toBe(1);
    expect(ToastQueue.lifeFraction(t, TOAST_TTL_MS / 2)).toBeCloseTo(0.5);
    expect(ToastQueue.lifeFraction(t, TOAST_TTL_MS + 999)).toBe(0);
  });

  it('custom ttl is honoured by push and lifeFraction', () => {
    const q = new ToastQueue();
    const t = q.push('a', 0, 1000);
    expect(t.expiresAt).toBe(1000);
    expect(ToastQueue.lifeFraction(t, 500, 1000)).toBeCloseTo(0.5);
  });

  it('clear empties the queue', () => {
    const q = new ToastQueue();
    q.push('a', 0);
    q.clear();
    expect(q.getToasts()).toHaveLength(0);
  });
});
