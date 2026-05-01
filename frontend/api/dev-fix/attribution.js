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

function publicState({ walletAddress, state = null, recruiter = null }) {
  return {
    walletAddress,
    hasActivity: Boolean(state?.has_activity),
    recruiterLinkState: state?.recruiter_link_state || (recruiter ? "linked_unlocked" : "unlinked"),
    recruiterCode: state?.recruiter_code || recruiter?.code || null,
    recruiterDisplayName: state?.recruiter_display_name || recruiter?.display_name || null,
    recruiterIsOg: Boolean(state?.recruiter_is_og ?? recruiter?.is_og),
    squadState: state?.squad_state || (recruiter ? "in_squad" : "solo"),
  };
}

function recruiterSummaryShape(recruiter, extra = {}) {
  return {
    recruiterId: Number(recruiter.id),
    walletAddress: recruiter.wallet_address,
    code: recruiter.code,
    displayName: recruiter.display_name,
    isOg: Boolean(recruiter.is_og),
    status: recruiter.status,
    closedAt: recruiter.closed_at,
    linkedWalletCount: Number(extra.linkedWalletCount || 0),
    linkedCreatorsCount: Number(extra.linkedCreatorsCount || 0),
    linkedTradersCount: Number(extra.linkedTradersCount || 0),
    activeSquadMemberCount: Number(extra.activeSquadMemberCount || 0),
    referredEventCount: Number(extra.referredEventCount || 0),
    referredVolumeRaw: String(extra.referredVolumeRaw || "0"),
    recruiterRouteAmountRaw: String(extra.recruiterRouteAmountRaw || "0"),
    lastReferredEventAt: extra.lastReferredEventAt || null,
    latestLinkedActivityAt: extra.latestLinkedActivityAt || null,
    pendingEarningsRaw: String(extra.pendingEarningsRaw || "0"),
    claimableEarningsRaw: String(extra.claimableEarningsRaw || "0"),
    totalEarnedRaw: String(extra.totalEarnedRaw || "0"),
    claimedLifetimeRaw: String(extra.claimedLifetimeRaw || "0"),
    lastClaimedAt: extra.lastClaimedAt || null,
    weightedScore: Number(extra.weightedScore || 0),
    createdAt: recruiter.created_at || null,
    updatedAt: recruiter.updated_at || null,
    materializedAt: new Date().toISOString(),
  };
}

