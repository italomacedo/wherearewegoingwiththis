/**
 * Rough token estimator for dev observability + the Phase 5 cost analysis. The
 * Claude CLI runs with `--print` (plain text), so it returns no usage numbers;
 * we approximate ~4 characters per token (a common English heuristic). Use for
 * order-of-magnitude logging, not billing.
 */
export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);
}
