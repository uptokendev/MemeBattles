import { pool } from "../../server/db.js";
import { isAddress } from "../../server/http.js";

export const ROUTE_PROFILE_STANDARD_LINKED = 0;
export const ROUTE_PROFILE_STANDARD_UNLINKED = 1;
export const ROUTE_PROFILE_OG_LINKED = 2;

export const ROUTE_PROFILE_NAMES = {
  [ROUTE_PROFILE_STANDARD_LINKED]: "standard_linked",
  [ROUTE_PROFILE_STANDARD_UNLINKED]: "standard_unlinked",
  [ROUTE_PROFILE_OG_LINKED]: "og_linked",
};

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function normalizeWallet(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

async function readAttribution(walletAddress) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) return { state: null, error: "Invalid wallet address" };

  try {
    const { rows } = await pool.query(
      `select wallet_address,
              recruiter_id,
              recruiter_code,
              recruiter_display_name,
              recruiter_is_og,
              recruiter_status,
              recruiter_link_state,
              squad_state,
              has_activity,
              locked_at,
              materialized_at
         from public.wallet_attribution_states
        where wallet_address = $1
        limit 1`,
      [wallet],
    );
    return { state: rows[0] || null, error: null };
  } catch (error) {
    if (schemaMissing(error)) return { state: null, error: "Attribution schema missing" };
    console.error("[api/routing attribution lookup]", error);
    return { state: null, error: "Attribution lookup failed" };
  }
}

async function readRecruiterWallet(walletAddress) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) return { recruiter: null, error: "Invalid wallet address" };

  try {
    const { rows } = await pool.query(
      `select id,
              wallet_address,
              code,
              display_name,
              is_og,
              status,
              closed_at,
              created_at,
              updated_at
         from public.recruiters
        where wallet_address = $1
        limit 1`,
      [wallet],
    );
    return { recruiter: rows[0] || null, error: null };
  } catch (error) {
    if (schemaMissing(error)) return { recruiter: null, error: "Attribution schema missing" };
    console.error("[api/routing recruiter wallet lookup]", error);
    return { recruiter: null, error: "Recruiter wallet lookup failed" };
  }
}

function activeAttribution(state) {
  if (!state?.recruiter_id) return false;
  if (state.recruiter_status !== "active") return false;
  const linkState = String(state.recruiter_link_state || "").toLowerCase();
  return linkState === "linked_unlocked" || linkState === "linked_locked";
}

function normalizeSquadState(value) {
  const state = String(value || "").trim().toLowerCase();
  return ["in_squad", "linked_squad", "active_squad", "squad_member", "member"].includes(state)
    ? "in_squad"
    : "solo";
}

function linkedDecision(walletAddress, state) {
  const routeProfileId = state.recruiter_is_og
    ? ROUTE_PROFILE_OG_LINKED
    : ROUTE_PROFILE_STANDARD_LINKED;

  return {
    tradeRouteProfileId: routeProfileId,
    finalizeRouteProfileId: routeProfileId,
    routeProfileId,
    decision: {
      profile: ROUTE_PROFILE_NAMES[routeProfileId],
      routeProfileId,
      finalizeRouteProfileId: routeProfileId,
      walletAddress,
      recruiterId: Number(state.recruiter_id),
      recruiterCode: state.recruiter_code,
      recruiterDisplayName: state.recruiter_display_name || null,
      recruiterIsOg: Boolean(state.recruiter_is_og),
      recruiterStatus: state.recruiter_status,
      recruiterLinkState: state.recruiter_link_state,
      squadState: normalizeSquadState(state.squad_state),
      source: "wallet_attribution_states",
      reason: state.recruiter_is_og
        ? "Wallet is linked to an active OG recruiter; using OgLinked."
        : "Wallet is linked to an active recruiter; using StandardLinked.",
    },
  };
}

function selfRecruiterDecision(walletAddress, recruiter) {
  const routeProfileId = recruiter.is_og
    ? ROUTE_PROFILE_OG_LINKED
    : ROUTE_PROFILE_STANDARD_LINKED;

  return {
    tradeRouteProfileId: routeProfileId,
    finalizeRouteProfileId: routeProfileId,
    routeProfileId,
    decision: {
      profile: ROUTE_PROFILE_NAMES[routeProfileId],
      routeProfileId,
      finalizeRouteProfileId: routeProfileId,
      walletAddress,
      recruiterId: Number(recruiter.id),
      recruiterCode: recruiter.code,
      recruiterDisplayName: recruiter.display_name || null,
      recruiterIsOg: Boolean(recruiter.is_og),
      recruiterStatus: recruiter.status,
      recruiterLinkState: "self_recruiter_wallet",
      squadState: "solo",
      source: "recruiters.wallet_address",
      reason: recruiter.is_og
        ? "Wallet owns an active OG recruiter code; using OgLinked."
        : "Wallet owns an active recruiter code; using StandardLinked.",
    },
  };
}

function unlinkedDecision(walletAddress, state = null, recruiter = null, reason = null) {
  return {
    tradeRouteProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
    finalizeRouteProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
    routeProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
    decision: {
      profile: ROUTE_PROFILE_NAMES[ROUTE_PROFILE_STANDARD_UNLINKED],
      routeProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
      finalizeRouteProfileId: ROUTE_PROFILE_STANDARD_UNLINKED,
      walletAddress,
      recruiterId: state?.recruiter_id ? Number(state.recruiter_id) : null,
      recruiterCode: state?.recruiter_code || recruiter?.code || null,
      recruiterDisplayName: state?.recruiter_display_name || recruiter?.display_name || null,
      recruiterIsOg: Boolean(state?.recruiter_is_og ?? recruiter?.is_og),
      recruiterStatus: state?.recruiter_status || recruiter?.status || null,
      recruiterLinkState: state?.recruiter_link_state || (recruiter ? "self_recruiter_inactive" : "unlinked"),
      squadState: normalizeSquadState(state?.squad_state),
      source: recruiter ? "recruiters.wallet_address" : "wallet_attribution_states",
      reason: reason || "Wallet has no active recruiter link; using StandardUnlinked.",
    },
  };
}

export async function getRouteDecision(walletAddress) {
  const [{ state, error: attributionError }, { recruiter, error: recruiterError }] = await Promise.all([
    readAttribution(walletAddress),
    readRecruiterWallet(walletAddress),
  ]);

  if (activeAttribution(state)) return linkedDecision(walletAddress, state);
  if (recruiter?.status === "active") return selfRecruiterDecision(walletAddress, recruiter);

  if (attributionError && recruiterError) {
    return unlinkedDecision(
      walletAddress,
      state,
      recruiter,
      `${attributionError}; ${recruiterError}; using safe fallback route profile.`,
    );
  }

  if (recruiter) {
    return unlinkedDecision(
      walletAddress,
      state,
      recruiter,
      "Wallet owns a recruiter code, but it is not active; using StandardUnlinked.",
    );
  }

  if (state?.recruiter_id) {
    return unlinkedDecision(
      walletAddress,
      state,
      recruiter,
      "Wallet is not linked to an active eligible recruiter; using StandardUnlinked.",
    );
  }

  return unlinkedDecision(walletAddress, state, recruiter);
}
