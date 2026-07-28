#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function file(relative) {
  return path.join(root, relative);
}

function read(relative) {
  return fs.readFileSync(file(relative), "utf8").replace(/\r\n/g, "\n");
}

function write(relative, content) {
  fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
  fs.writeFileSync(file(relative), content.endsWith("\n") ? content : `${content}\n`);
}

function replaceOnce(relative, before, after, label) {
  const source = read(relative);
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match in ${relative}, found ${count}`);
  write(relative, source.replace(before, after));
}

function replaceRegexOnce(relative, pattern, after, label) {
  const source = read(relative);
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const matches = Array.from(source.matchAll(global));
  if (matches.length !== 1) throw new Error(`${label}: expected one match in ${relative}, found ${matches.length}`);
  write(relative, source.replace(pattern, after));
}

// Draft sort/filter dropdown: only the two requested options on the Drafts tab.
replaceOnce(
  "frontend/src/components/home/DiscoveryControls.tsx",
  `  { value: "created_asc", label: "Created: Old -> New" },\n];\n\nfunction numOrUndef`,
  `  { value: "created_asc", label: "Created: Old -> New" },\n];\n\nconst DRAFT_SORT_DEFS: Array<{ value: NonNullable<HomeQuery["sort"]>; label: string }> = [\n  { value: "created_desc", label: "New draft" },\n  { value: "progress_desc", label: "Near deployment" },\n];\n\nfunction numOrUndef`,
  "insert draft sort options",
);
replaceOnce(
  "frontend/src/components/home/DiscoveryControls.tsx",
  `  const sortValue = query.sort ?? "default";`,
  `  const sortValue = isDraftRow\n    ? query.sort === "progress_desc" ? "progress_desc" : "created_desc"\n    : query.sort ?? "default";`,
  "set draft default sort",
);
replaceOnce(
  "frontend/src/components/home/DiscoveryControls.tsx",
  `                  onChange({ ...query, tab: nextTab, status: nextStatus });`,
  `                  const nextSort = nextTab === "drafts"\n                    ? "created_desc"\n                    : query.tab === "drafts" && query.sort === "progress_desc"\n                      ? "default"\n                      : query.sort ?? "default";\n                  onChange({ ...query, tab: nextTab, status: nextStatus, sort: nextSort });`,
  "set sort when changing tabs",
);
replaceOnce(
  "frontend/src/components/home/DiscoveryControls.tsx",
  `      sort: "default",`,
  `      sort: isDraftRow ? "created_desc" : "default",`,
  "reset draft sort",
);
replaceOnce(
  "frontend/src/components/home/DiscoveryControls.tsx",
  `                {SORT_DEFS.map((s) => (`,
  `                {(isDraftRow ? DRAFT_SORT_DEFS : SORT_DEFS).map((s) => (`,
  "render draft sort options",
);

// Keep cards compact, show only a Scheduled badge and launch date over the image,
// remove them at launchAt, and make newest draft the standard order.
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `import { ScheduledLaunchCountdown } from "@/components/prepare/ScheduledLaunchCountdown";\n`,
  ``,
  "remove card countdown import",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `import type { CampaignDraftLifecycle } from "@/lib/scheduledLaunchApi";`,
  `import { timestampSeconds, type CampaignDraftLifecycle } from "@/lib/scheduledLaunchApi";`,
  "import timestamp helper",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `const PUBLIC_DRAFT_STATUSES = new Set(["promotion_published", "ready_to_launch", "scheduled", "deployed"]);`,
  `const PUBLIC_DRAFT_STATUSES = new Set(["promotion_published", "ready_to_launch", "scheduled"]);`,
  "exclude deployed drafts",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `function readiness(status: string, deployed: boolean) {\n  if (status === "deployed") return "Launched · Prepare live";\n  if (status === "scheduled") return deployed ? "Deployed · trading timed" : "Scheduled";\n  if (status === "ready_to_launch") return "Ready to launch";\n  return "Promotion live";\n}`,
  `function readiness(status: string) {\n  if (status === "scheduled") return "Scheduled";\n  if (status === "ready_to_launch") return "Ready to launch";\n  return "Promotion live";\n}\n\nfunction scheduledLaunchSeconds(draft: CampaignDraftLifecycle) {\n  return timestampSeconds(draft.scheduledLaunchAt);\n}\n\nfunction isFutureScheduledDraft(draft: CampaignDraftLifecycle, nowMs = Date.now()) {\n  const launchAt = scheduledLaunchSeconds(draft);\n  return Boolean(\n    String(draft.status) === "scheduled" &&\n      draft.campaignAddress &&\n      launchAt &&\n      launchAt > Math.floor(nowMs / 1000),\n  );\n}\n\nfunction formatLaunchDate(value?: string | number | null) {\n  const seconds = timestampSeconds(value);\n  if (!seconds) return "Launch time unavailable";\n  return `Launch ${new Intl.DateTimeFormat(undefined, {\n    month: "short",\n    day: "numeric",\n    year: "numeric",\n    hour: "2-digit",\n    minute: "2-digit",\n  }).format(new Date(seconds * 1000))}`;\n}`,
  "replace draft readiness and launch helpers",
);
replaceRegexOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  /function sortDrafts\(items: DraftCampaignVM\[\], sort: HomeQuery\["sort"\] \| undefined\) \{[\s\S]*?\n\}/,
  `function sortDrafts(items: DraftCampaignVM[], sort: HomeQuery["sort"] | undefined, nowMs: number) {\n  const created = (item: DraftCampaignVM) => String(item.draft.draftCreatedAt || item.draft.createdAt || "");\n  const active = items.filter((item) => {\n    if (String(item.draft.status) !== "scheduled") return String(item.draft.status) !== "deployed";\n    return isFutureScheduledDraft(item.draft, nowMs);\n  });\n\n  if (sort === "progress_desc") {\n    return active\n      .filter((item) => isFutureScheduledDraft(item.draft, nowMs))\n      .sort((a, b) => {\n        const launchDiff = Number(scheduledLaunchSeconds(a.draft) || Number.MAX_SAFE_INTEGER)\n          - Number(scheduledLaunchSeconds(b.draft) || Number.MAX_SAFE_INTEGER);\n        return launchDiff || created(b).localeCompare(created(a));\n      });\n  }\n\n  if (sort === "created_asc") return active.slice().sort((a, b) => created(a).localeCompare(created(b)));\n  return active.slice().sort((a, b) => created(b).localeCompare(created(a)));\n}`,
  "replace draft sorting",
);
replaceRegexOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  /function isDiscoverableDraft\(draft: CampaignDraftLifecycle\) \{[\s\S]*?\n\}/,
  `function isDiscoverableDraft(draft: CampaignDraftLifecycle, nowMs = Date.now()) {\n  const status = String(draft.status);\n  if (!PUBLIC_DRAFT_STATUSES.has(status)) return false;\n  if (status === "scheduled") return isFutureScheduledDraft(draft, nowMs);\n  return !draft.campaignAddress;\n}`,
  "replace draft discovery predicate",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `  const [refreshNonce, setRefreshNonce] = useState(0);`,
  `  const [refreshNonce, setRefreshNonce] = useState(0);\n  const [nowMs, setNowMs] = useState(() => Date.now());`,
  "add draft clock",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `  }, [chainId]);\n\n  useEffect(() => {\n    let cancelled = false;`,
  `  }, [chainId]);\n\n  useEffect(() => {\n    if (!items.some((item) => String(item.draft.status) === "scheduled")) return;\n    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);\n    return () => window.clearInterval(timer);\n  }, [items]);\n\n  useEffect(() => {\n    let cancelled = false;`,
  "add scheduled draft timer",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `          .filter(isDiscoverableDraft)`,
  `          .filter((draft) => isDiscoverableDraft(draft, Date.now()))`,
  "filter launched drafts on load",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `  const visible = useMemo(\n    () => sortDrafts(items.filter((item) => matchesSearch(item, query.search)), query.sort),\n    [items, query.search, query.sort],\n  );`,
  `  const visible = useMemo(\n    () => sortDrafts(items.filter((item) => matchesSearch(item, query.search)), query.sort, nowMs),\n    [items, query.search, query.sort, nowMs],\n  );`,
  "apply newest and near-deployment sorting",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `            const timedOnChain = Boolean(draft.campaignAddress && draft.scheduledLaunchAt);\n            const lifecycleLabel = String(draft.status) === "deployed" ? "Launched · Prepare" : "Scheduled on-chain";`,
  `            const scheduled = isFutureScheduledDraft(draft, nowMs);\n            const launchDate = scheduled ? formatLaunchDate(draft.scheduledLaunchAt) : "";`,
  "simplify card scheduled state",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `                      {timedOnChain ? lifecycleLabel : "Prepare Mode"}`,
  `                      {scheduled ? "Scheduled" : "Prepare Mode"}`,
  "use scheduled card label",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `                    <div className="absolute right-2 top-2 inline-flex items-center gap-1 border border-orange-400/50 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-orange-300">\n                      <Flame className="h-3 w-3" />\n                      {heat}\n                    </div>\n                  </div>`,
  `                    <div className="absolute right-2 top-2 inline-flex items-center gap-1 border border-orange-400/50 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-orange-300">\n                      <Flame className="h-3 w-3" />\n                      {heat}\n                    </div>\n                    {scheduled ? (\n                      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-orange-400/35 bg-black/85 px-3 py-2 text-center text-[10px] uppercase tracking-[0.12em] text-orange-200 backdrop-blur-sm">\n                        {launchDate}\n                      </div>\n                    ) : null}\n                  </div>`,
  "add launch date over image",
);
replaceOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  `                      <div className="max-w-[112px] text-success">{readiness(String(draft.status), Boolean(draft.campaignAddress))}</div>`,
  `                      <div className="max-w-[112px] text-success">{readiness(String(draft.status))}</div>`,
  "simplify readiness call",
);
replaceRegexOnce(
  "frontend/src/components/home/DraftCampaignGrid.tsx",
  /\n                  \{timedOnChain \? \([\s\S]*?\n                  \) : null\}\n/,
  `\n`,
  "remove oversized card countdown",
);

// A due launch remains available to its promotion page, but no longer belongs in any Drafts list.
replaceOnce(
  "frontend/api/dev-fix/scheduled-lifecycle.js",
  `export async function listPublicCampaignLifecycleDrafts(pool, { chainId = null, limit = 200 } = {}) {\n  if (!pool) return [];\n  const params = [PUBLIC_LIFECYCLE_STATUSES];\n  const where = [\n    "visibility = 'public'",\n    "campaign_address is not null",\n    "scheduled_launch_at is not null",\n    "status = any($1::text[])",\n  ];\n  if (chainId) {\n    params.push(Number(chainId));\n    where.push(\`chain_id = $\${params.length}\`);\n  }\n  params.push(Math.max(1, Math.min(500, Number(limit || 200))));\n  const result = await pool.query(\n    \`select *\n       from public.campaign_drafts\n      where $\{where.join(" and ")}\n      order by coalesce(scheduled_launch_at, deployed_at, created_at) desc\n      limit $$\{params.length}\`,\n    params,\n  );\n  return result.rows.map(mapLifecycleDraftRow).filter(Boolean);\n}`,
  `export async function listPublicCampaignLifecycleDrafts(\n  pool,\n  { chainId = null, limit = 200, includeLaunched = true } = {},\n) {\n  if (!pool) return [];\n  const statuses = includeLaunched ? PUBLIC_LIFECYCLE_STATUSES : ["scheduled"];\n  const params = [statuses];\n  const where = [\n    "visibility = 'public'",\n    "campaign_address is not null",\n    "scheduled_launch_at is not null",\n    "status = any($1::text[])",\n  ];\n  if (!includeLaunched) where.push("scheduled_launch_at > now()");\n  if (chainId) {\n    params.push(Number(chainId));\n    where.push(\`chain_id = $\${params.length}\`);\n  }\n  params.push(Math.max(1, Math.min(500, Number(limit || 200))));\n  const result = await pool.query(\n    \`select *\n       from public.campaign_drafts\n      where $\{where.join(" and ")}\n      order by coalesce(scheduled_launch_at, deployed_at, created_at) desc\n      limit $$\{params.length}\`,\n    params,\n  );\n  return result.rows.map(mapLifecycleDraftRow).filter(Boolean);\n}`,
  "split promotion lifecycle from draft discovery",
);

replaceOnce(
  "frontend/api/dev-fix/drafts.js",
  `function mergeDraftItems(primary, lifecycle) {`,
  `function belongsInDraftSection(item, nowMs = Date.now()) {\n  const status = String(item?.status || "draft");\n  if (status === "deployed") return false;\n  if (status !== "scheduled") return true;\n  const launchMs = item?.scheduledLaunchAt ? Date.parse(String(item.scheduledLaunchAt)) : NaN;\n  return Number.isFinite(launchMs) && launchMs > nowMs;\n}\n\nfunction mergeDraftItems(primary, lifecycle) {`,
  "add draft lifecycle filter",
);
replaceOnce(
  "frontend/api/dev-fix/drafts.js",
  `    const items = await listPublicCampaignLifecycleDrafts(pool, { chainId, limit });`,
  `    const items = await listPublicCampaignLifecycleDrafts(pool, { chainId, limit, includeLaunched: true });`,
  "keep lifecycle endpoint complete",
);
replaceOnce(
  "frontend/api/dev-fix/drafts.js",
  `    const isPublicList = req.method === "GET" && !String(query.owner || "").trim();\n    if (!isPublicList || !Array.isArray(enriched?.items) || !pool) return enriched;\n\n    const chainId = query.chainId ? Number(query.chainId) : null;\n    const limit = Math.max(1, Math.min(500, Number(query.limit || 50) || 50));\n    const lifecycleItems = await listPublicCampaignLifecycleDrafts(pool, { chainId, limit });\n\n    return {\n      ...enriched,\n      items: mergeDraftItems(enriched.items, lifecycleItems).slice(0, limit),\n    };`,
  `    if (!Array.isArray(enriched?.items)) return enriched;\n\n    const nowMs = Date.now();\n    const draftItems = enriched.items.filter((item) => belongsInDraftSection(item, nowMs));\n    const isPublicList = req.method === "GET" && !String(query.owner || "").trim();\n    if (!isPublicList || !pool) return { ...enriched, items: draftItems };\n\n    const chainId = query.chainId ? Number(query.chainId) : null;\n    const limit = Math.max(1, Math.min(500, Number(query.limit || 50) || 50));\n    const lifecycleItems = await listPublicCampaignLifecycleDrafts(pool, {\n      chainId,\n      limit,\n      includeLaunched: false,\n    });\n\n    return {\n      ...enriched,\n      items: mergeDraftItems(draftItems, lifecycleItems)\n        .filter((item) => belongsInDraftSection(item, nowMs))\n        .slice(0, limit),\n    };`,
  "filter launched items from all draft lists",
);

// Prevent two route/page consumers from consuming the one-use just-created cache
// and issuing duplicate unauthenticated GETs.
replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `const JUST_CREATED_DRAFT_CACHE_PREFIX = "mwz:just-created-draft:";\nconst JUST_CREATED_DRAFT_CACHE_TTL_MS = 5 * 60 * 1000;`,
  `const JUST_CREATED_DRAFT_CACHE_PREFIX = "mwz:just-created-draft:";\nconst JUST_CREATED_DRAFT_CACHE_TTL_MS = 5 * 60 * 1000;\nconst DRAFT_READ_IN_FLIGHT = new Map<string, Promise<PrepareDraftBundle>>();`,
  "add draft read coordinator",
);
replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `    if (!raw) return null;\n    window.sessionStorage.removeItem(key);\n    const parsed = JSON.parse(raw) as { draft?: CampaignDraft; cachedAt?: number };`,
  `    if (!raw) return null;\n    const parsed = JSON.parse(raw) as { draft?: CampaignDraft; cachedAt?: number };`,
  "preserve just-created cache for duplicate readers",
);
replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `function readJustCreatedDraftBundle(draftId: string): PrepareDraftBundle | null {`,
  `function clearJustCreatedDraftCache(draftId: string) {\n  if (typeof window === "undefined" || !draftId) return;\n  try {\n    window.sessionStorage.removeItem(\`${JUST_CREATED_DRAFT_CACHE_PREFIX}$\{draftId}\`);\n  } catch {}\n}\n\nfunction readJustCreatedDraftBundle(draftId: string): PrepareDraftBundle | null {`,
  "add just-created cache invalidation",
);
replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `export async function fetchCampaignDraft(draftId: string, viewer?: string | null): Promise<PrepareDraftBundle> {\n  const justCreatedBundle = readJustCreatedDraftBundle(draftId);\n  if (justCreatedBundle) return justCreatedBundle;\n\n  const url = apiUrl(\`/api/drafts/$\{encodeURIComponent(draftId)\}$\{query({ viewer })\}\`);\n  const res = await fetch(url);\n  const json = await res.json().catch(() => ({}));\n\n  if (res.ok) return json as PrepareDraftBundle;\n  if (res.status === 401 && json?.code === "PRIVATE_DRAFT_AUTH_REQUIRED") return retryPrivateReadWithAuth(url, viewer, json, draftId);\n  throw new Error(String(json?.error || json?.message || \`Request failed ($\{res.status})\`));\n}`,
  `export async function fetchCampaignDraft(draftId: string, viewer?: string | null): Promise<PrepareDraftBundle> {\n  const justCreatedBundle = readJustCreatedDraftBundle(draftId);\n  if (justCreatedBundle) return justCreatedBundle;\n\n  const readKey = \`$\{draftId}:$\{normalizeWallet(viewer || "") || "public"}\`;\n  const existing = DRAFT_READ_IN_FLIGHT.get(readKey);\n  if (existing) return existing;\n\n  const request = (async () => {\n    const url = apiUrl(\`/api/drafts/$\{encodeURIComponent(draftId)\}$\{query({ viewer })\}\`);\n    const res = await fetch(url, { cache: "no-store" });\n    const json = await res.json().catch(() => ({}));\n\n    if (res.ok) return json as PrepareDraftBundle;\n    if (res.status === 401 && json?.code === "PRIVATE_DRAFT_AUTH_REQUIRED") {\n      return retryPrivateReadWithAuth(url, viewer, json, draftId);\n    }\n    throw new Error(String(json?.error || json?.message || \`Request failed ($\{res.status})\`));\n  })();\n\n  DRAFT_READ_IN_FLIGHT.set(readKey, request);\n  try {\n    return await request;\n  } finally {\n    DRAFT_READ_IN_FLIGHT.delete(readKey);\n  }\n}`,
  "deduplicate draft reads",
);
replaceOnce(
  "frontend/src/lib/draftApi.ts",
  `  return parseJson(res) as Promise<PrepareDraftBundle>;\n}\n\nexport async function fetchPrepareDraft`,
  `  const bundle = await parseJson(res) as PrepareDraftBundle;\n  clearJustCreatedDraftCache(draftId);\n  return bundle;\n}\n\nexport async function fetchPrepareDraft`,
  "invalidate cache after promotion save",
);

// Dedicated scheduled-factory resolution. Testnet must never silently fall back
// to the stale generation in the generic deployment manifest.
write(
  "frontend/src/lib/scheduledFactoryConfig.ts",
  `import { ethers } from "ethers";\n\nexport const BSC_TESTNET_SCHEDULED_FACTORY = "0xF7872169265eCE4E4C93ef894F1635E84DC6F681";\n\nfunction env(name: string) {\n  return String((import.meta.env as Record<string, unknown>)[name] || "").trim();\n}\n\nfunction validAddress(value?: string | null) {\n  const raw = String(value || "").trim();\n  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";\n}\n\nexport function getScheduledFactoryAddress(chainId: number, genericFactoryAddress?: string | null) {\n  const explicit = validAddress(\n    env(\`VITE_SCHEDULED_FACTORY_ADDRESS_$\{Number(chainId)}\`) ||\n      env(\`VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS_$\{Number(chainId)}\`) ||\n      env("VITE_SCHEDULED_FACTORY_ADDRESS") ||\n      env("VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS"),\n  );\n  if (explicit) return explicit;\n  if (Number(chainId) === 97) return BSC_TESTNET_SCHEDULED_FACTORY;\n  return validAddress(genericFactoryAddress);\n}\n`,
);

write(
  "frontend/src/lib/scheduledLaunchClientV2.ts",
  `import { Contract, ethers, type JsonRpcSigner } from "ethers";\nimport { apiFetch } from "@/lib/apiBase";\nimport type { DraftActionAuth } from "@/lib/draftAuth";\n\nconst SCHEDULED_FACTORY_ABI = [\n  "function live() view returns (bool)",\n  "function globalPaused() view returns (bool)",\n  "function createPaused() view returns (bool)",\n  "function creatorRegistry() view returns (address)",\n  "function createScheduledCampaignAuthorized(((string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint256 graduationTarget) campaign,uint64 launchAt,bytes32 draftReferenceHash,bytes32 normalizedTickerHash,bytes32 metadataHash,uint64 reservationVersion,uint256 authorizationNonce) req,(uint8 tradeRouteProfile,uint8 finalizeRouteProfile,uint64 deadline,bytes signature) routeAuth) returns (address campaignAddr,address tokenAddr)",\n  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol,string logoURI,string metadataURI)",\n  "error NotLive()",\n  "error Paused()",\n  "error CreatePaused()",\n  "error CreatorNotEligible()",\n  "error RiskNotEligible()",\n  "error RouteAuthorityZero()",\n  "error RouteAuthorizationExpired()",\n  "error InvalidRouteAuthorization()",\n  "error RouteAuthorizationReplayed()",\n  "error InvalidLaunchAt()",\n  "error LaunchAtTooFar()",\n  "error MissingDraftReference()",\n  "error MissingTickerHash()",\n  "error MissingMetadataHash()",\n  "error InvalidReservationVersion()",\n  "error InvalidAuthorizationNonce()",\n  "error UnsupportedGraduationTarget()",\n] as const;\n\nconst CREATOR_REGISTRY_ABI = [\n  "function canLaunch(address) view returns (bool)",\n  "function getCreatorProfile(address) view returns (uint8 tier,uint256 trustScore,uint256 liveBondingCount,uint256 lastLaunchTimestamp,bool restricted,bool manualReviewRequired)",\n  "function getCreatorRules(address) view returns (uint256 maxLiveBonding,uint256 cooldownSeconds,uint256 creatorBuyLockSeconds,uint256 creatorBuyCapWei,uint256 maxClusterWallets)",\n] as const;\n\nconst FACTORY_INTERFACE = new ethers.Interface(SCHEDULED_FACTORY_ABI);\n\nasync function parseApiJson(res: Response) {\n  const json = await res.json().catch(() => ({}));\n  if (!res.ok) throw new Error(String(json?.error || json?.message || \`Request failed ($\{res.status})\`));\n  return json;\n}\n\nfunction extractCreated(receipt: any) {\n  for (const log of receipt?.logs || []) {\n    try {\n      const parsed = FACTORY_INTERFACE.parseLog({ topics: [...log.topics], data: log.data });\n      if (parsed?.name === "CampaignCreated") {\n        return {\n          campaignAddress: String(parsed.args?.campaign || ""),\n          tokenAddress: String(parsed.args?.token || ""),\n        };\n      }\n    } catch {}\n  }\n  return { campaignAddress: "", tokenAddress: "" };\n}\n\nfunction errorData(error: any): string {\n  const candidates = [\n    error?.data,\n    error?.revert?.data,\n    error?.info?.error?.data,\n    error?.info?.error?.data?.data,\n    error?.error?.data,\n    error?.cause?.data,\n  ];\n  for (const candidate of candidates) {\n    if (typeof candidate === "string" && candidate.startsWith("0x")) return candidate;\n    if (candidate && typeof candidate === "object") {\n      for (const key of ["data", "result", "return"]) {\n        const nested = candidate[key];\n        if (typeof nested === "string" && nested.startsWith("0x")) return nested;\n      }\n    }\n  }\n  return "";\n}\n\nfunction errorName(error: any) {\n  const direct = String(error?.revert?.name || error?.errorName || "").trim();\n  if (direct) return direct;\n  const data = errorData(error);\n  if (!data) return "";\n  try {\n    return String(FACTORY_INTERFACE.parseError(data)?.name || "");\n  } catch {\n    return "";\n  }\n}\n\nfunction friendlyFactoryError(error: any) {\n  const name = errorName(error);\n  const messages: Record<string, string> = {\n    NotLive: "The scheduled LaunchFactory is not live.",\n    Paused: "Scheduled deployment is paused by the factory.",\n    CreatePaused: "New campaign creation is currently paused.",\n    CreatorNotEligible: "This creator wallet is not eligible for another launch yet. Check the on-chain cooldown and live-campaign limit.",\n    RiskNotEligible: "The creator wallet is blocked by the on-chain risk rules.",\n    RouteAuthorityZero: "The scheduled factory route authority is not configured.",\n    RouteAuthorizationExpired: "The scheduled deployment authorization expired. Try again.",\n    InvalidRouteAuthorization: "The scheduled route authorization does not match this factory. Refresh and try again.",\n    RouteAuthorizationReplayed: "This scheduled deployment authorization was already used. Refresh and try again.",\n    InvalidLaunchAt: "The selected launch time is no longer in the future.",\n    LaunchAtTooFar: "The selected launch time is more than 30 days away.",\n    UnsupportedGraduationTarget: "The selected graduation tier is not allowed by this factory.",\n  };\n  return messages[name] || String(error?.shortMessage || error?.reason || error?.message || "Scheduled deployment failed.");\n}\n\nfunction formatRemaining(seconds: number) {\n  const total = Math.max(0, Math.floor(seconds));\n  const hours = Math.floor(total / 3600);\n  const minutes = Math.floor((total % 3600) / 60);\n  return hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";\n}\n\nasync function assertScheduledFactoryReady(input: {\n  signer: JsonRpcSigner;\n  chainId: number;\n  factoryAddress: string;\n}) {\n  const provider = input.signer.provider;\n  if (!provider) throw new Error("Wallet provider is unavailable.");\n  const network = await provider.getNetwork();\n  if (Number(network.chainId) !== Number(input.chainId)) {\n    throw new Error("Wallet network changed. Switch back to the draft chain and try again.");\n  }\n  const code = await provider.getCode(input.factoryAddress);\n  if (!code || code === "0x") throw new Error("The configured scheduled factory has no contract code.");\n\n  const factory = new Contract(input.factoryAddress, SCHEDULED_FACTORY_ABI, input.signer) as any;\n  const [live, globalPaused, createPaused] = await Promise.all([\n    factory.live(),\n    factory.globalPaused(),\n    factory.createPaused(),\n  ]);\n  if (!live) throw new Error("The scheduled LaunchFactory is not live.");\n  if (globalPaused) throw new Error("Scheduled deployment is paused by the factory.");\n  if (createPaused) throw new Error("New campaign creation is currently paused.");\n\n  const creator = await input.signer.getAddress();\n  const registryAddress = String(await factory.creatorRegistry());\n  if (ethers.isAddress(registryAddress) && registryAddress !== ethers.ZeroAddress) {\n    const registry = new Contract(registryAddress, CREATOR_REGISTRY_ABI, provider) as any;\n    const canLaunch = Boolean(await registry.canLaunch(creator));\n    if (!canLaunch) {\n      const [profile, rules] = await Promise.all([\n        registry.getCreatorProfile(creator),\n        registry.getCreatorRules(creator),\n      ]);\n      if (profile.restricted) throw new Error("This creator wallet is restricted by the on-chain CreatorRegistry.");\n      if (profile.manualReviewRequired) throw new Error("This creator wallet requires manual review before another launch.");\n      if (BigInt(profile.liveBondingCount) >= BigInt(rules.maxLiveBonding)) {\n        throw new Error("This creator wallet has reached its on-chain live campaign limit.");\n      }\n      const cooldownEnds = Number(profile.lastLaunchTimestamp) + Number(rules.cooldownSeconds);\n      const now = Math.floor(Date.now() / 1000);\n      if (cooldownEnds > now) {\n        throw new Error(\n          "Creator launch cooldown is active until " +\n            new Date(cooldownEnds * 1000).toLocaleString() +\n            " (" + formatRemaining(cooldownEnds - now) + " remaining).",\n        );\n      }\n      throw new Error("This creator wallet is not eligible for another on-chain launch yet.");\n    }\n  }\n\n  return factory;\n}\n\nexport async function deployScheduledDraftCampaignV2(input: {\n  signer: JsonRpcSigner;\n  auth: DraftActionAuth;\n  chainId: number;\n  factoryAddress: string;\n  draftId: string;\n  launchAt: number;\n  graduationTargetWei: bigint;\n}) {\n  const factory = await assertScheduledFactoryReady(input);\n  const response = await apiFetch(\`/api/drafts/$\{encodeURIComponent(input.draftId)}/deploy\`, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({\n      operation: "authorize_scheduled",\n      auth: input.auth,\n      chainId: input.chainId,\n      factoryAddress: input.factoryAddress,\n      launchAt: input.launchAt,\n      graduationTargetWei: input.graduationTargetWei.toString(),\n    }),\n  });\n  const json = await parseApiJson(response);\n  const scheduledRequest = json.scheduledRequest;\n  const authorization = json.authorization;\n  if (!scheduledRequest || !authorization) throw new Error("Scheduled launch authorization response is incomplete.");\n\n  const request = {\n    campaign: {\n      ...scheduledRequest.campaign,\n      graduationTarget: BigInt(scheduledRequest.campaign.graduationTarget),\n    },\n    launchAt: Number(scheduledRequest.launchAt),\n    draftReferenceHash: scheduledRequest.draftReferenceHash,\n    normalizedTickerHash: scheduledRequest.normalizedTickerHash,\n    metadataHash: scheduledRequest.metadataHash,\n    reservationVersion: Number(scheduledRequest.reservationVersion),\n    authorizationNonce: BigInt(scheduledRequest.authorizationNonce),\n  };\n  const routeAuth = {\n    tradeRouteProfile: Number(authorization.tradeRouteProfileId),\n    finalizeRouteProfile: Number(authorization.finalizeRouteProfileId),\n    deadline: Math.floor(new Date(authorization.validUntil).getTime() / 1000),\n    signature: authorization.signature,\n  };\n\n  try {\n    await factory.createScheduledCampaignAuthorized.staticCall(request, routeAuth);\n    const tx = await factory.createScheduledCampaignAuthorized(request, routeAuth);\n    const receipt = await tx.wait();\n    return { receipt, txHash: String(receipt?.hash || tx.hash || ""), ...extractCreated(receipt) };\n  } catch (error: any) {\n    throw new Error(friendlyFactoryError(error));\n  }\n}\n`,
);

// Bind scheduled mode to the active scheduled factory, not the generic/stale manifest factory.
replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  `import { deployScheduledDraftCampaignV2 } from "@/lib/scheduledLaunchClientV2";`,
  `import { deployScheduledDraftCampaignV2 } from "@/lib/scheduledLaunchClientV2";\nimport { getScheduledFactoryAddress } from "@/lib/scheduledFactoryConfig";`,
  "import scheduled factory resolver",
);
replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  `  const selectedTier = graduationTierLabel(graduationTargetWei);`,
  `  const selectedTier = graduationTierLabel(graduationTargetWei);\n  const scheduledFactoryAddress = useMemo(\n    () => getScheduledFactoryAddress(Number(draft?.chainId || 0), launchpad.factoryAddress),\n    [draft?.chainId, launchpad.factoryAddress],\n  );`,
  "resolve scheduled factory",
);
replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  `    if (!launchpad.factoryAddress) return toast.error("LaunchFactory is not configured for this network.");`,
  `    if (mode === "scheduled" && !scheduledFactoryAddress) {\n      return toast.error("Scheduled LaunchFactory is not configured for this network.");\n    }\n    if (mode === "now" && !launchpad.factoryAddress) {\n      return toast.error("LaunchFactory is not configured for this network.");\n    }`,
  "validate mode-specific factory",
);
replaceOnce(
  "frontend/src/pages/PushDraftLive.tsx",
  `          factoryAddress: launchpad.factoryAddress,`,
  `          factoryAddress: scheduledFactoryAddress,`,
  "use scheduled factory",
);

