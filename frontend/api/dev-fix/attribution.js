import { pool } from "../../server/db.js";
import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function schemaMissing(error) {
  return error?.code === "42P01" || error?.code === "42703";
}

function publicState({ walletAddress, recruiter = null, attribution = null }) {
  return {
    walletAddress,
    hasActivity: Boolean(attribution?.has_activity),
    recruiterLinkState: attribution?.link_state || (recruiter ? "linked" : "unlinked"),
    recruiterCode: recruiter?.code || attribution?.recruiter_code || null,
    recruiterDisplayName: recruiter?.display_name || null,
    recruiterIsOg: Boolean(recruiter?.is_og),
    squadState: attribution?.squad_state || (recruiter ? "member" : "solo"),
  };
}

async function findRecruiterByCode(code) {
  const { rows } = await pool.query(
    `select id, chain_id, wallet_address, code, display_name, is_og, status, closed_at
       from public.recruiters
      where lower(code) = lower($1)
      limit 1`,
    [code],
  );
  return rows[0] || null;
}

async function findRecruiterByWallet(walletAddress) {
  const { rows } = await pool.query(
    `select id, chain_id, wallet_address, code, display_name, is_og, status, closed_at
       from public.recruiters
      where lower(wallet_address) = lower($1)
      limit 1`,
    [walletAddress],
  );
  return rows[0] || null;
}

async function findWalletAttribution(walletAddress) {
  const { rows } = await pool.query(
    `select *
       from public.wallet_attributions
      where lower(wallet_address) = lower($1)
      limit 1`,
    [walletAddress],
  );
  return rows[0] || null;
}

async function findLatestSession({ sessionToken, clientFingerprint }) {
  if (sessionToken) {
    const { rows } = await pool.query(
      `select s.*, r.code, r.display_name, r.is_og, r.status
         from public.recruiter_referral_sessions s
         left join public.recruiters r on r.id = s.recruiter_id
        where s.session_token = $1
          and s.expires_at > now()
        order by s.captured_at desc
        limit 1`,
      [sessionToken],
    );
    if (rows[0]) return rows[0];
  }

  if (clientFingerprint) {
    const { rows } = await pool.query(
      `select s.*, r.code, r.display_name, r.is_og, r.status
         from public.recruiter_referral_sessions s
         left join public.recruiters r on r.id = s.recruiter_id
        where s.client_fingerprint = $1
          and s.expires_at > now()
        order by s.captured_at desc
        limit 1`,
      [clientFingerprint],
    );
    if (rows[0]) return rows[0];
  }

  return null;
}

export async function recruiterReferralCapture(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  try {
    const code = normalizeCode(req.params?.code);
    const body = await readJson(req);
    const sessionToken = String(body.sessionToken || "").trim();
    const clientFingerprint = String(body.clientFingerprint || "").trim();
    const walletAddress = normalizeAddress(body.walletAddress) || null;

    if (!code) return json(res, 400, { error: "Missing recruiter code" });
    if (!sessionToken) return json(res, 400, { error: "Missing sessionToken" });
    if (!clientFingerprint) return json(res, 400, { error: "Missing clientFingerprint" });

    const recruiter = await findRecruiterByCode(code);
    if (!recruiter || recruiter.status !== "active") {
      return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });
    }

    await pool.query(
      `insert into public.recruiter_referral_sessions (
         recruiter_id, recruiter_code, session_token, client_fingerprint, wallet_address, user_agent, metadata_json, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
       on conflict (session_token)
       do update set
         recruiter_id = excluded.recruiter_id,
         recruiter_code = excluded.recruiter_code,
         client_fingerprint = excluded.client_fingerprint,
         wallet_address = coalesce(excluded.wallet_address, public.recruiter_referral_sessions.wallet_address),
         user_agent = excluded.user_agent,
         expires_at = now() + interval '30 days',
         updated_at = now()`,
      [
        recruiter.id,
        recruiter.code,
        sessionToken,
        clientFingerprint,
        walletAddress,
        String(req.headers?.["user-agent"] || "").slice(0, 300),
        JSON.stringify({ source: "frontend_referral_capture" }),
      ],
    );

    return json(res, 200, {
      captured: true,
      recruiterCode: recruiter.code,
      recruiterDisplayName: recruiter.display_name,
      recruiterIsOg: Boolean(recruiter.is_og),
      walletAddress,
      expiresInDays: 30,
    });
  } catch (error) {
    console.error("[api/attribution referral capture]", error);
    if (schemaMissing(error)) {
      return json(res, 200, {
        captured: false,
        warning: "Reward attribution schema has not been applied yet.",
      });
    }
    return json(res, 500, { error: "Server error" });
  }
}

