import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, content) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function replaceOnce(file, before, after) {
  const current = read(file);
  if (!current.includes(before)) {
    throw new Error(`Patch anchor not found in ${file}: ${before.slice(0, 120)}`);
  }
  write(file, current.replace(before, after));
}

function replaceRegex(file, pattern, after) {
  const current = read(file);
  if (!pattern.test(current)) throw new Error(`Regex patch anchor not found in ${file}: ${pattern}`);
  write(file, current.replace(pattern, after));
}

// 1. Persist the selected graduation target and cache a complete just-created bundle.
replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `  deployedAt: string | null;\n  createdAt: string;`,
  `  deployedAt: string | null;\n  graduationTargetWei: string;\n  scheduledLaunchAt?: string | null;\n  createdAt: string;`,
);

replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `  xUrl?: string | null;\n  otherUrl?: string | null;\n  visibility?: DraftVisibility;`,
  `  xUrl?: string | null;\n  telegramUrl?: string | null;\n  discordUrl?: string | null;\n  docs?: string[];\n  otherUrl?: string | null;\n  graduationTargetWei?: string;\n  visibility?: DraftVisibility;`,
);

replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `const DRAFT_READ_IN_FLIGHT = new Map<string, Promise<PrepareDraftBundle>>();`,
  `const DRAFT_READ_IN_FLIGHT = new Map<string, Promise<PrepareDraftBundle>>();\nconst DRAFT_READ_RESULT_CACHE = new Map<string, { bundle: PrepareDraftBundle; cachedAt: number }>();\nconst DRAFT_READ_RESULT_CACHE_TTL_MS = 10_000;`,
);

replaceRegex(
  "frontend/src/lib/draftApi.ts",
  /function cacheJustCreatedDraft\(draft: CampaignDraft\) \{[\s\S]*?\n\}\n\nfunction clearJustCreatedDraftCache/,
  `function cacheJustCreatedDraft(bundle: PrepareDraftBundle) {\n  const draft = bundle?.draft;\n  if (typeof window === "undefined" || !draft?.id) return;\n  try {\n    window.sessionStorage.setItem(\n      \`${JUST_CREATED_DRAFT_CACHE_PREFIX}\${draft.id}\`,\n      JSON.stringify({ bundle, cachedAt: Date.now() }),\n    );\n  } catch {}\n}\n\nfunction clearJustCreatedDraftCache`,
);

replaceRegex(
  "frontend/src/lib/draftApi.ts",
  /    const parsed = JSON\.parse\(raw\) as \{ draft\?: CampaignDraft; cachedAt\?: number \};\n    if \(!parsed\?\.draft \|\| parsed\.draft\.id !== draftId\) return null;\n    if \(!parsed\.cachedAt \|\| Date\.now\(\) - parsed\.cachedAt > JUST_CREATED_DRAFT_CACHE_TTL_MS\) return null;\n    return \{ draft: parsed\.draft, promotion: emptyPromotion\(draftId\), popularity: emptyPopularity\(\) \};/,
  `    const parsed = JSON.parse(raw) as { bundle?: PrepareDraftBundle; draft?: CampaignDraft; cachedAt?: number };\n    if (!parsed.cachedAt || Date.now() - parsed.cachedAt > JUST_CREATED_DRAFT_CACHE_TTL_MS) return null;\n    if (parsed.bundle?.draft?.id === draftId) return parsed.bundle;\n    if (parsed.draft?.id === draftId) {\n      return { draft: parsed.draft, promotion: emptyPromotion(draftId), popularity: emptyPopularity() };\n    }\n    return null;`,
);

replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `  const draft = {\n    ...(json.draft as CampaignDraft),\n    tickerReservation: (json.tickerReservation as TickerReservation | null | undefined) ?? json.draft?.tickerReservation ?? null,\n  };\n  cacheJustCreatedDraft(draft);\n  return draft;`,
  `  const draft = {\n    ...(json.draft as CampaignDraft),\n    tickerReservation: (json.tickerReservation as TickerReservation | null | undefined) ?? json.draft?.tickerReservation ?? null,\n  };\n  const bundle: PrepareDraftBundle = {\n    draft,\n    promotion: (json.promotion as CampaignDraftPromotion | undefined) || emptyPromotion(draft.id),\n    popularity: (json.popularity as DraftPopularity | undefined) || emptyPopularity(),\n    viewer: json.viewer,\n  };\n  cacheJustCreatedDraft(bundle);\n  return draft;`,
);

replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `  const readKey = \`${draftId}:\${normalizeWallet(viewer || "") || "public"}\`;\n  const existing = DRAFT_READ_IN_FLIGHT.get(readKey);`,
  `  const readKey = \`${draftId}:\${normalizeWallet(viewer || "") || "public"}\`;\n  const cachedResult = DRAFT_READ_RESULT_CACHE.get(readKey);\n  if (cachedResult && Date.now() - cachedResult.cachedAt <= DRAFT_READ_RESULT_CACHE_TTL_MS) {\n    return cachedResult.bundle;\n  }\n  if (cachedResult) DRAFT_READ_RESULT_CACHE.delete(readKey);\n\n  const existing = DRAFT_READ_IN_FLIGHT.get(readKey);`,
);

replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `    if (res.ok) return json as PrepareDraftBundle;\n    if (res.status === 401 && json?.code === "PRIVATE_DRAFT_AUTH_REQUIRED") {\n      return retryPrivateReadWithAuth(url, viewer, json, draftId);\n    }`,
  `    if (res.ok) {\n      const bundle = json as PrepareDraftBundle;\n      DRAFT_READ_RESULT_CACHE.set(readKey, { bundle, cachedAt: Date.now() });\n      return bundle;\n    }\n    if (res.status === 401 && json?.code === "PRIVATE_DRAFT_AUTH_REQUIRED") {\n      const bundle = await retryPrivateReadWithAuth(url, viewer, json, draftId);\n      DRAFT_READ_RESULT_CACHE.set(readKey, { bundle, cachedAt: Date.now() });\n      return bundle;\n    }`,
);

// 2. Create the draft and seed promotion fields in one signed request.
replaceOnce(
  "frontend/src/pages/Create.tsx",
  `import { checkTickerAvailability, createCampaignDraft, saveDraftPromotion, type TickerAvailability } from "@/lib/draftApi";`,
  `import { checkTickerAvailability, createCampaignDraft, type TickerAvailability } from "@/lib/draftApi";`,
);

replaceRegex(
  "frontend/src/pages/Create.tsx",
  /function clearJustCreatedDraftCache\(draftId: string\) \{[\s\S]*?\n\}\n\nconst Create/,
  `const Create`,
);

replaceOnce(
  "frontend/src/pages/Create.tsx",
  `        xUrl: formData.twitter || null,\n        telegramUrl: formData.telegram || null,\n        discordUrl: formData.discord || null,\n        otherUrl: formData.otherLink || null,\n        visibility: "private",\n      } as any);\n\n      try {\n        const promotionAuth = await createDraftAuth(draft.id);\n\n        await saveDraftPromotion(draft.id, {\n          auth: promotionAuth,\n          websiteUrl: formData.website || "",\n          xUrl: formData.twitter || "",\n          telegramUrl: formData.telegram || "",\n          discordUrl: formData.discord || "",\n          docs: formData.otherLink ? [formData.otherLink] : [],\n          visibility: "private",\n        });\n      } catch (promotionError) {\n        console.warn("[Create] Failed to seed promotion social links", promotionError);\n      }\n\n      clearJustCreatedDraftCache(draft.id);`,
  `        xUrl: formData.twitter || null,\n        telegramUrl: formData.telegram || null,\n        discordUrl: formData.discord || null,\n        docs: formData.otherLink ? [formData.otherLink] : [],\n        otherUrl: formData.otherLink || null,\n        graduationTargetWei: graduationTargetWei.toString(),\n        visibility: "private",\n      });`,
);

