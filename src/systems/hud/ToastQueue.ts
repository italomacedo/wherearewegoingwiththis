export interface Toast {
  id: number;
  text: string;
  expiresAt: number;
}

/** How long a toast stays on screen. */
export const TOAST_TTL_MS = 3000;
/** Max simultaneous toasts; pushing beyond evicts the oldest. */
export const TOAST_MAX = 4;

/**
 * Pure FIFO queue of ephemeral HUD notifications ("+0.1 Pilotagem", "+1 Perk
 * Point — Destreza"). Timestamps are injected (`nowMs`) so tests never touch
 * real clocks; the browser render layer feeds `Date.now()`.
 */
export class ToastQueue {
  private toasts: Toast[] = [];
  private nextId = 1;

  /** Add a toast; evicts the oldest beyond TOAST_MAX. Returns the new toast. */
  push(text: string, nowMs: number, ttlMs = TOAST_TTL_MS): Toast {
    const toast: Toast = { id: this.nextId++, text, expiresAt: nowMs + ttlMs };
    this.toasts.push(toast);
    while (this.toasts.length > TOAST_MAX) this.toasts.shift();
    return toast;
  }

  /** Drop expired toasts; returns true if the visible set changed. */
  prune(nowMs: number): boolean {
    const before = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.expiresAt > nowMs);
    return this.toasts.length !== before;
  }

  /** Oldest → newest. */
  getToasts(): readonly Toast[] {
    return this.toasts;
  }

  /** 0..1 remaining-life fraction (1 fresh → 0 expired) — drives the fade-out. */
  static lifeFraction(toast: Toast, nowMs: number, ttlMs = TOAST_TTL_MS): number {
    return Math.min(1, Math.max(0, (toast.expiresAt - nowMs) / ttlMs));
  }

  clear(): void {
    this.toasts = [];
  }
}
