/**
 * Compact sponsorship intake popup with creative upload.
 */
import { useRef, useState } from "react";
import { ImagePlus, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/apiBase";
import {
  FEATURED_SPONSOR_CREATIVE_H,
  FEATURED_SPONSOR_CREATIVE_W,
  FEATURED_SPONSOR_DIMENSIONS_COPY,
  uploadSponsorCreative,
} from "@/lib/sponsorCreative";

const FEATURED_SLOT = "featured-top-left";

export function SponsorshipApplyDialog({
  open,
  onOpenChange,
  defaultSlot = FEATURED_SLOT,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSlot?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    projectName: "",
    contactName: "",
    contactChannel: "",
    websiteUrl: "",
    imageUrl: "",
    bio: "",
    applicantWallet: "",
    paymentReference: "",
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadSponsorCreative(file);
      update("imageUrl", url);
      toast.success("Creative uploaded.");
    } catch (error: any) {
      toast.error(error?.message || "Image upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!form.projectName.trim() || !form.contactName.trim() || !form.contactChannel.trim() || !form.websiteUrl.trim() || !form.bio.trim()) {
      toast.error("Add project name, contact, website, and bio.");
      return;
    }
    if (!form.imageUrl.trim()) {
      toast.error("Upload a Featured creative image.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/sponsorship-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectName: form.projectName.trim(),
          contactName: form.contactName.trim(),
          contactChannel: form.contactChannel.trim(),
          applicantWallet: form.applicantWallet.trim(),
          websiteUrl: form.websiteUrl.trim(),
          imageUrl: form.imageUrl.trim(),
          bio: form.bio.trim(),
          preferredSlot: defaultSlot,
          paymentReference: form.paymentReference.trim(),
          status: "submitted",
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));
      toast.success("Sponsorship application submitted. We will review and confirm payment.");
      setForm({
        projectName: "",
        contactName: "",
        contactChannel: "",
        websiteUrl: "",
        imageUrl: "",
        bio: "",
        applicantWallet: "",
        paymentReference: "",
      });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Sponsorship intake is unavailable right now.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-amber-400/30 bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-retro text-xl">
            <Megaphone className="h-5 w-5 text-amber-300" />
            Advertise in Featured
          </DialogTitle>
          <DialogDescription>
            Apply for the homepage Featured top-left slot. Paid creatives rotate here as full-bleed images.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Project name</span>
            <Input value={form.projectName} onChange={(e) => update("projectName", e.target.value)} placeholder="Project or token name" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Contact name</span>
              <Input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="Your name" />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Email or Telegram</span>
              <Input value={form.contactChannel} onChange={(e) => update("contactChannel", e.target.value)} placeholder="@handle or email" />
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Website</span>
            <Input value={form.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://" />
          </label>

          <div className="space-y-2 rounded-lg border border-amber-400/25 bg-amber-500/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-amber-200/90">Featured creative</div>
            <p className="text-xs leading-relaxed text-muted-foreground">{FEATURED_SPONSOR_DIMENSIONS_COPY}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || submitting}
                className="font-retro"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="mr-1.5 h-4 w-4" />
                {uploading ? "Uploading…" : form.imageUrl ? "Replace image" : "Upload image"}
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {FEATURED_SPONSOR_CREATIVE_W}×{FEATURED_SPONSOR_CREATIVE_H}px recommended
              </span>
            </div>
            {form.imageUrl ? (
              <div className="overflow-hidden rounded border border-border/60 bg-black">
                <img src={form.imageUrl} alt="Creative preview" className="h-[75px] w-full object-cover" />
              </div>
            ) : null}
          </div>

          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Short bio</span>
            <Textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} className="min-h-20" placeholder="What should Featured visitors know?" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Payment wallet (optional)</span>
            <Input value={form.applicantWallet} onChange={(e) => update("applicantWallet", e.target.value)} placeholder="0x… or treasury note" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Payment reference (optional)</span>
            <Input value={form.paymentReference} onChange={(e) => update("paymentReference", e.target.value)} placeholder="Invoice / transfer note" />
          </label>
          <Button type="button" className="mwz-button mwz-button-orange font-retro" disabled={submitting || uploading} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting…" : "Submit application"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SponsorshipApplyDialog;
