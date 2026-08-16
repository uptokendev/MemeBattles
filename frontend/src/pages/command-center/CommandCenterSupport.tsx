import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flag, LifeBuoy, Search, ShieldAlert } from "lucide-react";

import { CommandCenterCard } from "@/components/command-center/CommandCenterCard";
import { useCommandCenterData } from "@/components/command-center/CommandCenterContext";
import { CommandCenterPageHeader } from "@/components/command-center/CommandCenterPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ABUSE_HELP_ARTICLES, DISCORD_SUPPORT_URL, searchAbuseHelp } from "@/lib/abuseHelpArticles";

export default function CommandCenterSupport() {
  const { walletAddress } = useCommandCenterData();
  const base = `/profile/${walletAddress}/command/support`;
  const [query, setQuery] = useState("");
  const articles = useMemo(() => searchAbuseHelp(query), [query]);

  return (
    <div className="space-y-4">
      <CommandCenterPageHeader
        eyebrow="Support & Safety"
        title="Help desk"
        description="Search MemeWarzone Help for product questions. Identity theft, impersonation and fake official accounts go to Abuse — not Discord."
      />

      <CommandCenterCard title="Search MemeWarzone Help">
        <label className="sr-only" htmlFor="mwz-help-search">Search help</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="mwz-help-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Help"
            className="border-border/60 bg-background/40 pl-10 font-sans"
          />
        </div>
      </CommandCenterCard>

      <div className="grid gap-4 md:grid-cols-2">
        {(articles.length ? articles : []).map((article) => (
          <CommandCenterCard key={article.id} title={article.title} description={article.summary}>
            <p className="text-sm leading-6 text-muted-foreground">{article.body}</p>
          </CommandCenterCard>
        ))}
        {articles.length === 0 && (
          <CommandCenterCard title="No matching briefing">
            <p className="text-sm text-muted-foreground">
              Nothing in Help matches that search. Product questions go to Discord. Targeted abuse stays in Report Abuse.
            </p>
          </CommandCenterCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterCard
          eyebrow="Normal support"
          title="Can't find what you're looking for?"
          description="Wallet, trade, rewards and product questions stay in Discord. They are not Abuse reports."
        >
          <Button asChild className="font-retro">
            <a href={DISCORD_SUPPORT_URL} target="_blank" rel="noreferrer">
              <LifeBuoy className="mr-2 h-4 w-4" />
              Join Discord and open a support ticket
            </a>
          </Button>
        </CommandCenterCard>

        <CommandCenterCard
          eyebrow="Restricted lane"
          title="Report abuse"
          description="Impersonation, stolen content, fake official profiles, and phishing pretending to be you or MemeWarzone."
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild className="font-retro">
              <Link to={`${base}/report`}>
                <ShieldAlert className="mr-2 h-4 w-4" />
                File an abuse report
              </Link>
            </Button>
            <Button asChild variant="outline" className="font-retro">
              <Link to={`${base}/reports`}>
                <Flag className="mr-2 h-4 w-4" />
                My abuse reports
              </Link>
            </Button>
          </div>
        </CommandCenterCard>
      </div>

      {query.trim() === "" && (
        <p className="px-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {ABUSE_HELP_ARTICLES.length} popular topics on station
        </p>
      )}
    </div>
  );
}
