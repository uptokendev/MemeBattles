import type { ReactNode } from "react";

type CommandCenterCardProps = {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function CommandCenterCard({
  title,
  eyebrow,
  description,
  action,
  children,
  className = "",
}: CommandCenterCardProps) {
  return (
    <section className={`mwz-command-card p-4 md:p-5 ${className}`}>
      {(eyebrow || title || description || action) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-2 font-retro text-[10px] uppercase tracking-[0.18em] text-accent">
                {eyebrow}
              </div>
            )}
            {title && <h2 className="font-retro text-lg text-foreground md:text-xl">{title}</h2>}
            {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