// 3. Store and return the graduation target and initial promotion server-side.
replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `const ZERO = { views: 0, follows: 0, comments: 0, reactions: 0, shares: 0, signedActions: 0 };`,
  `const ZERO = { views: 0, follows: 0, comments: 0, reactions: 0, shares: 0, signedActions: 0 };\nconst DEFAULT_GRADUATION_TARGET_WEI = 30_000n * 10n ** 18n;\nconst TEST_GRADUATION_TARGET_WEI = 6n * 10n ** 18n;\nconst STANDARD_GRADUATION_TARGETS = new Set([15_000n, 30_000n, 50_000n].map((value) => value * 10n ** 18n));`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `function cleanStringArray(value, maxItems = 12, maxLen = 600) {\n  if (!Array.isArray(value)) return [];\n  return value.map((item) => cleanText(item, maxLen)).filter(Boolean).slice(0, maxItems);\n}`,
  `function cleanStringArray(value, maxItems = 12, maxLen = 600) {\n  if (!Array.isArray(value)) return [];\n  return value.map((item) => cleanText(item, maxLen)).filter(Boolean).slice(0, maxItems);\n}\n\nfunction normalizeDraftGraduationTarget(chainId, value) {\n  let target = DEFAULT_GRADUATION_TARGET_WEI;\n  if (value != null && String(value).trim()) {\n    try {\n      target = BigInt(String(value));\n    } catch {\n      throw new TickerReservationError("Invalid graduation target.", { code: "INVALID_GRADUATION_TARGET", httpStatus: 400 });\n    }\n  }\n  if (STANDARD_GRADUATION_TARGETS.has(target)) return target.toString();\n  if (Number(chainId) === 97 && target === TEST_GRADUATION_TARGET_WEI) return target.toString();\n  throw new TickerReservationError("Unsupported graduation target for this chain.", { code: "INVALID_GRADUATION_TARGET", httpStatus: 400 });\n}`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `    deployedAt: row.deployed_at ?? row.deployedAt ?? null,\n    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),`,
  `    deployedAt: row.deployed_at ?? row.deployedAt ?? null,\n    graduationTargetWei: String(row.graduation_target_wei ?? row.graduationTargetWei ?? DEFAULT_GRADUATION_TARGET_WEI),\n    scheduledLaunchAt: row.scheduled_launch_at ?? row.scheduledLaunchAt ?? null,\n    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : "private";\n  const now = new Date().toISOString();`,
  `  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : "private";\n  const graduationTargetWei = normalizeDraftGraduationTarget(chainId, body.graduationTargetWei);\n  const now = new Date().toISOString();`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `          "insert into campaign_drafts (chain_id, creator_wallet, name, ticker, description, category, logo_url, website_url, x_url, other_url, slug, status, visibility) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12) returning *",\n          [\n            chainId,\n            creatorWallet,\n            name,\n            ticker,\n            cleanText(body.description, 1200) || null,\n            cleanText(body.category, 40) || "meme",\n            cleanUrl(body.logoUrl) || null,\n            cleanUrl(body.websiteUrl) || null,\n            cleanUrl(body.xUrl) || null,\n            cleanUrl(body.otherUrl) || null,\n            makeSlug(name, ticker),\n            visibility,\n          ],`,
  `          "insert into campaign_drafts (chain_id, creator_wallet, name, ticker, description, category, logo_url, website_url, x_url, other_url, graduation_target_wei, slug, status, visibility) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13) returning *",\n          [\n            chainId,\n            creatorWallet,\n            name,\n            ticker,\n            cleanText(body.description, 1200) || null,\n            cleanText(body.category, 40) || "meme",\n            cleanUrl(body.logoUrl) || null,\n            cleanUrl(body.websiteUrl) || null,\n            cleanUrl(body.xUrl) || null,\n            cleanUrl(body.otherUrl) || null,\n            graduationTargetWei,\n            makeSlug(name, ticker),\n            visibility,\n          ],`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `        await db.query("insert into campaign_draft_promotion (draft_id) values ($1) on conflict (draft_id) do nothing", [draft.id]);\n        await db.query("insert into campaign_draft_metrics (draft_id) values ($1) on conflict (draft_id) do nothing", [draft.id]);\n        return { draft, tickerReservation };`,
  `        const promotionRes = await db.query(\n          "insert into campaign_draft_promotion (draft_id, telegram_url, discord_url, x_url, website_url, docs, updated_at) values ($1,$2,$3,$4,$5,$6::jsonb,now()) on conflict (draft_id) do update set telegram_url = excluded.telegram_url, discord_url = excluded.discord_url, x_url = excluded.x_url, website_url = excluded.website_url, docs = excluded.docs, updated_at = now() returning *",\n          [\n            draft.id,\n            cleanUrl(body.telegramUrl),\n            cleanUrl(body.discordUrl),\n            cleanUrl(body.xUrl),\n            cleanUrl(body.websiteUrl),\n            JSON.stringify(cleanStringArray(body.docs, 8, 500)),\n          ],\n        );\n        await db.query("insert into campaign_draft_metrics (draft_id) values ($1) on conflict (draft_id) do nothing", [draft.id]);\n        return {\n          draft,\n          promotion: mapPromotionRow(promotionRes.rows[0], draft.id),\n          popularity: popularityFromMetrics(ZERO),\n          tickerReservation,\n        };`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `    deployedAt: null,\n    createdAt: now,`,
  `    deployedAt: null,\n    graduationTargetWei,\n    scheduledLaunchAt: null,\n    createdAt: now,`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `  store.promotions.set(draft.id, defaultPromotion(draft.id, now));`,
  `  store.promotions.set(draft.id, {\n    ...defaultPromotion(draft.id, now),\n    telegramUrl: cleanUrl(body.telegramUrl),\n    discordUrl: cleanUrl(body.discordUrl),\n    xUrl: cleanUrl(body.xUrl),\n    websiteUrl: cleanUrl(body.websiteUrl),\n    docs: cleanStringArray(body.docs, 8, 500),\n    publishedAt: null,\n  });`,
);

