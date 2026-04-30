import { badMethod, getQuery, isAddress, json, readJson } from "../../server/http.js";

const ZERO_AMOUNT = "0";
const INTERNAL_TOKEN_ENV_KEYS = ["INTERNAL_REWARDS_TOKEN", "RANK_EVENTS_TOKEN", "REWARD_OPS_TOKEN"];

function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  badMethod(res);
  return false;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return isAddress(raw) ? raw : "";
}

function parseLimit(value, fallback = 50, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function internalTokenConfigured() {
  return INTERNAL_TOKEN_ENV_KEYS.some((key) => String(process.env[key] || "").trim());
}

function requireInternalToken(req, res) {
  const expected = INTERNAL_TOKEN_ENV_KEYS
    .map((key) => String(process.env[key] || "").trim())
    .find(Boolean);

  if (!expected) {
    json(res, 503, {
      error: "Internal reward ops API is not configured in this environment.",
      code: "INTERNAL_REWARDS_TOKEN_MISSING",
    });
    return false;
  }

  const header = String(req.headers?.authorization || "").trim();
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (token !== expected) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }

  return true;
}

function emptyRewardSummary(address) {
  return {
    walletAddress: address,
    pendingByProgram: {},
    claimableByProgram: {},
    claimedByProgram: {},
    totalClaimableAmount: ZERO_AMOUNT,
    claimedLifetimeAmount: ZERO_AMOUNT,
    lastClaimedAt: null,
    materializedAt: null,
  };
}

export async function rewardsMe(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const address = normalizeAddress(q.address);
  if (!address) return json(res, 400, { error: "Invalid or missing address" });

  return json(res, 200, emptyRewardSummary(address));
}

export async function rewardsHistory(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const address = normalizeAddress(q.address);
  if (!address) return json(res, 400, { error: "Invalid or missing address" });

  return json(res, 200, {
    address,
    items: [],
    limit: parseLimit(q.limit, 50, 100),
    program: q.program || null,
    materializedAt: null,
  });
}

export async function rewardsClaims(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const address = normalizeAddress(q.address);
  if (!address) return json(res, 400, { error: "Invalid or missing address" });

  return json(res, 200, {
    address,
    claims: [],
    limit: parseLimit(q.limit, 50, 100),
    program: q.program || null,
    materializedAt: null,
  });
}

export async function rewardsEligibility(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const address = normalizeAddress(q.address);
  if (!address) return json(res, 400, { error: "Invalid or missing address" });

  return json(res, 200, {
    address,
    items: [],
    limit: parseLimit(q.limit, 20, 100),
    program: q.program || null,
    materializedAt: null,
  });
}

export async function airdropWinners(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    epochId: q.epochId ? Number(q.epochId) : null,
    program: q.program || null,
    walletAddress: q.walletAddress || null,
    limit: parseLimit(q.limit, 20, 100),
    isPublished: false,
    materializedAt: null,
  });
}

export async function squadsLeaderboard(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    currentEpochId: q.epochId ? Number(q.epochId) : null,
    currentEpochStartAt: null,
    currentEpochEndAt: null,
    materializedAt: null,
  });
}

export async function squadSummary(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const recruiterCode = String(req.params?.code || "").trim();
  if (!recruiterCode) return json(res, 400, { error: "Missing recruiter code" });

  return json(res, 404, { error: "Squad summary not found", code: "SQUAD_NOT_FOUND" });
}

export async function squadMembers(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    epochId: q.epochId ? Number(q.epochId) : null,
    recruiterCode: q.recruiterCode || null,
    walletAddress: q.walletAddress || null,
    limit: parseLimit(q.limit, 50, 100),
    materializedAt: null,
  });
}

export async function recruiters(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    recruiters: [],
    limit: parseLimit(q.limit, 100, 250),
    status: q.status || null,
    materializedAt: null,
  });
}

export async function recruiterSummary(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const code = String(req.params?.code || "").trim();
  if (!code) return json(res, 400, { error: "Missing recruiter code" });

  return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });
}

export async function recruiterWalletSummary(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const wallet = normalizeAddress(req.params?.wallet);
  if (!wallet) return json(res, 400, { error: "Invalid wallet address" });

  return json(res, 404, { error: "Recruiter not found", code: "RECRUITER_NOT_FOUND" });
}

export async function recruiterReplacements(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const code = String(req.params?.code || "").trim();
  if (!code) return json(res, 400, { error: "Missing recruiter code" });

  return json(res, 200, {
    recruiterCode: code,
    replacements: [],
    materializedAt: null,
  });
}

export async function recruiterReferralCapture(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const code = String(req.params?.code || "").trim();
  const body = await readJson(req);
  if (!code) return json(res, 400, { error: "Missing recruiter code" });

  return json(res, 200, {
    captured: false,
    recruiterCode: code,
    walletAddress: normalizeAddress(body.walletAddress) || null,
    sessionToken: body.sessionToken || null,
    clientFingerprint: body.clientFingerprint || null,
    reason: "Recruiter referral capture route is wired, but attribution persistence is not implemented in this environment yet.",
  });
}

export async function attributionWalletConnect(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const walletAddress = normalizeAddress(body.walletAddress);
  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });

  return json(res, 200, {
    state: {
      walletAddress,
      hasActivity: false,
      recruiterLinkState: "unlinked",
      recruiterCode: null,
      recruiterDisplayName: null,
      recruiterIsOg: false,
      squadState: "solo",
    },
    linked: false,
    reason: "Wallet attribution route is wired, but attribution persistence is not implemented in this environment yet.",
  });
}

