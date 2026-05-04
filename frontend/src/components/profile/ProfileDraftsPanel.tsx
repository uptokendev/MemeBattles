import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Copy, Eye, FileText, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { resolveImageUri } from "@/lib/media";
import { signDraftAction } from "@/lib/draftAuth";
import {
  archiveCampaignDraft,
  fetchOwnerCampaignDrafts,
  fetchPublicCampaignDrafts,
  type CampaignDraft,
} from "@/lib/draftApi";

function shortAddr(addr?: string | null) {
  if (!addr) return "—";
  const a = String(addr);
  return a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function statusClass(status: string) {
  if (status === "promotion_published") return "border-orange-400/60 text-orange-300";
  if (status === "ready_to_launch") return "border-green-400/60 text-green-300";
  if (status === "deployed") return "border-blue-400/60 text-blue-300";
  if (status === "archived") return "border-red-400/60 text-red-300";
  return "border-success/50 text-success";
}

function visibilityClass(visibility: string) {
  if (visibility === "public") return "border-green-400/60 text-green-300";
  if (visibility === "unlisted") return "border-orange-400/60 text-orange-300";
  return "border-muted-foreground/40 text-muted-foreground";
}

export function ProfileDraftsPanel({
  viewedAddress,
  isOwnProfile,
}: {
  viewedAddress: string | null;
  isOwnProfile: boolean;
}) {
  const wallet = useWallet();
  const [items, setItems] = useState<CampaignDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);

  const chainId = Number(wallet.chainId ?? import.meta.env.VITE_TARGET_CHAIN_ID ?? 97);

  const normalizedViewedAddress = useMemo(
    () => String(viewedAddress || "").trim().toLowerCase(),
    [viewedAddress]
  );

  const loadDrafts = async () => {
    if (!normalizedViewedAddress) {
      setItems([]);
      return;
    }

    setLoading(true);

    try {
      if (isOwnProfile) {
        const drafts = await fetchOwnerCampaignDrafts(normalizedViewedAddress, {
          chainId,
          limit: 100,
        });

        setItems(
          drafts
            .filter((draft) => Number(draft.chainId) === Number(chainId))
            .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
        );
        return;
      }

      const publicDrafts = await fetchPublicCampaignDrafts({
        chainId,
        limit: 100,
      });

      setItems(
        publicDrafts
          .filter((draft) => Number(draft.chainId) === Number(chainId))
          .filter((draft) => draft.visibility === "public")
          .filter((draft) => draft.status !== "archived")
          .filter((draft) => String(draft.creatorWallet || "").toLowerCase() === normalizedViewedAddress)
          .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to load drafts.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedViewedAddress, isOwnProfile, chainId]);

  const copyPrepareLink = async (draft: CampaignDraft) => {
    const url = `${window.location.origin}/prepare/${draft.slug}`;
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.success("Prepare page link copied.");
  };

  const archiveDraft = async (draft: CampaignDraft) => {
    if (!isOwnProfile) return;

    if (!wallet.account || !wallet.signer) {
      toast.error("Connect the draft owner wallet before archiving.");
      return;
    }

    if (draft.creatorWallet.toLowerCase() !== wallet.account.toLowerCase()) {
      toast.error("Only the draft owner wallet can archive this draft.");
      return;
    }

    if (draft.status !== "draft") {
      toast.error("Only unpublished drafts can be archived.");
      return;
    }

    const confirmed = window.confirm(
      `Archive ${draft.name} / $${draft.ticker}? This removes it from public Prepare Mode listings.`
    );

    if (!confirmed) return;

    setBusyDraftId(draft.id);

    try {
      const auth = await signDraftAction({
        signer: wallet.signer,
        walletAddress: wallet.account,
        chainId: draft.chainId,
        action: "archive_draft",
        draftId: draft.id,
      });

      const updated = await archiveCampaignDraft(draft.id, auth);

      setItems((prev) =>
        prev.map((item) => (item.id === draft.id ? updated.draft : item))
      );

      toast.success("Draft archived.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to archive draft.");
    } finally {
      setBusyDraftId(null);
    }
  };

  if (!viewedAddress) {
    return (
      <div className="mwz-card p-6 text-sm text-muted-foreground">
        Connect a wallet to view Prepare Mode drafts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mwz-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400">
            Prepare Mode
          </div>
          <h2 className="mwz-section-title mt-1 text-2xl text-success">
            Drafts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOwnProfile
              ? "Manage your saved drafts, promotion pages, visibility, and archive actions."
              : `Public Prepare Mode drafts by ${shortAddr(viewedAddress)}.`}
          </p>
        </div>

        {isOwnProfile && (
          <Button asChild className="mwz-button mwz-button-orange h-10 font-retro text-xs">
            <Link to="/create">
              <FileText className="mr-2 h-4 w-4" />
              New Draft
            </Link>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[260px] animate-pulse border border-success/20 bg-black/45"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mwz-card p-6 text-sm text-muted-foreground">
          {isOwnProfile
            ? "No drafts yet. Create a Prepare Mode draft first."
            : "No public Prepare Mode drafts for this profile."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((draft) => {
            const logo = resolveImageUri(draft.logoUrl) || "/placeholder.svg";
            const canOpenPrepare = draft.status !== "archived" && draft.visibility !== "private";
            const canArchive = isOwnProfile && draft.status === "draft";
            const isBusy = busyDraftId === draft.id;

            return (
              <article
                key={draft.id}
                className="mwz-card flex min-h-[300px] flex-col overflow-hidden border-success/30 bg-black/70"
              >
                <div className="relative aspect-[16/9] border-b border-success/20 bg-black">
                  <img
                    src={logo}
                    alt={draft.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                    loading="lazy"
                  />

                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 border border-success/55 bg-black/80 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-success">
                    <ShieldCheck className="h-3 w-3" />
                    Prepare
                  </div>

                  <div className={`absolute right-2 top-2 border bg-black/80 px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${statusClass(draft.status)}`}>
                    {statusLabel(draft.status)}
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mwz-section-title truncate text-xl text-success">
                        {draft.name}
                      </div>
                      <div className="mt-1 truncate text-sm text-success/70">
                        ${draft.ticker}
                      </div>
                    </div>

                    <div className={`shrink-0 border bg-black/60 px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${visibilityClass(draft.visibility)}`}>
                      {draft.visibility}
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {draft.description || "No short description yet."}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-y border-success/15 py-3 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Created
                      </div>
                      <div className="mt-1 text-success">{formatDate(draft.createdAt)}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Updated
                      </div>
                      <div className="mt-1 text-success">{formatDate(draft.updatedAt)}</div>
                    </div>
                  </div>

                  <div className="mt-auto grid gap-2 pt-4">
                    {isOwnProfile && draft.status !== "archived" && (
                      <Button asChild variant="outline" className="mwz-button h-9 justify-center font-retro text-xs">
                        <Link to={`/drafts/${draft.id}/promotion`}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Open Setup
                        </Link>
                      </Button>
                    )}

                    {canOpenPrepare ? (
                      <Button asChild variant="outline" className="mwz-button h-9 justify-center font-retro text-xs">
                        <Link to={`/prepare/${draft.slug}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Prepare Page
                        </Link>
                      </Button>
                    ) : (
                      <Button disabled variant="outline" className="mwz-button h-9 justify-center font-retro text-xs opacity-50">
                        <Eye className="mr-2 h-4 w-4" />
                        Prepare Page
                      </Button>
                    )}

                    {isOwnProfile && draft.status !== "archived" && (
                      <Button
                        onClick={() => copyPrepareLink(draft)}
                        variant="outline"
                        className="mwz-button h-9 justify-center font-retro text-xs"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Link
                      </Button>
                    )}

                    {canArchive && (
                      <Button
                        onClick={() => archiveDraft(draft)}
                        disabled={isBusy}
                        variant="outline"
                        className="mwz-button h-9 justify-center border-red-500/40 font-retro text-xs text-red-300 hover:border-red-400 hover:text-red-200"
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        {isBusy ? "Archiving..." : "Archive Draft"}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}