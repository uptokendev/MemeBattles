#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv } from 'node:process';

const url = process.env.LAUNCHPAD_URL ?? 'http://127.0.0.1:5173/';
const labelArg = argv[2] ?? '00-baseline';
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
  { name: '05-discovery', selector: '[class*="mwz-hud-frame"]:has(button:has-text("Drafts"))', topOffset: 0 },
  { name: '06-grid', selector: 'main .grid', topOffset: 0 },
  { name: '07-footer', selector: 'footer', topOffset: 0 },
];

const browser = await chromium.launch();

for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
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

  // Skip loading screen if visible
  await page.waitForTimeout(2500);

  // Full page screenshot
  const fullPath = `${outDir}/${vp.name}-00-full.png`;
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log(`  saved ${fullPath}`);

  // Above-the-fold
  const foldPath = `${outDir}/${vp.name}-00a-fold.png`;
  await page.screenshot({ path: foldPath, fullPage: false });
  console.log(`  saved ${foldPath}`);

  for (const sec of sections) {
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

  await ctx.close();
}

await browser.close();
console.log(`\nAll screenshots saved under ${outDir}`);