replaceOnce(
  "frontend/api/dev-fix/drafts-base.js",
  `  return json(res, 201, { draft });`,
  `  return json(res, 201, {\n    draft,\n    promotion: store.promotions.get(draft.id),\n    popularity: popularityFromMetrics(ZERO),\n  });`,
);

// Keep signed read responses aligned with the new persisted fields.
replaceOnce(
  "frontend/api/dev-fix/draft-read-base.js",
  `    deployedAt: row.deployed_at ?? row.deployedAt ?? null,\n    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),`,
  `    deployedAt: row.deployed_at ?? row.deployedAt ?? null,\n    graduationTargetWei: String(row.graduation_target_wei ?? row.graduationTargetWei ?? 30_000n * 10n ** 18n),\n    scheduledLaunchAt: row.scheduled_launch_at ?? row.scheduledLaunchAt ?? null,\n    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),`,
);

// 4. Preselect the stored tier on Push Live.
replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  `import { DEFAULT_GRADUATION_TARGET_WEI, graduationTierLabel } from "@/lib/graduationTiers";`,
  `import { DEFAULT_GRADUATION_TARGET_WEI, graduationTierLabel, isSupportedGraduationTarget } from "@/lib/graduationTiers";`,
);

replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  `      .then((data) => {\n        if (!cancelled) setBundle(data);\n      })`,
  `      .then((data) => {\n        if (cancelled) return;\n        setBundle(data);\n        try {\n          const persistedTarget = BigInt(String(data.draft.graduationTargetWei || DEFAULT_GRADUATION_TARGET_WEI));\n          if (isSupportedGraduationTarget(Number(data.draft.chainId), persistedTarget)) {\n            setGraduationTargetWei(persistedTarget);\n          }\n        } catch {\n          setGraduationTargetWei(DEFAULT_GRADUATION_TARGET_WEI);\n        }\n      })`,
);

// 5. Show a direct creator profile link on every promotion page.
replaceOnce(
  "frontend/src/pages/PrepareBase.tsx",
  `          <p className="relative z-20 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">\n            {heroTagline}{" "}\n\n          </p>`,
  `          <p className="relative z-20 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">\n            {heroTagline}{" "}\n          </p>\n\n          <Link\n            to={\`/profile/\${encodeURIComponent(draft.creatorWallet)}\`}\n            className="relative z-20 mt-4 inline-flex items-center gap-2 border border-orange-400/35 bg-black/55 px-4 py-2 text-xs uppercase tracking-[0.16em] text-orange-200 transition-colors hover:border-orange-300 hover:text-orange-100"\n            title={draft.creatorWallet}\n          >\n            <Users className="h-4 w-4" />\n            Creator · {creatorLabel(bundle)}\n          </Link>`,
);

// Also make the creator field on draft cards navigable.
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `                       <div className="truncate text-success/75">{shortAddr(draft.creatorWallet)}</div>`,
  `                       <Link\n                         to={\`/profile/\${encodeURIComponent(draft.creatorWallet)}\`}\n                         className="block truncate text-success/75 hover:text-orange-300"\n                         title={draft.creatorWallet}\n                       >\n                         {shortAddr(draft.creatorWallet)}\n                       </Link>`,
);

// 6. Allow TokenDetails to resolve a scheduled token before the general campaign feed indexes it.
replaceOnce(
  "frontend/src/pages/TokenDetails.tsx",
  `import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";`,
  `import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";\nimport { fetchPublicCampaignLifecycleDrafts } from "@/lib/scheduledLaunchApi";`,
);

