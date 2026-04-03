import { pool } from "../server/db.js";
import { badMethod, getQuery, isAddress, json } from "../server/http.js";

const LEAGUES = {
  perfect_run: { title: "Perfect Run", image: "/assets/perfectrun.png" },
  fastest_finish: { title: "Fastest Finish", image: "/assets/fastestfinish.png" },
  biggest_hit: { title: "Biggest Hit", image: "/assets/biggesthit.png" },
  top_earner: { title: "Top Earner", image: "/assets/topearner.png" },
  crowd_favorite: { title: "Crowd Favorite", image: "/assets/crowdfavorite.png" },
};

const TIER_STEPS = [
  { tier: "Bronze", minWins: 1 },
  { tier: "Silver", minWins: 3 },
  { tier: "Gold", minWins: 5 },
  { tier: "Platinum", minWins: 10 },
  { tier: "Diamond", minWins: 25 },
  { tier: "Legend", minWins: 50 },
];

const ASSET_CACHE = new Map();

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function filenameSafe(value) {
  return String(value ?? "share-card")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "share-card";
}

function inferOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function mimeTypeForAsset(assetPath) {
  const value = String(assetPath || "").toLowerCase();
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function assetToDataUri(origin, assetPath) {
  const key = `${origin}|${assetPath}`;
  if (ASSET_CACHE.has(key)) return ASSET_CACHE.get(key);

  const response = await fetch(`${origin}${assetPath}`);
  if (!response.ok) {
    throw new Error(`Failed to load share card asset: ${assetPath} (${response.status})`);
  }

  const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");
  const dataUri = `data:${mimeTypeForAsset(assetPath)};base64,${base64}`;
  ASSET_CACHE.set(key, dataUri);
  return dataUri;
}

function getLeagueMeta(category) {
  return LEAGUES[String(category)] || { title: String(category || "League"), image: "/assets/leaguelogo.png" };
}

function shortenAddress(addr) {
  const value = String(addr ?? "").trim();
  if (!value) return "";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function trimBnb(raw) {
  try {
    const v = BigInt(String(raw ?? "0"));
    const whole = v / 1000000000000000000n;
    const frac = (v % 1000000000000000000n).toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return "0";
  }
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.trunc(Number(totalSeconds) || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${seconds}s`);
  return parts.slice(0, 2).join(" ");
}

function formatEpochLabel(period, epochStart) {
  const date = new Date(epochStart);
  if (Number.isNaN(date.getTime())) return String(epochStart || "");
  if (period === "monthly") {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  }
  return `Week of ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)}`;
}

function formatWinPlacement(period, rank) {
  const label = period === "monthly" ? "Monthly" : "Weekly";
  return Number(rank) === 1 ? `${label} Champion` : `${label} #${Number(rank)}`;
}

function formatMetric(category, meta) {
  const data = meta && typeof meta === "object" ? meta : {};

  if (category === "fastest_finish" || category === "perfect_run") {
    const seconds = Number(data.duration_seconds ?? data.score ?? 0);
    if (Number.isFinite(seconds) && seconds > 0) return { label: "Time", value: formatDuration(seconds) };
  }
  if (category === "biggest_hit") {
    return { label: "Hit", value: `${trimBnb(String(data.score ?? "0"))} BNB` };
  }
  if (category === "top_earner") {
    return { label: "PnL", value: `${trimBnb(String(data.pnl_raw ?? data.score ?? "0"))} BNB` };
  }
  if (category === "crowd_favorite") {
    const votes = Number(data.votes_count ?? data.score ?? 0);
    if (Number.isFinite(votes) && votes >= 0) return { label: "Votes", value: votes.toLocaleString("en-US") };
  }
  return { label: "Result", value: "Verified win" };
}

function getTierInfo(wins) {
  const totalWins = Number.isFinite(Number(wins)) ? Math.max(0, Math.trunc(Number(wins))) : 0;
  let current = null;
  let next = null;
  for (const step of TIER_STEPS) {
    if (totalWins >= step.minWins) current = step;
    else {
      next = step;
      break;
    }
  }

  if (!current) {
    return {
      tier: "Unranked",
      nextTier: next?.tier ?? null,
      nextThreshold: next?.minWins ?? null,
      progressPercent: 0,
    };
  }
  if (!next) {
    return { tier: current.tier, nextTier: null, nextThreshold: null, progressPercent: 100 };
  }
  const span = Math.max(1, next.minWins - current.minWins);
  return {
    tier: current.tier,
    nextTier: next.tier,
    nextThreshold: next.minWins,
    progressPercent: Math.max(0, Math.min(100, ((totalWins - current.minWins) / span) * 100)),
  };
}

async function readDisplayName(chainId, address) {
  try {
    const { rows } = await pool.query(
      `SELECT display_name AS "displayName"
         FROM user_profiles
        WHERE chain_id = $1 AND address = $2
        LIMIT 1`,
      [chainId, address]
    );
    return String(rows?.[0]?.displayName || "").trim() || shortenAddress(address);
  } catch (e) {
    const code = e?.code;
    if (code === "42P01" || code === "42703") return shortenAddress(address);
    throw e;
  }
}

async function readMastery(chainId, address, category) {
  const { rows } = await pool.query(
    `SELECT category,
            COUNT(*)::int AS wins,
            COUNT(*) FILTER (WHERE rank = 1)::int AS titles,
            MIN(rank)::int AS "bestRank",
            MAX(epoch_end) AS "latestEpochEnd"
       FROM league_epoch_winners
      WHERE chain_id = $1
        AND lower(recipient_address) = $2
        AND category = $3
      GROUP BY category`,
    [chainId, address, category]
  );
  const row = rows[0];
  if (!row) return null;
  const tier = getTierInfo(row.wins);
  return {
    category: row.category,
    wins: Number(row.wins ?? 0),
    titles: Number(row.titles ?? 0),
    bestRank: row.bestRank == null ? null : Number(row.bestRank),
    latestEpochEnd: row.latestEpochEnd instanceof Date ? row.latestEpochEnd.toISOString() : row.latestEpochEnd ? String(row.latestEpochEnd) : null,
    tier: tier.tier,
    nextTier: tier.nextTier,
    nextThreshold: tier.nextThreshold,
    progressPercent: tier.progressPercent,
  };
}

async function readTopMasteries(chainId, address) {
  const { rows } = await pool.query(
    `SELECT category,
            COUNT(*)::int AS wins,
            COUNT(*) FILTER (WHERE rank = 1)::int AS titles,
            MIN(rank)::int AS "bestRank",
            MAX(epoch_end) AS "latestEpochEnd"
       FROM league_epoch_winners
      WHERE chain_id = $1
        AND lower(recipient_address) = $2
      GROUP BY category
      ORDER BY COUNT(*) DESC, COUNT(*) FILTER (WHERE rank = 1) DESC, MIN(rank) ASC, category ASC
      LIMIT 3`,
    [chainId, address]
  );

  return rows.map((row) => {
    const tier = getTierInfo(row.wins);
    return {
      category: row.category,
      wins: Number(row.wins ?? 0),
      titles: Number(row.titles ?? 0),
      bestRank: row.bestRank == null ? null : Number(row.bestRank),
      latestEpochEnd: row.latestEpochEnd instanceof Date ? row.latestEpochEnd.toISOString() : row.latestEpochEnd ? String(row.latestEpochEnd) : null,
      tier: tier.tier,
    };
  });
}

async function readCabinetSummary(chainId, address) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS "totalWins",
            COUNT(*) FILTER (WHERE rank = 1)::int AS "totalTitles",
            COUNT(DISTINCT category)::int AS "uniqueLeagues",
            MAX(epoch_end) AS "latestWinAt"
       FROM league_epoch_winners
      WHERE chain_id = $1
        AND lower(recipient_address) = $2`,
    [chainId, address]
  );
  const row = rows[0] || {};
  return {
    totalWins: Number(row.totalWins ?? 0),
    totalTitles: Number(row.totalTitles ?? 0),
    uniqueLeagues: Number(row.uniqueLeagues ?? 0),
    latestWinAt: row.latestWinAt instanceof Date ? row.latestWinAt.toISOString() : row.latestWinAt ? String(row.latestWinAt) : null,
  };
}

async function readWin(chainId, address, category, period, epochStart, rank) {
  let rows;
  try {
    ({ rows } = await pool.query(
      `SELECT period,
              epoch_start AS "epochStart",
              epoch_end AS "epochEnd",
              category,
              rank,
              recipient_address AS "recipientAddress",
              amount_raw::text AS "amountRaw",
              meta
         FROM league_epoch_winners
        WHERE chain_id = $1
          AND lower(recipient_address) = $2
          AND category = $3
          AND period = $4
          AND epoch_start = $5::timestamptz
          AND rank = $6
        LIMIT 1`,
      [chainId, address, category, period, epochStart, rank]
    ));
  } catch (e) {
    if (e?.code !== "42703") throw e;
    ({ rows } = await pool.query(
      `SELECT period,
              epoch_start AS "epochStart",
              epoch_end AS "epochEnd",
              category,
              rank,
              recipient_address AS "recipientAddress",
              amount_raw::text AS "amountRaw",
              payload AS meta
         FROM league_epoch_winners
        WHERE chain_id = $1
          AND lower(recipient_address) = $2
          AND category = $3
          AND period = $4
          AND epoch_start = $5::timestamptz
          AND rank = $6
        LIMIT 1`,
      [chainId, address, category, period, epochStart, rank]
    ));
  }
  const row = rows[0];
  if (!row) return null;
  return {
    period: row.period,
    epochStart: row.epochStart instanceof Date ? row.epochStart.toISOString() : String(row.epochStart),
    epochEnd: row.epochEnd instanceof Date ? row.epochEnd.toISOString() : String(row.epochEnd),
    category: row.category,
    rank: Number(row.rank),
    recipientAddress: String(row.recipientAddress).toLowerCase(),
    amountRaw: String(row.amountRaw ?? "0"),
    meta: row.meta ?? {},
  };
}

function renderShell({ title, subtitle, kicker, body, footer, badgeMarkup, pillsMarkup, emblemHref = null }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="120" y1="80" x2="1080" y2="1120" gradientUnits="userSpaceOnUse">
      <stop stop-color="#17191F"/>
      <stop offset="1" stop-color="#090A0D"/>
    </linearGradient>
    <linearGradient id="panel" x1="250" y1="180" x2="950" y2="980" gradientUnits="userSpaceOnUse">
      <stop stop-color="#242833"/>
      <stop offset="1" stop-color="#0E1015"/>
    </linearGradient>
    <linearGradient id="accent" x1="230" y1="0" x2="970" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FF7B00"/>
      <stop offset="0.55" stop-color="#FFC247"/>
      <stop offset="1" stop-color="#FF5E00"/>
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="1200" height="1200" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="24" stdDeviation="30" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
    <filter id="badgeShadow" x="0" y="0" width="1200" height="1200" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(600 920) rotate(90) scale(220 520)">
      <stop stop-color="#FF7B00" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#FF7B00" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" stroke="#FFFFFF" stroke-opacity="0.035"/>
    </pattern>
  </defs>

  <rect width="1200" height="1200" fill="url(#bg)"/>
  <rect width="1200" height="1200" fill="url(#grid)"/>
  <circle cx="236" cy="220" r="140" fill="#FF7B00" fill-opacity="0.08"/>
  <circle cx="1000" cy="180" r="180" fill="#FFC247" fill-opacity="0.06"/>
  <circle cx="860" cy="1040" r="220" fill="#FF5E00" fill-opacity="0.06"/>
  <rect x="136" y="108" width="928" height="984" rx="42" fill="url(#panel)" stroke="#FFFFFF" stroke-opacity="0.09" filter="url(#shadow)"/>
  <rect x="164" y="136" width="872" height="928" rx="34" fill="#0B0D12" fill-opacity="0.4" stroke="#FF8A1E" stroke-opacity="0.18"/>
  <rect x="164" y="136" width="872" height="8" rx="4" fill="url(#accent)"/>
  <ellipse cx="600" cy="910" rx="400" ry="150" fill="url(#glow)"/>
  <text x="196" y="188" fill="#FFC35A" font-size="30" font-weight="700" letter-spacing="7" font-family="Inter, Arial, sans-serif">${xml(kicker)}</text>
  <text x="1002" y="188" fill="#FFFFFF" fill-opacity="0.55" font-size="24" font-weight="700" text-anchor="end" font-family="Inter, Arial, sans-serif">MEMEWARZONE</text>
  ${emblemHref ? `<image href="${xml(emblemHref)}" x="910" y="840" width="96" height="96" opacity="0.18"/>` : ""}
  ${badgeMarkup}
  <text x="600" y="760" fill="#F8F9FB" font-size="86" font-weight="900" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(title)}</text>
  <text x="600" y="824" fill="#FFC35A" font-size="40" font-weight="800" letter-spacing="2" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(subtitle)}</text>
  <text x="600" y="878" fill="#D1D7E0" fill-opacity="0.95" font-size="34" font-weight="600" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(body)}</text>
  ${pillsMarkup}
  <text x="600" y="1110" fill="#FFFFFF" fill-opacity="0.78" font-size="28" font-weight="700" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(footer)}</text>
</svg>`;
}

