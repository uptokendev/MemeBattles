import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/apiBase";
import { normalizeAddress } from "@/lib/address";
import { signSolanaMessage } from "@/lib/solanaWallet";
import {
  buildProfileMessage,
  fetchUserProfile,
  requestNonce,
  saveUserProfile,
  type UserProfile,
} from "@/lib/profileApi";

interface UseEditableProfileArgs {
  chainId?: number;
  account: string | null;
  viewedAddress: string | null;
  wallet: any;
}

function isSolanaChain(chainId?: number | null): boolean {
  const id = Number(chainId);
  return id === 101 || id === 102;
}

async function signProfileMessage({ chainId, account, wallet, message }: { chainId: number; account: string; wallet: any; message: string }) {
  if (isSolanaChain(chainId)) {
    return (await signSolanaMessage(message, account)).signature;
  }
  if (!wallet.signer) throw new Error("Wallet signer is not available. Reconnect your wallet and try again.");
  return wallet.signer.signMessage(message);
}

export function useEditableProfile({
  chainId,
  account,
  viewedAddress,
  wallet,
}: UseEditableProfileArgs) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [awaitingWallet, setAwaitingWallet] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!viewedAddress) {
        setProfile(null);
        return;
      }

      setLoadingProfile(true);
      try {
        if (!chainId) {
          setProfile(null);
          return;
        }

        const p = await fetchUserProfile(chainId, viewedAddress);
        if (!cancelled) setProfile(p);
      } catch (e: any) {
        // Fail gracefully if the backend is not configured or the endpoint is missing.
        console.warn("Failed to load profile", e);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [viewedAddress, chainId]);

  const handleConnect = async () => {
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("memewarzone:openWalletModal"));
        return;
      }
    } catch {}

    if (typeof wallet?.connect === "function") return wallet.connect();
    if (typeof wallet?.openConnectModal === "function") return wallet.openConnectModal();

    toast.message("Use the Connect Wallet button in the header to connect.");
  };

  const handleEdit = () => {
    if (!account) {
      handleConnect();
      return;
    }

    setEditOpen(true);
  };

  const uploadAvatarFile = async (file: File): Promise<string> => {
    if (!chainId) throw new Error("ChainId is not available.");
    if (!account) throw new Error("Wallet not connected.");

    const maxBytes = 3 * 1024 * 1024; // 3 MB
    if (file.size > maxBytes) throw new Error("Avatar must be <= 3 MB.");

    const typeOk = /^(image\/png|image\/jpeg|image\/jpg|image\/webp)$/.test(file.type);
    if (!typeOk) throw new Error("Unsupported image type. Use png/jpg/webp.");

    const fd = new FormData();
    fd.append("file", file);

    const addr = normalizeAddress(account);
    const qs = new URLSearchParams({
      kind: "avatar",
      chainId: String(chainId),
      address: addr,
    });
    // Put signature auth in form fields (not query string) — long message/sig in URL
    // can break proxies and message equality checks.
    try {
      const { signWalletAction } = await import("@/lib/walletActionAuth");
      let auth = null as null | {
        action: string;
        walletAddress: string;
        chainId: number;
        nonce: string;
        message: string;
        signature: string;
        walletType?: string;
      };
      if (isSolanaChain(chainId)) {
        auth = await signWalletAction({
          action: "upload_avatar",
          walletAddress: addr,
          chainId: Number(chainId),
          walletType: "solana",
          signMessage: async (message) => (await signSolanaMessage(message, addr)).signature,
        });
      } else if (wallet?.signer) {
        auth = await signWalletAction({
          action: "upload_avatar",
          walletAddress: addr,
          chainId: Number(chainId),
          signer: wallet.signer,
        });
      }
      if (auth) {
        fd.append("action", auth.action);
        fd.append("walletAddress", auth.walletAddress);
        fd.append("nonce", auth.nonce);
        fd.append("message", auth.message);
        fd.append("signature", auth.signature);
        if (auth.walletType) fd.append("walletType", auth.walletType);
      }
    } catch (signErr) {
      console.warn("[useEditableProfile] upload auth sign skipped", signErr);
    }

    const res = await apiFetch(`/api/upload?${qs.toString()}`, { method: "POST", body: fd });
    const j = await res.json().catch(() => null);

    if (!res.ok) throw new Error(j?.error || `Upload failed (${res.status})`);
    if (!j?.url) throw new Error("Upload did not return a URL.");

    return String(j.url);
  };

  const handlePickAvatar = () => {
    if (!account) {
      handleConnect();
      return;
    }

    avatarInputRef.current?.click();
  };

  const handleAvatarSelected = async (file: File) => {
    if (!account) {
      toast.error("Connect your wallet to change your avatar.");
      return;
    }

    if (!chainId) {
      toast.error("ChainId is not available. Reconnect your wallet and try again.");
      return;
    }

    if (!isSolanaChain(chainId) && !wallet.signer) {
      toast.error("Wallet signer is not available. Reconnect your wallet and try again.");
      return;
    }

    setSavingAvatar(true);
    const toastId = toast.loading("Uploading…");

    try {
      const uploadedUrl = await uploadAvatarFile(file);

      // Sign and persist the new avatar url.
      const addr = normalizeAddress(account);
      const nonce = await requestNonce(chainId, addr);
      const displayName = (profile?.displayName ?? "").trim() || null;
      const bio = (profile?.bio ?? "").trim() || null;

      setAwaitingWallet(true);
      toast.dismiss(toastId);

      const toastId2 = toast.loading("Confirm the signature in your wallet…");
      let signature = "";

      try {
        const msg = buildProfileMessage({
          chainId,
          address: addr,
          nonce,
          displayName,
          avatarUrl: uploadedUrl,
        });

        signature = await signProfileMessage({ chainId, account: addr, wallet, message: msg });
      } finally {
        setAwaitingWallet(false);
        toast.dismiss(toastId2);
      }

      const toastId3 = toast.loading("Saving profile…");

      try {
        await saveUserProfile({
          chainId,
          address: addr,
          displayName,
          bio,
          avatarUrl: uploadedUrl,
          nonce,
          signature,
        });
      } finally {
        toast.dismiss(toastId3);
      }

      const refreshed = await fetchUserProfile(chainId, addr);
      setProfile(refreshed);
      toast.success("Avatar updated.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update avatar.");
    } finally {
      setSavingAvatar(false);
      toast.dismiss(toastId);
    }
  };

  const handleSaveProfile = async (values: { username: string; bio: string }) => {
    if (!account) {
      toast.error("Connect your wallet to edit your profile.");
      return;
    }

    if (!chainId) {
      toast.error("ChainId is not available. Reconnect your wallet and try again.");
      return;
    }

    if (!isSolanaChain(chainId) && !wallet.signer) {
      toast.error("Wallet signer is not available. Reconnect your wallet and try again.");
      return;
    }

    setSavingProfile(true);

    const toastId = toast.loading("Preparing signature…");

    try {
      const addr = normalizeAddress(account);
      const nonce = await requestNonce(chainId, addr);
      const displayName = values.username.trim();
      const avatarUrl = profile?.avatarUrl ?? null;

      setAwaitingWallet(true);
      toast.dismiss(toastId);

      const toastId2 = toast.loading("Confirm the signature in your wallet…");
      let signature = "";

      try {
        const msg = buildProfileMessage({
          chainId,
          address: addr,
          nonce,
          displayName: displayName || null,
          avatarUrl: avatarUrl ?? null,
        });

        signature = await signProfileMessage({ chainId, account: addr, wallet, message: msg });
      } finally {
        setAwaitingWallet(false);
        toast.dismiss(toastId2);
      }

      const toastId3 = toast.loading("Saving profile…");

      try {
        await saveUserProfile({
          chainId,
          address: addr,
          displayName: displayName || null,
          bio: values.bio.trim() || null,
          avatarUrl,
          nonce,
          signature,
        });
      } finally {
        toast.dismiss(toastId3);
      }

      const refreshed = await fetchUserProfile(chainId, addr);
      setProfile(refreshed);
      setEditOpen(false);
      toast.success("Profile updated.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update profile.");
    } finally {
      setSavingProfile(false);
      toast.dismiss(toastId);
    }
  };

  return {
    profile,
    loadingProfile,
    editOpen,
    setEditOpen,
    savingProfile,
    awaitingWallet,
    savingAvatar,
    avatarInputRef,
    handleEdit,
    handlePickAvatar,
    handleAvatarSelected,
    handleSaveProfile,
  };
}