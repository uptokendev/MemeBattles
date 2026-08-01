#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function read(relativePath) {
  const target = path.resolve(root, relativePath);
  const original = fs.readFileSync(target, "utf8");
  return { target, original, source: original.replace(/\r\n/g, "\n"), hadCrLf: original.includes("\r\n") };
}

function write(file, source) {
  if (source === file.source) return false;
  const output = file.hadCrLf ? source.replace(/\n/g, "\r\n") : source;
  fs.writeFileSync(file.target, output);
  console.log(`[devpostgrad-closeout] patched ${file.target}`);
  return true;
}

function replaceOnce(source, before, after, label, marker = after) {
  if (source.includes(marker)) return source;
  const matches = source.split(before).length - 1;
  // Source often already contains the permanent fix (or a newer rewrite). Skip
  // missing anchors instead of crashing Railway start/build.
  if (matches === 0) {
    console.warn(`[devpostgrad-closeout] skip ${label}: no match (already fixed or source evolved)`);
    return source;
  }
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}`);
  return source.replace(before, after);
}

function patchCreatePage() {
  const file = read("src/pages/Create.tsx");
  let source = file.source;
  source = replaceOnce(
    source,
    'import { ContentContainer } from "@/components/layout/ContentContainer";\n',
    'import { ContentContainer } from "@/components/layout/ContentContainer";\nimport { normalizeSocialUrl } from "@/lib/socialLinks";\n',
    "Create social normalizer import",
    'import { normalizeSocialUrl } from "@/lib/socialLinks";',
  );
  source = replaceOnce(
    source,
    `        website: formData.website || undefined,\n        twitter: formData.twitter || undefined,\n        otherLink: formData.otherLink || undefined,`,
    `        website: normalizeSocialUrl(formData.website, "website") || undefined,\n        twitter: normalizeSocialUrl(formData.twitter, "x") || undefined,\n        otherLink: normalizeSocialUrl(formData.otherLink, "other") || undefined,`,
    "Create normalized validation",
    'website: normalizeSocialUrl(formData.website, "website") || undefined,',
  );
  source = replaceOnce(
    source,
    `        websiteUrl: formData.website || null,\n        xUrl: formData.twitter || null,\n        telegramUrl: formData.telegram || null,\n        discordUrl: formData.discord || null,\n        docs: formData.otherLink ? [formData.otherLink] : [],\n        otherUrl: formData.otherLink || null,`,
    `        websiteUrl: normalizeSocialUrl(formData.website, "website") || null,\n        xUrl: normalizeSocialUrl(formData.twitter, "x") || null,\n        telegramUrl: normalizeSocialUrl(formData.telegram, "telegram") || null,\n        discordUrl: normalizeSocialUrl(formData.discord, "discord") || null,\n        docs: formData.otherLink ? [normalizeSocialUrl(formData.otherLink, "other")] : [],\n        otherUrl: normalizeSocialUrl(formData.otherLink, "other") || null,`,
    "Create normalized draft payload",
    'xUrl: normalizeSocialUrl(formData.twitter, "x") || null,',
  );
  source = replaceOnce(
    source,
    `        xAccount: formData.twitter || "",\n        website: formData.website || "",\n        extraLink: formData.otherLink || "",`,
    `        xAccount: normalizeSocialUrl(formData.twitter, "x"),\n        website: normalizeSocialUrl(formData.website, "website"),\n        extraLink: normalizeSocialUrl(formData.otherLink, "other"),`,
    "Create normalized direct deploy payload",
    'xAccount: normalizeSocialUrl(formData.twitter, "x"),',
  );
  write(file, source);
}

function patchPromotionEditor() {
  const file = read("src/pages/DraftPromotionSetup.tsx");
  let source = file.source;
  source = replaceOnce(
    source,
    `<div><FieldLabel>Website</FieldLabel><Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={inputClass} placeholder="https://memewar.zone" /></div>\n                  <div><FieldLabel>X (formally Twitter)</FieldLabel><Input value={xUrl} onChange={(e) => setXUrl(e.target.value)} className={inputClass} placeholder="@memewarzone or URL" /></div>\n                  <div><FieldLabel>Telegram</FieldLabel><Input value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} className={inputClass} placeholder="@memewarzone or URL" /></div>\n                  <div><FieldLabel>Discord</FieldLabel><Input value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} className={inputClass} placeholder="Discord invite URL" /></div>`,
    `<div><FieldLabel>Website</FieldLabel><Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} onBlur={() => setWebsiteUrl(normalizeSocialUrl(websiteUrl, "website"))} className={inputClass} placeholder="memewar.zone or full URL" /></div>\n                  <div><FieldLabel>X (formerly Twitter)</FieldLabel><Input value={xUrl} onChange={(e) => setXUrl(e.target.value)} onBlur={() => setXUrl(normalizeSocialUrl(xUrl, "x"))} className={inputClass} placeholder="memewarzone, @memewarzone, or URL" /></div>\n                  <div><FieldLabel>Telegram</FieldLabel><Input value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} onBlur={() => setTelegramUrl(normalizeSocialUrl(telegramUrl, "telegram"))} className={inputClass} placeholder="memewarzone, @memewarzone, or URL" /></div>\n                  <div><FieldLabel>Discord</FieldLabel><Input value={discordUrl} onChange={(e) => setDiscordUrl(e.target.value)} onBlur={() => setDiscordUrl(normalizeSocialUrl(discordUrl, "discord"))} className={inputClass} placeholder="Invite code or full URL" /></div>`,
    "Promotion social inputs",
    'onBlur={() => setXUrl(normalizeSocialUrl(xUrl, "x"))}',
  );
  write(file, source);
}

function patchUpvoteDialog() {
  const file = read("src/components/token/UpvoteDialog.tsx");
  let source = file.source;
  source = replaceOnce(
    source,
    `const UPVOTE_USD_TARGET = 3;\n`,
    `const UPVOTE_USD_TARGET = 3;\nconst UPVOTE_DISPLAY_DECIMALS = 6;\nconst UPVOTE_DISPLAY_SCALE_WEI = 10n ** BigInt(18 - UPVOTE_DISPLAY_DECIMALS);\n\nfunction floorToDisplayPrecision(wei: bigint) {\n  return (wei / UPVOTE_DISPLAY_SCALE_WEI) * UPVOTE_DISPLAY_SCALE_WEI;\n}\n\nfunction formatDisplayBnb(wei: bigint) {\n  const formatted = ethers.formatEther(floorToDisplayPrecision(wei));\n  const [whole, fraction = ""] = formatted.split(".");\n  const trimmed = fraction.slice(0, UPVOTE_DISPLAY_DECIMALS).replace(/0+$/, "");\n  return trimmed ? \`\${whole}.\${trimmed}\` : whole;\n}\n`,
    "Upvote display helpers",
    "const UPVOTE_DISPLAY_DECIMALS = 6;",
  );
  source = replaceOnce(
    source,
    `  const humanEffectiveMin = useMemo(() => {\n    try {\n      return ethers.formatEther(effectiveMinWei);\n    } catch {\n      return "—";\n    }\n  }, [effectiveMinWei]);`,
    `  const displayedMinWei = useMemo(() => floorToDisplayPrecision(effectiveMinWei), [effectiveMinWei]);\n\n  const humanEffectiveMin = useMemo(() => {\n    try {\n      return formatDisplayBnb(effectiveMinWei);\n    } catch {\n      return "—";\n    }\n  }, [effectiveMinWei]);`,
    "Upvote display minimum",
    "const displayedMinWei = useMemo(() => floorToDisplayPrecision(effectiveMinWei)",
  );
  source = replaceOnce(
    source,
    `  const tooLow = useMemo(() => {\n    if (amountWei == null) return false;\n    if (amountWei <= 0n) return false;\n    return amountWei < effectiveMinWei;\n  }, [amountWei, effectiveMinWei]);`,
    `  const normalizedAmountWei = useMemo(() => {\n    if (amountWei == null) return null;\n    if (amountWei >= displayedMinWei && amountWei < effectiveMinWei) return effectiveMinWei;\n    return amountWei;\n  }, [amountWei, displayedMinWei, effectiveMinWei]);\n\n  const tooLow = useMemo(() => {\n    if (amountWei == null) return false;\n    if (amountWei <= 0n) return false;\n    return amountWei < displayedMinWei;\n  }, [amountWei, displayedMinWei]);`,
    "Upvote normalized amount",
    "const normalizedAmountWei = useMemo(() => {",
  );
  source = replaceOnce(
    source,
    `        const v = Number(ethers.formatEther(effectiveMinWei));\n        if (Number.isFinite(v) && v > 0) {\n          setAmountBnb(v.toFixed(6));\n          setPrefilled(true);\n        }`,
    `        const display = formatDisplayBnb(effectiveMinWei);\n        if (display && display !== "0") {\n          setAmountBnb(display);\n          setPrefilled(true);\n        }`,
    "Upvote low prefill",
    "const display = formatDisplayBnb(effectiveMinWei);",
  );
  source = replaceOnce(
    source,
    `      const v = Number(ethers.formatEther(effectiveMinWei));\n      if (!Number.isFinite(v) || v <= 0) return;\n      setAmountBnb(v.toFixed(6));\n      setPrefilled(true);`,
    `      const display = formatDisplayBnb(effectiveMinWei);\n      if (!display || display === "0") return;\n      setAmountBnb(display);\n      setPrefilled(true);`,
    "Upvote initial prefill",
    "if (!display || display === \"0\") return;",
  );
  source = replaceOnce(
    source,
    `      let valueWei: bigint = 0n;\n      try {\n        valueWei = ethers.parseEther(String(amountBnb || "0"));\n      } catch {\n        setEstTotalWei(null);\n        setInsufficient(false);\n        return;\n      }\n      if (valueWei <= 0n) {`,
    `      let parsedWei: bigint = 0n;\n      try {\n        parsedWei = ethers.parseEther(String(amountBnb || "0"));\n      } catch {\n        setEstTotalWei(null);\n        setInsufficient(false);\n        return;\n      }\n      const valueWei = parsedWei >= displayedMinWei && parsedWei < effectiveMinWei ? effectiveMinWei : parsedWei;\n      if (valueWei <= 0n) {`,
    "Upvote estimate normalization",
    "const valueWei = parsedWei >= displayedMinWei",
  );
  source = replaceOnce(
    source,
    `      if (valueWei < effectiveMinWei) {\n        // Too low amount is handled elsewhere; don't flag as insufficient.`,
    `      if (parsedWei < displayedMinWei) {\n        // Too low amount is handled elsewhere; don't flag as insufficient.`,
    "Upvote estimate threshold",
    "if (parsedWei < displayedMinWei)",
  );
  source = replaceOnce(
    source,
    `}, [open, wallet.provider, wallet.account, treasuryAddress, hasContractCode, enabled, amountBnb, effectiveMinWei, campaignAddress, balanceWei]);`,
    `}, [open, wallet.provider, wallet.account, treasuryAddress, hasContractCode, enabled, amountBnb, effectiveMinWei, displayedMinWei, campaignAddress, balanceWei]);`,
    "Upvote estimate dependencies",
    "effectiveMinWei, displayedMinWei, campaignAddress",
  );
  source = replaceOnce(
    source,
    `      amountWei != null &&\n      amountWei > 0n &&`,
    `      normalizedAmountWei != null &&\n      normalizedAmountWei > 0n &&`,
    "Upvote submit eligibility",
    "normalizedAmountWei != null &&",
  );
  source = replaceOnce(
    source,
    `      let valueWei: bigint;\n      try {\n        valueWei = ethers.parseEther(String(amountBnb));\n      } catch {\n        fail("Invalid amount", "Enter a valid BNB amount.");\n      }\n      if (valueWei < effectiveMinWei) {`,
    `      let parsedWei: bigint;\n      try {\n        parsedWei = ethers.parseEther(String(amountBnb));\n      } catch {\n        fail("Invalid amount", "Enter a valid BNB amount.");\n      }\n      if (parsedWei < displayedMinWei) {`,
    "Upvote submit display validation",
    "if (parsedWei < displayedMinWei) {",
  );
  source = replaceOnce(
    source,
    `      }\n\n\n// Check balance (value + estimated gas)`,
    `      }\n      const valueWei = parsedWei < effectiveMinWei ? effectiveMinWei : parsedWei;\n\n\n// Check balance (value + estimated gas)`,
    "Upvote exact transaction amount",
    "const valueWei = parsedWei < effectiveMinWei ? effectiveMinWei : parsedWei;",
  );
  source = replaceOnce(
    source,
    `          {tooLow ? (\n            <div className="text-xs text-destructive">\n              Minimum is {humanEffectiveMin} BNB{minUsdLabel ? \` (~\${minUsdLabel})\` : ""}.\n            </div>\n          ) : null}\n\n          <div className="text-xs text-muted-foreground">`,
    `          {tooLow ? (\n            <div className="text-xs text-destructive">\n              Minimum is {humanEffectiveMin} BNB{minUsdLabel ? \` (~\${minUsdLabel})\` : ""}.\n            </div>\n          ) : null}\n\n          <div className="text-xs text-muted-foreground">\n            The field shows six decimals. When that displayed minimum is used, the transaction automatically sends the exact oracle minimum.\n          </div>\n\n          <div className="text-xs text-muted-foreground">`,
    "Upvote rounding explanation",
    "The field shows six decimals.",
  );
  write(file, source);
}