export async function attributionWallet(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const walletAddress = normalizeAddress(req.params?.wallet);
  if (!walletAddress) return json(res, 400, { error: "Invalid wallet address" });

  return json(res, 200, {
    state: {
      walletAddress,
      hasActivity: false,
      recruiterLinkState: "unlinked",
      recruiterCode: null,
      recruiterDisplayName: null,
      recruiterIsOg: false,
      squadState: "solo",
    },
    materializedAt: null,
  });
}

export async function routingCreateAuthorization(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const walletAddress = normalizeAddress(body.walletAddress);
  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });

  return json(res, 503, {
    error: "Route authorization signer is not configured yet.",
    code: "ROUTE_AUTHORIZER_NOT_IMPLEMENTED",
    expectedNextStep: "Implement signed MWZ_CREATE_ROUTE_AUTH responses using the route authority private key.",
  });
}

export async function routingTradeAuthorization(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const walletAddress = normalizeAddress(body.walletAddress);
  const campaignAddress = normalizeAddress(body.campaignAddress);
  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });
  if (!campaignAddress) return json(res, 400, { error: "Invalid or missing campaignAddress" });

  return json(res, 503, {
    error: "Route authorization signer is not configured yet.",
    code: "ROUTE_AUTHORIZER_NOT_IMPLEMENTED",
    expectedNextStep: "Implement signed MWZ_ROUTE_TRADE_AUTH responses using the route authority private key.",
  });
}

export async function recruiterSignupStatus(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const walletAddress = normalizeAddress(q.walletAddress);
  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });

  return json(res, 200, {
    walletAddress,
    isRecruiter: false,
    recruiter: null,
    canStartSignup: true,
    signupApiAvailable: true,
  });
}

export async function recruiterSignupCodeAvailability(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const code = String(q.code || "").trim().toLowerCase();
  if (!code) return json(res, 400, { error: "Missing recruiter code" });

  return json(res, 200, {
    code,
    isAvailable: null,
    message: "Recruiter code availability is wired but not backed by persistence yet.",
  });
}

export async function recruiterSignupNonce(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  const body = await readJson(req);
  const walletAddress = normalizeAddress(body.walletAddress);
  if (!walletAddress) return json(res, 400, { error: "Invalid or missing walletAddress" });

  return json(res, 503, {
    error: "Recruiter signup nonce storage is not configured yet.",
    code: "RECRUITER_SIGNUP_NOT_IMPLEMENTED",
  });
}

export async function recruiterSignupSubmit(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  return json(res, 503, {
    error: "Recruiter signup submission is not configured yet.",
    code: "RECRUITER_SIGNUP_NOT_IMPLEMENTED",
  });
}

export async function internalRewardPublications(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  if (!requireInternalToken(req, res)) return;

  if (req.method === "GET") {
    return json(res, 200, { items: [] });
  }

  const body = await readJson(req);
  return json(res, 200, {
    item: {
      id: null,
      resourceType: body.resourceType || null,
      resourceKey: body.resourceKey || "latest",
      isPublished: Boolean(body.isPublished),
      changedBy: body.actedBy || null,
      reason: body.reason || null,
      metadataJson: {},
      publishedAt: body.isPublished ? new Date().toISOString() : null,
      unpublishedAt: body.isPublished ? null : new Date().toISOString(),
      createdAt: null,
      updatedAt: new Date().toISOString(),
    },
    warning: "Publication state is not persisted yet.",
  });
}

export async function internalRewardRouting(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  if (!requireInternalToken(req, res)) return;
  return json(res, 200, {
    diagnostics: {
      activeLinkedWalletCount: 0,
      lockedWalletCount: 0,
      recruiterRouteAmount: ZERO_AMOUNT,
      airdropPoolAmount: ZERO_AMOUNT,
      squadPoolAmount: ZERO_AMOUNT,
      protocolRevenueAmount: ZERO_AMOUNT,
      internalTokenConfigured: internalTokenConfigured(),
    },
  });
}

export async function internalRewardClaimVault(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  if (!requireInternalToken(req, res)) return;
  return json(res, 200, {
    posture: {
      programs: [],
      totalClaimableAmount: ZERO_AMOUNT,
      totalPendingAmount: ZERO_AMOUNT,
      materializedAt: null,
    },
  });
}

export async function internalRewardEpochStatus(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  if (!requireInternalToken(req, res)) return;
  const q = getQuery(req);
  return json(res, 200, { items: [], limit: parseLimit(q.limit, 20, 100) });
}

export async function internalRewardAlerts(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  if (!requireInternalToken(req, res)) return;
  return json(res, 200, { items: [] });
}

export async function internalRewardAdminActions(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  if (!requireInternalToken(req, res)) return;
  const q = getQuery(req);
  return json(res, 200, { items: [], limit: parseLimit(q.limit, 50, 100) });
}

export async function internalAirdropDraws(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  if (!requireInternalToken(req, res)) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    epochId: q.epochId ? Number(q.epochId) : null,
    program: q.program || null,
    status: q.status || null,
    limit: parseLimit(q.limit, 20, 100),
  });
}

export async function internalAirdropDrawRun(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  if (!requireInternalToken(req, res)) return;
  return json(res, 503, {
    error: "Airdrop draw execution is not implemented yet.",
    code: "AIRDROP_DRAW_NOT_IMPLEMENTED",
  });
}
