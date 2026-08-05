/**
 * For social crawlers (X/Twitter, etc.), serve server OG HTML for /prepare/:slug
 * instead of the SPA shell (which only has generic meta tags).
 *
 * Humans still get the SPA via context.next().
 */

const BOT_RE =
  /twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|googlebot|bingbot|embedly|quora link preview|pinterest|redditbot|applebot|vkshare|w3c_validator|discordbot|skypeuripreview|nuzzel|tumblr|bitlybot|streamingbot|outbrain|iframely|opengraph|developer\.google\.com/i;

const API_BASE =
  Deno.env.get("PREPARE_OG_API_BASE") ||
  Deno.env.get("VITE_FRONTEND_API_BASE") ||
  "https://memebattles-frontend-7dcf.up.railway.app";

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT_RE.test(ua)) {
    return context.next();
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // /prepare/:slug
  if (parts[0] !== "prepare" || !parts[1]) {
    return context.next();
  }

  const slug = encodeURIComponent(parts[1]);
  // Prefer same-origin /api proxy (Netlify → Railway) so previews + prod both work.
  // Fall back to explicit Railway API base if needed.
  const sameOriginOg = `${url.origin}/api/prepare-og/${slug}`;
  const apiBase = String(API_BASE).replace(/\/+$/, "");
  const railwayOg = `${apiBase}/api/prepare-og/${slug}`;
  const ogCandidates = sameOriginOg === railwayOg ? [sameOriginOg] : [sameOriginOg, railwayOg];

  try {
    let html = "";
    for (const ogUrl of ogCandidates) {
      try {
        const upstream = await fetch(ogUrl, {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": ua,
          },
          redirect: "follow",
        });
        if (!upstream.ok) continue;
        const body = await upstream.text();
        if (body && body.includes("og:image") && body.includes("twitter:card")) {
          html = body;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    if (!html) {
      return context.next();
    }

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=120, s-maxage=300",
        "x-mwz-edge-og": "1",
      },
    });
  } catch {
    return context.next();
  }
};

export const config = { path: "/prepare/*" };