function renderPills(items) {
  const filtered = items.filter(Boolean).slice(0, 3);
  const pillWidth = 248;
  const gap = 24;
  const totalWidth = filtered.length * pillWidth + Math.max(0, filtered.length - 1) * gap;
  const startX = Math.round((1200 - totalWidth) / 2);
  const y = 930;

  return filtered
    .map((item, index) => {
      const x = startX + index * (pillWidth + gap);
      return `<g>
        <rect x="${x}" y="${y}" width="${pillWidth}" height="98" rx="24" fill="#11151C" fill-opacity="0.92" stroke="#FFFFFF" stroke-opacity="0.09"/>
        <rect x="${x}" y="${y}" width="${pillWidth}" height="6" rx="3" fill="url(#accent)" fill-opacity="0.95"/>
        <text x="${x + pillWidth / 2}" y="${y + 34}" fill="#9FA8B8" font-size="18" font-weight="700" letter-spacing="2" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(item.label.toUpperCase())}</text>
        <text x="${x + pillWidth / 2}" y="${y + 70}" fill="#F6F7FA" font-size="28" font-weight="800" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(item.value)}</text>
      </g>`;
    })
    .join("\n");
}

function renderCenterBadge(href, size = 520, y = 214) {
  const x = Math.round((1200 - size) / 2);
  return `<g filter="url(#badgeShadow)">
    <rect x="${x - 18}" y="${y - 18}" width="${size + 36}" height="${size + 36}" rx="38" fill="#101319" stroke="#FF9B2D" stroke-opacity="0.25"/>
    <image href="${xml(href)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

function renderMiniBadges(items) {
  const size = 194;
  const gap = 28;
  const totalWidth = items.length * size + Math.max(0, items.length - 1) * gap;
  const startX = Math.round((1200 - totalWidth) / 2);
  const y = 292;
  return items
    .map((item, index) => {
      const x = startX + index * (size + gap);
      return `<g filter="url(#badgeShadow)">
        <rect x="${x - 10}" y="${y - 10}" width="${size + 20}" height="${size + 20}" rx="28" fill="#11151C" stroke="#FFFFFF" stroke-opacity="0.10"/>
        <image href="${xml(item.badgeHref)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>
      </g>
      <text x="${x + size / 2}" y="${y + size + 42}" fill="#F6F7FA" font-size="24" font-weight="800" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(item.title)}</text>
      <text x="${x + size / 2}" y="${y + size + 74}" fill="#FFC35A" font-size="20" font-weight="700" text-anchor="middle" font-family="Inter, Arial, sans-serif">${xml(`${item.tier} · ${item.wins} wins`)}</text>`;
    })
    .join("\n");
}

function sendSvg(res, svg, filename, shouldDownload) {
  res.statusCode = 200;
  res.setHeader("content-type", "image/svg+xml; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=300, s-maxage=300");
  if (shouldDownload) {
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  }
  res.end(svg);
}

async function renderPng(svg) {
  const dynamicImport = new Function("specifier", "return import(specifier);");
  const { Resvg } = await dynamicImport("@resvg/resvg-js");
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    background: "rgba(0,0,0,0)",
  });
  const pngData = renderer.render();
  return Buffer.from(pngData.asPng());
}

async function sendImage(res, svg, filenameBase, shouldDownload, format) {
  if (format === "svg") {
    return sendSvg(res, svg, `${filenameBase}.svg`, shouldDownload);
  }

  const png = await renderPng(svg);
  res.statusCode = 200;
  res.setHeader("content-type", "image/png");
  res.setHeader("cache-control", "public, max-age=300, s-maxage=300");
  if (shouldDownload) {
    res.setHeader("content-disposition", `attachment; filename="${filenameBase}.png"`);
  }
  res.end(png);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    const q = getQuery(req);
    const chainId = Number(q.chainId);
    const address = String(q.address ?? "").trim().toLowerCase();
    const kind = String(q.kind ?? "win").trim().toLowerCase();
    const format = String(q.format ?? "png").trim().toLowerCase() === "svg" ? "svg" : "png";
    const download = String(q.download ?? "").trim() === "1";

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!isAddress(address)) return json(res, 400, { error: "Invalid address" });
    if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

    const origin = inferOrigin(req);
    const displayName = await readDisplayName(chainId, address);
    const logoHref = await assetToDataUri(origin, "/assets/logo.png");

    if (kind === "cabinet") {
      const [summary, rawTopMasteries] = await Promise.all([
        readCabinetSummary(chainId, address),
        readTopMasteries(chainId, address),
      ]);

      if (!summary.totalWins) return json(res, 404, { error: "No recorded cabinet data for this wallet" });

      const topMasteries = await Promise.all(rawTopMasteries.map(async (item) => ({
        ...item,
        title: getLeagueMeta(item.category).title,
        badgeHref: await assetToDataUri(origin, getLeagueMeta(item.category).image),
      })));

      const svg = renderShell({
        title: "LEAGUE CABINET",
        subtitle: displayName,
        kicker: "PROFILE FLEX",
        body: `${summary.totalWins} wins · ${summary.totalTitles} titles · ${summary.uniqueLeagues} leagues conquered`,
        footer: "Compete. Create. Conquer.  ·  memewar.zone",
        emblemHref: logoHref,
        badgeMarkup: renderMiniBadges(topMasteries),
        pillsMarkup: renderPills([
          { label: "Total Wins", value: String(summary.totalWins) },
          { label: "Titles", value: String(summary.totalTitles) },
          { label: "Leagues", value: String(summary.uniqueLeagues) },
        ]),
      });

      return sendImage(res, svg, `${filenameSafe(displayName)}-league-cabinet`, download, format);
    }

    const category = String(q.category ?? "").trim();
    if (!category || !LEAGUES[category]) return json(res, 400, { error: "Invalid category" });

    const mastery = await readMastery(chainId, address, category);
    if (!mastery) return json(res, 404, { error: "No recorded wins for this league" });
    const meta = getLeagueMeta(category);
    const badgeHref = await assetToDataUri(origin, meta.image);

    if (kind === "mastery") {
      const nextLine = mastery.nextTier && mastery.nextThreshold
        ? `${mastery.nextTier} unlocks at ${mastery.nextThreshold} wins`
        : "Legend tier unlocked";

      const svg = renderShell({
        title: `${meta.title.toUpperCase()} MASTERY`,
        subtitle: `${mastery.tier} TIER`,
        kicker: "ACHIEVEMENT UNLOCKED",
        body: `${displayName} has ${mastery.wins} total wins and ${mastery.titles} titles in ${meta.title}`,
        footer: `${nextLine}  ·  MemeWarzone`,
        emblemHref: logoHref,
        badgeMarkup: renderCenterBadge(badgeHref, 500, 214),
        pillsMarkup: renderPills([
          { label: "Wins", value: String(mastery.wins) },
          { label: "Titles", value: String(mastery.titles) },
          { label: "Progress", value: `${Math.round(mastery.progressPercent)}%` },
        ]),
      });

      return sendImage(res, svg, `${filenameSafe(displayName)}-${filenameSafe(meta.title)}-mastery`, download, format);
    }

    const period = String(q.period ?? "").trim().toLowerCase();
    const epochStart = String(q.epochStart ?? "").trim();
    const rank = Number(q.rank);
    if ((period !== "weekly" && period !== "monthly") || !epochStart || !Number.isFinite(rank)) {
      return json(res, 400, { error: "Missing or invalid win selectors" });
    }

    const win = await readWin(chainId, address, category, period, epochStart, rank);
    if (!win) return json(res, 404, { error: "Recorded win not found" });

    const placement = formatWinPlacement(win.period, win.rank);
    const metric = formatMetric(win.category, win.meta);
    const epochLabel = formatEpochLabel(win.period, win.epochStart);

    const svg = renderShell({
      title: meta.title.toUpperCase(),
      subtitle: placement,
      kicker: "LEAGUE WIN VERIFIED",
      body: `${displayName} · ${epochLabel}`,
      footer: `Compete. Create. Conquer.  ·  ${metric.label}: ${metric.value}`,
      emblemHref: logoHref,
      badgeMarkup: renderCenterBadge(badgeHref, 520, 196),
      pillsMarkup: renderPills([
        { label: metric.label, value: metric.value },
        { label: "Mastery", value: mastery.tier },
        { label: "Wins", value: String(mastery.wins) },
      ]),
    });

    return sendImage(res, svg, `${filenameSafe(displayName)}-${filenameSafe(meta.title)}-${filenameSafe(placement)}`, download, format);
  } catch (e) {
    const code = e?.code;
    console.error("[api/shareCard GET]", e);
    if (code === "42P01" || code === "42703") {
      return json(res, 200, { error: "DB schema missing league winners tables/columns" });
    }
    const message = typeof e?.message === "string" && e.message.includes("@resvg/resvg-js")
      ? "PNG renderer unavailable. Install @resvg/resvg-js and redeploy."
      : "Server error";
    return json(res, 500, { error: message });
  }
}
