import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTokenSearch } from "@/hooks/useTokenSearch";
import type { CampaignInfo } from "@/lib/launchpadClient";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allCampaigns: CampaignInfo[];
};

const HINT_ROTATION = [
  "Search by ticker — try $BONK or $PEPE",
  "Paste a 0x… address to jump to a token",
  "Find a creator by name",
  "Hunt a draft before it goes live",
];

export function CommandPalette({ open, onOpenChange, allCampaigns }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hintIndex, setHintIndex] = useState(0);

  const { results, loading, error } = useTokenSearch(query, allCampaigns, {
    limit: 12,
    debounceMs: 200,
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = window.setInterval(() => setHintIndex((i) => (i + 1) % HINT_ROTATION.length), 3200);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      window.dispatchEvent(new CustomEvent("memebattles:homeSearch", { detail: String(query ?? "") }));
    } catch {
      // ignore
    }
  }, [query, open]);

  const placeholder = useMemo(() => HINT_ROTATION[hintIndex], [hintIndex]);

  const handleSelectToken = (tokenOrCampaignAddress: string, tokenAddress?: string) => {
    onOpenChange(false);
    const preferred = String(tokenAddress || tokenOrCampaignAddress || "").toLowerCase();
    if (!preferred) return;
    navigate(`/token/${preferred}`);
  };

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={placeholder} />
      <CommandList>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning warzone…
          </div>
        ) : null}

        {!loading && error ? (
          <div className="px-3 py-6 text-center text-xs text-destructive">{error}</div>
        ) : null}

        {!loading && !error && query.trim().length > 0 && results.length === 0 ? (
          <CommandEmpty>No matches. Try a ticker, name, or 0x address.</CommandEmpty>
        ) : null}

        {results.length > 0 ? (
          <CommandGroup heading="Tokens">
            {results.map((r) => {
              const publicAddr = String(r.tokenAddress || r.campaignAddress || "").toLowerCase();
              return (
              <CommandItem
                key={publicAddr || r.campaignAddress}
                value={`${r.name} ${r.symbol} ${publicAddr} ${r.campaignAddress}`}
                onSelect={() => handleSelectToken(r.campaignAddress, r.tokenAddress)}
              >
                <Search className="mr-2 h-4 w-4 text-accent/70" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">${r.symbol}</span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">{publicAddr}</div>
                </div>
              </CommandItem>
            )})}
          </CommandGroup>
        ) : null}

        {query.trim().length === 0 ? (
          <>
            <CommandGroup heading="Jump to">
              <CommandItem onSelect={() => handleNavigate("/")}>Launchpad</CommandItem>
              <CommandItem onSelect={() => handleNavigate("/create")}>Create a coin</CommandItem>
              <CommandItem onSelect={() => handleNavigate("/recruiter")}>Recruiter dashboard</CommandItem>
              <CommandItem onSelect={() => handleNavigate("/profile")}>My profile</CommandItem>
              <CommandItem onSelect={() => handleNavigate("/docs")}>Docs &amp; playbook</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <div className="px-3 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Tip — type a $ticker, paste a 0x address, or search by creator name.
            </div>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
