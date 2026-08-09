/**
 * Compact sponsorship intake popup (Featured house ad + reusable elsewhere).
 */
import { useState } from "react";
import { Megaphone } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async () => {
    if (!form.projectName.trim() || !form.contactName.trim() || !form.contactChannel.trim() || !form.websiteUrl.trim() || !form.bio.trim()) {
      toast.error("Add project name, contact, website, and bio.");
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
            Apply for the homepage Featured top-left slot. Paid placements rotate here; we review and schedule after payment.
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
          <label className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Creative image URL</span>
            <Input value={form.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} placeholder="Wide image for Featured card" />
          </label>
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
          <Button type="button" className="mwz-button mwz-button-orange font-retro" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting…" : "Submit application"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SponsorshipApplyDialog;
