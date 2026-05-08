import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const platformLinks = [
  { label: "Launchpad", to: "/" },
  { label: "Create Coin", to: "/create" },
  { label: "Battle Leagues", to: "/battle-leagues" },
  { label: "My Airdrops", to: "/profile?tab=airdrops" },
  { label: "My Squad", to: "/profile?tab=squad" },
  { label: "Recruiter Dashboard", to: "/profile?tab=recruiter" },
];

const publicLinks = [
  { label: "Public Recruiters", to: "/recruiters" },
  { label: "Public Squads", to: "/squads" },
  { label: "Airdrop Winners", to: "/airdrops/winners" },
];

const resourceLinks = [
  { label: "Docs", to: "/docs" },
  { label: "Security", to: "/docs#security" },
  { label: "Fees", to: "/docs#fees" },
];

const communityLinks = [
  { label: "X", href: "https://twitter.com/_MemeBattles" },
  { label: "Telegram", href: "https://t.me/launchpad" },
  { label: "Discord", href: "https://discord.gg/launchpad" },
];

function FooterLinkList(props: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-retro text-xs uppercase tracking-[0.18em] text-muted-foreground">{props.title}</p>
      <div className="mt-4 space-y-2 text-sm">{props.children}</div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 rounded-[2rem] border border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(240,106,26,0.12),transparent_34%),linear-gradient(180deg,rgba(18,22,28,0.94),rgba(9,12,16,0.99))] p-6 md:p-8">
      <div className="grid gap-8 xl:grid-cols-[1.15fr_1.85fr]">
        <div className="space-y-4">
          <p className="font-retro text-xs uppercase tracking-[0.24em] text-amber-100/70">MemeWarzone</p>
          <h2 className="font-retro text-3xl text-foreground">Build your squad and prepare for the Warzone.</h2>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            The frontend now separates public discovery from your personal incentive hub. Use Profile for your wallet-specific airdrops, squad state, and recruiter rewards, while public leaderboards stay open to everyone.
          </p>
          <Button asChild className="font-retro">
            <Link to="/recruiter">
              Become a Recruiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          <FooterLinkList title="Platform">
            {platformLinks.map((item) => (
              <Link key={item.label} to={item.to} className="block text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </FooterLinkList>

          <FooterLinkList title="Public">
            {publicLinks.map((item) => (
              <Link key={item.label} to={item.to} className="block text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </FooterLinkList>

          <FooterLinkList title="Resources">
            {resourceLinks.map((item) => (
              <Link key={item.label} to={item.to} className="block text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </FooterLinkList>

          <FooterLinkList title="Community">
            {communityLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="block text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </FooterLinkList>
        </div>
      </div>
    </footer>
  );
}
