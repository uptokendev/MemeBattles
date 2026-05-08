import { pool } from "../../server/db.js";

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function safeLowerAddress(value) {
  const raw = String(value || "").trim();
  return raw ? raw.toLowerCase() : null;
}

export async function logRouteAuthorization({
  chainId,
  walletAddress,
  routeKind,
  routeProfileId,
  finalizeRouteProfileId = null,
  factoryAddress = null,
  campaignAddress = null,
  decision = null,
  routeAuthority = null,
  authorizationDeadline = null,
  validUntil = null,
  metadata = {},
}) {
  try {
    await pool.query(
      `insert into public.route_authorization_log (
         chain_id,
         wallet_address,
         route_kind,
         route_profile_id,
         finalize_route_profile_id,
         factory_address,
         campaign_address,
         recruiter_id,
         recruiter_code,
         recruiter_is_og,
         decision_profile,
         decision_source,
         decision_reason,
         route_authority,
         authorization_deadline,
         valid_until,
         metadata
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17::jsonb
       )`,
      [
        Number(chainId),
        safeLowerAddress(walletAddress),
        routeKind,
        Number(routeProfileId),
        finalizeRouteProfileId == null ? null : Number(finalizeRouteProfileId),
        safeLowerAddress(factoryAddress),
        safeLowerAddress(campaignAddress),
        decision?.recruiterId == null ? null : Number(decision.recruiterId),
        decision?.recruiterCode || null,
        Boolean(decision?.recruiterIsOg),
        decision?.profile || null,
        decision?.source || null,
        decision?.reason || null,
        safeLowerAddress(routeAuthority),
        authorizationDeadline == null ? null : Number(authorizationDeadline),
        validUntil || null,
        JSON.stringify(metadata || {}),
      ],
    );
  } catch (error) {
    if (schemaMissing(error)) {
      console.warn("[api/routing log] route_authorization_log table not available yet; skipping audit log");
      return;
    }
    console.warn("[api/routing log] failed to write audit log", error);
  }
}
