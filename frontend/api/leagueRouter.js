import league from "./league.js";
import leagueRecruiter from "./leagueRecruiter.js";

function readCategory(req) {
  try {
    const base = `${req.protocol || "http"}://${req.headers?.host || "localhost"}`;
    const url = new URL(req.originalUrl || req.url || "", base);
    return String(url.searchParams.get("category") || "").toLowerCase().trim();
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  if (readCategory(req) === "recruiter_league") {
    return leagueRecruiter(req, res);
  }

  return league(req, res);
}
