import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ExternalLink, Eye, Image, Lock, Settings, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { useWallet } from "@/contexts/WalletContext";
import { getActiveChainId, getChainLabel, isAllowedChainId } from "@/lib/chainConfig";
import { requestWalletChainSwitch } from "@/lib/launchpadReadiness";

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

export default function CommandCenterSettings() {
  const {
    walletAddress,
    walletChainId,
    profile,
    loadingProfile,
    displayName,
    avatarUrl,
    editOpen,
    setEditOpen,
    savingProfile,
    savingAvatar,
    awaitingWallet,
    avatarInputRef,
    handleEdit,
    handlePickAvatar,
    handleAvatarSelected,
    handleSaveProfile,
  } = useCommandCenterData();

  const wallet = useWallet();
  const [switchingChain, setSwitchingChain] = useState(false);
  const handleSwitchChain = async () => {
    if (!wallet.provider) {
      toast.error("Connect a wallet first.");
      return;
    }
    setSwitchingChain(true);
    try {
      const target = getActiveChainId(wallet.chainId);
      await requestWalletChainSwitch(wallet.provider, target);
      toast.success(`Switched to ${getChainLabel(target) ?? `Chain ${target}`}.`);
    } catch (err: any) {
      const message = String(err?.message || err || "");
      if (/user rejected|user denied|4001/i.test(message)) {
        toast("Switch cancelled.");
      } else {
        toast.error(message || "Failed to switch network.");
      }
    } finally {
      setSwitchingChain(false);
    }
  };

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Settings"
      />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard
          title="Profile settings"
                  >
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/25 p-4 sm:flex-row sm:items-center">
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-20 w-20 rounded-2xl border border-border/60 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="font-retro text-lg text-foreground">{displayName}</div>
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{walletAddress}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={handleEdit} className="font-retro" disabled={savingProfile || savingAvatar}>
                  <Settings className="mr-2 h-4 w-4" />
                  Edit profile
                </Button>
                <Button onClick={handlePickAvatar} variant="outline" className="font-retro" disabled={savingProfile || savingAvatar}>
                  <Image className="mr-2 h-4 w-4" />
                  {savingAvatar ? (awaitingWallet ? "Confirm wallet..." : "Uploading...") : "Change avatar"}
                </Button>
              </div>
            </div>
          </div>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleAvatarSelected(file);
              event.currentTarget.value = "";
            }}
          />

          <EditProfileDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            initialUsername={profile?.displayName ?? ""}
            initialBio={profile?.bio ?? ""}
            saving={savingProfile}
            onSave={handleSaveProfile}
          />

          <div className="mt-4 rounded-2xl border border-border/50 bg-card/25 p-4 text-sm text-muted-foreground">
            {loadingProfile ? "Loading profile..." : profile?.bio ? profile.bio : "No public bio set yet."}
          </div>
        </CommandCenterCard>

        <CommandCenterCard
          title="Wallet / linked address"
                  >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="mb-2 flex items-center gap-2 font-retro text-sm text-foreground">
                <Wallet className="h-4 w-4 text-accent" />
                Owner wallet
              </div>
              <div className="break-all font-mono text-xs text-muted-foreground">{walletAddress}</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
              <div className="mb-2 flex items-center gap-2 font-retro text-sm text-foreground">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Chain
              </div>
              <div className="font-retro text-sm text-muted-foreground">
                {getChainLabel(walletChainId) ?? "Not detected"}
              </div>
              {walletChainId && !isAllowedChainId(walletChainId) ? (
                <div className="mt-2 space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-amber-300">
                    Unsupported network — switch your wallet to BNB Smart Chain to interact.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-retro"
                    disabled={switchingChain || !wallet.provider}
                    onClick={handleSwitchChain}
                  >
                    {switchingChain ? "Switching..." : "Switch network"}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" className="font-retro">
              <Link to={`/profile/${encodeURIComponent(walletAddress)}`}>
                Public profile
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="font-retro">
              <Link to="/create">Create coin</Link>
            </Button>
          </div>
        </CommandCenterCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CommandCenterCard title="Notifications" >
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
            <Bell className="mb-3 h-5 w-5 text-accent" />
            <div className="font-retro text-sm text-foreground">Profile notifications enabled by default</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Detailed toggles for rank-ups, claims, recruiter updates, squad updates, and airdrops can plug in once the notification preferences API is available.
            </p>
          </div>
        </CommandCenterCard>

        
      </div>

      
    </div>
  );
}
