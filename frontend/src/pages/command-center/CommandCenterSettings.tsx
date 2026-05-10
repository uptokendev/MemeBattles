import { Link } from "react-router-dom";
import { Bell, ExternalLink, Eye, Image, Lock, Settings, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";

function shortenWallet(addr?: string | null) {
  if (!addr) return "";
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

export default function CommandCenterSettings() {
  const {
    walletAddress,
    chainId,
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

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        title="Settings"
        description="Manage profile identity, wallet visibility, notifications, privacy expectations, and safe Command Center preferences."
      />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <CommandCenterCard
          title="Profile settings"
          description="Update the public identity attached to this wallet. Saves use the existing wallet-signature profile flow."
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
          description="This Command Center is locked to the owner wallet in the URL. Wrong-wallet access is blocked by the Command Center shell."
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
              <div className="font-retro text-sm text-muted-foreground">{chainId ? `Chain ${chainId}` : "Not detected"}</div>
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
        <CommandCenterCard title="Notifications" description="Command Center notification controls will live here.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
            <Bell className="mb-3 h-5 w-5 text-accent" />
            <div className="font-retro text-sm text-foreground">Profile notifications enabled by default</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Detailed toggles for rank-ups, claims, recruiter updates, squad updates, and airdrops can plug in once the notification preferences API is available.
            </p>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Privacy" description="Private dashboard data stays separated from public profiles.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
            <Lock className="mb-3 h-5 w-5 text-accent" />
            <div className="font-retro text-sm text-foreground">Owner-only surfaces</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Rewards, attribution, claim history, squad posture, and private dashboard data require the matching connected wallet.
            </p>
          </div>
        </CommandCenterCard>

        <CommandCenterCard title="Public visibility" description="Quick reminder of what visitors can see.">
          <div className="rounded-2xl border border-border/50 bg-background/25 p-4">
            <Eye className="mb-3 h-5 w-5 text-accent" />
            <div className="font-retro text-sm text-foreground">Public profile remains public</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Visitors can view your public profile, created coins, public recruiter pages, public squads, and published airdrop winners.
            </p>
          </div>
        </CommandCenterCard>
      </div>

      <CommandCenterCard
        title="Safe settings boundary"
        description="No admin-only controls, private anti-abuse thresholds, reward math, vault controls, or treasury routing live in user settings."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {["Profile identity", "Avatar", "Notification preferences", "Wallet visibility", "Privacy explanation", "Public profile shortcut", "Create coin shortcut", "Owner access guard"].map((item) => (
            <div key={item} className="rounded-2xl border border-border/50 bg-background/25 p-3 text-sm text-muted-foreground">
              {item}
            </div>
          ))}
        </div>
      </CommandCenterCard>
    </div>
  );
}
