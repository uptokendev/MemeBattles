import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CreditCard, Globe, Image as ImageIcon, Mail, Megaphone, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/apiBase";

const STORAGE_KEY = "mwz:sponsorship-application-draft";

type SponsorshipApplicationForm = {
  projectName: string;
  contactName: string;
  contactChannel: string;
  applicantWallet: string;
  websiteUrl: string;
  imageUrl: string;
  bio: string;
  preferredSlot: string;
  preferredStart: string;
  preferredEnd: string;
  paymentReference: string;
  notes: string;
};

const defaultForm: SponsorshipApplicationForm = {
  projectName: "",
  contactName: "",
  contactChannel: "",
  applicantWallet: "",
  websiteUrl: "",
  imageUrl: "",
  bio: "",
  preferredSlot: "featured-top-left",
  preferredStart: "",
  preferredEnd: "",
  paymentReference: "",
  notes: "",
};

const slotOptions = [
  {
    value: "featured-top-left",
    label: "Featured top-left (Homepage)",
    detail: "Fixed Featured board slot — large image + Sponsored pill. Rotates when multiple actives share the slot.",
  },
  {
    value: "homepage-sponsored-rail",
    label: "Homepage Sponsored Rail",
    detail: "Primary Arena / postgrad sponsored rail placement",
  },
  {
    value: "homepage-sponsored-rail-priority",
    label: "Homepage Priority Slot",
    detail: "Top-priority rail placement (battle/rail inventory)",
  },
  {
    value: "homepage-sponsored-rail-category-boost",
    label: "Category Boost Add-on",
    detail: "Rail placement with extra category emphasis",
  },
];

function inputClass() {
  return "h-11 border-border bg-background/60 font-retro text-foreground placeholder:text-muted-foreground";
}

function loadDraft(): SponsorshipApplicationForm {
  if (typeof window === "undefined") return defaultForm;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultForm;
    const parsed = JSON.parse(raw);
    return { ...defaultForm, ...parsed };
  } catch {
    return defaultForm;
  }
}

