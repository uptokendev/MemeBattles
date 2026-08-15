import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiBase";

export function AdvertisementNoticeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setStatus("idle");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md border-orange-400/40 bg-black p-5">
        <DialogTitle className="text-[13px] font-semibold uppercase tracking-[0.16em] text-orange-300">
          Advertisement
        </DialogTitle>
        <p className="mt-3 text-sm leading-6 text-foreground/90">
          This is a paid placement. You will be able to advertise here soon. Leave your email and we will notify you when slots open.
        </p>
        {status === "done" ? (
          <p className="mt-4 text-sm text-emerald-400">You are on the list. We will ping you when ads go live.</p>
        ) : (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={async (event) => {
              event.preventDefault();
              const nextEmail = email.trim();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
                setStatus("error");
                setError("Enter a valid email.");
                return;
              }
              setStatus("saving");
              setError(null);
              try {
                const res = await apiFetch("/api/newsletter", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: nextEmail, source: "advertise" }),
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => null);
                  throw new Error(body?.error || "Could not save your email.");
                }
                setStatus("done");
                setEmail("");
              } catch (err) {
                setStatus("error");
                setError(err instanceof Error ? err.message : "Could not save your email.");
              }
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className="h-9 flex-1 border border-border/70 bg-black px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-orange-400/60"
            />
            <button
              type="submit"
              disabled={status === "saving"}
              className="h-9 border border-orange-400/50 bg-orange-500/20 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-orange-200 hover:bg-orange-500/30 disabled:opacity-60"
            >
              {status === "saving" ? "Saving…" : "Notify me"}
            </button>
          </form>
        )}
        {status === "error" && error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
