// Minimal reward-program stubs for local hybrid/devpostgrad until canonical reward tables are wired.

function methodAllowed(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  res.status(405).json({ error: "Method not allowed" });
  return false;
}

function getQuery(req) {
  return req.query || {};
}

function parseLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function json(res, status, payload) {
  return res.status(status).json({ ok: status < 400, ...payload });
}

export async function rewardsMe(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const address = String(q.address || q.walletAddress || "").trim();
  return json(res, 200, {
    address,
    chainId: q.chainId ? Number(q.chainId) : null,
    claimable: [],
    totals: {
      claimableAmount: "0",
      claimedAmount: "0",
      expiredAmount: "0",
    },
    materializedAt: null,
  });
}

export async function rewardsHistory(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    address: q.address || q.walletAddress || null,
    chainId: q.chainId ? Number(q.chainId) : null,
    limit: parseLimit(q.limit, 20, 100),
    cursor: q.cursor || null,
    nextCursor: null,
  });
}

export async function rewardsClaims(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    address: q.address || q.walletAddress || null,
    chainId: q.chainId ? Number(q.chainId) : null,
    limit: parseLimit(q.limit, 20, 100),
    materializedAt: null,
  });
}

export async function rewardsEligibility(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  const address = String(q.address || q.walletAddress || "").trim();
  return json(res, 200, {
    address,
    chainId: q.chainId ? Number(q.chainId) : null,
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
    chainId: q.chainId ? Number(q.chainId) : null,
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
    materializedAt: null,
  });
}

export async function squadMembers(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  const q = getQuery(req);
  return json(res, 200, {
    items: [],
    recruiterCode: q.recruiterCode || null,
    walletAddress: q.walletAddress || null,
    currentEpochId: q.epochId ? Number(q.epochId) : null,
    materializedAt: null,
  });
}

export async function recruiterReplacements(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    items: [],
    replacementQueue: [],
    materializedAt: null,
  });
}

export async function internalAirdropDraws(req, res) {
  if (!methodAllowed(req, res, ["GET"])) return;
  return json(res, 200, {
    items: [],
    status: "stub",
    materializedAt: null,
  });
}

export async function internalAirdropDrawRun(req, res) {
  if (!methodAllowed(req, res, ["POST"])) return;
  return json(res, 202, {
    status: "queued",
    drawId: null,
    materializedAt: null,
  });
}

export async function internalRewardEpochStatus(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    status: "stub",
    currentEpochId: null,
    materializedAt: null,
  });
}

export async function internalRewardClaimVault(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    claimVault: null,
    status: "stub",
    materializedAt: null,
  });
}

export async function internalRewardRouting(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    routes: [],
    status: "stub",
    materializedAt: null,
  });
}

export async function internalRewardPublications(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    publications: [],
    status: "stub",
    materializedAt: null,
  });
}

export async function internalRewardAlerts(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    alerts: [],
    status: "stub",
    materializedAt: null,
  });
}

export async function internalRewardAdminActions(req, res) {
  if (!methodAllowed(req, res, ["GET", "POST"])) return;
  return json(res, 200, {
    actions: [],
    status: "stub",
    materializedAt: null,
  });
}
