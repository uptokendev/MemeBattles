from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def replace_block(source: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found")
    end = source.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker not found")
    return source[:start] + replacement + source[end:]


def patch_service() -> None:
    path = Path("frontend/api/dev-fix/ticker-reservation-service.js")
    source = path.read_text(encoding="utf-8")

    cluster_block = '''function canonicalSolanaCluster(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["mainnet", "mainnet-beta", "solana-mainnet", "solana-mainnet-beta"].includes(normalized)) {
    return "solana-mainnet-beta";
  }
  if (["devnet", "solana-devnet"].includes(normalized)) return "solana-devnet";
  if (["testnet", "solana-testnet"].includes(normalized)) return "solana-testnet";
  if (["localnet", "localhost", "solana-localnet"].includes(normalized)) return "solana-localnet";
  return normalized;
}

export function canonicalClusterForChain(chainId, explicitCluster = "") {
  const numericChainId = Number(chainId);
  const explicit = String(explicitCluster || "").trim().toLowerCase();
  if (explicit) {
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(explicit)) {
      throw new TickerReservationError("Invalid chain cluster.", {
        code: "INVALID_RESERVATION_CLUSTER",
        httpStatus: 400,
      });
    }
    return numericChainId === 101 || numericChainId === 102
      ? canonicalSolanaCluster(explicit)
      : explicit;
  }

  if (numericChainId === 56) return "bsc-mainnet";
  if (numericChainId === 97) return "bsc-testnet";
  if (numericChainId === 101) {
    return canonicalSolanaCluster(
      process.env.SOLANA_CLUSTER || process.env.VITE_SOLANA_CLUSTER || "solana-mainnet-beta",
    );
  }
  if (numericChainId === 102) return "solana-devnet";
  return `chain-${numericChainId}`;
}'''
    source = replace_block(
        source,
        "export function canonicalClusterForChain",
        "\n\nexport function isBlockingReservationStatus",
        cluster_block,
        "canonical cluster block",
    )

    refresh_head = '''export async function refreshExpiredTickerReservations(db, {
  chainId = null,
  cluster = null,
  normalizedTicker = null,
  draftId = null,
} = {}) {
  const ticker = normalizedTicker ? normalizeTicker(normalizedTicker) : null;
  const reservationCluster = cluster ? canonicalClusterForChain(chainId, cluster) : null;
  const params = [
    chainId == null ? null : Number(chainId),
    reservationCluster,
    ticker || null,
    draftId || null,
    EXPIRABLE_STATUSES,
  ];'''
    source = replace_block(
        source,
        "export async function refreshExpiredTickerReservations",
        "\n\n  const released = await db.query",
        refresh_head,
        "refresh reservation header",
    )

    if source.count("status = any($4::text[])") != 2:
        raise SystemExit("refresh status placeholders: expected two matches")
    source = source.replace("status = any($4::text[])", "status = any($5::text[])", 2)

    old_filters = '''          and ($1::integer is null or chain_id = $1)
          and ($2::text is null or normalized_ticker = $2)
          and ($3::uuid is null or draft_id = $3)'''
    new_filters = '''          and ($1::integer is null or chain_id = $1)
          and ($2::text is null or cluster = $2)
          and ($3::text is null or normalized_ticker = $3)
          and ($4::uuid is null or draft_id = $4)'''
    if source.count(old_filters) != 2:
        raise SystemExit(f"refresh cluster filters: expected two matches, found {source.count(old_filters)}")
    source = source.replace(old_filters, new_filters, 2)

    availability_block = '''export async function getTickerAvailability(db, {
  chainId,
  cluster = "",
  ticker,
  excludeDraftId = null,
}) {
  const numericChainId = Number(chainId);
  const normalizedTicker = normalizeTicker(ticker);
  if (!Number.isFinite(numericChainId) || numericChainId <= 0) {
    throw new TickerReservationError("Invalid chain id.", {
      code: "INVALID_RESERVATION_CHAIN",
      httpStatus: 400,
    });
  }
  if (!normalizedTicker) {
    throw new TickerReservationError("Ticker is required.", {
      code: "INVALID_RESERVATION_TICKER",
      httpStatus: 400,
    });
  }

  const reservationCluster = canonicalClusterForChain(numericChainId, cluster);
  await refreshExpiredTickerReservations(db, {
    chainId: numericChainId,
    cluster: reservationCluster,
    normalizedTicker,
  });
  const result = await db.query(
    `select *
       from public.ticker_reservations
      where chain_id = $1
        and cluster = $2
        and normalized_ticker = $3
        and status not in ('DRAFT_UNRESERVED', 'RELEASED')
        and ($4::uuid is null or draft_id is distinct from $4::uuid)
      order by created_at asc
      limit 1`,
    [numericChainId, reservationCluster, normalizedTicker, excludeDraftId || null],
  );
  const reservation = mapTickerReservationRow(result.rows[0]);
  return {
    ticker: normalizedTicker,
    chainId: numericChainId,
    cluster: reservationCluster,
    available: !reservation,
    reservation,
  };
}'''
    source = replace_block(
        source,
        "export async function getTickerAvailability",
        "\n\nfunction reservationTerms",
        availability_block,
        "cluster-scoped availability function",
    )

    create_start = source.find("export async function createTickerReservation")
    create_end = source.find("\n\nexport async function promoteTickerReservation", create_start)
    if create_start < 0 or create_end < 0:
        raise SystemExit("create reservation function markers missing")
    create = source[create_start:create_end]
    create = replace_once(
        create,
        '''  const numericChainId = Number(chainId);
  const normalizedTicker = normalizeTicker(ticker);
  if (!draftId || !creatorWallet || !normalizedTicker || !Number.isFinite(numericChainId) || numericChainId <= 0) {''',
        '''  const numericChainId = Number(chainId);
  const normalizedTicker = normalizeTicker(ticker);
  const reservationCluster = canonicalClusterForChain(numericChainId, cluster);
  if (!draftId || !creatorWallet || !normalizedTicker || !Number.isFinite(numericChainId) || numericChainId <= 0) {''',
        "create cluster resolution",
    )
    create = replace_once(
        create,
        "    if (existing.chainId === numericChainId && existing.normalizedTicker === normalizedTicker) return existing;",
        "    if (existing.chainId === numericChainId && existing.cluster === reservationCluster && existing.normalizedTicker === normalizedTicker) return existing;",
        "existing reservation cluster identity",
    )
    create = replace_once(
        create,
        "  const availability = await getTickerAvailability(db, { chainId: numericChainId, ticker: normalizedTicker });",
        "  const availability = await getTickerAvailability(db, { chainId: numericChainId, cluster: reservationCluster, ticker: normalizedTicker });",
        "create availability cluster",
    )
    create = replace_once(
        create,
        "        canonicalClusterForChain(numericChainId, cluster),",
        "        reservationCluster,",
        "insert reservation cluster",
    )
    create = replace_once(
        create,
        "      metadata: { draftId: String(draftId), chainId: numericChainId, ticker: normalizedTicker },",
        "      metadata: { draftId: String(draftId), chainId: numericChainId, cluster: reservationCluster, ticker: normalizedTicker },",
        "reservation event cluster metadata",
    )
    source = source[:create_start] + create + source[create_end:]
    path.write_text(source, encoding="utf-8")


def patch_availability_handler() -> None:
    path = Path("frontend/api/dev-fix/ticker-availability.js")
    source = path.read_text(encoding="utf-8")
    source = replace_once(
        source,
        '  const chainId = Number(q.chainId || process.env.VITE_TARGET_CHAIN_ID || 97);\n',
        '  const chainId = Number(q.chainId || process.env.VITE_TARGET_CHAIN_ID || 97);\n  const cluster = String(q.cluster || "").trim();\n',
        "availability request cluster",
    )
    source = replace_once(
        source,
        "    const result = await getTickerAvailability(pool, { chainId, ticker });",
        "    const result = await getTickerAvailability(pool, { chainId, cluster, ticker });",
        "availability service cluster",
    )
    source = replace_once(
        source,
        '''        ticker,
        chainId,
        available: true,''',
        '''        ticker,
        chainId,
        cluster: result.cluster,
        available: true,''',
        "available response cluster",
    )
    source = replace_once(
        source,
        '''      ticker,
      chainId,
      available: false,''',
        '''      ticker,
      chainId,
      cluster: result.cluster,
      available: false,''',
        "blocked response cluster",
    )
    path.write_text(source, encoding="utf-8")


def patch_management_handler() -> None:
    path = Path("frontend/api/dev-fix/ticker-reservations.js")
    source = path.read_text(encoding="utf-8")
    reclaim = '''async function reclaimReservation(db, draft) {
  await refreshExpiredTickerReservations(db, { draftId: draft.id });
  const existing = await loadTickerReservationByDraft(db, draft.id, { forUpdate: true });

  if (existing) {
    if (existing.status === TICKER_RESERVATION_STATUS.EXPIRED_GRACE) {
      return renewTickerReservation(db, {
        draftId: draft.id,
        creatorWallet: draft.creatorWallet,
      });
    }
    return existing;
  }

  const previous = await loadTickerReservationByDraft(db, draft.id, {
    forUpdate: true,
    includeReleased: true,
  });
  const published = draft.visibility === "public" || PUBLISHED_DRAFT_STATUSES.has(draft.status);
  return createTickerReservation(db, {
    draftId: draft.id,
    creatorWallet: draft.creatorWallet,
    chainId: draft.chainId,
    cluster: previous?.cluster || "",
    ticker: draft.ticker,
    published,
  });
}'''
    source = replace_block(
        source,
        "async function reclaimReservation",
        "\n\nexport async function tickerReservationManagement",
        reclaim,
        "cluster-preserving reclaim",
    )
    path.write_text(source, encoding="utf-8")


def patch_frontend_api() -> None:
    path = Path("frontend/src/lib/draftApi.ts")
    source = path.read_text(encoding="utf-8")
    source = replace_once(
        source,
        '''export type CreateDraftInput = {
  auth?: DraftActionAuth;
  chainId: number;
  creatorWallet: string;''',
        '''export type CreateDraftInput = {
  auth?: DraftActionAuth;
  chainId: number;
  cluster?: string;
  creatorWallet: string;''',
        "create draft cluster type",
    )
    source = replace_once(
        source,
        '''export type TickerAvailability = {
  ticker: string;
  chainId?: number;
  available: boolean;''',
        '''export type TickerAvailability = {
  ticker: string;
  chainId?: number;
  cluster?: string;
  available: boolean;''',
        "availability cluster type",
    )
    check = '''export async function checkTickerAvailability(input: { ticker: string; chainId?: number; cluster?: string }): Promise<TickerAvailability> {
  const res = await apiFetch(`/api/drafts/ticker-availability${query({
    ticker: input.ticker,
    chainId: input.chainId,
    cluster: input.cluster,
  })}`, { cache: "no-store" });
  return parseJson(res) as Promise<TickerAvailability>;
}'''
    source = replace_block(
        source,
        "export async function checkTickerAvailability",
        "\n\nexport async function createCampaignDraft",
        check,
        "typed cluster availability client",
    )
    path.write_text(source, encoding="utf-8")


def patch_tests() -> None:
    path = Path("frontend/api/dev-fix/ticker-reservation-service.test.mjs")
    source = path.read_text(encoding="utf-8")
    source = replace_once(
        source,
        '  assert.equal(canonicalClusterForChain(101, "solana-devnet"), "solana-devnet");\n',
        '  assert.equal(canonicalClusterForChain(101, "solana-devnet"), "solana-devnet");\n  assert.equal(canonicalClusterForChain(101, "devnet"), "solana-devnet");\n  assert.equal(canonicalClusterForChain(101, "mainnet-beta"), "solana-mainnet-beta");\n',
        "cluster alias tests",
    )
    path.write_text(source, encoding="utf-8")


def main() -> None:
    patch_service()
    patch_availability_handler()
    patch_management_handler()
    patch_frontend_api()
    patch_tests()


if __name__ == "__main__":
    main()
