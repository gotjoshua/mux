/**
 * Stable key for a per-model timing row (`session-timing.json` `session.byModel`).
 *
 * The backend buckets completed streams by this key and the renderer folds live and
 * sub-agent rows into the same buckets, so both sides must agree on the format:
 * agent-split turns key by agent id, otherwise by mode, otherwise by model alone.
 */
export function getModelTimingKey(
  model: string,
  mode: string | undefined,
  agentId?: string
): string {
  if (agentId) return `${model}:${agentId}`;
  return mode ? `${model}:${mode}` : model;
}
