import type { ReactNode } from "react";

import { CommandCenterDataProvider } from "@/components/command-center/CommandCenterContext";
import { CommandCenterHero } from "@/components/command-center/CommandCenterHero";
import { CommandCenterSidebar } from "@/components/command-center/CommandCenterSidebar";

type CommandCenterLayoutProps = {
  walletAddress: string;
  basePath: string;
  children: ReactNode;
};

export function CommandCenterLayout({ walletAddress, basePath, children }: CommandCenterLayoutProps) {
  return (
    <CommandCenterDataProvider walletAddress={walletAddress}>
      <div className="mx-auto w-full max-w-7xl space-y-4 pb-8">
        <CommandCenterHero walletAddress={walletAddress} />
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <CommandCenterSidebar basePath={basePath} />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </CommandCenterDataProvider>
  );
}