export async function attributionWalletConnect(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;

  try {
    const body = await readJson(req);
    const walletAddress = normalizeAddress(body.walletAddress);
    const sessionToken = String(body.sessionToken || "").trim();
    const clientFingerprint = String(body.clientFingerprint || "").trim();

    if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });

    const existing = await findWalletAttribution(walletAddress);
    if (existing?.has_activity || existing?.locked_at || existing?.link_state === "linked") {
      const recruiter = existing.recruiter_id
        ? await findRecruiterByCode(existing.recruiter_code)
        : null;
      return json(res, 200, {
        linked: false,
        locked: Boolean(existing.has_activity || existing.locked_at),
        state: publicState({ walletAddress, recruiter, attribution: existing }),
        reason: "Existing wallet attribution is locked or already linked.",
      });
    }

    const session = await findLatestSession({ sessionToken, clientFingerprint });
    const recruiter = session?.recruiter_id ? await findRecruiterByCode(session.recruiter_code) : null;

    if (!session || !recruiter || recruiter.status !== "active") {
      await pool.query(
        `insert into public.wallet_attributions (wallet_address, link_state, squad_state, source_session_token, source_client_fingerprint, updated_at)
         values ($1, 'unlinked', 'solo', $2, $3, now())
         on conflict (lower(wallet_address))
         do update set
           source_session_token = coalesce(excluded.source_session_token, public.wallet_attributions.source_session_token),
           source_client_fingerprint = coalesce(excluded.source_client_fingerprint, public.wallet_attributions.source_client_fingerprint),
           updated_at = now()`,
        [walletAddress, sessionToken || null, clientFingerprint || null],
      );

      return json(res, 200, {
        linked: false,
        state: publicState({ walletAddress }),
        reason: "No active referral session found for this wallet.",
      });
    }

    await pool.query(
      `insert into public.wallet_attributions (
         wallet_address, recruiter_id, recruiter_code, link_state, squad_state, linked_at,
         source_session_token, source_client_fingerprint, updated_at
       ) values ($1, $2, $3, 'linked', 'member', now(), $4, $5, now())
       on conflict (lower(wallet_address))
       do update set
         recruiter_id = excluded.recruiter_id,
         recruiter_code = excluded.recruiter_code,
         link_state = 'linked',
         squad_state = 'member',
         linked_at = coalesce(public.wallet_attributions.linked_at, now()),
         source_session_token = excluded.source_session_token,
         source_client_fingerprint = excluded.source_client_fingerprint,
         updated_at = now()
       where public.wallet_attributions.has_activity = false
         and public.wallet_attributions.locked_at is null
         and public.wallet_attributions.link_state <> 'linked'`,
      [walletAddress, recruiter.id, recruiter.code, sessionToken || null, clientFingerprint || null],
    );

    const updated = await findWalletAttribution(walletAddress);
    return json(res, 200, {
      linked: updated?.link_state === "linked",
      state: publicState({ walletAddress, recruiter, attribution: updated }),
    });
  } catch (error) {
    console.error("[api/attribution wallet-connect]", error);
    if (schemaMissing(error)) {
      const body = await readJson(req).catch(() => ({}));
      const walletAddress = normalizeAddress(body.walletAddress);
      return json(res, 200, {
        linked: false,
        state: publicState({ walletAddress }),
        warning: "Reward attribution schema has not been applied yet.",
      });
    }
    return json(res, 500, { error: "Server error" });
  }
}

