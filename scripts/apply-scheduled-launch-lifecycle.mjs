import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function replaceOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0) throw new Error(`Missing patch target: ${label}`);
  const second = text.indexOf(search, first + search.length);
  if (second >= 0) throw new Error(`Patch target is not unique: ${label}`);
  return `${text.slice(0, first)}${replacement}${text.slice(first + search.length)}`;
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start marker: ${label}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing end marker: ${label}`);
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}

function edit(relativePath, mutator) {
  const before = read(relativePath);
  const after = mutator(before);
  if (after === before) throw new Error(`Patch made no changes: ${relativePath}`);
  write(relativePath, after);
}

write(
  "frontend/api/dev-fix/scheduled-lifecycle.js",
  `export async function reconcileScheduledDraftLifecycle(pool) {
  if (!pool) return 0;

  try {
    const result = await pool.query(\`
      update public.campaign_drafts
         set status = 'deployed',
             updated_at = now()
       where status = 'scheduled'
         and campaign_address is not null
         and scheduled_launch_at is not null
         and scheduled_launch_at <= now()
      returning id
    \`);

    return Number(result.rowCount || 0);
  } catch (error) {
    console.warn("[scheduled-lifecycle] reconciliation skipped", error?.message || error);
    return 0;
  }
}
`,
);

write(
  "frontend/src/components/prepare/ScheduledLaunchCountdown.tsx",
  `import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Radio } from "lucide-react";

import { cn } from "@/lib/utils";

export type ScheduledLaunchCountdownProps = {
  launchAt?: string | null;
  chainId?: number | null;
  campaignAddress?: string | null;
  contractDeployed?: boolean;
  variant?: "hero" | "compact";
  className?: string;
};

function parseLaunchMs(value?: string | null) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function pad(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function countdownParts(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export function formatScheduledLaunchLocal(value?: string | null) {
  const ms = parseLaunchMs(value);
  if (!ms) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date(ms));
}

export function formatScheduledLaunchUtc(value?: string | null) {
  const ms = parseLaunchMs(value);
  if (!ms) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms))} UTC`;
}

export function ScheduledLaunchCountdown({
  launchAt,
  chainId,
  campaignAddress,
  contractDeployed = true,
  variant = "hero",
  className,
}: ScheduledLaunchCountdownProps) {
  const launchMs = useMemo(() => parseLaunchMs(launchAt), [launchAt]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const announcedRef = useRef(false);

  useEffect(() => {
    announcedRef.current = false;
    setNowMs(Date.now());
    if (!launchMs) return;

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [launchMs]);

  const reachedTimestamp = Boolean(launchMs && nowMs >= launchMs);
  const launched = Boolean(reachedTimestamp && contractDeployed);

  useEffect(() => {
    if (!launched || announcedRef.current || !launchAt) return;
    announcedRef.current = true;
    window.dispatchEvent(
      new CustomEvent("memebattles:scheduledLaunchReached", {
        detail: { chainId, campaignAddress, launchAt },
      }),
    );
  }, [campaignAddress, chainId, launchAt, launched]);

  if (!launchMs) return null;

  const remaining = countdownParts(launchMs - nowMs);
  const local = formatScheduledLaunchLocal(launchAt);
  const utc = formatScheduledLaunchUtc(launchAt);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";

  if (variant === "compact") {
    return (
      <div className={cn("border border-orange-400/35 bg-orange-500/5 p-2.5", className)}>
        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.15em] text-orange-300">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3 w-3" />
            {contractDeployed ? "On-chain launch" : "Scheduled launch"}
          </span>
          <span>{launched ? "Launched" : reachedTimestamp ? "Time reached" : "Trading locked"}</span>
        </div>

        <div className="mt-2 font-retro text-xl leading-none text-foreground">
          {launched
            ? "LAUNCHED"
            : reachedTimestamp
              ? "AWAITING ON-CHAIN CONFIRMATION"
              : `${remaining.days}D ${pad(remaining.hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`}
        </div>

        <div className="mt-2 text-[10px] leading-4 text-muted-foreground">
          <div>{local}</div>
          <div>{utc}</div>
        </div>

        <div className="mt-2 text-[10px] leading-4 text-orange-100/75">
          {launched
            ? "Trading-open time reached. The promotion page remains active."
            : contractDeployed
              ? "Contract deployed. Trading has not opened yet."
              : "Creator must still confirm the launch on-chain."}
        </div>
      </div>
    );
  }

  return (
    <section className={cn("mwz-card relative z-20 mt-7 w-full max-w-5xl overflow-hidden border-orange-400/55 bg-black/65 p-5 md:p-7", className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,153,0,0.18),transparent_62%)]" />
      <div className="relative">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-orange-300">
              <Radio className="h-4 w-4" />
              {contractDeployed ? "Launch confirmed on-chain" : "Scheduled launch"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {launched
                ? "The scheduled trading-open timestamp has been reached. Trading controls still verify the campaign contract before submitting."
                : reachedTimestamp
                  ? "The selected time has passed, but this launch is not confirmed on-chain."
                  : contractDeployed
                    ? "The campaign and token are deployed. Trading remains contract-locked until the selected launch timestamp."
                    : "The selected time is tentative until the creator arms and confirms the launch on-chain."}
            </p>
          </div>

          <div className="shrink-0 border border-orange-400/30 bg-black/60 px-4 py-3 text-left md:text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Exact launch</div>
            <div className="mt-1 text-sm text-foreground">{local}</div>
            <div className="mt-1 text-[11px] text-orange-200/80">{utc}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{timezone}</div>
          </div>
        </div>

        {launched ? (
          <div className="mt-6 border-y border-green-400/35 py-6 text-center">
            <div className="font-retro text-5xl uppercase tracking-[0.1em] text-green-300 md:text-7xl">Launched</div>
          </div>
        ) : reachedTimestamp ? (
          <div className="mt-6 border-y border-orange-400/35 py-6 text-center">
            <div className="font-retro text-3xl uppercase tracking-[0.08em] text-orange-200 md:text-5xl">Awaiting on-chain confirmation</div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-4 gap-2 md:gap-4">
            {[
              [remaining.days, "Days"],
              [remaining.hours, "Hours"],
              [remaining.minutes, "Minutes"],
              [remaining.seconds, "Seconds"],
            ].map(([value, label]) => (
              <div key={String(label)} className="border border-orange-400/30 bg-black/55 px-2 py-4 text-center md:px-4 md:py-5">
                <div className="font-retro text-3xl leading-none text-foreground md:text-5xl">{pad(Number(value))}</div>
                <div className="mt-2 text-[9px] uppercase tracking-[0.14em] text-orange-300 md:text-[10px]">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
`,
);

edit("frontend/api/dev-fix/draft-read.js", (source) => {
  let text = replaceOnce(
    source,
    'import { requireDraftActionAuth } from "./draft-auth.js";\n',
    'import { requireDraftActionAuth } from "./draft-auth.js";\nimport { reconcileScheduledDraftLifecycle } from "./scheduled-lifecycle.js";\n',
    "draft-read lifecycle import",
  );

  text = replaceOnce(
    text,
    '  const rawCreator = String(row.creator_wallet ?? row.creatorWallet ?? "");\n  return {',
    '  const rawCreator = String(row.creator_wallet ?? row.creatorWallet ?? "");\n  const draftCreatedAt = row.created_at ?? row.createdAt ?? new Date().toISOString();\n  const contractDeployedAt = row.deployed_at ?? row.deployedAt ?? null;\n  const scheduledLaunchAt = row.scheduled_launch_at ?? row.scheduledLaunchAt ?? null;\n  const tradingLaunchAt = scheduledLaunchAt ?? contractDeployedAt;\n  return {',
    "draft-read canonical timestamps",
  );

  text = replaceOnce(
    text,
    '    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,\n    archivedAt: row.archived_at ?? row.archivedAt ?? null,\n    deployedAt: row.deployed_at ?? row.deployedAt ?? null,\n    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),\n    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),',
    '    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,\n    scheduledLaunchAt,\n    draftCreatedAt,\n    contractDeployedAt,\n    tradingLaunchAt,\n    archivedAt: row.archived_at ?? row.archivedAt ?? null,\n    deployedAt: contractDeployedAt,\n    createdAt: draftCreatedAt,\n    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),',
    "draft-read mapped timestamps",
  );

  text = replaceOnce(
    text,
    '  if (!pool) return json(res, 503, { error: "Signed draft reads require DATABASE_URL-backed wallet auth." });\n\n  const draftRes',
    '  if (!pool) return json(res, 503, { error: "Signed draft reads require DATABASE_URL-backed wallet auth." });\n  await reconcileScheduledDraftLifecycle(pool);\n\n  const draftRes',
    "signed draft reconciliation",
  );

  text = replaceOnce(
    text,
    '  if (!pool) return json(res, 503, { error: "Signed prepare reads require DATABASE_URL-backed wallet auth." });\n\n  const draftRes',
    '  if (!pool) return json(res, 503, { error: "Signed prepare reads require DATABASE_URL-backed wallet auth." });\n  await reconcileScheduledDraftLifecycle(pool);\n\n  const draftRes',
    "signed prepare reconciliation",
  );

  return text;
});

edit("frontend/api/dev-fix/drafts.js", (source) => {
  let text = replaceOnce(
    source,
    'import { requireDraftActionAuth } from "./draft-auth.js";\n',
    'import { requireDraftActionAuth } from "./draft-auth.js";\nimport { reconcileScheduledDraftLifecycle } from "./scheduled-lifecycle.js";\n',
    "drafts lifecycle import",
  );

  text = replaceOnce(
    text,
    '      deployTxHash: null,\n      archivedAt: null,\n      deployedAt: null,\n      createdAt: now,',
    '      deployTxHash: null,\n      scheduledLaunchAt: null,\n      draftCreatedAt: now,\n      contractDeployedAt: null,\n      tradingLaunchAt: null,\n      archivedAt: null,\n      deployedAt: null,\n      createdAt: now,',
    "demo draft timestamps",
  );

  text = replaceOnce(
    text,
    '  const rawCreator = String(row.creator_wallet ?? row.creatorWallet ?? "");\n  return {',
    '  const rawCreator = String(row.creator_wallet ?? row.creatorWallet ?? "");\n  const draftCreatedAt = row.created_at ?? row.createdAt ?? new Date().toISOString();\n  const contractDeployedAt = row.deployed_at ?? row.deployedAt ?? null;\n  const scheduledLaunchAt = row.scheduled_launch_at ?? row.scheduledLaunchAt ?? null;\n  const tradingLaunchAt = scheduledLaunchAt ?? contractDeployedAt;\n  return {',
    "drafts canonical timestamps",
  );

  text = replaceOnce(
    text,
    '    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,\n    archivedAt: row.archived_at ?? row.archivedAt ?? null,\n    deployedAt: row.deployed_at ?? row.deployedAt ?? null,\n    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),\n    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),',
    '    deployTxHash: row.deploy_tx_hash ?? row.deployTxHash ?? null,\n    scheduledLaunchAt,\n    draftCreatedAt,\n    contractDeployedAt,\n    tradingLaunchAt,\n    archivedAt: row.archived_at ?? row.archivedAt ?? null,\n    deployedAt: contractDeployedAt,\n    createdAt: draftCreatedAt,\n    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),',
    "drafts mapped timestamps",
  );

  const getBlock = `  if (req.method === "GET") {
    const q = getQuery(req);
    const ownerChain = q.chainId ? Number(q.chainId) : null;
    const owner = normalizeAddress(q.owner, ownerChain);
    const includeCampaignLifecycle = String(q.lifecycle || "").toLowerCase() === "campaign";
    const requestedLimit = Math.max(1, Math.min(200, Number(q.limit || 50) || 50));
    const pool = await getPool();

    if (pool) {
      await reconcileScheduledDraftLifecycle(pool);

      if (owner) {
        const result = await pool.query(
          "select * from campaign_drafts where creator_wallet = $1 order by created_at desc limit $2",
          [owner, requestedLimit],
        );
        return json(res, 200, { items: result.rows.map(mapDraftRow) });
      }

      const chainId = q.chainId ? Number(q.chainId) : null;
      const discoveryStatuses = includeCampaignLifecycle
        ? Array.from(new Set([...PUBLIC_DISCOVERY_STATUSES, "deployed"]))
        : Array.from(PUBLIC_DISCOVERY_STATUSES);
      const where = ["visibility = 'public'", "status = any($1::text[])"];
      const params = [discoveryStatuses];

      if (includeCampaignLifecycle) where.push("campaign_address is not null");
      if (chainId) {
        where.push(\`chain_id = $\${params.length + 1}\`);
        params.push(chainId);
      }

      params.push(requestedLimit);
      const result = await pool.query(
        \`select * from campaign_drafts where \${where.join(" and ")} order by created_at desc limit $\${params.length}\`,
        params,
      );
      return json(res, 200, { items: result.rows.map(mapDraftRow) });
    }

    const nowMs = Date.now();
    const store = memoryStore();
    const items = Array.from(store.drafts.values())
      .map((draft) => {
        const scheduledMs = Date.parse(String(draft.scheduledLaunchAt || draft.tradingLaunchAt || ""));
        if (
          draft.status === "scheduled" &&
          draft.campaignAddress &&
          Number.isFinite(scheduledMs) &&
          scheduledMs <= nowMs
        ) {
          return { ...draft, status: "deployed" };
        }
        return draft;
      })
      .filter((draft) => {
        if (owner) return draft.creatorWallet === owner;
        if (includeCampaignLifecycle) {
          return (
            draft.visibility === "public" &&
            Boolean(draft.campaignAddress) &&
            ["promotion_published", "ready_to_launch", "scheduled", "deployed"].includes(String(draft.status))
          );
        }
        return isPublicDiscoverableDraft(draft);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, requestedLimit);
    return json(res, 200, { items });
  }
`;

  text = replaceBetween(
    text,
    '  if (req.method === "GET") {\n',
    '\n  const body = await readJson(req);',
    getBlock,
    "drafts GET lifecycle block",
  );

  text = replaceOnce(
    text,
    '    deployTxHash: null,\n    archivedAt: null,\n    deployedAt: null,\n    createdAt: now,',
    '    deployTxHash: null,\n    scheduledLaunchAt: null,\n    draftCreatedAt: now,\n    contractDeployedAt: null,\n    tradingLaunchAt: null,\n    archivedAt: null,\n    deployedAt: null,\n    createdAt: now,',
    "new memory draft timestamps",
  );

  return text;
});

edit("frontend/api/dev-fix/draft-deploy.js", (source) => {
  let text = replaceOnce(
    source,
    '  const rawCreator = String(row.creator_wallet || row.creatorWallet || "");\n  return {',
    '  const rawCreator = String(row.creator_wallet || row.creatorWallet || "");\n  const draftCreatedAt = row.created_at ?? row.createdAt ?? new Date().toISOString();\n  const contractDeployedAt = row.deployed_at ?? row.deployedAt ?? null;\n  const scheduledLaunchAt = row.scheduled_launch_at ?? row.scheduledLaunchAt ?? null;\n  const tradingLaunchAt = scheduledLaunchAt ?? contractDeployedAt;\n  return {',
    "draft deploy canonical timestamps",
  );

  text = replaceOnce(
    text,
    '    deployTxHash: row.deploy_tx_hash ?? null,\n    scheduledLaunchAt: row.scheduled_launch_at ?? null,\n    archivedAt: row.archived_at ?? null,\n    deployedAt: row.deployed_at ?? null,\n    createdAt: row.created_at,\n    updatedAt: row.updated_at,',
    '    deployTxHash: row.deploy_tx_hash ?? null,\n    scheduledLaunchAt,\n    draftCreatedAt,\n    contractDeployedAt,\n    tradingLaunchAt,\n    archivedAt: row.archived_at ?? null,\n    deployedAt: contractDeployedAt,\n    createdAt: draftCreatedAt,\n    updatedAt: row.updated_at,',
    "draft deploy mapped timestamps",
  );

  return text;
});

edit("frontend/src/lib/draftApi.ts", (source) => {
  let text = replaceOnce(
    source,
    '  deployTxHash: string | null;\n  archivedAt: string | null;\n  deployedAt: string | null;\n  createdAt: string;\n  updatedAt: string;',
    '  deployTxHash: string | null;\n  scheduledLaunchAt: string | null;\n  draftCreatedAt?: string;\n  contractDeployedAt?: string | null;\n  tradingLaunchAt?: string | null;\n  archivedAt: string | null;\n  deployedAt: string | null;\n  createdAt: string;\n  updatedAt: string;',
    "CampaignDraft timestamp fields",
  );

  text = replaceOnce(
    text,
    `export async function fetchPublicCampaignDrafts(input: { chainId?: number; limit?: number } = {}): Promise<CampaignDraft[]> {
  const res = await apiFetch(\`/api/drafts\${query({ chainId: input.chainId, limit: input.limit })}\`, { cache: "no-store" });
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as CampaignDraft[]) : [];
}
`,
    `export async function fetchPublicCampaignDrafts(input: { chainId?: number; limit?: number } = {}): Promise<CampaignDraft[]> {
  const res = await apiFetch(\`/api/drafts\${query({ chainId: input.chainId, limit: input.limit })}\`, { cache: "no-store" });
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as CampaignDraft[]) : [];
}

export async function fetchPublicCampaignLifecycleDrafts(input: { chainId?: number; limit?: number } = {}): Promise<CampaignDraft[]> {
  const res = await apiFetch(
    \`/api/drafts\${query({ chainId: input.chainId, limit: input.limit ?? 100, lifecycle: "campaign" })}\`,
    { cache: "no-store" },
  );
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as CampaignDraft[]) : [];
}
`,
    "public campaign lifecycle fetcher",
  );

  return text;
});

edit("frontend/src/components/home/DraftCampaignGrid.tsx", (source) => {
  let text = replaceOnce(
    source,
    'import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";\n',
    'import { useSelectedFeedChainId } from "@/components/common/ChainFeedSwitch";\nimport { ScheduledLaunchCountdown } from "@/components/prepare/ScheduledLaunchCountdown";\n',
    "DraftCampaignGrid countdown import",
  );

  text = replaceOnce(
    text,
    '  const [err, setErr] = useState<string | null>(null);\n\n  useEffect(() => {',
    `  const [err, setErr] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const onLaunchReached = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const eventChainId = Number(detail.chainId ?? NaN);
      if (Number.isFinite(eventChainId) && eventChainId !== Number(draftChainId)) return;
      setRefreshNonce((value) => value + 1);
    };

    window.addEventListener("memebattles:scheduledLaunchReached", onLaunchReached as EventListener);
    return () => window.removeEventListener("memebattles:scheduledLaunchReached", onLaunchReached as EventListener);
  }, [draftChainId]);

  useEffect(() => {`,
    "DraftCampaignGrid launch refresh listener",
  );

  text = replaceOnce(
    text,
    '          .filter((draft) => PUBLIC_DRAFT_STATUSES.has(String(draft.status)))\n          .filter((draft) => !draft.campaignAddress && String(draft.status) !== "deployed")\n          .slice(0, 24);',
    '          .filter((draft) => PUBLIC_DRAFT_STATUSES.has(String(draft.status)))\n          .filter((draft) => String(draft.status) === "scheduled" || (!draft.campaignAddress && String(draft.status) !== "deployed"))\n          .slice(0, 24);',
    "scheduled draft visibility filter",
  );

  text = replaceOnce(
    text,
    '  }, [draftChainId]);',
    '  }, [draftChainId, refreshNonce]);',
    "DraftCampaignGrid load dependencies",
  );

  text = replaceOnce(
    text,
    '{formatCreatedAt(draft.createdAt)}',
    '{formatCreatedAt(draft.draftCreatedAt || draft.createdAt)}',
    "draft age origin",
  );

  text = replaceOnce(
    text,
    `                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-success/70">
                    {mission}
                  </p>`,
    `                  </div>

                  {draft.scheduledLaunchAt ? (
                    <ScheduledLaunchCountdown
                      launchAt={draft.scheduledLaunchAt}
                      chainId={draft.chainId}
                      campaignAddress={draft.campaignAddress}
                      contractDeployed={Boolean(draft.campaignAddress)}
                      variant="compact"
                      className="mt-3"
                    />
                  ) : null}

                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-success/70">
                    {mission}
                  </p>`,
    "draft card countdown",
  );

  return text;
});

edit("frontend/src/pages/Prepare.tsx", (source) => {
  let text = replaceOnce(
    source,
    'import { Textarea } from "@/components/ui/textarea";\n',
    'import { Textarea } from "@/components/ui/textarea";\nimport { ScheduledLaunchCountdown } from "@/components/prepare/ScheduledLaunchCountdown";\n',
    "Prepare countdown import",
  );

  text = replaceOnce(
    text,
    '       "Creator pushes the draft live into the bonding curve. Trading opens only after deployment is confirmed.",',
    '       "Creator deploys the campaign on-chain. Scheduled launches remain contract-locked until the exact trading-open timestamp.",',
    "Prepare deploy phase copy",
  );

  text = replaceOnce(
    text,
    '  const [hasFollowed, setHasFollowed] = useState(false);\n\n  useEffect(() => {',
    `  const [hasFollowed, setHasFollowed] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const scheduledLaunchAt = bundle?.draft?.scheduledLaunchAt ?? null;

  useEffect(() => {
    if (!scheduledLaunchAt) return;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [scheduledLaunchAt]);

  useEffect(() => {`,
    "Prepare launch clock",
  );

  text = replaceOnce(
    text,
    `  const isCreator = Boolean(
    wallet.account &&
      draft.creatorWallet &&
      wallet.account.toLowerCase() === draft.creatorWallet.toLowerCase(),
  );
`,
    `  const isCreator = Boolean(
    wallet.account &&
      draft.creatorWallet &&
      wallet.account.toLowerCase() === draft.creatorWallet.toLowerCase(),
  );
  const scheduledLaunchMs = scheduledLaunchAt ? Date.parse(scheduledLaunchAt) : NaN;
  const hasScheduledLaunch = Boolean(scheduledLaunchAt && Number.isFinite(scheduledLaunchMs));
  const scheduledLaunchReached = Boolean(hasScheduledLaunch && clockNow >= scheduledLaunchMs && draft.campaignAddress);
  const liveCampaignRoute = draft.campaignAddress
    ? \`/token/\${encodeURIComponent(draft.campaignAddress)}\`
    : draft.tokenAddress
      ? \`/token/\${encodeURIComponent(draft.tokenAddress)}\`
      : null;
  const activeMissionPhase = scheduledLaunchReached || draft.status === "deployed" ? 1 : 0;
`,
    "Prepare lifecycle values",
  );

  text = replaceOnce(
    text,
    `          <div className="absolute right-4 top-6 hidden items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-orange-200 md:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
            UNARMED · DRAFT MODE
          </div>`,
    `          <div className="absolute right-4 top-6 hidden items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-orange-200 md:flex">
            <span className={\`h-2 w-2 rounded-full \${scheduledLaunchReached ? "bg-green-400" : "animate-pulse bg-red-400"}\`} />
            {scheduledLaunchReached
              ? "LAUNCHED · LIVE CAMPAIGN"
              : hasScheduledLaunch && draft.campaignAddress
                ? "ON-CHAIN · TRADING LOCKED"
                : "UNARMED · DRAFT MODE"}
          </div>`,
    "Prepare header lifecycle label",
  );

  text = replaceOnce(
    text,
    ` <div className="mwz-chip mwz-chip-active relative z-20 mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs md:mt-4">
   <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-300" />
   Incoming transmission · Prepare Mode
 </div>`,
    ` <div className="mwz-chip mwz-chip-active relative z-20 mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs md:mt-4">
   <span className={\`h-1.5 w-1.5 rounded-full \${scheduledLaunchReached ? "bg-green-300" : "animate-pulse bg-orange-300"}\`} />
   {scheduledLaunchReached
     ? "Launched · Prepare Mode remains open"
     : hasScheduledLaunch && draft.campaignAddress
       ? "Launch confirmed on-chain · Trading locked"
       : "Incoming transmission · Prepare Mode"}
 </div>`,
    "Prepare hero lifecycle chip",
  );

  text = replaceOnce(
    text,
    `          <p className="relative z-20 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
            {heroTagline}{" "}

          </p>

          <div className="relative z-20 mt-6 flex flex-wrap justify-center gap-3">`,
    `          <p className="relative z-20 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-2xl">
            {heroTagline}{" "}

          </p>

          {hasScheduledLaunch ? (
            <ScheduledLaunchCountdown
              launchAt={scheduledLaunchAt}
              chainId={draft.chainId}
              campaignAddress={draft.campaignAddress}
              contractDeployed={Boolean(draft.campaignAddress)}
            />
          ) : null}

          <div className="relative z-20 mt-6 flex flex-wrap justify-center gap-3">
            {scheduledLaunchReached && liveCampaignRoute ? (
              <Button asChild className="mwz-button mwz-button-orange h-13 px-6 font-retro text-base active:!translate-y-px">
                <Link to={liveCampaignRoute}>
                  <Rocket className="mr-2 h-4 w-4" />
                  Open live campaign
                </Link>
              </Button>
            ) : null}`,
    "Prepare hero countdown and live route",
  );

  text = replaceOnce(
    text,
    '["Status", statusLabel(draft.status), Shield],',
    '["Status", scheduledLaunchReached ? "LAUNCHED" : hasScheduledLaunch ? "SCHEDULED" : statusLabel(draft.status), Shield],',
    "Prepare status metric",
  );

  text = replaceOnce(
    text,
    '                  index === 0 ? "border-orange-400/70 bg-orange-500/5" : ""',
    '                  index === activeMissionPhase ? "border-orange-400/70 bg-orange-500/5" : ""',
    "Prepare active mission card",
  );
  text = replaceOnce(
    text,
    '                  {index === 0 ? (\n                    <Flame className="h-4 w-4 text-orange-300" />',
    '                  {index === activeMissionPhase ? (\n                    <Flame className="h-4 w-4 text-orange-300" />',
    "Prepare active mission icon",
  );
  text = replaceOnce(
    text,
    '                {index === 0 && (\n                  <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-orange-300">',
    '                {index === activeMissionPhase && (\n                  <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-orange-300">',
    "Prepare active mission state",
  );

  const bottomStart = '        <section className="mx-auto max-w-7xl px-4 py-10 pb-20 md:px-8 md:py-14 md:pb-24">\n          <div className="mwz-card border-orange-400/50 bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.18),rgba(2,17,4,0.92)_70%)] p-8 text-center md:p-12">';
  const bottomEnd = '        </section>\n      </main>';
  const bottomReplacement = `        <section className="mx-auto max-w-7xl px-4 py-10 pb-20 md:px-8 md:py-14 md:pb-24">
          <div className="mwz-card border-orange-400/50 bg-[radial-gradient(ellipse_at_top,rgba(255,153,0,0.18),rgba(2,17,4,0.92)_70%)] p-8 text-center md:p-12">
            <div className="text-xs uppercase tracking-[0.22em] text-orange-300">
              // {scheduledLaunchReached ? "Campaign launched" : "Prepare Mode active"}
            </div>

            <h3 className="mt-3 bg-gradient-to-b from-white to-orange-400 bg-clip-text font-retro text-5xl uppercase tracking-[0.08em] text-transparent md:text-7xl">
              {scheduledLaunchReached ? "Launched." : "Be first in."}
            </h3>

            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {scheduledLaunchReached
                ? \`The \${ticker} promotion page stays open for the creator and community. Continue following the dossier, then move directly to the live campaign to trade.\`
                : \`\${(followCount ?? pop.follows).toLocaleString()} soldiers already watching. The moment \${ticker} moves from draft to live campaign, the alert fires.\`}
            </p>

            <div className="mt-7 flex flex-wrap justify-center gap-3">
              {scheduledLaunchReached && liveCampaignRoute ? (
                <Button asChild className="mwz-button mwz-button-orange h-13 px-6 font-retro text-base active:!translate-y-px">
                  <Link to={liveCampaignRoute}>
                    <Rocket className="mr-2 h-4 w-4" />
                    Open live campaign
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={handleArmNotification}
                  disabled={armingNotification}
                  className={\`mwz-button h-13 px-6 font-retro text-base active:!translate-y-px \${
                    hasArmed
                      ? "!border-green-400 !bg-green-500/25 !text-green-100"
                      : "mwz-button-orange"
                  }\`}
                >
                  <Bell className="mr-2 h-4 w-4" fill={hasArmed ? "currentColor" : "none"} />
                  {armLabel}
                </Button>
              )}
            </div>
          </div>
        </section>
`;

  text = replaceBetween(text, bottomStart, bottomEnd, bottomReplacement, "Prepare post-launch footer");
  return text;
});

edit("frontend/api/campaigns.js", (source) => {
  let text = replaceOnce(
    source,
    'import { badMethod, getQuery, json } from "../server/http.js";\n',
    'import { badMethod, getQuery, json } from "../server/http.js";\nimport { reconcileScheduledDraftLifecycle } from "./dev-fix/scheduled-lifecycle.js";\n',
    "campaign feed lifecycle import",
  );

  text = replaceOnce(
    text,
    '    createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,\n    graduatedAtChain: graduatedAt,',
    '    draftCreatedAt: row.draft_created_at ? String(row.draft_created_at) : null,\n    contractDeployedAt: row.contract_deployed_at\n      ? String(row.contract_deployed_at)\n      : row.contract_created_at_chain\n        ? String(row.contract_created_at_chain)\n        : null,\n    scheduledLaunchAt: row.scheduled_launch_at ? String(row.scheduled_launch_at) : null,\n    tradingLaunchAt: row.trading_launch_at ? String(row.trading_launch_at) : row.created_at_chain ? String(row.created_at_chain) : null,\n    createdAtChain: row.created_at_chain ? String(row.created_at_chain) : null,\n    graduatedAtChain: graduatedAt,',
    "campaign feed timestamp mapping",
  );

  text = replaceOnce(
    text,
    `  const orderBy = (() => {
    if (sort === "created_asc") return "c.created_block asc nulls last, c.created_at_chain asc nulls last, c.campaign_address asc";
    if (tab === "dex") return "c.graduated_block desc nulls last, c.graduated_at_chain desc nulls last, c.created_block desc nulls last, c.campaign_address asc";
    return "c.created_block desc nulls last, c.created_at_chain desc nulls last, c.campaign_address asc";
  })();`,
    `  const effectiveCreatedAt = "coalesce(dl.scheduled_launch_at, c.created_at_chain)";
  const orderBy = (() => {
    if (sort === "created_asc") return \`\${effectiveCreatedAt} asc nulls last, c.created_block asc nulls last, c.campaign_address asc\`;
    if (tab === "dex") return "c.graduated_block desc nulls last, c.graduated_at_chain desc nulls last, c.created_block desc nulls last, c.campaign_address asc";
    return \`\${effectiveCreatedAt} desc nulls last, c.created_block desc nulls last, c.campaign_address asc\`;
  })();`,
    "basic feed effective timestamp order",
  );

  text = replaceOnce(
    text,
    '       c.created_block,\n       c.created_at_chain,\n       c.graduated_block,',
    '       c.created_block,\n       c.created_at_chain as contract_created_at_chain,\n       coalesce(dl.scheduled_launch_at, c.created_at_chain) as created_at_chain,\n       dl.draft_created_at,\n       dl.contract_deployed_at,\n       dl.scheduled_launch_at,\n       coalesce(dl.scheduled_launch_at, c.created_at_chain) as trading_launch_at,\n       c.graduated_block,',
    "basic feed lifecycle columns",
  );

  text = replaceOnce(
    text,
    '     from public.campaigns c\n     ${where}\n     order by ${orderBy}',
    `     from public.campaigns c
     left join lateral (
       select
         d.created_at as draft_created_at,
         d.deployed_at as contract_deployed_at,
         d.scheduled_launch_at
       from public.campaign_drafts d
       where d.chain_id = c.chain_id
         and d.campaign_address is not null
         and lower(d.campaign_address) = lower(c.campaign_address)
       order by d.updated_at desc
       limit 1
     ) dl on true
     \${where}
       and (dl.scheduled_launch_at is null or dl.scheduled_launch_at <= now())
     order by \${orderBy}`,
    "basic feed lifecycle join",
  );

  text = replaceOnce(
    text,
    '  try {\n    // Deterministic ordering per tab/sort.',
    '  try {\n    await reconcileScheduledDraftLifecycle(pool);\n\n    // Deterministic ordering per tab/sort.',
    "campaign feed reconciliation",
  );

  text = text.replaceAll('return "calc.created_block desc, calc.campaign_address asc";', 'return "calc.created_at_chain desc nulls last, calc.created_block desc, calc.campaign_address asc";');
  text = replaceOnce(
    text,
    'if (sort === "created_asc") return "calc.created_block asc, calc.campaign_address asc";',
    'if (sort === "created_asc") return "calc.created_at_chain asc nulls last, calc.created_block asc, calc.campaign_address asc";',
    "rich created ascending order",
  );

  text = replaceOnce(
    text,
    '          c.created_block,\n          c.created_at_chain,\n          c.graduated_block,',
    '          c.created_block,\n          c.created_at_chain as contract_created_at_chain,\n          coalesce(dl.scheduled_launch_at, c.created_at_chain) as created_at_chain,\n          dl.draft_created_at,\n          dl.contract_deployed_at,\n          dl.scheduled_launch_at,\n          coalesce(dl.scheduled_launch_at, c.created_at_chain) as trading_launch_at,\n          c.graduated_block,',
    "rich feed lifecycle columns",
  );

  text = replaceOnce(
    text,
    '        from public.campaigns c\n        left join public.token_stats ts',
    `        from public.campaigns c
        left join lateral (
          select
            d.created_at as draft_created_at,
            d.deployed_at as contract_deployed_at,
            d.scheduled_launch_at
          from public.campaign_drafts d
          where d.chain_id = c.chain_id
            and d.campaign_address is not null
            and lower(d.campaign_address) = lower(c.campaign_address)
          order by d.updated_at desc
          limit 1
        ) dl on true
        left join public.token_stats ts`,
    "rich feed lifecycle join",
  );

  text = replaceOnce(
    text,
    '        where c.chain_id = $1\n          and ($3::text is null or (',
    '        where c.chain_id = $1\n          and (dl.scheduled_launch_at is null or dl.scheduled_launch_at <= now())\n          and ($3::text is null or (',
    "rich feed prelaunch filter",
  );

  return text;
});

edit("frontend/src/components/home/CampaignGrid.tsx", (source) => {
  let text = replaceOnce(
    source,
    'import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";\n',
    'import { fetchOnChainCampaignPage } from "@/lib/onChainCampaignFeed";\nimport { fetchPublicCampaignLifecycleDrafts } from "@/lib/draftApi";\n',
    "CampaignGrid lifecycle import",
  );

  text = replaceOnce(
    text,
    '  createdAtChain?: string | null;\n  lastActivityAt?: string | null;',
    '  draftCreatedAt?: string | null;\n  contractDeployedAt?: string | null;\n  scheduledLaunchAt?: string | null;\n  tradingLaunchAt?: string | null;\n  createdAtChain?: string | null;\n  lastActivityAt?: string | null;',
    "CampaignGrid lifecycle fields",
  );

  const fallbackStart = 'async function fetchOnChainCampaignFeed(params: Record<string, any>): Promise<CampaignFeedResponse> {';
  const fallbackEnd = '\n\nasync function fetchCampaignFeed(params: Record<string, any>): Promise<CampaignFeedResponse> {';
  const fallbackFunction = `async function fetchOnChainCampaignFeed(params: Record<string, any>): Promise<CampaignFeedResponse> {
  const chainId = Number(params.chainId || 97);
  const limit = Math.max(1, Math.min(100, Number(params.limit || 24)));
  const cursor = Math.max(0, Number(params.cursor || 0));
  const [page, lifecycleDrafts] = await Promise.all([
    fetchOnChainCampaignPage(chainId as SupportedChainId, {
      limit: Math.min(100, Math.max(limit, 48)),
      cursor,
    }),
    fetchPublicCampaignLifecycleDrafts({ chainId, limit: 200 }).catch(() => []),
  ]);

  const lifecycleByCampaign = new Map(
    lifecycleDrafts
      .filter((draft) => draft.campaignAddress)
      .map((draft) => [String(draft.campaignAddress).toLowerCase(), draft] as const),
  );
  const nowSec = Math.floor(Date.now() / 1000);

  const mapped: CampaignFeedItemApi[] = page.campaigns
    .map((row) => {
      const campaignAddress = String(row.campaign || "").toLowerCase();
      const lifecycle = lifecycleByCampaign.get(campaignAddress);
      const scheduledLaunchSec = safeUnixSeconds(lifecycle?.scheduledLaunchAt ?? null);
      const tradingLaunchSec = safeUnixSeconds(lifecycle?.tradingLaunchAt ?? lifecycle?.scheduledLaunchAt ?? null);

      return {
        chainId,
        campaignAddress,
        tokenAddress: row.token || null,
        creatorAddress: row.creator || null,
        name: row.name || null,
        symbol: row.symbol || null,
        logoUri: row.logoURI || null,
        draftCreatedAt: lifecycle?.draftCreatedAt || lifecycle?.createdAt || null,
        contractDeployedAt: lifecycle?.contractDeployedAt || lifecycle?.deployedAt || null,
        scheduledLaunchAt: lifecycle?.scheduledLaunchAt || null,
        tradingLaunchAt: tradingLaunchSec ? String(tradingLaunchSec) : row.createdAt ? String(row.createdAt) : null,
        createdAtChain: tradingLaunchSec ? String(tradingLaunchSec) : row.createdAt ? String(row.createdAt) : null,
        graduatedAtChain: null,
        isDexTrading: false,
        marketcapBnb: null,
        votes24h: 0,
        progressPct: null,
        etaSec: null,
        __scheduledLaunchSec: scheduledLaunchSec,
      } as CampaignFeedItemApi & { __scheduledLaunchSec: number | null };
    })
    .filter((item) => /^0x[a-f0-9]{40}$/.test(item.campaignAddress))
    .filter((item: CampaignFeedItemApi & { __scheduledLaunchSec?: number | null }) => !item.__scheduledLaunchSec || item.__scheduledLaunchSec <= nowSec)
    .filter((item) => matchesSearch(item, params.search))
    .map(({ __scheduledLaunchSec: _scheduledLaunchSec, ...item }: CampaignFeedItemApi & { __scheduledLaunchSec?: number | null }) => item);

  if (params.sort === "created_asc") {
    mapped.sort((a, b) => Number(safeUnixSeconds(a.createdAtChain) || 0) - Number(safeUnixSeconds(b.createdAtChain) || 0));
  } else if (params.tab === "new" || params.sort === "created_desc") {
    mapped.sort((a, b) => Number(safeUnixSeconds(b.createdAtChain) || 0) - Number(safeUnixSeconds(a.createdAtChain) || 0));
  }

  const items = mapped.slice(0, limit);
  return {
    items,
    nextCursor: page.nextCursor,
    pageSize: limit,
    updatedAt: new Date().toISOString(),
    source: items.length ? "onchain-factory-fallback" : "onchain-empty",
  };
}`;
  text = replaceBetween(text, fallbackStart, fallbackEnd, `${fallbackFunction}${fallbackEnd}`, "on-chain lifecycle fallback");

  const realtimeStart = '  useEffect(() => {\n    if (query.tab !== "new") return;\n    if (!created?.length) return;';
  const realtimeEnd = '\n\n  useEffect(() => {\n    const onRefresh = (e: any) => {';
  const realtimeEffect = `  useEffect(() => {
    if (query.tab !== "new") return;
    if (!created?.length) return;

    let cancelled = false;
    void (async () => {
      const lifecycleDrafts = await fetchPublicCampaignLifecycleDrafts({ chainId: activeChainId, limit: 200 }).catch(() => []);
      if (cancelled) return;

      const lifecycleByCampaign = new Map(
        lifecycleDrafts
          .filter((draft) => draft.campaignAddress)
          .map((draft) => [String(draft.campaignAddress).toLowerCase(), draft] as const),
      );
      const nowSec = Math.floor(Date.now() / 1000);

      setItems((prev) => {
        const seen = new Set(prev.map((x) => String(x.campaignAddress ?? "").toLowerCase()).filter(Boolean));
        const additions: CampaignFeedItemApi[] = [];
        for (const it of created) {
          const addr = String(it?.campaignAddress ?? "").toLowerCase();
          if (!addr || seen.has(addr)) continue;

          const lifecycle = lifecycleByCampaign.get(addr);
          const scheduledLaunchSec = safeUnixSeconds(lifecycle?.scheduledLaunchAt ?? null);
          if (scheduledLaunchSec && scheduledLaunchSec > nowSec) continue;

          seen.add(addr);
          const tradingLaunchSec = safeUnixSeconds(lifecycle?.tradingLaunchAt ?? lifecycle?.scheduledLaunchAt ?? null);
          additions.push({
            chainId: activeChainId,
            campaignAddress: addr,
            tokenAddress: it.tokenAddress ?? null,
            creatorAddress: it.creatorAddress ?? null,
            name: it.name ?? null,
            symbol: it.symbol ?? null,
            logoUri: null,
            draftCreatedAt: lifecycle?.draftCreatedAt || lifecycle?.createdAt || null,
            contractDeployedAt: lifecycle?.contractDeployedAt || lifecycle?.deployedAt || null,
            scheduledLaunchAt: lifecycle?.scheduledLaunchAt || null,
            tradingLaunchAt: tradingLaunchSec ? String(tradingLaunchSec) : it.createdAtChain ?? new Date().toISOString(),
            createdAtChain: tradingLaunchSec ? String(tradingLaunchSec) : it.createdAtChain ?? new Date().toISOString(),
            graduatedAtChain: null,
            isDexTrading: false,
            marketcapBnb: null,
            votes24h: 0,
            progressPct: 0,
            etaSec: null,
          });
        }
        return additions.length ? [...additions, ...prev].slice(0, 200) : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [created, query.tab, activeChainId]);`;
  text = replaceBetween(text, realtimeStart, realtimeEnd, `${realtimeEffect}${realtimeEnd}`, "realtime scheduled launch guard");

  text = replaceOnce(
    text,
    '    window.addEventListener("memebattles:txConfirmed", onRefresh as any);\n    return () => {\n      window.removeEventListener("memebattles:upvoteConfirmed", onRefresh as any);\n      window.removeEventListener("memebattles:txConfirmed", onRefresh as any);',
    '    window.addEventListener("memebattles:txConfirmed", onRefresh as any);\n    window.addEventListener("memebattles:scheduledLaunchReached", onRefresh as any);\n    return () => {\n      window.removeEventListener("memebattles:upvoteConfirmed", onRefresh as any);\n      window.removeEventListener("memebattles:txConfirmed", onRefresh as any);\n      window.removeEventListener("memebattles:scheduledLaunchReached", onRefresh as any);',
    "CampaignGrid scheduled launch refresh event",
  );

  text = replaceOnce(
    text,
    '    const mapped = (items || []).map((it) => {',
    '    const nowSec = Math.floor(Date.now() / 1000);\n    const mapped = (items || [])\n      .filter((it) => {\n        const scheduledLaunchSec = safeUnixSeconds(it.scheduledLaunchAt ?? null);\n        return !scheduledLaunchSec || scheduledLaunchSec <= nowSec;\n      })\n      .map((it) => {',
    "CampaignGrid prelaunch VM filter",
  );

  text = replaceOnce(
    text,
    '        createdAt: safeUnixSeconds(it.createdAtChain ?? null) ?? undefined,',
    '        createdAt: safeUnixSeconds(it.tradingLaunchAt ?? it.createdAtChain ?? null) ?? undefined,',
    "CampaignGrid campaign age origin",
  );

  return text;
});

console.log("Scheduled launch lifecycle patch applied successfully.");
