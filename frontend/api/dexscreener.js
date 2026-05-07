const DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex/tokens";
const DEFAULT_TIMEOUT_MS = 8000;

function readTokenAddress(req) {
  return String(req.params?.address || req.query?.address || req.query?.tokenAddress || "").trim();
}

export default async function dexScreenerToken(req, res) {
  if (String(req.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const tokenAddress = readTokenAddress(req);
  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    return res.status(400).json({ error: "Invalid token address" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.DEXSCREENER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

  try {
    const upstream = await fetch(`${DEXSCREENER_BASE}/${tokenAddress}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "MemeWarzone/1.0 (+https://memewar.zone)",
      },
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=20, stale-while-revalidate=60");
    return res.send(text || "{}");
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return res.status(aborted ? 504 : 502).json({
      error: aborted ? "DexScreener request timed out" : "DexScreener request failed",
      detail: err?.message || String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}