// Server-side guard: never sign a scheduled request for the old generic factory.
write(
  "frontend/api/dev-fix/draft-deploy.js",
  `import { ethers } from "ethers";\nimport { json, readJson } from "../../server/http.js";\nimport { draftDeploy as baseDraftDeploy } from "./draft-deploy-base.js";\n\nimport { runJsonTransform } from "./json-transform.js";\nimport {\n  augmentDraftLifecycle,\n  getLifecyclePool,\n  loadDraftRowById,\n} from "./scheduled-lifecycle.js";\n\nconst BSC_TESTNET_SCHEDULED_FACTORY = "0xF7872169265eCE4E4C93ef894F1635E84DC6F681";\n\nfunction configuredScheduledFactory(chainId) {\n  const id = Number(chainId);\n  const configured = String(\n    process.env[\`SCHEDULED_FACTORY_ADDRESS_$\{id}\`] ||\n      process.env[\`SCHEDULED_LAUNCH_FACTORY_ADDRESS_$\{id}\`] ||\n      process.env[\`VITE_SCHEDULED_FACTORY_ADDRESS_$\{id}\`] ||\n      process.env.SCHEDULED_FACTORY_ADDRESS ||\n      process.env.SCHEDULED_LAUNCH_FACTORY_ADDRESS ||\n      "",\n  ).trim();\n  if (ethers.isAddress(configured)) return ethers.getAddress(configured);\n  return id === 97 ? BSC_TESTNET_SCHEDULED_FACTORY : "";\n}\n\nexport async function draftDeploy(req, res) {\n  if (req.method === "POST") {\n    const body = await readJson(req);\n    req.body = body;\n    if (body?.operation === "authorize_scheduled") {\n      const chainId = Number(body.chainId || body.auth?.chainId || 0);\n      const expected = configuredScheduledFactory(chainId);\n      const supplied = String(body.factoryAddress || "").trim();\n      if (!expected) {\n        return json(res, 503, {\n          error: "Scheduled LaunchFactory is not configured for this chain.",\n          code: "SCHEDULED_FACTORY_NOT_CONFIGURED",\n        });\n      }\n      if (!ethers.isAddress(supplied) || ethers.getAddress(supplied) !== expected) {\n        return json(res, 409, {\n          error: \`Scheduled factory mismatch. Refresh the application and try again with $\{expected}.\`,\n          code: "SCHEDULED_FACTORY_MISMATCH",\n          expectedFactoryAddress: expected,\n        });\n      }\n    }\n  }\n\n  const pool = await getLifecyclePool();\n  return runJsonTransform(baseDraftDeploy, req, res, async (payload) => {\n    if (!payload?.draft?.id) return payload;\n    const row = await loadDraftRowById(pool, payload.draft.id);\n    return { ...payload, draft: augmentDraftLifecycle(payload.draft, row) };\n  });\n}\n`,
);

