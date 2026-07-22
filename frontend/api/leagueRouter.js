import league from "./league.js";
import leagueRecruiter from "./leagueRecruiter.js";
import monthlyLeagueTreasury from "./monthlyLeagueTreasury.js";

function readRequest(req) {
  try {
    const base = `${req.protocol || "http"}://${req.headers?.host || "localhost"}`;
    const url = new URL(req.originalUrl || req.url || "", base);
    return {
      category: String(url.searchParams.get("category") || "").toLowerCase().trim(),
      monthId: String(url.searchParams.get("monthId") || "").trim(),
      wallet: String(url.searchParams.get("wallet") || "").trim(),
      search: url.search,
    };
  } catch {
    return { category: "", monthId: "", wallet: "", search: "" };
  }
}

export default async function handler(req, res) {
  const request = readRequest(req);

  // Monthly treasury reads use the already-mounted /api/league route so this
  // remains deployable without broad server-router changes:
  // GET /api/league?monthId=202607&chainId=56
  // GET /api/league?monthId=202607&wallet=0x...&chainId=56
  if (request.monthId) {
    const suffix = request.wallet ? `/claimable/${request.wallet}` : "";
    const path = `/league/month/${request.monthId}${suffix}`;
    const proxyReq = {
      ...req,
      path,
      url: `${path}${request.search}`,
      originalUrl: `/api${path}${request.search}`,
    };
    return monthlyLeagueTreasury(proxyReq, res);
  }

  if (request.category === "recruiter_league") {
    return leagueRecruiter(req, res);
  }

  return league(req, res);
}
