/**
 * Graduation log search windows.
 *
 * NEVER reuse FACTORY_LOOKBACK_BLOCKS (default 250k) for CampaignFinalized scans.
 * Factory discovery needs deep history; graduation events are recent relative to head
 * when a campaign first reports launched()=true.
 */

export type GraduationSearchWindow = {
  fromBlock: number;
  toBlock: number;
  /** Why this window was chosen (for logs / diagnostics). */
  mode: "exact_graduated_block" | "created_and_recent" | "recent_unknown_created";
  /** Estimated max getLogs chunks at the given step size. */
  estimatedChunks: number;
};

export function clampNonNegInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * Resolve the [from, to] block range for eth_getLogs(CampaignFinalized).
 *
 * Rules:
 * - known graduated_block → ±1 around that block (cheap exact recovery)
 * - known created_block → max(created, head - lookback) … head
 *   (never re-walk the whole bonding life every tick)
 * - unknown created_block (0) → head - unknownLookback … head only
 *   (never FACTORY_LOOKBACK 250k)
 */
export function graduationLogSearchWindow(input: {
  finalizedHead: number;
  createdBlock: number;
  graduatedBlock: number | null;
  /** Normal recent window (default ~20k blocks). */
  lookbackBlocks: number;
  /** When created_block is missing; keep ≤ lookbackBlocks. */
  unknownCreatedLookbackBlocks: number;
  logChunkSize: number;
}): GraduationSearchWindow {
  const head = clampNonNegInt(input.finalizedHead, 0);
  const lookback = Math.max(1, clampNonNegInt(input.lookbackBlocks, 20_000));
  const unknownLookback = Math.max(
    1,
    Math.min(lookback, clampNonNegInt(input.unknownCreatedLookbackBlocks, 12_000)),
  );
  const step = Math.max(1, clampNonNegInt(input.logChunkSize, 2_000));
  const created = clampNonNegInt(input.createdBlock, 0);
  const graduated =
    input.graduatedBlock == null || !Number.isFinite(Number(input.graduatedBlock))
      ? null
      : Math.max(0, Math.floor(Number(input.graduatedBlock)));

  if (graduated != null) {
    const fromBlock = Math.max(0, graduated - 1);
    const toBlock = Math.min(head, graduated + 1);
    const span = Math.max(0, toBlock - fromBlock + 1);
    return {
      fromBlock,
      toBlock,
      mode: "exact_graduated_block",
      estimatedChunks: Math.max(1, Math.ceil(span / step)),
    };
  }

  if (created > 0) {
    const recentStart = Math.max(0, head - lookback);
    // Prefer the recent tip window; never start earlier than created_block.
    const fromBlock = Math.max(created, recentStart);
    const toBlock = head;
    const span = Math.max(0, toBlock - fromBlock + 1);
    return {
      fromBlock,
      toBlock,
      mode: "created_and_recent",
      estimatedChunks: Math.max(1, Math.ceil(span / step)),
    };
  }

  const fromBlock = Math.max(0, head - unknownLookback);
  const toBlock = head;
  const span = Math.max(0, toBlock - fromBlock + 1);
  return {
    fromBlock,
    toBlock,
    mode: "recent_unknown_created",
    estimatedChunks: Math.max(1, Math.ceil(span / step)),
  };
}

/**
 * Iterate windows from the tip backward so we stop as soon as CampaignFinalized is found
 * (graduation is a one-shot near the end of bonding, not at campaign birth).
 */
export function* graduationLogChunkRanges(
  fromBlock: number,
  toBlock: number,
  step: number,
): Generator<{ start: number; end: number }> {
  const from = clampNonNegInt(fromBlock, 0);
  const to = clampNonNegInt(toBlock, 0);
  const size = Math.max(1, clampNonNegInt(step, 500));
  if (from > to) return;

  for (let end = to; end >= from; end -= size) {
    const start = Math.max(from, end - size + 1);
    yield { start, end };
    if (start === from) break;
  }
}