function patchDraftGrid() {
  const file = read("src/components/home/DraftCampaignGrid.tsx");
  let source = file.source;
  // Permanent source already loads BSC 56+97 via draftFeedChainIds(); keep this
  // patch only for older checkouts that still use a single-chain fetch.
  if (
    source.includes("function draftFeedChainIds(") ||
    source.includes("draftFeedChainIds(chainId)") ||
    source.includes("fetchPublicCampaignDrafts({ limit: 100 })")
  ) {
    console.log("[devpostgrad-closeout] DraftCampaignGrid already multi-chain; skip legacy patch");
    return;
  }
  source = replaceOnce(
    source,
    `        const drafts = (await fetchPublicCampaignDrafts({ chainId, limit: 50 })) as CampaignDraftLifecycle[];\n        const candidates = drafts\n          .filter((draft) => Number(draft.chainId) === Number(chainId))\n          .filter((draft) => draft.visibility === "public")`,
    `        const drafts = (await fetchPublicCampaignDrafts({ limit: 100 })) as CampaignDraftLifecycle[];\n        const candidates = drafts\n          .filter((draft) => draft.visibility === "public")`,
    "Restore all-chain public drafts",
    "fetchPublicCampaignDrafts({ limit: 100 })",
  );
  source = replaceOnce(
    source,
    `No public draft campaigns yet. Published Prepare Pages and timed on-chain launches appear here.`,
    `No public draft campaigns yet. Published Prepare Pages from every supported chain appear here.`,
    "Draft empty-state copy",
  );
  write(file, source);
}

