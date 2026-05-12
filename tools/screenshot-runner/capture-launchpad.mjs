#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv } from 'node:process';

const url = process.env.LAUNCHPAD_URL ?? 'http://127.0.0.1:5173/';
const labelArg = argv[2] ?? '00-baseline';
const sectionsFilter = (process.env.SECTIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const skipLiveTab = process.env.SKIP_LIVE_TAB === '1';
const skipFold = process.env.SKIP_FOLD === '1';
const skipFull = process.env.SKIP_FULL === '1';
const outDir = resolve(
  '/Users/sven.vanthoenderdaal/PersonalDevelopment/meme-warzone/MemeBattles/screenshots/launchpad-audit',
  labelArg,
);
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
];

const sections = [
  { name: '01-topbar', selector: '.mwz-hud-frame', topOffset: 0 },
  { name: '02-headerband', selector: '.mwz-tactical-hero', topOffset: 0 },
  { name: '03-featured', selector: '.mwz-featured-layout', topOffset: 0 },
  { name: '04-live-heading', selector: '.mwz-live-heading', topOffset: 0 },
  { name: '05-discovery', selector: '.mwz-launchpad-inner > .mwz-hud-frame.w-full', topOffset: 0 },
  { name: '06-grid', selector: '.mwz-launchpad-inner > div.w-full:last-child', topOffset: 0 },
  { name: '07-footer', selector: 'footer', topOffset: 0 },
];

// --- API mocks so featured/live grid render with cards instead of empty states.
const SAMPLE_NAMES = ['Bonk Brigade', 'Pepe Phalanx', 'Doge Division', 'Wojak Warriors', 'Shiba Squadron', 'Frog Force', 'Cheems Corps', 'Floki Force', 'Apu Army', 'Kek Kommand', 'Moon Marines', 'Rocket Recon'];
const SAMPLE_TICKERS = ['BONK', 'PEPE', 'DOGE', 'WOJAK', 'SHIB', 'FROG', 'CHMS', 'FLOKI', 'APU', 'KEK', 'MOON', 'RKT'];

function chainIdFromUrl(url, fallback = 97) {
  try {
    const v = Number(new URL(url).searchParams.get('chainId'));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

function mkFeatured(chainId = 97, n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    chainId,
    campaignAddress: '0x' + (i + 1).toString().padStart(40, '0'),
    tokenAddress: '0x' + (1000 + i).toString().padStart(40, '0'),
    creatorAddress: '0x' + (2000 + i).toString().padStart(40, '0'),
    creatorUsername: `creator${i + 1}`,
    name: SAMPLE_NAMES[i % SAMPLE_NAMES.length],
    symbol: SAMPLE_TICKERS[i % SAMPLE_TICKERS.length],
    logoUri: null,
    createdAtChain: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
    graduatedAtChain: i % 4 === 0 ? new Date(Date.now() - i * 1800_000).toISOString() : null,
    votes24h: 420 - i * 17,
    votesAllTime: 4200 - i * 73,
    marketcapBnb: (2.5 - i * 0.12).toFixed(4),
  }));
}

function mkCampaigns(chainId = 97, n = 16) {
  return Array.from({ length: n }, (_, i) => ({
    chainId,
    campaignAddress: '0x' + (i + 100).toString().padStart(40, '0'),
    tokenAddress: '0x' + (1100 + i).toString().padStart(40, '0'),
    creatorAddress: '0x' + (2100 + i).toString().padStart(40, '0'),
    name: SAMPLE_NAMES[i % SAMPLE_NAMES.length],
    symbol: SAMPLE_TICKERS[i % SAMPLE_TICKERS.length],
    logoUri: null,
    createdAtChain: new Date(Date.now() - (i + 1) * 7200_000).toISOString(),
    lastActivityAt: new Date(Date.now() - (i + 1) * 600_000).toISOString(),
    graduatedAtChain: i % 5 === 0 ? new Date(Date.now() - i * 1800_000).toISOString() : null,
    isDexTrading: i % 5 === 0,
    marketcapBnb: (1.8 - i * 0.08).toFixed(4),
    votes24h: 320 - i * 11,
    progressPct: Math.min(95, 12 + i * 6),
    etaSec: null,
  }));
}

function mkDrafts(chainId = 97, n = 10) {
  return Array.from({ length: n }, (_, i) => ({
    id: `draft-${i + 1}`,
    slug: `draft-${SAMPLE_TICKERS[i % SAMPLE_TICKERS.length].toLowerCase()}-${i + 1}`,
    chainId,
    visibility: 'public',
    status: ['promotion_published', 'ready_to_launch', 'scheduled'][i % 3],
    campaignAddress: null,
    name: `${SAMPLE_NAMES[i % SAMPLE_NAMES.length]} Prep`,
    ticker: SAMPLE_TICKERS[i % SAMPLE_TICKERS.length],
    description: 'Mission brief: rally the squad before the warzone opens. Verified creator, audited curve, premium spotlight.',
    logoUrl: null,
    creatorWallet: '0x' + (3000 + i).toString().padStart(40, '0'),
    createdAt: new Date(Date.now() - (i + 1) * 3600_000).toISOString(),
  }));
}

