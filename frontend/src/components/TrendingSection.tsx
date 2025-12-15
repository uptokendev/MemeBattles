import { Card, CardContent } from "@/components/ui/card";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { useEffect, useMemo, useState } from "react";
import { useLaunchpad } from "@/lib/launchpadClient";
import type { CampaignSummary } from "@/lib/launchpadClient";

type TrendingItem = {
  rank: number;
  name: string;
  value: string;
  change: string;
};

// Best-effort parsing of formatted strings like:
//  - "12.34 BNB"
//  - "$67.31k"
//  - "$4.08m"
const parseFormattedNumber = (s: string): number => {
  if (!s) return 0;
  const str = String(s).trim().toLowerCase();

  // BNB: "12.34 bnb"
  if (str.includes("bnb")) {
    const n = Number(str.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  // USD-like compact formats (k/m)
  const match = str.match(/([-0-9.]+)\s*([kmb])?/);
  if (!match) return 0;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;

  const suffix = match[2];
  const mult = suffix === "b" ? 1e9 : suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
  return base * mult;
};

export const TrendingSection = () => {
  const { fetchCampaigns, fetchCampaignSummary } = useLaunchpad();
  const [items, setItems] = useState<TrendingItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const campaigns = (await fetchCampaigns()) ?? [];
        const results = await Promise.allSettled(
          campaigns.map((c) => fetchCampaignSummary(c))
        );

        if (cancelled) return;

        const summaries: CampaignSummary[] = results
          .filter((r): r is PromiseFulfilledResult<CampaignSummary> => r.status === "fulfilled")
          .map((r) => r.value);

        // Simple, deterministic heuristic: top 3 by volume
        const sorted = [...summaries].sort((a, b) => {
          const av = parseFormattedNumber(a.stats.volume);
          const bv = parseFormattedNumber(b.stats.volume);
          return bv - av;
        });

        const top = sorted.slice(0, 3).map((s, idx) => {
          return {
            rank: idx + 1,
            name: s.campaign.symbol,
            value: `Vol ${s.stats.volume}`,
            change: `MC ${s.stats.marketCap}`,
          };
        });

        setItems(top);
      } catch (e) {
        console.error("[TrendingSection] Failed to load trending campaigns", e);
        if (!cancelled) setItems([]);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns, fetchCampaignSummary]);

  const display = useMemo(() => items, [items]);

  return (
    <div className="mb-12">
      <h2 className="text-2xl font-retro text-accent mb-6" style={{ textShadow: '0 0 10px hsl(var(--glow-accent))' }}>
        Trending Now
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {display.map((token) => (
          <div key={token.rank} className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2">
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={3}
            />
            <Card className="relative bg-card/50 backdrop-blur-sm border-accent/30">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <span className="text-3xl font-retro text-accent/50">#{token.rank}</span>
                  <span className="text-xs font-retro text-accent">{token.change}</span>
                </div>
                <h3 className="text-lg font-retro text-accent mb-2" style={{ textShadow: '0 0 5px hsl(var(--glow-accent))' }}>
                  {token.name}
                </h3>
                <p className="text-2xl font-retro text-foreground">{token.value}</p>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};
