import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export type EditProfileValues = {
  username: string;
  bio: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUsername?: string | null;
  initialBio?: string | null;
  saving?: boolean;
  onSave: (values: EditProfileValues) => Promise<void> | void;
};

function normalizeUsername(raw: string): string {
  return raw.trim();
}

function validateUsername(username: string): string | null {
  // Optional: empty clears the username.
  if (!username) return null;
  if (username.length < 3) return "Username must be at least 3 characters.";
  if (username.length > 20) return "Username must be at most 20 characters.";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Only letters, numbers, and underscores are allowed.";
  return null;
}

export function EditProfileDialog({
  open,
  onOpenChange,
  initialUsername,
  initialBio,
  saving,
  onSave,
}: Props) {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [bio, setBio] = useState(initialBio ?? "");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername(initialUsername ?? "");
    setBio(initialBio ?? "");
    setTouched(false);
  }, [open, initialUsername, initialBio]);

  const usernameError = useMemo(() => {
    if (!touched) return null;
    return validateUsername(normalizeUsername(username));
  }, [username, touched]);

  const canSave = useMemo(() => {
    return !saving && !validateUsername(normalizeUsername(username));
  }, [saving, username]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-retro">Edit profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="font-retro" htmlFor="username">
              Username (optional)
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setTouched(true);
              }}
              placeholder="e.g. patrick_k"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="font-retro"
              disabled={!!saving}
            />
            <div className="text-xs font-retro text-muted-foreground">
              Leave blank to remove. If set: 3–20 chars, letters/numbers/underscore.
            </div>
            {usernameError && <div className="text-xs font-retro text-destructive">{usernameError}</div>}
          </div>

          <div className="space-y-2">
            <Label className="font-retro" htmlFor="bio">
              Bio
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Add a short bio…"
              className="font-retro min-h-[96px]"
              maxLength={160}
              disabled={!!saving}
            />
            <div className="text-xs font-retro text-muted-foreground">{bio.length}/160</div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={!!saving}
            className="font-retro"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onSave({ username: normalizeUsername(username), bio: bio.trim() })}
            disabled={!canSave}
            className="font-retro"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