replaceOnce(
  "frontend/src/pages/TokenDetails.tsx",
  `        const campaigns = await fetchCampaigns().catch((campaignError) => {\n          console.warn("[TokenDetails] campaign feed failed; trying direct campaign load", campaignError);\n          return [] as CampaignInfo[];\n        });\n\n        const param = campaignAddress.trim();\n        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(param);`,
  `        const campaigns = await fetchCampaigns().catch((campaignError) => {\n          console.warn("[TokenDetails] campaign feed failed; trying direct campaign load", campaignError);\n          return [] as CampaignInfo[];\n        });\n\n        const param = campaignAddress.trim();\n        const isAddress = /^0x[a-fA-F0-9]{40}$/.test(param);\n        const lifecycleDrafts = isAddress\n          ? await fetchPublicCampaignLifecycleDrafts({ chainId: chainIdForStorage, limit: 500 }).catch(() => [])\n          : [];\n        const lifecycleDraft = isAddress\n          ? lifecycleDrafts.find((item) => {\n              const needle = param.toLowerCase();\n              return String(item.campaignAddress || "").toLowerCase() === needle\n                || String(item.tokenAddress || "").toLowerCase() === needle;\n            })\n          : null;`,
);

replaceOnce(
  "frontend/src/pages/TokenDetails.tsx",
  `        if (!match && isAddress) {\n          match = await buildCampaignFromAddress(param, readProvider, chainIdForStorage);\n        }`,
  `        if (!match && isAddress) {\n          const directCampaignAddress = String(lifecycleDraft?.campaignAddress || param);\n          match = await buildCampaignFromAddress(directCampaignAddress, readProvider, chainIdForStorage);\n        }`,
);

// 7. Add a UI access gate for scheduled TokenDetails pages. Contract launchAt remains the real trading lock.
write(
  "frontend/src/components/token/ScheduledTokenAccessRoute.tsx",
  `import { useEffect, useMemo, useState, type ReactNode } from "react";\nimport { Link, useLocation, useParams } from "react-router-dom";\nimport { Clock3, ShieldCheck } from "lucide-react";\n\nimport { Button } from "@/components/ui/button";\nimport { useWallet } from "@/contexts/WalletContext";\nimport { getActiveChainId } from "@/lib/chainConfig";\nimport { fetchPublicCampaignLifecycleDrafts, timestampSeconds, type CampaignDraftLifecycle } from "@/lib/scheduledLaunchApi";\n\nfunction sameAddress(a?: string | null, b?: string | null) {\n  return Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());\n}\n\nfunction countdownLabel(launchAt: number, nowMs: number) {\n  const remaining = Math.max(0, launchAt - Math.floor(nowMs / 1000));\n  const hours = Math.floor(remaining / 3600);\n  const minutes = Math.floor((remaining % 3600) / 60);\n  const seconds = remaining % 60;\n  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");\n}\n\nexport function ScheduledTokenAccessRoute({ children }: { children: ReactNode }) {\n  const { campaignAddress = "" } = useParams();\n  const location = useLocation();\n  const wallet = useWallet();\n  const [draft, setDraft] = useState<CampaignDraftLifecycle | null>(null);\n  const [loading, setLoading] = useState(true);\n  const [nowMs, setNowMs] = useState(() => Date.now());\n\n  const chainId = useMemo(() => {\n    const configured = Number(new URLSearchParams(location.search).get("chainId") || 0);\n    return configured > 0 ? configured : Number(getActiveChainId(wallet.chainId));\n  }, [location.search, wallet.chainId]);\n\n  useEffect(() => {\n    let cancelled = false;\n    setLoading(true);\n    void fetchPublicCampaignLifecycleDrafts({ chainId, limit: 500 })\n      .then((items) => {\n        if (cancelled) return;\n        const needle = String(campaignAddress).toLowerCase();\n        setDraft(items.find((item) =>\n          String(item.campaignAddress || "").toLowerCase() === needle\n          || String(item.tokenAddress || "").toLowerCase() === needle\n        ) || null);\n      })\n      .catch(() => {\n        if (!cancelled) setDraft(null);\n      })\n      .finally(() => {\n        if (!cancelled) setLoading(false);\n      });\n    return () => { cancelled = true; };\n  }, [campaignAddress, chainId]);\n\n  const launchAt = timestampSeconds(draft?.scheduledLaunchAt);\n  const restricted = Boolean(draft && launchAt && launchAt > Math.floor(nowMs / 1000));\n  const isCreator = sameAddress(wallet.account, draft?.creatorWallet);\n\n  useEffect(() => {\n    if (!restricted) return;\n    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);\n    return () => window.clearInterval(timer);\n  }, [restricted]);\n\n  if (loading) {\n    return <div className="mx-auto max-w-4xl py-20 text-center font-retro text-muted-foreground">Checking launch access...</div>;\n  }\n\n  if (restricted && !isCreator && draft && launchAt) {\n    return (\n      <div className="mx-auto max-w-3xl px-4 py-20 text-center">\n        <div className="mwz-card border-orange-400/35 p-8">\n          <ShieldCheck className="mx-auto h-10 w-10 text-orange-300" />\n          <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-orange-400">Scheduled campaign protection</div>\n          <h1 className="mt-3 font-retro text-3xl text-foreground">Trading room opens at launch</h1>\n          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">\n            This campaign is already deployed on-chain, but its TokenDetails workspace stays creator-only until the scheduled trading timestamp.\n          </p>\n          <div className="mt-6 inline-flex items-center gap-2 border border-orange-400/35 bg-black/50 px-5 py-3 font-retro text-xl text-orange-200">\n            <Clock3 className="h-5 w-5" />\n            {countdownLabel(launchAt, nowMs)}\n          </div>\n          <div className="mt-6">\n            <Button asChild className="mwz-button mwz-button-orange font-retro">\n              <Link to={\`/prepare/\${encodeURIComponent(draft.slug)}\`}>Open promotion page</Link>\n            </Button>\n          </div>\n        </div>\n      </div>\n    );\n  }\n\n  return (\n    <>\n      {restricted && isCreator && draft && launchAt ? (\n        <div className="mx-auto mb-4 max-w-7xl border border-orange-400/35 bg-orange-500/5 px-4 py-3 text-center text-xs uppercase tracking-[0.14em] text-orange-200">\n          Creator preview · public TokenDetails access opens in {countdownLabel(launchAt, nowMs)}\n        </div>\n      ) : null}\n      {children}\n    </>\n  );\n}\n`,
);

