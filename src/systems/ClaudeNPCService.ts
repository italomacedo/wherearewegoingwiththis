import { NPCAgent } from '@entities/NPCAgent';
import { PromptBuilder, WorldSnapshot } from '@systems/npc/PromptBuilder';

/**
 * IPC query params — structurally matches electron/preload.ts ClaudeQueryParams.
 * Defined here to avoid crossing the Electron project-reference boundary.
 */
export interface ClaudeQueryParams {
  npcId: string;
  prompt: string;
  claudePath: string;
  sessionId?: string;
  useSession?: boolean;
}

/** Minimal slice of the Electron API this service needs (injectable for tests). */
export interface ClaudeBridge {
  claudeQuery: (params: ClaudeQueryParams) => Promise<void>;
  claudeCancel: (npcId: string) => Promise<void>;
  onClaudeResponseChunk: (cb: (data: { npcId: string; chunk: string }) => void) => () => void;
  onClaudeResponseDone: (cb: (data: { npcId: string; code: number | null }) => void) => () => void;
}

export interface ClaudeNPCServiceOptions {
  claudePath: string;
  bridge: ClaudeBridge;
  sessionIdFactory?: () => string;
}

/**
 * Orchestrates one NPC conversation turn through the Claude CLI (via Electron IPC).
 * Decides stateless vs session mode (ADR-0010), streams chunks, records the exchange.
 */
export class ClaudeNPCService {
  private claudePath: string;
  private bridge: ClaudeBridge;
  private sessionIdFactory: () => string;

  constructor(opts: ClaudeNPCServiceOptions) {
    this.claudePath = opts.claudePath;
    this.bridge = opts.bridge;
    this.sessionIdFactory = opts.sessionIdFactory ?? ClaudeNPCService.defaultSessionId;
  }

  /**
   * Send a player message to the NPC and stream Claude's reply.
   * @param onChunk optional progressive callback for each streamed chunk
   * @returns the full NPC reply text
   */
  async query(
    agent: NPCAgent,
    world: WorldSnapshot,
    playerMessage: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (agent.isBusy()) {
      throw new Error(`NPC '${agent.definition.id}' is already responding.`);
    }

    const params = this.buildQueryParams(agent, world, playerMessage);

    agent.beginResponse();
    let response = '';
    const npcId = agent.definition.id;

    const offChunk = this.bridge.onClaudeResponseChunk((data) => {
      if (data.npcId !== npcId) return;
      response += data.chunk;
      onChunk?.(data.chunk);
    });

    try {
      await this.bridge.claudeQuery(params);
    } finally {
      offChunk();
    }

    const text = response.trim();
    agent.conversation.recordExchange(playerMessage, text);
    agent.endResponse();
    return text;
  }

  /** Cancel an in-flight NPC response. */
  async cancel(agent: NPCAgent): Promise<void> {
    await this.bridge.claudeCancel(agent.definition.id);
    agent.endResponse();
  }

  /** Builds the IPC params, applying the stateless→session strategy. */
  private buildQueryParams(
    agent: NPCAgent,
    world: WorldSnapshot,
    playerMessage: string
  ): ClaudeQueryParams {
    const ctx = agent.conversation;
    const history = ctx.getRecentHistory();
    const statelessInputs = {
      definition: agent.definition,
      mood: agent.getMood(),
      world,
      history,
      playerMessage,
    };
    const statelessPrompt = PromptBuilder.buildStateless(statelessInputs);

    const modeBefore = ctx.getMode();
    ctx.evaluateGraduation(statelessPrompt.length, this.sessionIdFactory);
    const modeAfter = ctx.getMode();

    if (modeAfter === 'stateless') {
      return {
        npcId: agent.definition.id,
        prompt: statelessPrompt,
        claudePath: this.claudePath,
      };
    }

    // session mode
    const sessionTurn = PromptBuilder.buildSessionTurn(world, playerMessage);
    const justGraduated = modeBefore === 'stateless' && modeAfter === 'session';
    const prompt = justGraduated
      ? `${PromptBuilder.buildSessionPrimer({ definition: agent.definition, mood: agent.getMood(), world, history })}\n\n${sessionTurn}`
      : sessionTurn;

    return {
      npcId: agent.definition.id,
      prompt,
      claudePath: this.claudePath,
      sessionId: ctx.getSessionId() ?? undefined,
      useSession: true,
    };
  }

  /* istanbul ignore next — uuid only needed at runtime, deterministic factory used in tests */
  private static defaultSessionId(): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { v4 } = require('uuid') as typeof import('uuid');
    return v4();
  }
}