async function installRoutes(context) {
  await context.route('**/api/featured**', (route) => {
    const cid = chainIdFromUrl(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: mkFeatured(cid) }) });
  });
  await context.route('**/api/campaigns?**', (route) => {
    const cid = chainIdFromUrl(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: mkCampaigns(cid), nextCursor: null, pageSize: 24, updatedAt: new Date().toISOString() }) });
  });
  await context.route('**/api/drafts**', (route) => {
    const reqUrl = route.request().url();
    const cid = chainIdFromUrl(reqUrl);
    const u = new URL(reqUrl);
    if (/\/api\/drafts\/[^/]+$/.exec(u.pathname)) {
      const id = u.pathname.split('/').pop();
      const idx = Number(String(id ?? '').replaceAll(/\D/g, '') || 1) - 1;
      const drafts = mkDrafts(cid, 10);
      const draft = drafts[Math.max(0, idx) % drafts.length];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft, promotion: { missionStatement: 'Rally the squad. Hold the line.', creatorNote: '' }, popularity: { heatLabel: ['On Fire', 'Hot', 'Warming', 'Cold'][idx % 4], follows: 80 - idx * 5, popularityPercentage: 70 - idx * 4, rankingScore: 1000 - idx * 50 } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mkDrafts(cid, 10)) });
  });
  await context.route('**/api/bnb-usd**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ price: 600 }) }));
  await context.route('**/api/status**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/auth/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/follows/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"following": false}' }));
  await context.route('**/api/profile**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/votes**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/vote_counts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

const browser = await chromium.launch();

for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });

  await installRoutes(ctx);

  const page = await ctx.newPage();

  page.on('pageerror', (err) => console.error(`[${vp.name}] pageerror:`, err.message));

  console.log(`\n→ ${vp.name} (${vp.width}×${vp.height}) loading ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    console.error(`[${vp.name}] navigation failed:`, err.message);
    await ctx.close();
    continue;
  }

  // Skip loading screen + give mocked fetches time to render
  await page.waitForTimeout(3500);

  // Full page screenshot
  if (!skipFull) {
    const fullPath = `${outDir}/${vp.name}-00-full.png`;
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`  saved ${fullPath}`);
  }

  // Above-the-fold
  if (!skipFold) {
    const foldPath = `${outDir}/${vp.name}-00a-fold.png`;
    await page.screenshot({ path: foldPath, fullPage: false });
    console.log(`  saved ${foldPath}`);
  }

  const filteredSections = sectionsFilter.length
    ? sections.filter((s) => sectionsFilter.includes(s.name) || sectionsFilter.includes(s.name.replace(/^\d+[a-z]?-/, '')))
    : sections;

  for (const sec of filteredSections) {
    try {
      const handle = await page.locator(sec.selector).first();
      const count = await handle.count();
      if (!count) {
        console.warn(`  [${sec.name}] selector not found: ${sec.selector}`);
        continue;
      }
      await handle.scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(400);
      const path = `${outDir}/${vp.name}-${sec.name}.png`;
      await handle.screenshot({ path });
      console.log(`  saved ${path}`);
    } catch (err) {
      console.warn(`  [${sec.name}] failed: ${err.message}`);
    }
  }

  // Switch to "Trending" tab and capture the Live campaign grid
  const wantsLive = !skipLiveTab && (!sectionsFilter.length
    || sectionsFilter.some((s) => ['06b-grid-live', 'grid-live', '04b-live-heading', 'live-heading'].includes(s)));
  try {
    if (!wantsLive) throw new Error('skip live tab');
    const trendingBtn = page.locator('button:has-text("Trending")').first();
    if (await trendingBtn.count()) {
      await trendingBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
      await trendingBtn.click();
      await page.waitForTimeout(2500);
      const liveGrid = page.locator('.mwz-launchpad-inner > div.w-full:last-child').first();
      await liveGrid.scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(400);
      const livePath = `${outDir}/${vp.name}-06b-grid-live.png`;
      await liveGrid.screenshot({ path: livePath });
      console.log(`  saved ${livePath}`);

      const liveHeading = page.locator('.mwz-live-heading').first();
      if (await liveHeading.count()) {
        await liveHeading.scrollIntoViewIfNeeded({ timeout: 5000 });
        await page.waitForTimeout(200);
        const liveHeadPath = `${outDir}/${vp.name}-04b-live-heading.png`;
        await liveHeading.screenshot({ path: liveHeadPath });
        console.log(`  saved ${liveHeadPath}`);
      }
    } else {
      console.warn(`  [trending switch] button not found`);
    }
  } catch (err) {
    if (err.message !== 'skip live tab') console.warn(`  [trending switch] failed: ${err.message}`);
  }

  await ctx.close();
}

await browser.close();
console.log(`\nAll screenshots saved under ${outDir}`);
