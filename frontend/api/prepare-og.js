/**
 * Social crawler landing HTML for Prepare Mode pages.
 * X/Twitter (and similar) do not execute SPA JS — they need server-rendered
 * og:/twitter: meta tags with an absolute share-card image URL.
 */
import { pool } from "../server/db.js";
import { badMethod, getQuery, json } from "../server/http.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ogHtml({ title, description, pageUrl, imageUrl, siteName = "MemeWarzone" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(pageUrl)}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(siteName)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="${esc(imageUrl)}" />
  <meta property="og:image:secure_url" content="${esc(imageUrl)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1002" />
  <meta property="og:image:height" content="668" />
  <meta property="og:image:alt" content="${esc(title)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@memewarzone" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(imageUrl)}" />
  <meta name="twitter:image:alt" content="${esc(title)}" />

  <meta http-equiv="refresh" content="0;url=${esc(pageUrl)}" />
</head>
<body style="background:#050505;color:#f5f5f5;font-family:system-ui,sans-serif;padding:2rem;">
  <p>Opening <a href="${esc(pageUrl)}" style="color:#f06a1a;">${esc(title)}</a>…</p>
  <p><img src="${esc(imageUrl)}" alt="${esc(title)}" style="max-width:100%;height:auto;border:1px solid #333;" /></p>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return badMethod(res);

  try {
    const q = getQuery(req);
    const slug = String(req.params?.slug || q.slug || "").trim();
    if (!slug) return json(res, 400, { error: "Missing prepare slug" });

    if (!pool) return json(res, 503, { error: "DATABASE_URL required for prepare OG" });

    const draftRes = await pool.query(
      `select id, chain_id, slug, name, ticker, description, logo_url, status, visibility,
              creator_wallet, x_url, created_at, updated_at
         from public.campaign_drafts
        where lower(slug) = lower($1)
        limit 1`,
      [slug],
    );
    const draft = draftRes.rows[0];
    if (!draft) return json(res, 404, { error: "Prepare page not found" });

    // Private drafts: still show generic card so links don't 404 for bots.
    const isPrivate = String(draft.visibility || "").toLowerCase() === "private";

    const [promoRes, metricsRes] = await Promise.all([
      pool
        .query(`select mission_statement, creator_note, share_message from public.campaign_draft_promotion where draft_id = $1 limit 1`, [
          draft.id,
        ])
        .catch(() => ({ rows: [] })),
      pool
        .query(`select * from public.campaign_draft_metrics where draft_id = $1 limit 1`, [draft.id])
        .catch(() => ({ rows: [] })),
    ]);
    const promotion = promoRes.rows[0] || {};
    const metrics = metricsRes.rows[0] || {};

    const appBase = String(process.env.PUBLIC_APP_URL || "https://app.memewar.zone").replace(/\/+$/, "");
    const pageUrl = `${appBase}/prepare/${draft.slug}`;

    const title = isPrivate
      ? "MemeWarzone Prepare Mode"
      : `${draft.name || "Campaign"} ($${String(draft.ticker || "").toUpperCase()}) — MemeWarzone`;

    const description = isPrivate
      ? "A private Prepare Mode dossier on MemeWarzone."
      : String(
          promotion.share_message ||
            draft.description ||
            promotion.mission_statement ||
            promotion.creator_note ||
            `Incoming transmission: ${draft.name || "this campaign"} is preparing for war on MemeWarzone.`,
        ).slice(0, 200);

    // Short absolute image URL (slug only). Long query strings break some crawlers.
    // prepare-share-card loads draft/metrics by slug and renders the PNG.
    const imageUrl = `${appBase}/api/prepare-share-card?slug=${encodeURIComponent(draft.slug)}`;

    const html = ogHtml({ title, description, pageUrl, imageUrl });
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("cache-control", "public, max-age=120, s-maxage=300");
    res.setHeader("x-mwz-og", "prepare");
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(html);
  } catch (error) {
    console.error("[api/prepare-og]", error);
    return json(res, 500, { error: "Failed to build prepare OG page" });
  }
}
