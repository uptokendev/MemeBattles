import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Path", "Identity", "Story", "Bond", "Launch"] as const;

export function CreateWizardShell({
  step,
  totalSteps,
  canBack,
  canNext,
  onBack,
  onNext,
  children,
  fullWidth = false,
}: {
  step: number;
  totalSteps: number;
  canBack: boolean;
  canNext: boolean;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className="relative mx-auto flex w-full max-w-[1100px] items-stretch gap-2 px-1 sm:gap-3 sm:px-2">
      <button
        type="button"
        aria-label="Previous step"
        disabled={!canBack}
        onClick={onBack}
        className={cn(
          "mwz-button sticky top-[45%] z-10 my-auto hidden h-12 w-10 shrink-0 items-center justify-center sm:flex",
          !canBack && "cursor-not-allowed opacity-35",
        )}
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      <div
        className={cn(
          "mwz-card flex min-h-[min(640px,calc(100dvh-8.5rem))] w-full flex-col overflow-hidden border-accent/25",
          "bg-background/40",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 sm:px-4">
          <div>
            <p className="font-retro text-[10px] uppercase tracking-[0.22em] text-accent">Create Coin</p>
            <h1 className="font-retro text-xl tracking-tight text-foreground sm:text-2xl">
              {STEP_LABELS[step - 1] || "Create"}
              <span className="ml-2 text-sm text-muted-foreground">
                {step}/{totalSteps}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-5 rounded-sm sm:w-6",
                  i + 1 === step ? "bg-accent" : i + 1 < step ? "bg-accent/45" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>

        <div className={cn("flex min-h-0 flex-1 flex-col", fullWidth ? "p-3 sm:p-5" : "p-0")}>
          {children}
        </div>

        {/* Mobile arrow row */}
        <div className="flex items-center justify-between gap-2 border-t border-border/50 p-2 sm:hidden">
          <button
            type="button"
            disabled={!canBack}
            onClick={onBack}
            className={cn("mwz-button h-10 flex-1 font-retro text-xs", !canBack && "opacity-35")}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={onNext}
            className={cn("mwz-button mwz-button-orange h-10 flex-1 font-retro text-xs", !canNext && "opacity-35")}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="Next step"
        disabled={!canNext}
        onClick={onNext}
        className={cn(
          "mwz-button sticky top-[45%] z-10 my-auto hidden h-12 w-10 shrink-0 items-center justify-center sm:flex",
          !canNext && "cursor-not-allowed opacity-35",
        )}
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}

export function CreateSplitPane({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
      <div className="flex items-center justify-center border-b border-border/40 bg-black/20 p-4 md:border-b-0 md:border-r md:p-6">
        {left}
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto p-4 sm:p-5 md:p-6">{right}</div>
    </div>
  );
}
