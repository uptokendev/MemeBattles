/**
 * Prepare Mode social previews for /prepare/:slug
 *
 * Problem:
 * - X/Twitter often unfurls with a browser-like UA (not only Twitterbot).
 * - SPA index.html only has generic site OG tags → empty/wrong card.
 *
 * Strategy:
 * 1) Bots → pure server OG HTML (title/description + share-card PNG meta).
 * 2) Everyone else → SPA HTML with OG/Twitter meta tags injected for this slug
 *    so browser-UA crawlers still see the correct card, while humans get the app.
 */

const BOT_RE =
  /twitterbot|facebookexternalhit|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|googlebot|bingbot|embedly|quora link preview|pinterest|redditbot|applebot|vkshare|w3c_validator|skypeuripreview|nuzzel|tumblr|bitlybot|streamingbot|outbrain|iframely|opengraph|developer\.google\.com|x\.com|twitter/i;

const API_BASE =
  Deno.env.get("PREPARE_OG_API_BASE") ||
  Deno.env.get("VITE_FRONTEND_API_BASE") ||
  "";

async function fetchOgHtml(origin: string, slug: string, ua: string): Promise<string> {
  const encoded = encodeURIComponent(slug);
  const apiBase = String(API_BASE).replace(/\/+$/, "");
  const sameOriginOg = `${origin}/api/prepare-og/${encoded}`;
  const configuredOg = apiBase ? `${apiBase}/api/prepare-og/${encoded}` : "";
  const candidates = configuredOg && configuredOg !== sameOriginOg ? [sameOriginOg, configuredOg] : [sameOriginOg];

  for (const ogUrl of candidates) {
    try {
      const upstream = await fetch(ogUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": ua || "MemeWarzone-Prepare-OG/1.0",
        },
        redirect: "follow",
      });
      if (!upstream.ok) continue;
      const body = await upstream.text();
      if (body && body.includes("og:image") && body.includes("twitter:card")) {
        return body;
      }
    } catch {
      // try next
    }
  }
  return "";
}

function extractInjectBlock(ogHtml: string): string {
  const bits: string[] = [];
  const title = ogHtml.match(/<title>[\s\S]*?<\/title>/i);
  if (title) bits.push(title[0]);

  const canonical = ogHtml.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
  if (canonical) bits.push(canonical[0]);

  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(ogHtml)) !== null) {
    const tag = m[0];
    if (
      /property\s*=\s*["']og:/i.test(tag) ||
      /name\s*=\s*["']twitter:/i.test(tag) ||
      /name\s*=\s*["']description["']/i.test(tag)
    ) {
      bits.push(tag);
    }
  }
  return bits.join("\n  ");
}

function injectOgIntoSpa(spaHtml: string, ogHtml: string): string {
  const inject = extractInjectBlock(ogHtml);
  if (!inject) return spaHtml;

  let html = spaHtml;
  // Drop generic site OG / Twitter tags from index.html so crawlers don't prefer them.
  html = html.replace(/<meta\b[^>]*property\s*=\s*["']og:[^"']*["'][^>]*>\s*/gi, "");
  html = html.replace(/<meta\b[^>]*name\s*=\s*["']twitter:[^"']*["'][^>]*>\s*/gi, "");
  // Keep one description — replace generic with campaign-specific via inject.
  html = html.replace(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>\s*/gi, "");
  html = html.replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>\s*/gi, "");

  const titleTag = inject.match(/<title>[\s\S]*?<\/title>/i)?.[0];
  if (titleTag) {
    if (/<title>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
    }
  }

  if (html.includes("</head>")) {
    return html.replace("</head>", `  <!-- mwz prepare og inject -->\n  ${inject}\n</head>`);
  }
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>\n  <!-- mwz prepare og inject -->\n  ${inject}\n`);
  }
  return html;
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "prepare" || !parts[1]) {
    return context.next();
  }

  const slug = decodeURIComponent(parts[1]);
  const ua = request.headers.get("user-agent") || "";
  const isBot = BOT_RE.test(ua);

  const ogHtml = await fetchOgHtml(url.origin, slug, ua);
  if (!ogHtml) {
    return context.next();
  }

  // Bots: pure OG document (no SPA shell, no generic meta).
  if (isBot) {
    return new Response(ogHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=120",
        "x-mwz-edge-og": "bot",
      },
    });
  }

  // Humans + browser-UA crawlers: SPA with correct OG tags in the HTML source.
  try {
    const spa = await context.next();
    const contentType = spa.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return spa;
    }

    const spaHtml = await spa.text();
    const injected = injectOgIntoSpa(spaHtml, ogHtml);

    const headers = new Headers(spa.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("x-mwz-edge-og", "inject");
    // Avoid long-lived CDN cache of a specific draft's injected tags on the shell.
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    headers.delete("content-length");
    headers.delete("etag");
    headers.delete("content-encoding");

    return new Response(injected, {
      status: spa.status,
      headers,
    });
  } catch {
    // Fallback: at least bots of any kind can use pure OG if SPA rewrite fails.
    return new Response(ogHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=120",
        "x-mwz-edge-og": "bot-fallback",
      },
    });
  }
};

export const config = { path: "/prepare/*" };