const SponsorshipApplication = () => {
  const [form, setForm] = useState<SponsorshipApplicationForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(loadDraft());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  const slotDetail = useMemo(
    () => slotOptions.find((option) => option.value === form.preferredSlot)?.detail ?? "",
    [form.preferredSlot],
  );

  const update = (key: keyof SponsorshipApplicationForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetDraft = () => {
    setForm(defaultForm);
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    toast.success("Sponsorship draft cleared.");
  };

  const handleSubmit = async () => {
    if (!form.projectName.trim() || !form.contactName.trim() || !form.contactChannel.trim() || !form.websiteUrl.trim() || !form.bio.trim()) {
      toast.error("Add the project, contact, website, and bio before submitting.");
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
          preferredSlot: form.preferredSlot,
          preferredStart: form.preferredStart || null,
          preferredEnd: form.preferredEnd || null,
          paymentReference: form.paymentReference.trim(),
          notes: form.notes.trim(),
          status: "submitted",
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(json?.error || `HTTP ${response.status}`));

      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
      setForm(defaultForm);
      toast.success("Sponsorship application submitted.");
    } catch (error: any) {
      toast.error(error?.message || "The sponsorship intake API is unavailable right now.");
      toast.message("Your application draft is still saved locally in this browser.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 px-1 pb-10">
      <section className="mwz-hud-frame p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] uppercase tracking-[0.32em] text-accent/80">Sponsored placements</div>
            <h1 className="mt-2 font-retro text-3xl tracking-tight text-foreground md:text-5xl">Apply for a MemeWarzone sponsorship slot.</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">Submit the project details we need for review, payment verification, scheduling, and rail publishing. This public intake route feeds the sponsorship workflow described in the revision build.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="font-retro">
              <Link to="/arena">Back to Arena</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="mwz-hud-frame p-5 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-accent" />
            <div>
              <div className="font-retro text-xl text-foreground">Application intake</div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Public sponsorship request</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Project name</span>
              <Input value={form.projectName} onChange={(event) => update("projectName", event.target.value)} className={inputClass()} placeholder="Project or campaign name" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Contact name</span>
              <Input value={form.contactName} onChange={(event) => update("contactName", event.target.value)} className={inputClass()} placeholder="Primary contact" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Contact email or Telegram</span>
              <Input value={form.contactChannel} onChange={(event) => update("contactChannel", event.target.value)} className={inputClass()} placeholder="name@project.com or @handle" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Website URL</span>
              <Input value={form.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} className={inputClass()} placeholder="https://project.xyz" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Image URL</span>
              <Input value={form.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} className={inputClass()} placeholder="https://cdn.project.xyz/asset.png" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Short bio</span>
              <Textarea value={form.bio} onChange={(event) => update("bio", event.target.value)} className="min-h-28 border-border bg-background/60 font-retro text-foreground placeholder:text-muted-foreground" placeholder="Short public-facing sponsor copy for the placement rail." />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Preferred slot</span>
              <select value={form.preferredSlot} onChange={(event) => update("preferredSlot", event.target.value)} className="h-11 w-full border border-border bg-background/60 px-3 font-retro text-foreground">
                {slotOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Payment reference</span>
              <Input value={form.paymentReference} onChange={(event) => update("paymentReference", event.target.value)} className={inputClass()} placeholder="Treasury transfer note or invoice ref" />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Preferred start</span>
              <Input type="date" value={form.preferredStart} onChange={(event) => update("preferredStart", event.target.value)} className={inputClass()} />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Preferred end</span>
              <Input type="date" value={form.preferredEnd} onChange={(event) => update("preferredEnd", event.target.value)} className={inputClass()} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Applicant wallet or payment wallet</span>
              <Input value={form.applicantWallet} onChange={(event) => update("applicantWallet", event.target.value)} className={inputClass()} placeholder="0x... or treasury sender reference" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Internal notes</span>
              <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="min-h-24 border-border bg-background/60 font-retro text-foreground placeholder:text-muted-foreground" placeholder="Preferred timing, category boost request, or anything the review team should know." />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={handleSubmit} disabled={submitting} className="mwz-button mwz-button-orange font-retro">
              {submitting ? "Submitting..." : "Submit application"}
            </Button>
            <Button type="button" variant="outline" onClick={resetDraft} className="font-retro">
              Clear draft
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <section className="mwz-hud-frame p-5">
            <div className="mb-4 font-retro text-xl text-foreground">Placement preview</div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center border border-orange-400/25 bg-orange-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-orange-200">{slotOptions.find((option) => option.value === form.preferredSlot)?.label ?? "Slot"}</span>
                {form.preferredStart ? <span className="inline-flex items-center border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/80">{form.preferredStart}{form.preferredEnd ? ` - ${form.preferredEnd}` : ""}</span> : null}
              </div>
              <div className="flex items-start gap-4">
                <div className="grid h-20 w-20 place-items-center border border-accent/30 bg-background/60 text-accent">
                  {form.imageUrl ? <img src={form.imageUrl} alt={form.projectName || "Sponsor preview"} className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-retro text-lg uppercase tracking-[0.03em] text-foreground">{form.projectName || "Project name"}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">{form.bio || "Short sponsor bio will appear here."}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="mwz-hud-frame p-5">
            <div className="mb-4 font-retro text-xl text-foreground">Review checklist</div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3"><Globe className="mt-0.5 h-4 w-4 text-accent" />Website, image, and short bio are required for publish-ready placement cards.</div>
              <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-4 w-4 text-accent" />Preferred dates help scheduling, but final dates will be set during admin review.</div>
              <div className="flex items-start gap-3"><Wallet className="mt-0.5 h-4 w-4 text-accent" />Treasury wallet verification is the assumed payment flow for v1 in the revision build.</div>
              <div className="flex items-start gap-3"><CreditCard className="mt-0.5 h-4 w-4 text-accent" />Payment reference should match the transfer note, invoice ID, or review note used by admin.</div>
              <div className="flex items-start gap-3"><Mail className="mt-0.5 h-4 w-4 text-accent" />Contact channel should be the fastest place to request edits before activation.</div>
            </div>
            <div className="mt-4 border-t border-border pt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected slot: {slotDetail}</div>
          </section>
        </div>
      </section>
    </div>
  );
};

export default SponsorshipApplication;
