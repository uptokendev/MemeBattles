import { useEffect, useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Link2, Share2, Trophy } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { LeagueCabinet, LeagueCabinetMastery, LeagueCabinetWin, ShareCardKind } from "@/lib/leagueCabinet";
import {
  buildCabinetPrompt,
  buildCabinetShareText,
  buildMasteryPrompt,
  buildMasteryShareText,
  buildShareCardUrl,
  buildShareText,
  buildVictoryPrompt,
  formatEpochLabel,
  formatMetric,
  formatWinPlacement,
  getLeagueImage,
  getLeagueTitle,
} from "@/lib/leagueCabinet";

function PromptBlock({ title, value }: { title: string; value: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${title} copied.`);
    } catch {
      toast.error("Failed to copy prompt.");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-retro text-xs text-foreground">{title}</div>
        <Button type="button" variant="outline" size="sm" className="font-retro" onClick={handleCopy}>
          copy
        </Button>
      </div>
      <div className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function ShareWinDialog({
  open,
  onOpenChange,
  win,
  mastery,
  displayName,
  cabinet,
  initialCardView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  win: LeagueCabinetWin | null;
  mastery: LeagueCabinetMastery | null;
  displayName?: string | null;
  cabinet: LeagueCabinet;
  initialCardView: ShareCardKind;
}) {
  const [cardView, setCardView] = useState<ShareCardKind>(initialCardView);

  useEffect(() => {
    if (open) setCardView(initialCardView);
  }, [open, initialCardView]);

  const address = win?.recipientAddress ?? cabinet.items[0]?.recipientAddress ?? null;
  const chainId = win?.chainId ?? cabinet.items[0]?.chainId ?? null;

  const shareTextByView = useMemo(() => {
    if (!win) return { win: "", mastery: "", cabinet: "" };
    return {
      win: buildShareText({ win, displayName, mastery }),
      mastery: mastery ? buildMasteryShareText({ mastery, displayName }) : "",
      cabinet: buildCabinetShareText({ cabinet, displayName }),
    };
  }, [win, displayName, mastery, cabinet]);

  const victoryPrompt = useMemo(() => {
    if (!win) return "";
    return buildVictoryPrompt({ win, displayName, mastery });
  }, [win, displayName, mastery]);

  const masteryPrompt = useMemo(() => {
    if (!mastery) return "";
    return buildMasteryPrompt({ mastery, displayName, address: win?.recipientAddress ?? null });
  }, [mastery, displayName, win?.recipientAddress]);

  const cabinetPrompt = useMemo(() => buildCabinetPrompt({ displayName, cabinet }), [displayName, cabinet]);

  const urls = useMemo(() => {
    if (!win || !address || !chainId) return { win: "", mastery: "", cabinet: "", winDownload: "", masteryDownload: "", cabinetDownload: "", winSvg: "", masterySvg: "", cabinetSvg: "" };

    const base = {
      win: buildShareCardUrl({ kind: "win", chainId, address, win, format: "png" }),
      mastery: mastery ? buildShareCardUrl({ kind: "mastery", chainId, address, category: mastery.category, format: "png" }) : "",
      cabinet: buildShareCardUrl({ kind: "cabinet", chainId, address, format: "png" }),
      winDownload: buildShareCardUrl({ kind: "win", chainId, address, win, download: true, format: "png" }),
      masteryDownload: mastery ? buildShareCardUrl({ kind: "mastery", chainId, address, category: mastery.category, download: true, format: "png" }) : "",
      cabinetDownload: buildShareCardUrl({ kind: "cabinet", chainId, address, download: true, format: "png" }),
      winSvg: buildShareCardUrl({ kind: "win", chainId, address, win, format: "svg" }),
      masterySvg: mastery ? buildShareCardUrl({ kind: "mastery", chainId, address, category: mastery.category, format: "svg" }) : "",
      cabinetSvg: buildShareCardUrl({ kind: "cabinet", chainId, address, format: "svg" }),
    };

    return base;
  }, [win, mastery, address, chainId]);

  const activeUrl = cardView === "mastery" ? urls.mastery : cardView === "cabinet" ? urls.cabinet : urls.win;
  const activeDownloadUrl = cardView === "mastery" ? urls.masteryDownload : cardView === "cabinet" ? urls.cabinetDownload : urls.winDownload;
  const activeShareText = cardView === "mastery" ? shareTextByView.mastery : cardView === "cabinet" ? shareTextByView.cabinet : shareTextByView.win;
  const activePrompt = cardView === "mastery" ? masteryPrompt : cardView === "cabinet" ? cabinetPrompt : victoryPrompt;
  const canShowMastery = Boolean(mastery);

  const activeTitle = cardView === "mastery"
    ? `${mastery?.tier ?? "Unranked"} Mastery Card`
    : cardView === "cabinet"
      ? "League Cabinet Card"
      : "Victory Card";

  const handleCopyShareText = async () => {
    try {
      await navigator.clipboard.writeText(activeShareText);
      toast.success("Share text copied.");
    } catch {
      toast.error("Failed to copy share text.");
    }
  };

  const handleCopyImageUrl = async () => {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      toast.success("Image URL copied.");
    } catch {
      toast.error("Failed to copy image URL.");
    }
  };

  const handleShareOnX = () => {
    if (!activeShareText) return;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(activeShareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenCard = () => {
    if (!activeUrl) return;
    window.open(activeUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownloadCard = () => {
    if (!activeDownloadUrl) return;
    window.open(activeDownloadUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto rounded-2xl border-border bg-card/95 p-6">
        <DialogHeader>
          <DialogTitle className="font-retro text-xl text-foreground">Share Cards</DialogTitle>
          <DialogDescription className="font-retro text-muted-foreground">
            Preview real MemeWarzone share cards as PNG, download them for posting, and keep the image prompts as backup templates.
          </DialogDescription>
        </DialogHeader>

        {win ? (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4 rounded-2xl border border-accent/20 bg-background/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
                    {getLeagueTitle(win.category)}
                  </Badge>
                  <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                    {formatWinPlacement(win)}
                  </Badge>
                  {mastery ? (
                    <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                      {mastery.tier} mastery
                    </Badge>
                  ) : null}
                </div>

                <div className="inline-flex flex-wrap rounded-xl border border-border bg-background/60 p-1">
                  {([
                    ["win", "Victory"],
                    ["mastery", "Mastery"],
                    ["cabinet", "Cabinet"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        if (id === "mastery" && !canShowMastery) return;
                        setCardView(id);
                      }}
                      disabled={id === "mastery" && !canShowMastery}
                      className={`rounded-lg px-3 py-2 font-retro text-xs transition-colors ${
                        cardView === id
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
                  {activeUrl ? (
                    <img src={activeUrl} alt={activeTitle} className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center font-retro text-sm text-muted-foreground">
                      Share card unavailable.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-background/60 p-4">
                <div>
                  <div className="font-retro text-sm text-foreground">{activeTitle}</div>
                  <div className="mt-1 font-retro text-xs leading-6 text-muted-foreground">{activeShareText}</div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" className="font-retro" onClick={handleOpenCard} disabled={!activeUrl}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    open card
                  </Button>
                  <Button type="button" variant="outline" className="font-retro" onClick={handleDownloadCard} disabled={!activeDownloadUrl}>
                    <Download className="mr-2 h-4 w-4" />
                    download png
                  </Button>
                  <Button type="button" variant="outline" className="font-retro" onClick={handleCopyImageUrl} disabled={!activeUrl}>
                    <Link2 className="mr-2 h-4 w-4" />
                    copy image url
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="font-retro"
                    onClick={() => {
                      const svgUrl = cardView === "mastery" ? urls.masterySvg : cardView === "cabinet" ? urls.cabinetSvg : urls.winSvg;
                      if (!svgUrl) return;
                      window.open(svgUrl, "_blank", "noopener,noreferrer");
                    }}
                    disabled={!(cardView === "mastery" ? urls.masterySvg : cardView === "cabinet" ? urls.cabinetSvg : urls.winSvg)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    open svg
                  </Button>
                  <Button type="button" variant="outline" className="font-retro" onClick={handleCopyShareText} disabled={!activeShareText}>
                    <Copy className="mr-2 h-4 w-4" />
                    copy text
                  </Button>
                </div>

                <Button type="button" variant="outline" className="w-full font-retro" onClick={handleShareOnX} disabled={!activeShareText}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  share on x
                </Button>

                <div className="rounded-2xl border border-border bg-card/30 p-4">
                  <div className="mb-2 font-retro text-xs text-foreground">Prompt fallback</div>
                  <div className="max-h-40 overflow-y-auto whitespace-pre-wrap font-retro text-[11px] leading-5 text-muted-foreground">
                    {activePrompt || "No prompt available."}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <PromptBlock title="Victory Card Prompt" value={victoryPrompt} />
              <PromptBlock title="Mastery Card Prompt" value={masteryPrompt || "No mastery data yet."} />
              <PromptBlock title="Cabinet Showcase Prompt" value={cabinetPrompt} />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WinCard({
  item,
  mastery,
  onShare,
}: {
  item: LeagueCabinetWin;
  mastery: LeagueCabinetMastery | null;
  onShare: (item: LeagueCabinetWin) => void;
}) {
  const metric = formatMetric(item);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background/60">
      <div className="flex items-center gap-4 border-b border-border/80 p-4">
        <img src={getLeagueImage(item.category)} alt={getLeagueTitle(item.category)} className="h-20 w-20 rounded-xl border border-border object-cover" loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
              {formatWinPlacement(item)}
            </Badge>
            {item.rank === 1 ? (
              <Badge className="font-retro text-[10px] uppercase tracking-[0.2em]">title</Badge>
            ) : null}
          </div>
          <div className="font-retro text-lg text-foreground">{getLeagueTitle(item.category)}</div>
          <div className="font-retro text-xs text-muted-foreground">{formatEpochLabel(item)}</div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card/40 p-3">
            <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</div>
            <div className="mt-1 font-retro text-sm text-foreground">{metric.value}</div>
          </div>
          <div className="rounded-xl border border-border bg-card/40 p-3">
            <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mastery</div>
            <div className="mt-1 font-retro text-sm text-foreground">{mastery?.tier ?? "Unranked"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-retro text-xs text-muted-foreground">
            {mastery ? `${mastery.wins} ${mastery.wins === 1 ? "win" : "wins"} in this league` : "First recorded win"}
          </div>
          <Button type="button" variant="outline" className="font-retro" onClick={() => onShare(item)}>
            <Share2 className="mr-2 h-4 w-4" />
            share
          </Button>
        </div>
      </div>
    </div>
  );
}

export function LeagueWinsDialog({
  open,
  onOpenChange,
  cabinet,
  displayName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cabinet: LeagueCabinet;
  displayName?: string | null;
}) {
  const [view, setView] = useState<"wins" | "mastery">("wins");
  const [periodFilter, setPeriodFilter] = useState<"all" | "weekly" | "monthly">("all");
  const [selectedWin, setSelectedWin] = useState<LeagueCabinetWin | null>(null);
  const [selectedShareView, setSelectedShareView] = useState<ShareCardKind>("win");

  const filteredWins = useMemo(() => {
    if (periodFilter === "all") return cabinet.items;
    return cabinet.items.filter((item) => item.period === periodFilter);
  }, [cabinet.items, periodFilter]);

  const masteryByCategory = useMemo(() => {
    const map = new Map<string, LeagueCabinetMastery>();
    for (const item of cabinet.mastery) map.set(item.category, item);
    return map;
  }, [cabinet.mastery]);

  const selectedMastery = selectedWin ? masteryByCategory.get(selectedWin.category) ?? null : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto rounded-2xl border-border bg-card/95 p-6">
          <DialogHeader>
            <DialogTitle className="font-retro text-xl text-foreground">League Cabinet</DialogTitle>
            <DialogDescription className="font-retro text-muted-foreground">
              Showcase every league finish, track repeat wins, and turn trophies into social proof.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Total wins", String(cabinet.summary.totalWins)],
              ["Titles", String(cabinet.summary.totalTitles)],
              ["Leagues conquered", String(cabinet.summary.uniqueLeagues)],
              ["Best mastery", cabinet.summary.bestTier ?? "Unranked"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-background/60 p-4">
                <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
                <div className="mt-2 font-retro text-2xl text-foreground">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-border bg-background/60 p-1">
              {[
                ["wins", "All wins"],
                ["mastery", "Mastery"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id as "wins" | "mastery")}
                  className={`rounded-lg px-3 py-2 font-retro text-xs transition-colors ${
                    view === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {view === "wins" ? (
              <div className="inline-flex rounded-xl border border-border bg-background/60 p-1">
                {[
                  ["all", "All"],
                  ["weekly", "Weekly"],
                  ["monthly", "Monthly"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPeriodFilter(id as "all" | "weekly" | "monthly")}
                    className={`rounded-lg px-3 py-2 font-retro text-xs transition-colors ${
                      periodFilter === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {view === "wins" ? (
            filteredWins.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredWins.map((item) => (
                  <WinCard
                    key={item.id}
                    item={item}
                    mastery={masteryByCategory.get(item.category) ?? null}
                    onShare={(item) => {
                      setSelectedShareView("win");
                      setSelectedWin(item);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-background/40 p-8 text-center">
                <Trophy className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <div className="font-retro text-foreground">No wins match this filter yet.</div>
              </div>
            )
          ) : cabinet.mastery.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {cabinet.mastery.map((entry) => (
                <div key={entry.category} className="overflow-hidden rounded-2xl border border-border bg-background/60">
                  <div className="flex items-center gap-4 border-b border-border/80 p-4">
                    <img src={getLeagueImage(entry.category)} alt={getLeagueTitle(entry.category)} className="h-20 w-20 rounded-xl border border-border object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <div className="font-retro text-lg text-foreground">{getLeagueTitle(entry.category)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
                          {entry.tier}
                        </Badge>
                        <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                          {entry.wins} wins
                        </Badge>
                        <Badge variant="outline" className="font-retro text-[10px] uppercase tracking-[0.2em]">
                          {entry.titles} titles
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-xl border border-border bg-card/40 p-3">
                        <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Best finish</div>
                        <div className="mt-1 font-retro text-sm text-foreground">{entry.bestRank ? `#${entry.bestRank}` : "—"}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-card/40 p-3">
                        <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Dominant</div>
                        <div className="mt-1 font-retro text-sm text-foreground">{entry.dominantPeriod}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-card/40 p-3">
                        <div className="font-retro text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Latest</div>
                        <div className="mt-1 font-retro text-sm text-foreground">{entry.latestEpochEnd ? new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(entry.latestEpochEnd)) : "—"}</div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between font-retro text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>
                          {entry.nextTier && entry.nextThreshold ? `${entry.nextTier} at ${entry.nextThreshold} wins` : "Max tier reached"}
                        </span>
                      </div>
                      <Progress value={entry.progressPercent} className="h-2 bg-muted" />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="font-retro"
                        onClick={() => {
                          const representative = cabinet.items.find((item) => item.category === entry.category) ?? null;
                          if (!representative) return;
                          setSelectedShareView("mastery");
                          setSelectedWin(representative);
                        }}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        share mastery
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background/40 p-8 text-center">
              <Trophy className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <div className="font-retro text-foreground">No mastery progress yet.</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ShareWinDialog
        open={Boolean(selectedWin)}
        onOpenChange={(next) => {
          if (!next) setSelectedWin(null);
        }}
        win={selectedWin}
        mastery={selectedMastery}
        displayName={displayName}
        cabinet={cabinet}
        initialCardView={selectedShareView}
      />
    </>
  );
}