async function findRecruiterByCode(code) {
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at
       from public.recruiters
      where lower(code) = lower($1)
      limit 1`,
    [code],
  );
  return rows[0] || null;
}

async function findRecruiterByWallet(walletAddress) {
  const { rows } = await pool.query(
    `select id, wallet_address, code, display_name, is_og, status, closed_at, created_at, updated_at
       from public.recruiters
      where wallet_address = lower($1)
      limit 1`,
    [walletAddress],
  );
  return rows[0] || null;
}

async function findWalletAttributionState(walletAddress) {
  const { rows } = await pool.query(
    `select *
       from public.wallet_attribution_states
      where wallet_address = lower($1)
      limit 1`,
    [walletAddress],
  );
  return rows[0] || null;
}

async function findLatestWindow({ sessionToken, clientFingerprint, walletAddress }) {
  const { rows } = await pool.query(
    `select w.*, r.code, r.display_name, r.is_og, r.status
       from public.wallet_referral_attribution_windows w
       join public.recruiters r on r.id = w.recruiter_id
      where w.consumed_at is null
        and w.expires_at > now()
        and (
          ($1::text is not null and w.session_token = $1::text)
          or ($2::text is not null and w.client_fingerprint = $2::text)
          or ($3::text is not null and w.wallet_address = $3::text)
        )
      order by w.captured_at desc, w.id desc
      limit 1`,
    [sessionToken || null, clientFingerprint || null, walletAddress || null],
  );
  return rows[0] || null;
}

async function getRecruiterStats(recruiterId) {
  const [{ rows: linkRows }, { rows: squadRows }] = await Promise.all([
    pool.query(
      `select count(*)::int as linked_wallet_count,
              max(linked_at) as latest_linked_activity_at
         from public.wallet_recruiter_links
        where recruiter_id = $1 and is_active = true`,
      [recruiterId],
    ),
    pool.query(
      `select count(*)::int as active_squad_member_count
         from public.wallet_squad_memberships
        where recruiter_id = $1 and is_active = true`,
      [recruiterId],
    ),
  ]);

  return {
    linkedWalletCount: linkRows[0]?.linked_wallet_count || 0,
    activeSquadMemberCount: squadRows[0]?.active_squad_member_count || 0,
    latestLinkedActivityAt: linkRows[0]?.latest_linked_activity_at || null,
  };
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
    if (!sessionToken && !clientFingerprint && !walletAddress) {
      return json(res, 400, { error: "Missing attribution identifier" });
    }

    const recruiter = await findRecruiterByCode(code);
    if (!recruiter || recruiter.status !== "active") {
      return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });
    }

    await pool.query(
      `insert into public.wallet_referral_attribution_windows (
         wallet_address, recruiter_id, client_fingerprint, session_token, expires_at, metadata, updated_at
       ) values ($1, $2, $3, $4, now() + interval '30 days', $5::jsonb, now())`,
      [
        walletAddress,
        recruiter.id,
        clientFingerprint || null,
        sessionToken || null,
        JSON.stringify({
          source: "frontend_referral_capture",
          userAgent: String(req.headers?.["user-agent"] || "").slice(0, 300),
        }),
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
        warning: "Canonical reward attribution schema has not been applied yet.",
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

    await pool.query(
      `insert into public.wallet_profiles (wallet_address)
       values ($1)
       on conflict (wallet_address)
       do update set updated_at = now()`,
      [walletAddress],
    );

    const existingState = await findWalletAttributionState(walletAddress);
    if (
      existingState?.recruiter_id ||
      existingState?.has_activity ||
      existingState?.recruiter_link_state === "linked_locked"
    ) {
      return json(res, 200, {
        linked: Boolean(existingState?.recruiter_id),
        locked: Boolean(existingState?.has_activity || existingState?.locked_at),
        state: publicState({ walletAddress, state: existingState }),
        reason: "Existing canonical wallet attribution is already linked or locked.",
      });
    }

    const window = await findLatestWindow({ sessionToken, clientFingerprint, walletAddress });
    const recruiter = window?.recruiter_id ? await findRecruiterByCode(window.code) : null;

    if (!window || !recruiter || recruiter.status !== "active") {
      return json(res, 200, {
        linked: false,
        state: publicState({ walletAddress }),
        reason: "No active referral attribution window found for this wallet.",
      });
    }

    await pool.query("BEGIN");
    try {
      await pool.query(
        `insert into public.wallet_recruiter_links (wallet_address, recruiter_id, link_source)
         values ($1, $2, 'referral_cookie')
         on conflict (wallet_address) where is_active = true
         do nothing`,
        [walletAddress, recruiter.id],
      );

      await pool.query(
        `insert into public.wallet_squad_memberships (wallet_address, recruiter_id)
         values ($1, $2)
         on conflict (wallet_address) where is_active = true
         do nothing`,
        [walletAddress, recruiter.id],
      );

      await pool.query(
        `update public.wallet_referral_attribution_windows
            set wallet_address = coalesce(wallet_address, $1),
                consumed_at = now(),
                updated_at = now()
          where id = $2`,
        [walletAddress, window.id],
      );

      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    const updatedState = await findWalletAttributionState(walletAddress);
    return json(res, 200, {
      linked: Boolean(updatedState?.recruiter_id),
      state: publicState({ walletAddress, state: updatedState, recruiter }),
    });
  } catch (error) {
    console.error("[api/attribution wallet-connect]", error);
    if (schemaMissing(error)) {
      const body = await readJson(req).catch(() => ({}));
      const walletAddress = normalizeAddress(body.walletAddress);
      return json(res, 200, {
        linked: false,
        state: publicState({ walletAddress }),
        warning: "Canonical reward attribution schema has not been applied yet.",
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

    const state = await findWalletAttributionState(walletAddress);
    return json(res, 200, {
      state: publicState({ walletAddress, state }),
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/attribution wallet]", error);
    if (schemaMissing(error)) {
      const walletAddress = normalizeAddress(req.params?.wallet);
      return json(res, 200, {
        state: publicState({ walletAddress }),
        warning: "Canonical reward attribution schema has not been applied yet.",
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

    const stats = await getRecruiterStats(recruiter.id);
    return json(res, 200, recruiterSummaryShape(recruiter, stats));
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

    const stats = await getRecruiterStats(recruiter.id);
    return json(res, 200, recruiterSummaryShape(recruiter, stats));
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
      `select r.id,
              r.wallet_address,
              r.code,
              r.display_name,
              r.is_og,
              r.status,
              r.closed_at,
              r.created_at,
              r.updated_at,
              count(distinct l.wallet_address)::int as linked_wallet_count,
              count(distinct s.wallet_address)::int as active_squad_member_count,
              max(l.linked_at) as latest_linked_activity_at
         from public.recruiters r
         left join public.wallet_recruiter_links l on l.recruiter_id = r.id and l.is_active = true
         left join public.wallet_squad_memberships s on s.recruiter_id = r.id and s.is_active = true
        where ($1::text = 'all' or r.status = $1::text)
        group by r.id
        order by r.is_og desc, linked_wallet_count desc, r.created_at asc
        limit $2`,
      [status || "active", limit],
    );

    return json(res, 200, {
      recruiters: rows.map((r) => recruiterSummaryShape(r, {
        linkedWalletCount: r.linked_wallet_count,
        activeSquadMemberCount: r.active_squad_member_count,
        latestLinkedActivityAt: r.latest_linked_activity_at,
      })),
      limit,
      status,
      materializedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/recruiters]", error);
    if (schemaMissing(error)) return json(res, 200, { recruiters: [], warning: "Canonical reward attribution schema has not been applied yet." });
    return json(res, 500, { error: "Server error" });
  }
}
