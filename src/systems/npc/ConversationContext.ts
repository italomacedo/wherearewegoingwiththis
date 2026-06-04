export interface Exchange {
  player: string;
  npc: string;
}

export type ConversationMode = 'stateless' | 'session';

export interface ConversationState {
  mode: ConversationMode;
  sessionId: string | null;
  history: Exchange[];
}

export const GRADUATION_THRESHOLD_CHARS = 2500;
export const MAX_PERSISTED_EXCHANGES = 20;
export const PROMPT_HISTORY_WINDOW = 3;

/**
 * Tracks a single NPC's conversation: rolling history, size, and the
 * stateless→session graduation decision. Pure logic, fully unit-tested.
 */
export class ConversationContext {
  private mode: ConversationMode = 'stateless';
  private sessionId: string | null = null;
  private history: Exchange[] = [];
  private readonly graduationThreshold: number;
  private readonly maxPersisted: number;

  constructor(opts?: { graduationThreshold?: number; maxPersisted?: number }) {
    this.graduationThreshold = opts?.graduationThreshold ?? GRADUATION_THRESHOLD_CHARS;
    this.maxPersisted = opts?.maxPersisted ?? MAX_PERSISTED_EXCHANGES;
  }

  getMode(): ConversationMode {
    return this.mode;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Last N exchanges used to build a prompt (most recent last). */
  getRecentHistory(window = PROMPT_HISTORY_WINDOW): Exchange[] {
    return this.history.slice(-window);
  }

  getFullHistory(): Exchange[] {
    return [...this.history];
  }

  getHistoryCount(): number {
    return this.history.length;
  }

  recordExchange(player: string, npc: string): void {
    this.history.push({ player, npc });
    // Cap persisted history to bound save size
    if (this.history.length > this.maxPersisted) {
      this.history = this.history.slice(-this.maxPersisted);
    }
  }

  /**
   * Decides whether to graduate to session mode given the size of the prompt
   * that *would* be sent in stateless mode. Once graduated, stays in session.
   */
  evaluateGraduation(builtPromptChars: number, sessionIdFactory: () => string): boolean {
    if (this.mode === 'session') return true;
    if (builtPromptChars > this.graduationThreshold) {
      this.mode = 'session';
      this.sessionId = sessionIdFactory();
      return true;
    }
    return false;
  }

  /** Serialize for the save file. */
  toState(): ConversationState {
    return {
      mode: this.mode,
      sessionId: this.sessionId,
      history: [...this.history],
    };
  }

  /** Restore from a save file. */
  static fromState(state: ConversationState, opts?: { graduationThreshold?: number; maxPersisted?: number }): ConversationContext {
    const ctx = new ConversationContext(opts);
    ctx.mode = state.mode;
    ctx.sessionId = state.sessionId;
    ctx.history = [...state.history];
    return ctx;
  }

  reset(): void {
    this.mode = 'stateless';
    this.sessionId = null;
    this.history = [];
  }
}
