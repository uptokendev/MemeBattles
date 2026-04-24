import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useWallet } from "@/contexts/WalletContext";

import type { DetectedWallet, WalletType } from "@/contexts/WalletContext";

type ConnectWalletModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type WalletDirectoryLink = {
  label: string;
  description: string;
  href: string;
};

const walletDirectoryLinks: WalletDirectoryLink[] = [
  {
    label: "BNB Chain wallets",
    description: "Wallets known to work with BNB Smart Chain and BSC dApps.",
    href: "https://www.bnbchain.org/en/wallets",
  },
  {
    label: "Ethereum wallet finder",
    description: "Browse more EVM-compatible wallets from ethereum.org.",
    href: "https://ethereum.org/en/wallets/find-wallet/",
  },
];

function shortAddress(address: string) {
  if (!address) return "";
  return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function getWalletInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "W";
}

function getWalletError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    if (message) return message;
  }

  return "Wallet connection failed. Please try again from the wallet popup.";
}

function WalletIcon({ wallet }: { wallet: DetectedWallet }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (wallet.icon && !imageFailed) {
    return (
      <img
        src={wallet.icon}
        alt=""
        className="h-10 w-10 rounded-2xl object-cover shadow-[0_0_30px_-12px_rgba(240,106,26,0.9)]"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 font-retro text-sm text-accent shadow-[0_0_30px_-12px_rgba(240,106,26,0.9)]">
      {getWalletInitial(wallet.name)}
    </div>
  );
}

function WalletCard({
  wallet,
  disabled,
  connecting,
  onConnect,
}: {
  wallet: DetectedWallet;
  disabled: boolean;
  connecting: boolean;
  onConnect: (wallet: DetectedWallet) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onConnect(wallet)}
      className="group relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card/85 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-card disabled:cursor-not-allowed disabled:opacity-70"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-center gap-3">
        <WalletIcon wallet={wallet} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-retro text-sm text-foreground">{wallet.name}</p>
            {wallet.source === "eip6963" && (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent">
                detected
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{wallet.description}</p>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/70 bg-background/50 text-muted-foreground transition-colors group-hover:border-accent/40 group-hover:text-accent">
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        </div>
      </div>
    </button>
  );
}

export function ConnectWalletModal({ open, onOpenChange }: ConnectWalletModalProps) {
  const {
    account,
    chainId,
    connect,
    connecting,
    connectingWalletId,
    detectedWallets,
    detectWallets,
    disconnect,
    isConnected,
  } = useWallet();
  const [selectedWalletId, setSelectedWalletId] = useState<WalletType | null>(null);

  const isBusy = connecting || Boolean(selectedWalletId);

  const handleClose = useCallback(() => {
    if (!isBusy) onOpenChange(false);
  }, [isBusy, onOpenChange]);

  const handleRefresh = useCallback(() => {
    detectWallets();
    toast.message("Wallet detection refreshed");
  }, [detectWallets]);

  const handleConnect = useCallback(
    async (detectedWallet: DetectedWallet) => {
      setSelectedWalletId(detectedWallet.id);

      try {
        await connect(detectedWallet.id);
        toast.success(`Connected ${detectedWallet.name}`);
        onOpenChange(false);
      } catch (error) {
        toast.error(getWalletError(error));
      } finally {
        setSelectedWalletId(null);
      }
    },
    [connect, onOpenChange],
  );

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      toast.success("Wallet disconnected");
      onOpenChange(false);
    } catch (error) {
      toast.error(getWalletError(error));
    }
  }, [disconnect, onOpenChange]);

  const statusCopy = useMemo(() => {
    if (isConnected && account) return `Connected: ${shortAddress(account)}`;
    if (detectedWallets.length > 0) return `${detectedWallets.length} wallet${detectedWallets.length === 1 ? "" : "s"} detected`;
    return "No injected wallet detected yet";
  }, [account, detectedWallets.length, isConnected]);

  useEffect(() => {
    if (!open) return;

    detectWallets();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detectWallets, handleClose, open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close wallet modal"
            className="absolute inset-0 cursor-default"
            onClick={handleClose}
            disabled={isBusy}
          />

          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-wallet-title"
            className="relative my-8 w-full max-w-[560px] overflow-hidden rounded-[2rem] border border-accent/25 bg-card/95 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.95),0_0_0_1px_rgba(240,106,26,0.08)]"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/80 to-transparent" />

            <div className="relative border-b border-border/60 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                    2026 wallet flow
                  </div>
                  <h2 id="connect-wallet-title" className="font-retro text-xl text-foreground sm:text-2xl">
                    Connect a wallet
                  </h2>
                  <p className="mt-2 max-w-[420px] text-sm leading-relaxed text-muted-foreground">
                    Pick an installed EVM wallet. MemeWarzone only requests your public address and lets your wallet handle approvals.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isBusy}
                  className="rounded-2xl border border-border/70 bg-background/50 p-2 text-muted-foreground transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Status</p>
                  <p className="mt-1 truncate text-sm text-foreground">{statusCopy}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Network</p>
                  <p className="mt-1 text-sm text-foreground">{chainId ? `Chain ${chainId}` : "Wallet decides"}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Security</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" /> No seed phrases
                  </p>
                </div>
              </div>
            </div>

            <div className="relative max-h-[68vh] overflow-y-auto p-5 sm:p-6">
              {isConnected && account && (
                <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-accent/25 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-retro text-sm text-foreground">Wallet connected</p>
                      <p className="text-xs text-muted-foreground">{shortAddress(account)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isBusy}
                    className="rounded-2xl border border-border/70 bg-background/60 px-4 py-2 text-xs text-muted-foreground transition hover:border-destructive/40 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-retro text-sm text-foreground">Detected wallets</p>
                  <p className="mt-1 text-xs text-muted-foreground">EIP-6963 wallets are listed first, then legacy injected providers.</p>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-background/50 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {detectedWallets.length > 0 ? (
                  detectedWallets.map((detectedWallet) => (
                    <WalletCard
                      key={`${detectedWallet.id}:${detectedWallet.rdns || detectedWallet.name}`}
                      wallet={detectedWallet}
                      disabled={isBusy}
                      connecting={selectedWalletId === detectedWallet.id || connectingWalletId === detectedWallet.id}
                      onConnect={handleConnect}
                    />
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-border/80 bg-background/35 p-5 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <p className="mt-3 font-retro text-sm text-foreground">No wallet detected</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Install an EVM wallet extension, unlock it, then refresh. On mobile, open MemeWarzone inside the wallet browser.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-3xl border border-border/70 bg-background/35 p-4">
                <p className="font-retro text-sm text-foreground">Need another EVM wallet?</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Use a trusted wallet directory instead of search ads. After installing, refresh this modal and the wallet should appear automatically.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {walletDirectoryLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group rounded-2xl border border-border/60 bg-card/70 p-3 transition hover:border-accent/40 hover:bg-card"
                    >
                      <span className="flex items-center justify-between gap-2 text-sm text-foreground">
                        {link.label}
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-accent" />
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{link.description}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-2 rounded-3xl border border-accent/15 bg-accent/5 p-4 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
                <div>
                  <span className="font-retro text-foreground">1.</span> Select a detected wallet.
                </div>
                <div>
                  <span className="font-retro text-foreground">2.</span> Approve the account request in your wallet.
                </div>
                <div>
                  <span className="font-retro text-foreground">3.</span> Switch chain in-wallet if needed.
                </div>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