replaceOnce(
  "frontend/src/App.tsx",
  `import { TokenSafetyRouteOverlay } from "@/components/token/TokenSafetyRouteOverlay";`,
  `import { TokenSafetyRouteOverlay } from "@/components/token/TokenSafetyRouteOverlay";\nimport { ScheduledTokenAccessRoute } from "@/components/token/ScheduledTokenAccessRoute";`,
);

replaceOnce(
  "frontend/src/App.tsx",
  `          <Route path="/token/:campaignAddress" element={<><TokenDetails /><TokenSafetyRouteOverlay /></>} />`,
  `          <Route path="/token/:campaignAddress" element={<ScheduledTokenAccessRoute><TokenDetails /><TokenSafetyRouteOverlay /></ScheduledTokenAccessRoute>} />`,
);

// 8. Database migration for persisted draft tiers.
write(
  "db/migrations/20260729134500_add_draft_graduation_target.sql",
  `alter table public.campaign_drafts\n  add column if not exists graduation_target_wei numeric(78,0);\n\nupdate public.campaign_drafts\n   set graduation_target_wei = 30000000000000000000000\n where graduation_target_wei is null;\n\nalter table public.campaign_drafts\n  alter column graduation_target_wei set default 30000000000000000000000,\n  alter column graduation_target_wei set not null;\n\ndo $$\nbegin\n  if not exists (\n    select 1\n      from pg_constraint\n     where conname = 'campaign_drafts_graduation_target_check'\n       and conrelid = 'public.campaign_drafts'::regclass\n  ) then\n    alter table public.campaign_drafts\n      add constraint campaign_drafts_graduation_target_check\n      check (\n        graduation_target_wei in (\n          6000000000000000000,\n          15000000000000000000000,\n          30000000000000000000000,\n          50000000000000000000000\n        )\n        and (graduation_target_wei <> 6000000000000000000 or chain_id = 97)\n      );\n  end if;\nend\n$$;\n`,
);

// Remove temporary automation from the resulting feature branch.
fs.rmSync(path.join(root, "scripts/apply-prepare-closeout-patch.mjs"), { force: true });
fs.rmSync(path.join(root, ".github/workflows/apply-prepare-closeout-patch.yml"), { force: true });

console.log("Prepare closeout patch applied.");