replaceOnce(
  "frontend/.env.example",
  `VITE_FACTORY_ADDRESS_97=\nVITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_97=`,
  `VITE_FACTORY_ADDRESS_97=\n# Timed launches use the active scheduled factory generation.\nVITE_SCHEDULED_FACTORY_ADDRESS_97=0xF7872169265eCE4E4C93ef894F1635E84DC6F681\nVITE_CAMPAIGN_IMPLEMENTATION_ADDRESS_97=`,
  "document scheduled factory env",
);
replaceOnce(
  "frontend/.env.example",
  `DATABASE_URL=\nPORT=3001`,
  `DATABASE_URL=\nSCHEDULED_FACTORY_ADDRESS_97=0xF7872169265eCE4E4C93ef894F1635E84DC6F681\nPORT=3001`,
  "document backend scheduled factory env",
);

replaceOnce(
  "frontend/api/dev-fix/scheduled-lifecycle.test.mjs",
  `test("a due scheduled draft remains discoverable until authoritative chain reconciliation", async () => {`,
  `test("a due scheduled draft preserves its record without remaining in Drafts", async () => {`,
  "rename due draft test",
);
replaceOnce(
  "frontend/api/dev-fix/scheduled-lifecycle.test.mjs",
  `  assert.equal(await reconcileScheduledDraftLifecycle({ query: () => assert.fail("read reconciliation must not write") }), 0);`,
  `  assert.equal(await reconcileScheduledDraftLifecycle({ query: () => assert.fail("read reconciliation must not write") }), 0);\n  assert.ok(Date.parse(draft.scheduledLaunchAt) <= Date.now());`,
  "assert due draft boundary",
);

// Remove one-shot patch/diagnostic plumbing from the resulting branch.
for (const relative of [
  ".github/workflows/diagnose-scheduled-create-once.yml",
  ".github/workflows/apply-scheduled-draft-deploy-fix.yml",
  "scripts/apply-scheduled-draft-deploy-fix.mjs",
]) {
  try { fs.rmSync(file(relative)); } catch {}\n}

console.log("Applied scheduled draft card, factory binding, creator preflight, and draft-read fixes.");