function patchTicker() {
  const file = read("src/components/home/CampaignTickerBar.tsx");
  let source = file.source;
  source = replaceOnce(
    source,
    'import { useWallet } from "@/contexts/WalletContext";\n',
    'import { useWallet } from "@/contexts/WalletContext";\nimport { apiFetch } from "@/lib/apiBase";\n',
    "Ticker API import",
    'import { apiFetch } from "@/lib/apiBase";',
  );
  source = replaceOnce(
    source,
    `async function fetchTickerItems(chainId: number): Promise<CampaignTickerItem[]> {\n  const rows = await fetchFactoryRows(chainId);\n  const baseItems = rows\n    .map((row) => {\n      const campaignAddress = normalizeAddress(row?.campaign);\n      if (!isAddress(campaignAddress)) return null;\n      return {\n        campaignAddress,\n        tokenAddress: isAddress(row?.token) ? normalizeAddress(row?.token) : undefined,\n        symbol: String(row?.symbol ?? "").trim() || "???",\n        name: String(row?.name ?? "").trim() || "Unknown",\n        marketcapBnb: null,\n        votes24h: 0,\n      } satisfies CampaignTickerItem;\n    })\n    .filter(Boolean) as CampaignTickerItem[];\n\n  const enriched = await Promise.all(\n    baseItems.slice(0, 24).map(async (item) => {\n      const summary = await fetchTokenSummary(chainId, item.campaignAddress);\n      return {\n        ...item,\n        marketcapBnb: summary.marketcapBnb,\n        votes24h: summary.votes24h,\n      } satisfies CampaignTickerItem;\n    })\n  );\n\n  return enriched;\n}`,
    `async function fetchIndexedTickerItems(chainId: number): Promise<CampaignTickerItem[]> {\n  try {\n    const params = new URLSearchParams({\n      chainId: String(chainId),\n      limit: "100",\n      cursor: "0",\n      status: "all",\n      sort: "created_desc",\n      tab: "trending",\n      _r: String(Date.now()),\n    });\n    if (chainId === 97) {\n      params.set("includeTestnet", "true");\n      params.set("testnet", "true");\n    }\n    const response = await apiFetch(\`/api/campaigns?\${params.toString()}\`, { cache: "no-store" });\n    const payload = await response.json().catch(() => null);\n    if (!response.ok || !Array.isArray(payload?.items)) return [];\n    return payload.items.map((row: any): CampaignTickerItem | null => {\n      const campaignAddress = normalizeAddress(row?.campaignAddress ?? row?.campaign_address);\n      if (!isAddress(campaignAddress)) return null;\n      return {\n        campaignAddress,\n        tokenAddress: isAddress(row?.tokenAddress ?? row?.token_address)\n          ? normalizeAddress(row?.tokenAddress ?? row?.token_address)\n          : undefined,\n        symbol: String(row?.symbol ?? row?.ticker ?? "").trim() || "???",\n        name: String(row?.name ?? "").trim() || "Unknown",\n        marketcapBnb: asNumber(row?.marketcapBnb ?? row?.marketcap_bnb),\n        votes24h: Number(asNumber(row?.votes24h ?? row?.votes_24h) ?? 0),\n      };\n    }).filter(Boolean) as CampaignTickerItem[];\n  } catch {\n    return [];\n  }\n}\n\nasync function fetchTickerItems(chainId: number): Promise<CampaignTickerItem[]> {\n  const [indexed, factoryRows] = await Promise.all([\n    fetchIndexedTickerItems(chainId),\n    fetchFactoryRows(chainId).catch(() => []),\n  ]);\n\n  const merged = new Map<string, CampaignTickerItem>();\n  for (const item of indexed) merged.set(item.campaignAddress, item);\n  for (const row of factoryRows) {\n    const campaignAddress = normalizeAddress(row?.campaign);\n    if (!isAddress(campaignAddress)) continue;\n    const previous = merged.get(campaignAddress);\n    merged.set(campaignAddress, {\n      campaignAddress,\n      tokenAddress: isAddress(row?.token) ? normalizeAddress(row?.token) : previous?.tokenAddress,\n      symbol: String(row?.symbol ?? "").trim() || previous?.symbol || "???",\n      name: String(row?.name ?? "").trim() || previous?.name || "Unknown",\n      marketcapBnb: previous?.marketcapBnb ?? null,\n      votes24h: previous?.votes24h ?? 0,\n    });\n  }\n\n  return Promise.all(\n    Array.from(merged.values()).slice(0, 30).map(async (item) => {\n      if (item.marketcapBnb != null || item.votes24h > 0) return item;\n      const summary = await fetchTokenSummary(chainId, item.campaignAddress);\n      return { ...item, ...summary };\n    }),\n  );\n}`,
    "Ticker indexed and factory merge",
    "async function fetchIndexedTickerItems(chainId: number)",
  );
  write(file, source);
}