export async function attributionWallet(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  try {
    const walletAddress = normalizeAddress(req.params?.wallet);
    if (!walletAddress) return json(res, 400, { error: "Invalid wallet address" });

    const attribution = await findWalletAttribution(walletAddress);
    const recruiter = attribution?.recruiter_code ? await findRecruiterByCode(attribution.recruiter_code) : null;

    return json(res, 200, {
      state: publicState({ walletAddress, recruiter, attribution }),
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/attribution wallet]", error);
    if (schemaMissing(error)) {
      const walletAddress = normalizeAddress(req.params?.wallet);
      return json(res, 200, {
        state: publicState({ walletAddress }),
        warning: "Reward attribution schema has not been applied yet.",
      });
    }
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterWalletSummary(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  try {
    const wallet = normalizeAddress(req.params?.wallet);
    if (!wallet) return json(res, 400, { error: "Invalid wallet address" });

    const recruiter = await findRecruiterByWallet(wallet);
    if (!recruiter) return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });

    return json(res, 200, {
      recruiterId: Number(recruiter.id),
      walletAddress: recruiter.wallet_address,
      code: recruiter.code,
      displayName: recruiter.display_name,
      isOg: Boolean(recruiter.is_og),
      status: recruiter.status,
      closedAt: recruiter.closed_at,
      linkedWalletCount: 0,
      linkedCreatorsCount: 0,
      linkedTradersCount: 0,
      activeSquadMemberCount: 0,
      referredEventCount: 0,
      referredVolumeRaw: "0",
      recruiterRouteAmountRaw: "0",
      lastReferredEventAt: null,
      latestLinkedActivityAt: null,
      pendingEarningsRaw: "0",
      claimableEarningsRaw: "0",
      totalEarnedRaw: "0",
      claimedLifetimeRaw: "0",
      lastClaimedAt: null,
      weightedScore: 0,
      createdAt: recruiter.created_at || null,
      updatedAt: recruiter.updated_at || null,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/recruiter wallet summary]", error);
    if (schemaMissing(error)) return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiterSummary(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  try {
    const code = normalizeCode(req.params?.code);
    if (!code) return json(res, 400, { error: "Missing recruiter code" });

    const recruiter = await findRecruiterByCode(code);
    if (!recruiter) return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });

    return json(res, 200, {
      recruiterId: Number(recruiter.id),
      walletAddress: recruiter.wallet_address,
      code: recruiter.code,
      displayName: recruiter.display_name,
      isOg: Boolean(recruiter.is_og),
      status: recruiter.status,
      closedAt: recruiter.closed_at,
      linkedWalletCount: 0,
      linkedCreatorsCount: 0,
      linkedTradersCount: 0,
      activeSquadMemberCount: 0,
      referredEventCount: 0,
      referredVolumeRaw: "0",
      recruiterRouteAmountRaw: "0",
      lastReferredEventAt: null,
      latestLinkedActivityAt: null,
      pendingEarningsRaw: "0",
      claimableEarningsRaw: "0",
      totalEarnedRaw: "0",
      claimedLifetimeRaw: "0",
      lastClaimedAt: null,
      weightedScore: 0,
      createdAt: recruiter.created_at || null,
      updatedAt: recruiter.updated_at || null,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/recruiter summary]", error);
    if (schemaMissing(error)) return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });
    return json(res, 500, { error: "Server error" });
  }
}

export async function recruiters(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;

  try {
    const q = getQuery(req);
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 250);
    const status = String(q.status || "active").trim().toLowerCase();

    const { rows } = await pool.query(
      `select id, chain_id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at
         from public.recruiters
        where ($1::text = 'all' or status = $1::text)
        order by is_og desc, created_at asc
        limit $2`,
      [status || "active", limit],
    );

    return json(res, 200, {
      recruiters: rows.map((r) => ({
        recruiterId: Number(r.id),
        walletAddress: r.wallet_address,
        code: r.code,
        displayName: r.display_name,
        isOg: Boolean(r.is_og),
        status: r.status,
        closedAt: r.closed_at,
        linkedWalletCount: 0,
        linkedCreatorsCount: 0,
        linkedTradersCount: 0,
        activeSquadMemberCount: 0,
        referredEventCount: 0,
        referredVolumeRaw: "0",
        recruiterRouteAmountRaw: "0",
        lastReferredEventAt: null,
        latestLinkedActivityAt: null,
        pendingEarningsRaw: "0",
        claimableEarningsRaw: "0",
        totalEarnedRaw: "0",
        claimedLifetimeRaw: "0",
        lastClaimedAt: null,
        weightedScore: 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        materializedAt: new Date().toISOString(),
      })),
      limit,
      status,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/recruiters]", error);
    if (schemaMissing(error)) return json(res, 200, { recruiters: [], warning: "Reward attribution schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}
