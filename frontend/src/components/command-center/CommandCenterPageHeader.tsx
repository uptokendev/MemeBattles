import type { ReactNode } from "react";

type CommandCenterPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
};

export function CommandCenterPageHeader({
  eyebrow = "Command Center",
  title,
  description,
  children,
}: CommandCenterPageHeaderProps) {
  return (
    <div className="mwz-command-header mb-4 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 font-retro text-[10px] uppercase tracking-[0.2em] text-accent">
            {eyebrow}
          </div>
          <h1 className="font-retro text-2xl text-foreground md:text-3xl">{title}</h1>
          {description && <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">{description}</p>}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </div>
  );
}