function patchCreatorProtection() {
  const file = read("api/dev-fix/security-current-time.js");
  let source = file.source;
  source = replaceOnce(
    source,
    `function normalizeAddress(value) {\n  const raw = String(value || "").trim();\n  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";\n}`,
    `function normalizeAddress(value) {\n  const raw = String(value || "").trim();\n  if (!ethers.isAddress(raw)) return "";\n  const normalized = ethers.getAddress(raw);\n  return normalized === ethers.ZeroAddress ? "" : normalized;\n}`,
    "Ignore zero-address registry",
    "return normalized === ethers.ZeroAddress ? \"\" : normalized;",
  );
  source = replaceOnce(
    source,
    `  if (riskRegistry) {\n    const registry = new ethers.Contract(riskRegistry, RISK_REGISTRY_ABI, provider);`,
    `  const directCreator = normalizeAddress(walletAddress).toLowerCase() === creator.toLowerCase();\n  if (riskRegistry && !directCreator) {\n    const registry = new ethers.Contract(riskRegistry, RISK_REGISTRY_ABI, provider);`,
    "Skip registry lookup for direct creator",
    "if (riskRegistry && !directCreator)",
  );
  source = replaceOnce(
    source,
    `    const onChain = await readOnchainCreatorProtection({ chainId, campaignAddress: campaign, walletAddress: wallet });\n    const creatorProfile = await legacySecurity.evaluateCreatePreflight({ walletAddress: onChain.creator });\n    const { tier, tierNumber } = formatTierLabel(creatorProfile?.tier || creatorProfile?.creator?.tier);\n    let dbBuyerClusterId = String(base?.walletRisk?.clusterId || base?.cluster?.id || "").trim() || null;\n    let dbCreatorClusterId = String(creatorProfile?.creator?.clusterId || creatorProfile?.cluster?.id || "").trim() || null;\n    const directCreator = wallet.toLowerCase() === onChain.creator.toLowerCase();`,
    `    const onChain = await readOnchainCreatorProtection({ chainId, campaignAddress: campaign, walletAddress: wallet });\n    const directCreator = wallet.toLowerCase() === onChain.creator.toLowerCase();\n    let creatorProfile = null;\n    try {\n      creatorProfile = await legacySecurity.evaluateCreatePreflight({ walletAddress: onChain.creator });\n    } catch (error) {\n      if (!directCreator) throw error;\n      console.warn("[security-current-time] creator profile lookup unavailable; enforcing direct creator lock from chain", error);\n    }\n    const { tier, tierNumber } = formatTierLabel(creatorProfile?.tier || creatorProfile?.creator?.tier);\n    let dbBuyerClusterId = String(base?.walletRisk?.clusterId || base?.cluster?.id || "").trim() || null;\n    let dbCreatorClusterId = String(creatorProfile?.creator?.clusterId || creatorProfile?.cluster?.id || "").trim() || null;`,
    "Direct creator chain-first protection",
    "creator profile lookup unavailable; enforcing direct creator lock from chain",
  );
  write(file, source);
}

patchCreatePage();
patchPromotionEditor();
patchUpvoteDialog();
patchDraftGrid();
patchTicker();
patchCreatorProtection();
console.log("[devpostgrad-closeout] all closeout fixes are present");
