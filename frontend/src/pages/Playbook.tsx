/**
 * Playbook Page
 * Practical, step-by-step docs for using the platform.
 */

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
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Rocket;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-card/30 backdrop-blur-md border border-border rounded-2xl overflow-hidden">
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
  return (
    <div className="h-full w-full overflow-y-auto scrollbar-thin scrollbar-thumb-accent/40 scrollbar-track-muted/20">
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

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">Quickstart</Badge>
                <Badge variant="secondary">Bonding curve</Badge>
                <Badge variant="secondary">Safety</Badge>
                <Badge variant="secondary">FAQ</Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <Button asChild className="w-full sm:w-auto">
                <Link to="/create">
                  Create a token <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link to="/up-now">Explore UP Now</Link>
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
                  <Link to="/">Showcase</Link>
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
            icon={Rocket}
            title="1) Launch a token"
            subtitle="Create a campaign, set the basics, and publish." 
          >
            <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                Go to <Link className="text-accent hover:underline" to="/create">Create</Link> and fill in
                name, ticker, logo, and links.
              </li>
              <li>
                Double-check external URLs. Use only official domains/handles.
              </li>
              <li>
                Submit the transaction and confirm in your wallet.
              </li>
              <li>
                After creation, your token appears in the carousel and UP Now.
              </li>
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
            icon={Zap}
            title="2) Understand bonding"
            subtitle="During bonding, pricing and progress follow the campaign mechanics." 
          >
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Tokens can start in a bonding phase. In this phase, buys and sells happen against the
                campaign, and the price typically changes as supply changes.
              </p>
              <p>
                Once the campaign reaches its graduation criteria, it can transition to DEX trading.
                Graduated tokens appear in the dedicated "graduated" row on UP Now.
              </p>
            </div>
          </Section>

          <Section
            icon={TrendingUp}
            title="3) Discover and trade"
            subtitle="Use UP Now to find tokens, then open details for chart, activity, and actions." 
          >
            <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                Open <Link className="text-accent hover:underline" to="/up-now">UP Now</Link> and browse
                the sections.
              </li>
              <li>
                Tap a card to center it, then tap again to open token details.
              </li>
              <li>
                On Token Details, review price action, holders, volume, and recent transactions before trading.
              </li>
            </ol>

            <div className="mt-4 rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
              Tip: If you are on mobile, use horizontal swipe to continue browsing cards.
            </div>
          </Section>

          <Section
            icon={ShieldCheck}
            title="4) Safety and risk"
            subtitle="Practical checks to reduce mistakes and avoid obvious scams." 
          >
            <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
              <li>Verify token address before sharing or trading.</li>
              <li>Prefer official links. Be cautious with rebranded or lookalike domains.</li>
              <li>Do not connect your wallet to unknown sites.</li>
              <li>Assume high volatility. Use position sizing you can tolerate.</li>
            </ul>
          </Section>

          <Section
            icon={MessageCircle}
            title="FAQ"
            subtitle="Answers to the most common questions." 
          >
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Why was the old Docs link showing a 404?</AccordionTrigger>
                <AccordionContent>
                  The docs icon previously pointed to a route that did not exist. This page replaces that
                  placeholder and provides a permanent playbook route.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger>What is the difference between bonding and graduated?</AccordionTrigger>
                <AccordionContent>
                  Bonding typically refers to a pre-DEX phase where the campaign mechanics set pricing.
                  Graduated tokens have transitioned and are tradable on a DEX (with external liquidity).
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger>How do I open Token Details?</AccordionTrigger>
                <AccordionContent>
                  Center a carousel card first (so it highlights), then click it again to navigate into the token.
                  This prevents accidental navigation when you are just scrolling.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger>Do you offer financial advice?</AccordionTrigger>
                <AccordionContent>
                  No. This playbook is product documentation only. Crypto assets can be highly volatile;
                  always do your own research.
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
