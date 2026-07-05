import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BNB_CHAIN_ID, BNB_TESTNET_CHAIN_ID, SOLANA_CHAIN_ID, type SupportedChainId } from "@/lib/chainConfig";
import { isTestnetCampaignsEnabled } from "@/features/postgrad/apiClient";

const FEED_CHAIN_KEY = "mwz:selected_feed_chain_id";
const FEED_CHAIN_EVENT = "memewarzone:feedChainChanged";

function resolveBnbFeedChainId(): SupportedChainId {
  return isTestnetCampaignsEnabled() ? BNB_TESTNET_CHAIN_ID : BNB_CHAIN_ID;
}

function normalizeFeedChainId(value: unknown): SupportedChainId {
  const chainId = Number(value);
  if (chainId === SOLANA_CHAIN_ID) return SOLANA_CHAIN_ID;
  if (chainId === BNB_CHAIN_ID || chainId === BNB_TESTNET_CHAIN_ID) return resolveBnbFeedChainId();
  return resolveBnbFeedChainId();
}

export function getSelectedFeedChainId(): SupportedChainId {
  if (typeof window === "undefined") return resolveBnbFeedChainId();
  try {
    return normalizeFeedChainId(window.localStorage.getItem(FEED_CHAIN_KEY));
  } catch {
    return resolveBnbFeedChainId();
  }
}

export function setSelectedFeedChainId(chainId: SupportedChainId): SupportedChainId {
  const next = normalizeFeedChainId(chainId);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(FEED_CHAIN_KEY, String(next));
      window.localStorage.setItem("mwz:last_featured_chain_id", String(next));
      window.dispatchEvent(new CustomEvent(FEED_CHAIN_EVENT, { detail: { chainId: next } }));
    } catch {
      // ignore storage failures
    }
  }
  return next;
}

export function useSelectedFeedChainId() {
  const [chainId, setChainIdState] = useState<SupportedChainId>(() => getSelectedFeedChainId());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ chainId?: number }>).detail;
      setChainIdState(normalizeFeedChainId(detail?.chainId));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === FEED_CHAIN_KEY) setChainIdState(getSelectedFeedChainId());
    };
    window.addEventListener(FEED_CHAIN_EVENT, onChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FEED_CHAIN_EVENT, onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setChainId = (next: SupportedChainId) => setChainIdState(setSelectedFeedChainId(next));
  return [chainId, setChainId] as const;
}

export function ChainFeedSwitch({ className, value, onChange }: { className?: string; value?: SupportedChainId; onChange?: (chainId: SupportedChainId) => void }) {
  const [selected, setSelected] = useSelectedFeedChainId();
  const active = value ?? selected;
  const bnbChainId = useMemo(() => resolveBnbFeedChainId(), []);

  const select = (next: SupportedChainId) => {
    const resolved = setSelectedFeedChainId(next);
    setSelected(resolved);
    onChange?.(resolved);
  };

  const options = [
    { chainId: bnbChainId, label: "BNB" },
    { chainId: SOLANA_CHAIN_ID, label: "Solana" },
  ] as const;

  return (
    <div className={cn("inline-flex items-center gap-1 border border-[var(--mwz-flat-card-border)] bg-black/25 p-1", className)}>
      {options.map((option) => {
        const isActive = active === option.chainId || (option.label === "BNB" && (active === BNB_CHAIN_ID || active === BNB_TESTNET_CHAIN_ID));
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => select(option.chainId)}
            className={cn(
              "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors",
              isActive
                ? "border border-orange-400/60 bg-orange-500/10 text-orange-300"
                : "border border-transparent text-white/58 hover:border-[var(--mwz-flat-card-border-strong)] hover:bg-white/[0.035] hover:text-white",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
