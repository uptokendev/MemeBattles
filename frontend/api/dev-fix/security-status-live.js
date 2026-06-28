import { pool } from "../../server/db.js";
import { badMethod, json } from "../../server/http.js";

const ROUTE_SIGNER_ENV_KEYS = [
  "ROUTE_AUTHORITY_PRIVATE_KEY",
  "MWZ_ROUTE_AUTHORITY_PRIVATE_KEY",
  "ROUTE_AUTH_PRIVATE_KEY",
];

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function parseBool(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function readJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function latestPaused(rows) {
  const payload = readJsonObject(rows?.[0]?.new_value);
  return parseBool(payload.paused);
}

function hasAnyEnv(keys) {
  return keys.some((key) => String(process.env[key] || "").trim());
}

function signerStatus() {
  return hasAnyEnv(ROUTE_SIGNER_ENV_KEYS) ? "online" : "offline";
}

function routeAuthorityStatus() {
  const signerReady = signerStatus() === "online";
  const factoryConfigured = Boolean(
    String(process.env.VITE_FACTORY_ADDRESS || process.env.FACTORY_ADDRESS || "").trim() ||
      String(process.env.VITE_FACTORY_ADDRESS_56 || process.env.FACTORY_ADDRESS_56 || "").trim() ||
      String(process.env.VITE_FACTORY_ADDRESS_97 || process.env.FACTORY_ADDRESS_97 || "").trim()
  );
  return signerReady && factoryConfigured ? "online" : "offline";
}

async function readSecurityControlStatus() {
  const [factoryResult, solanaResult, campaignResult, syncResult] = await Promise.all([
    pool.query(
      `select new_value
         from public.security_actions
        where action in ('bnb_pause-factory', 'pause-factory')
        order by created_at desc
        limit 1`,
    ),
    pool.query(
      `select new_value
         from public.security_actions
        where action in ('solana_pause-global', 'pause-global')
        order by created_at desc
        limit 1`,
    ),
    pool.query(
      `select coalesce(bool_or(paused), false) as global_paused,
              coalesce(bool_or(buy_paused), false) as buy_paused,
              coalesce(bool_or(sell_paused), false) as sell_paused,
              coalesce(bool_or(graduation_paused), false) as graduation_paused
         from public.campaign_security_states`,
    ),
    pool.query(
      `select chain,
              count(*) filter (where status in ('queued', 'running'))::int as pending
         from public.contract_sync_jobs
        group by chain`,
    ),
  ]);

  const campaign = campaignResult.rows[0] || {};
  const sync = new Map(syncResult.rows.map((row) => [String(row.chain), Number(row.pending || 0)]));
  return {
    bnbFactoryPaused: latestPaused(factoryResult.rows),
    solanaGlobalPaused: latestPaused(solanaResult.rows),
    campaignPaused: Boolean(campaign.global_paused),
    buysPaused: Boolean(campaign.buy_paused),
    sellsPaused: Boolean(campaign.sell_paused),
    graduationPaused: Boolean(campaign.graduation_paused),
    bnbContractSync: (sync.get("bnb") || 0) > 0 ? "pending" : "synced",
    solanaProgramSync: (sync.get("solana") || 0) > 0 ? "pending" : "synced",
  };
}

export default async function securityStatusLive(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  try {
    const [{ rows: reviews }, { rows: creators }, { rows: wallets }, { rows: clusters }, { rows: mass }, controls] = await Promise.all([
      pool.query("select count(*)::int as count from public.manual_review_queue where status = 'open'"),
      pool.query("select count(*)::int as count from public.creator_profiles where restricted = true"),
      pool.query("select count(*)::int as count from public.wallet_risk_profiles where restricted = true"),
      pool.query("select count(*)::int as count from public.wallet_clusters where risk_level in ('medium','high') or restricted = true"),
      pool.query("select count(*)::int as count from public.mass_deployer_flags where action in ('manual_review','restricted')"),
      readSecurityControlStatus(),
    ]);

    return json(res, 200, {
      globalRiskStatus: Number(mass[0]?.count || 0) > 0 || Number(clusters[0]?.count || 0) > 0 ? "watch" : "normal",
      openManualReviews: Number(reviews[0]?.count || 0),
      restrictedCreators: Number(creators[0]?.count || 0),
      restrictedWallets: Number(wallets[0]?.count || 0),
      suspiciousClusters: Number(clusters[0]?.count || 0),
      massDeployerAlerts: Number(mass[0]?.count || 0),
      bnbContractSync: controls.bnbContractSync,
      solanaProgramSync: controls.solanaProgramSync,
      backendSignerStatus: signerStatus(),
      routeAuthorityStatus: routeAuthorityStatus(),
      paused: {
        global: controls.bnbFactoryPaused || controls.campaignPaused || controls.solanaGlobalPaused,
        create: controls.bnbFactoryPaused,
        buys: controls.buysPaused,
        sells: controls.sellsPaused,
        graduation: controls.graduationPaused,
      },
    });
  } catch (error) {
    if (!schemaMissing(error)) console.error("[security] live status failed", error);
    return json(res, 200, {
      globalRiskStatus: "watch",
      openManualReviews: 0,
      restrictedCreators: 0,
      restrictedWallets: 0,
      suspiciousClusters: 0,
      massDeployerAlerts: 0,
      bnbContractSync: "unknown",
      solanaProgramSync: "unknown",
      backendSignerStatus: signerStatus(),
      routeAuthorityStatus: routeAuthorityStatus(),
      paused: { global: false, create: false, buys: false, sells: false, graduation: false },
      schemaReady: false,
    });
  }
}
