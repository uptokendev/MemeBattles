import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCcw, ShieldCheck, Sparkles, Wallet, X, } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useWallet } from "@/contexts/WalletContext";
const walletDirectoryLinks = [
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
function shortAddress(address) {
    if (!address)
        return "";
    return address.length > 10 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}
function getWalletInitial(name) {
    return name.trim().slice(0, 1).toUpperCase() || "W";
}
function getWalletError(error) {
    if (error && typeof error === "object" && "message" in error) {
        const message = String(error.message ?? "");
        if (message)
            return message;
    }
    return "Wallet connection failed. Please try again from the wallet popup.";
}
function WalletIcon({ wallet }) {
    const [imageFailed, setImageFailed] = useState(false);
    if (wallet.icon && !imageFailed) {
        return (_jsx("img", { src: wallet.icon, alt: "", className: "h-10 w-10 rounded-2xl object-cover shadow-[0_0_30px_-12px_rgba(240,106,26,0.9)]", onError: () => setImageFailed(true) }));
    }
    return (_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 font-retro text-sm text-accent shadow-[0_0_30px_-12px_rgba(240,106,26,0.9)]", children: getWalletInitial(wallet.name) }));
}
function WalletCard({ wallet, disabled, connecting, onConnect, }) {
    return (_jsxs("button", { type: "button", disabled: disabled, onClick: () => onConnect(wallet), className: "group relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card/85 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-card disabled:cursor-not-allowed disabled:opacity-70", children: [_jsx("div", { className: "absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" }), _jsxs("div", { className: "relative flex items-center gap-3", children: [_jsx(WalletIcon, { wallet: wallet }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("p", { className: "truncate font-retro text-sm text-foreground", children: wallet.name }), wallet.source === "eip6963" && (_jsx("span", { className: "rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent", children: "detected" }))] }), _jsx("p", { className: "mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground", children: wallet.description })] }), _jsx("div", { className: "flex h-9 w-9 items-center justify-center rounded-2xl border border-border/70 bg-background/50 text-muted-foreground transition-colors group-hover:border-accent/40 group-hover:text-accent", children: connecting ? _jsx(Loader2, { className: "h-4 w-4 animate-spin" }) : _jsx(Wallet, { className: "h-4 w-4" }) })] })] }));
}
export function ConnectWalletModal({ open, onOpenChange }) {
    const { account, chainId, connect, connecting, connectingWalletId, detectedWallets, detectWallets, disconnect, isConnected, } = useWallet();
    const [selectedWalletId, setSelectedWalletId] = useState(null);
    const isBusy = connecting || Boolean(selectedWalletId);
    const handleClose = useCallback(() => {
        if (!isBusy)
            onOpenChange(false);
    }, [isBusy, onOpenChange]);
    const handleRefresh = useCallback(() => {
        detectWallets();
        toast.message("Wallet detection refreshed");
    }, [detectWallets]);
    const handleConnect = useCallback(async (detectedWallet) => {
        setSelectedWalletId(detectedWallet.id);
        try {
            await connect(detectedWallet.id);
            toast.success(`Connected ${detectedWallet.name}`);
            onOpenChange(false);
        }
        catch (error) {
            toast.error(getWalletError(error));
        }
        finally {
            setSelectedWalletId(null);
        }
    }, [connect, onOpenChange]);
    const handleDisconnect = useCallback(async () => {
        try {
            await disconnect();
            toast.success("Wallet disconnected");
            onOpenChange(false);
        }
        catch (error) {
            toast.error(getWalletError(error));
        }
    }, [disconnect, onOpenChange]);
    const statusCopy = useMemo(() => {
        if (isConnected && account)
            return `Connected: ${shortAddress(account)}`;
        if (detectedWallets.length > 0)
            return `${detectedWallets.length} wallet${detectedWallets.length === 1 ? "" : "s"} detected`;
        return "No injected wallet detected yet";
    }, [account, detectedWallets.length, isConnected]);
    useEffect(() => {
        if (!open)
            return;
        detectWallets();
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event) => {
            if (event.key === "Escape")
                handleClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [detectWallets, handleClose, open]);
    if (typeof document === "undefined")
        return null;
    return createPortal(_jsx(AnimatePresence, { children: open && (_jsxs(motion.div, { className: "fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-xl", initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, children: [_jsx("button", { type: "button", "aria-label": "Close wallet modal", className: "absolute inset-0 cursor-default", onClick: handleClose, disabled: isBusy }), _jsxs(motion.section, { role: "dialog", "aria-modal": "true", "aria-labelledby": "connect-wallet-title", className: "relative my-8 w-full max-w-[560px] overflow-hidden rounded-[2rem] border border-accent/25 bg-card/95 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.95),0_0_0_1px_rgba(240,106,26,0.08)]", initial: { opacity: 0, y: 24, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 20, scale: 0.98 }, transition: { duration: 0.18, ease: "easeOut" }, children: [_jsx("div", { className: "pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-accent/20 blur-3xl" }), _jsx("div", { className: "pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-primary/30 blur-3xl" }), _jsx("div", { className: "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/80 to-transparent" }), _jsxs("div", { className: "relative border-b border-border/60 p-5 sm:p-6", children: [_jsxs("div", { className: "flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsxs("div", { className: "mb-3 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-accent", children: [_jsx(Sparkles, { className: "h-3.5 w-3.5" }), "2026 wallet flow"] }), _jsx("h2", { id: "connect-wallet-title", className: "font-retro text-xl text-foreground sm:text-2xl", children: "Connect a wallet" }), _jsx("p", { className: "mt-2 max-w-[420px] text-sm leading-relaxed text-muted-foreground", children: "Pick an installed EVM wallet. MemeWarzone only requests your public address and lets your wallet handle approvals." })] }), _jsx("button", { type: "button", onClick: handleClose, disabled: isBusy, className: "rounded-2xl border border-border/70 bg-background/50 p-2 text-muted-foreground transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60", children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsxs("div", { className: "mt-5 grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl border border-border/60 bg-background/40 p-3", children: [_jsx("p", { className: "text-[10px] uppercase tracking-[0.22em] text-muted-foreground", children: "Status" }), _jsx("p", { className: "mt-1 truncate text-sm text-foreground", children: statusCopy })] }), _jsxs("div", { className: "rounded-2xl border border-border/60 bg-background/40 p-3", children: [_jsx("p", { className: "text-[10px] uppercase tracking-[0.22em] text-muted-foreground", children: "Network" }), _jsx("p", { className: "mt-1 text-sm text-foreground", children: chainId ? `Chain ${chainId}` : "Wallet decides" })] }), _jsxs("div", { className: "rounded-2xl border border-border/60 bg-background/40 p-3", children: [_jsx("p", { className: "text-[10px] uppercase tracking-[0.22em] text-muted-foreground", children: "Security" }), _jsxs("p", { className: "mt-1 inline-flex items-center gap-1.5 text-sm text-foreground", children: [_jsx(ShieldCheck, { className: "h-3.5 w-3.5 text-accent" }), " No seed phrases"] })] })] })] }), _jsxs("div", { className: "relative max-h-[68vh] overflow-y-auto p-5 sm:p-6", children: [isConnected && account && (_jsxs("div", { className: "mb-4 flex flex-col gap-3 rounded-3xl border border-accent/25 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent", children: _jsx(CheckCircle2, { className: "h-5 w-5" }) }), _jsxs("div", { children: [_jsx("p", { className: "font-retro text-sm text-foreground", children: "Wallet connected" }), _jsx("p", { className: "text-xs text-muted-foreground", children: shortAddress(account) })] })] }), _jsx("button", { type: "button", onClick: handleDisconnect, disabled: isBusy, className: "rounded-2xl border border-border/70 bg-background/60 px-4 py-2 text-xs text-muted-foreground transition hover:border-destructive/40 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60", children: "Disconnect" })] })), _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "font-retro text-sm text-foreground", children: "Detected wallets" }), _jsx("p", { className: "mt-1 text-xs text-muted-foreground", children: "EIP-6963 wallets are listed first, then legacy injected providers." })] }), _jsxs("button", { type: "button", onClick: handleRefresh, disabled: isBusy, className: "inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-background/50 px-3 py-2 text-xs text-muted-foreground transition hover:border-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60", children: [_jsx(RefreshCcw, { className: "h-3.5 w-3.5" }), "Refresh"] })] }), _jsx("div", { className: "mt-4 space-y-3", children: detectedWallets.length > 0 ? (detectedWallets.map((detectedWallet) => (_jsx(WalletCard, { wallet: detectedWallet, disabled: isBusy, connecting: selectedWalletId === detectedWallet.id || connectingWalletId === detectedWallet.id, onConnect: handleConnect }, `${detectedWallet.id}:${detectedWallet.rdns || detectedWallet.name}`)))) : (_jsxs("div", { className: "rounded-3xl border border-dashed border-border/80 bg-background/35 p-5 text-center", children: [_jsx("div", { className: "mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent", children: _jsx(AlertTriangle, { className: "h-5 w-5" }) }), _jsx("p", { className: "mt-3 font-retro text-sm text-foreground", children: "No wallet detected" }), _jsx("p", { className: "mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground", children: "Install an EVM wallet extension, unlock it, then refresh. On mobile, open MemeWarzone inside the wallet browser." })] })) }), _jsxs("div", { className: "mt-6 rounded-3xl border border-border/70 bg-background/35 p-4", children: [_jsx("p", { className: "font-retro text-sm text-foreground", children: "Need another EVM wallet?" }), _jsx("p", { className: "mt-1 text-xs leading-relaxed text-muted-foreground", children: "Use a trusted wallet directory instead of search ads. After installing, refresh this modal and the wallet should appear automatically." }), _jsx("div", { className: "mt-4 grid gap-3 sm:grid-cols-2", children: walletDirectoryLinks.map((link) => (_jsxs("a", { href: link.href, target: "_blank", rel: "noreferrer", className: "group rounded-2xl border border-border/60 bg-card/70 p-3 transition hover:border-accent/40 hover:bg-card", children: [_jsxs("span", { className: "flex items-center justify-between gap-2 text-sm text-foreground", children: [link.label, _jsx(ExternalLink, { className: "h-3.5 w-3.5 text-muted-foreground transition group-hover:text-accent" })] }), _jsx("span", { className: "mt-1 block text-xs leading-relaxed text-muted-foreground", children: link.description })] }, link.href))) })] }), _jsxs("div", { className: "mt-4 grid gap-2 rounded-3xl border border-accent/15 bg-accent/5 p-4 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3", children: [_jsxs("div", { children: [_jsx("span", { className: "font-retro text-foreground", children: "1." }), " Select a detected wallet."] }), _jsxs("div", { children: [_jsx("span", { className: "font-retro text-foreground", children: "2." }), " Approve the account request in your wallet."] }), _jsxs("div", { children: [_jsx("span", { className: "font-retro text-foreground", children: "3." }), " Switch chain in-wallet if needed."] })] })] })] })] })) }), document.body);
}
