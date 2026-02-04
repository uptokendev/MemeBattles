/**
 * Playbook Page
 * Practical, step-by-step docs for using the platform.
 */

import React, { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  MessageCircle,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function Section({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: typeof Rocket;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      id={id}
      className="bg-card/30 backdrop-blur-md border border-border rounded-2xl overflow-hidden scroll-mt-6"
    >
      <div className="p-5 md:p-6 flex gap-4 items-start">
        <div className="shrink-0 rounded-xl border border-border/60 bg-background/40 p-3">
          <Icon className="h-5 w-5 text-accent" />
        </div>

        <div className="flex-1">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg md:text-xl font-retro text-foreground">{title}</h2>
            {subtitle ? (
              <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
            ) : null}
          </div>

          <div className="mt-4">{children}</div>
        </div>
      </div>
    </Card>
  );
}

const Playbook = () => {
  // Scroll container is the element with overflow-y-auto (this page does NOT scroll the window)
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((id: string) => {
    const container = scrollRef.current;
    if (!container) return;

    const el = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;

    // Scroll inside the container (not the window)
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });

    // Optional: update hash for shareable anchors without relying on window scrolling
    // (won't cause navigation, only updates URL fragment)
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = id;
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="h-full w-full overflow-y-auto scrollbar-thin scrollbar-thumb-accent/40 scrollbar-track-muted/20"
    >
      <div className="mx-auto max-w-5xl px-4 md:px-6 pb-10">
        {/* Hero */}
        <div className="pt-4 md:pt-6 pb-6 md:pb-8">
          <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
                  <BookOpen className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-4xl font-retro text-foreground leading-tight">
                    Playbook
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    A practical guide to launching, discovering, and trading tokens.
                  </p>
                </div>
              </div>

              {/* Anchor buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToSection("quickstart")}
                >
                  Quickstart
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToSection("bonding")}
                >
                  Bonding
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToSection("trading")}
                >
                  Trading
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToSection("safety")}
                >
                  Safety
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToSection("faq")}
                >
                  FAQ
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <Button asChild className="w-full sm:w-auto">
                <Link to="/create">
                  Create a token <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border/60 bg-background/30 backdrop-blur p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
              <div className="flex-1 text-sm text-muted-foreground">
                This playbook explains the core flow: create a campaign, participate during bonding,
                and trade once tokens graduate to a DEX. If you are building a community, review the
                safety section before sharing links.
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/">Launchpad</Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/profile">Profile</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4 md:space-y-6">
          <Section
            id="quickstart"
            icon={Rocket}
            title="1) Launch a token"
            subtitle="Create a campaign, set the basics, and publish."
          >
            <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                Go to{" "}
                <Link className="text-accent hover:underline" to="/create">
                  Create
                </Link>{" "}
                and fill in name, ticker, logo, and links.
              </li>
              <li>Double-check external URLs. Use only official domains/handles.</li>
              <li>Submit the transaction and confirm in your wallet.</li>
              <li>After creation, your token appears in the Launchpad feed.</li>
            </ol>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="rounded-2xl border border-border/60 bg-background/30 p-4">
                <p className="font-retro text-foreground">Best practices</p>
                <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Keep ticker short and unique.</li>
                  <li>Use a square logo and a readable name.</li>
                  <li>Provide at least one verified social link.</li>
                </ul>
              </Card>
              <Card className="rounded-2xl border border-border/60 bg-background/30 p-4">
                <p className="font-retro text-foreground">Common mistakes</p>
                <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Copy/paste wrong links (scam lookalikes).</li>
                  <li>Launching without a clear plan for updates.</li>
                  <li>Overpromising or implying guaranteed returns.</li>
                </ul>
              </Card>
            </div>
          </Section>

          <Section
            id="bonding"
            icon={Zap}
            title="2) Understand bonding"
            subtitle="During bonding, buys and sells happen against the campaign mechanics."
          >
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Tokens can start in a bonding phase. In this phase, price typically changes as supply
                changes, and trades are executed via the launch contracts (not a DEX pool).
              </p>
              <p>
                Once the campaign reaches its graduation criteria, it can transition to DEX trading.
                Graduated tokens appear in the dedicated graduated row on the Launchpad feed.
              </p>
            </div>
          </Section>

          <Section
            id="trading"
            icon={TrendingUp}
            title="3) Discover and trade"
            subtitle="Use the Launchpad feed to find tokens, then open details for chart, activity, and actions."
          >
            <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>Open the Launchpad feed on the home page and browse the sections.</li>
              <li>Tap a card to center it, then tap again to open token details.</li>
              <li>
                On Token Details, review price action, holders, volume, and recent activity before trading.
              </li>
            </ol>

            <div className="mt-4 rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
              Tip: If you are on mobile, use horizontal swipe to continue browsing cards.
            </div>
          </Section>

          <Section
            id="safety"
            icon={ShieldCheck}
            title="4) Safety and risk"
            subtitle="Practical checks to reduce mistakes and avoid obvious scams."
          >
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
              <li>Verify the token/campaign address before sharing or trading.</li>
              <li>Prefer official links. Be cautious with rebranded or lookalike domains.</li>
              <li>Do not connect your wallet to unknown sites.</li>
              <li>Assume high volatility. Use position sizing you can tolerate.</li>
            </ul>
          </Section>

          <Section id="faq" icon={MessageCircle} title="FAQ" subtitle="Answers to the most common questions.">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="faq-1">
                <AccordionTrigger>What is the difference between bonding and graduated?</AccordionTrigger>
                <AccordionContent>
                  Bonding is the initial phase where trades occur against the launch campaign mechanics
                  (not a DEX pool). Graduated tokens have transitioned to DEX trading, typically with
                  external liquidity and standard swaps.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-2">
                <AccordionTrigger>Can I buy and sell during bonding?</AccordionTrigger>
                <AccordionContent>
                  Yes. If a token is in bonding, buy/sell actions are executed through the campaign.
                  Expect higher price impact on thin liquidity phases and always review the details page
                  before trading.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-3">
                <AccordionTrigger>How do I open Token Details from the carousel?</AccordionTrigger>
                <AccordionContent>
                  First click to center/highlight a card, then click it again to navigate to the token.
                  This prevents accidental navigation when you are just scrolling.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-4">
                <AccordionTrigger>Why does my transaction fail or get stuck?</AccordionTrigger>
                <AccordionContent>
                  The most common causes are: insufficient gas, RPC congestion, slippage/price movement,
                  or wallet rejection. Try increasing gas slightly, refreshing, and re-submitting. Always
                  confirm you are on the correct network.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-5">
                <AccordionTrigger>Why does the price jump when I buy or sell?</AccordionTrigger>
                <AccordionContent>
                  Price impact is expected, especially during bonding or on low liquidity. Larger orders
                  move the price more. Consider splitting entries/exits and avoid market-chasing.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-6">
                <AccordionTrigger>Where do I find the contract / token address?</AccordionTrigger>
                <AccordionContent>
                  On the token card and Token Details page you can copy the address. Always verify the
                  address before sharing or trading to avoid clones.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-7">
                <AccordionTrigger>Why does the chart look different before DEX trading?</AccordionTrigger>
                <AccordionContent>
                  Before DEX trading, price data can come from campaign trades rather than an external pool.
                  After graduation, charts generally reflect DEX activity and liquidity conditions.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-8">
                <AccordionTrigger>How do I avoid fake links and impersonators?</AccordionTrigger>
                <AccordionContent>
                  Only trust links shown on the official token page, and verify handles/domains. Be cautious
                  of lookalike accounts, changed usernames, and URLs with extra characters.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-9">
                <AccordionTrigger>Can I edit token name, ticker, or image after launch?</AccordionTrigger>
                <AccordionContent>
                  In most launch flows, core metadata is meant to be immutable once created. If your setup
                  supports profile-based overrides, those changes affect UI display but do not change the
                  on-chain token itself.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-10">
                <AccordionTrigger>Why don’t I see my new token immediately?</AccordionTrigger>
                <AccordionContent>
                  It can take a short time for indexing / refresh. Try refreshing the page. If you just created
                  a token, it should appear in the Launchpad feed shortly after confirmation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-11">
                <AccordionTrigger>Do you offer financial advice?</AccordionTrigger>
                <AccordionContent>
                  No. This playbook is product documentation only. Crypto assets can be highly volatile;
                  always do your own research and manage risk responsibly.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="faq-12">
                <AccordionTrigger>How do I report a bug or suspicious token?</AccordionTrigger>
                <AccordionContent>
                  Use the official social links and channels. Include the token address, screenshots, and a
                  clear description of what happened. Never share your seed phrase or private keys.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default Playbook;
