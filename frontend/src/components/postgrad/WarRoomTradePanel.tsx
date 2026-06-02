import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, ethers } from "ethers";
import type { CampaignInfo, CampaignMetrics } from "@/lib/launchpadClient";
import { useLaunchpad } from "@/lib/launchpadClient";
import { useWallet } from "@/contexts/WalletContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDexScreenerChart } from "@/hooks/useDexScreenerChart";
import LaunchCampaignArtifact from "@/abi/LaunchCampaign.json";
import LaunchTokenArtifact from "@/abi/LaunchToken.json";

const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;
const TOKEN_DECIMALS = 18;
const SLIPPAGE_PCT = 5;
const MAX_UINT256 = (1n << 256n) - 1n;

function formatBnbFromWei(wei?: bigint | null): string {
  if (wei == null) return "—";
  try {
    const raw = ethers.formatEther(wei);
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${raw} BNB`;
    const pretty = n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6);
    return `${pretty} BNB`;
  } catch {
    return "—";
  }
}

function formatTokenFromWei(wei?: bigint | null): string {
  if (wei == null) return "—";
  try {
    const raw = ethers.formatUnits(wei, TOKEN_DECIMALS);
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const pretty = n >= 1 ? n.toFixed(4) : n >= 0.01 ? n.toFixed(6) : n.toFixed(8);
    return pretty;
  } catch {
    return "—";
  }
}

function parseTokenAmountWei(value: string): bigint {
  const v = (value ?? "").trim();
  if (!v || v === "." || v === "-") return 0n;
  const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const normalized = parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
  try {
    return ethers.parseUnits(normalized || "0", TOKEN_DECIMALS);
  } catch {
    return 0n;
  }
}

function parseBnbAmountWei(value: string): bigint {
  const v = (value ?? "").trim();
  if (!v || v === "." || v === "-") return 0n;
  const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  const normalized = parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join("")}`;
  try {
    return ethers.parseEther(normalized || "0");
  } catch {
    return 0n;
  }
}

export function WarRoomTradePanel({ campaign }: { campaign: CampaignInfo }) {
  const { toast } = useToast();
  const wallet = useWallet();
  const { fetchCampaignMetrics, buyTokens, sellTokens } = useLaunchpad();
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [tradeAmount, setTradeAmount] = useState("0");
  const [tradeInputDenom, setTradeInputDenom] = useState<"TOKEN" | "BNB">("TOKEN");
  const [effectiveTokenWei, setEffectiveTokenWei] = useState<bigint>(0n);
  const [effectiveBnbWei, setEffectiveBnbWei] = useState<bigint>(0n);
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const [quoteWei, setQuoteWei] = useState<bigint | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tradePending, setTradePending] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [bnbBalanceWei, setBnbBalanceWei] = useState<bigint | null>(null);
  const [tokenBalanceWei, setTokenBalanceWei] = useState<bigint | null>(null);

  const topbarButtonClass =
    "bg-accent hover:bg-accent/90 text-accent-foreground font-retro text-[11px] md:text-sm px-3 py-2 rounded-lg md:rounded-xl shadow-lg";
  const ctaTabsListClass = "grid w-full grid-cols-2 mb-2 bg-transparent p-0 h-auto gap-1.5 md:mb-3 md:gap-2";
  const ctaTabsTriggerClass =
    "rounded-lg md:rounded-xl border px-3 py-2 font-retro text-[11px] md:text-sm transition-colors " +
    "bg-transparent border-border/40 text-muted-foreground hover:text-foreground hover:bg-card/30 " +
    "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:border-accent/40 data-[state=active]:shadow-lg";

  const isDexStage = useMemo(() => {
    const hasLaunchFlag = (metrics as any)?.launched !== undefined || (metrics as any)?.finalizedAt !== undefined;
    return hasLaunchFlag
      ? Boolean((metrics as any)?.launched) ||
          (typeof (metrics as any)?.finalizedAt === "bigint"
            ? (metrics as any).finalizedAt > 0n
            : Number((metrics as any)?.finalizedAt ?? 0) > 0)
      : Boolean(metrics && metrics.graduationTarget > 0n && metrics.sold >= metrics.graduationTarget);
  }, [metrics]);

  const { baseUrl: dexBaseUrl } = useDexScreenerChart(isDexStage ? campaign.token : "");

  const loadMetrics = useCallback(async () => {
    try {
      const next = await fetchCampaignMetrics(campaign.campaign);
      setMetrics(next);
    } catch (error) {
      console.warn("[WarRoomTradePanel] Failed to load metrics", error);
      setMetrics(null);
    }
  }, [campaign.campaign, fetchCampaignMetrics]);

  const loadBalances = useCallback(async () => {
    try {
      if (!wallet.provider || !wallet.account) {
        setBnbBalanceWei(null);
        setTokenBalanceWei(null);
        return;
      }

      const [bnbBal, tokenBal] = await Promise.all([
        wallet.provider.getBalance(wallet.account),
        (async () => {
          try {
            if (!campaign.token) return 0n;
            const token = new Contract(campaign.token, TOKEN_ABI, wallet.provider) as any;
            return (await token.balanceOf(wallet.account)) as bigint;
          } catch {
            return 0n;
          }
        })(),
      ]);

      setBnbBalanceWei(bnbBal);
      setTokenBalanceWei(tokenBal);
    } catch (error) {
      console.warn("[WarRoomTradePanel] Failed to load balances", error);
      setBnbBalanceWei(null);
      setTokenBalanceWei(null);
    }
  }, [wallet.provider, wallet.account, campaign.token]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const toggleTradeInputDenom = () => {
    setTradeAmount("0");
    setQuoteWei(null);
    setQuoteError(null);
    setEffectiveTokenWei(0n);
    setEffectiveBnbWei(0n);
    setTradeInputDenom((value) => (value === "TOKEN" ? "BNB" : "TOKEN"));
  };

  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      try {
        setQuoteError(null);

        if (isDexStage) {
          setQuoteWei(null);
          return;
        }
        if (!campaign.campaign) {
          setQuoteWei(null);
          return;
        }

        let amountWei = 0n;
        let inputBnbWei = 0n;
        if (tradeInputDenom === "BNB") {
          inputBnbWei = parseBnbAmountWei(tradeAmount);
          setEffectiveBnbWei(inputBnbWei);
          if (inputBnbWei <= 0n) {
            setEffectiveTokenWei(0n);
            setQuoteWei(null);
            return;
          }
        } else {
          amountWei = parseTokenAmountWei(tradeAmount);
          setEffectiveTokenWei(amountWei);
          if (amountWei <= 0n) {
            setQuoteWei(null);
            return;
          }
        }

        setQuoteLoading(true);

        if (!wallet.provider) {
          if (!cancelled) {
            setQuoteWei(null);
            setQuoteError("Wallet provider not available");
          }
          return;
        }

        const contract = new Contract(campaign.campaign, CAMPAIGN_ABI, wallet.provider) as any;
        if (tradeInputDenom === "BNB") {
          const targetWei = inputBnbWei;
          const priceWei = metrics?.currentPrice ?? 0n;
          let hi: bigint;
          if (tradeTab === "sell" && tokenBalanceWei != null && tokenBalanceWei > 0n) {
            hi = tokenBalanceWei;
          } else if (priceWei > 0n) {
            const estimate = (targetWei * 10n ** 18n) / priceWei;
            hi = estimate > 0n ? estimate * 2n : 10n ** 18n;
          } else {
            hi = 10n ** 24n;
          }
          let lo = 0n;
          for (let i = 0; i < 28; i += 1) {
            const mid = (lo + hi) / 2n;
            if (mid <= 0n) {
              lo = 0n;
              continue;
            }
            const quote: bigint =
              tradeTab === "buy" ? await contract.quoteBuyExactTokens(mid) : await contract.quoteSellExactTokens(mid);
            if (tradeTab === "buy") {
              if (quote <= targetWei) lo = mid;
              else hi = mid;
            } else if (quote >= targetWei) hi = mid;
            else lo = mid;
          }
          const solved = tradeTab === "buy" ? lo : hi;
          if (!cancelled) {
            setEffectiveTokenWei(solved);
            setQuoteWei(targetWei);
          }
        } else {
          const quote: bigint =
            tradeTab === "buy"
              ? await contract.quoteBuyExactTokens(amountWei)
              : await contract.quoteSellExactTokens(amountWei);
          if (!cancelled) setQuoteWei(quote);
        }
      } catch (error: any) {
        console.warn("[WarRoomTradePanel] Quote failed", error);
        if (!cancelled) {
          setQuoteWei(null);
          setQuoteError(error?.message ?? "Failed to fetch quote");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };

    const timer = setTimeout(loadQuote, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wallet.provider, campaign.campaign, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage]);

  const handlePlaceTrade = async () => {
    if (!campaign.campaign) return;

    if (isDexStage) {
      toast({
        title: "Token is graduated",
        description: "This token is trading on DEX now. Use DexScreener / PancakeSwap.",
      });
      if (dexBaseUrl) window.open(dexBaseUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const amountWei = tradeInputDenom === "BNB" ? effectiveTokenWei : parseTokenAmountWei(tradeAmount);
    const inputBnbWei = tradeInputDenom === "BNB" ? effectiveBnbWei : 0n;
    if (amountWei <= 0n) {
      toast({
        title: "Invalid amount",
        description:
          tradeInputDenom === "BNB"
            ? "Enter a BNB amount greater than 0."
            : `Enter a ${campaign.symbol} amount greater than 0.`,
        variant: "destructive",
      });
      return;
    }

    try {
      if (tradeTab === "sell" && tokenBalanceWei != null && amountWei > tokenBalanceWei) {
        toast({
          title: "Insufficient token balance",
          description: `You do not have enough ${campaign.symbol} to sell that amount.`,
          variant: "destructive",
        });
        return;
      }

      if (tradeTab === "buy" && bnbBalanceWei != null) {
        const baseCostWei = tradeInputDenom === "BNB" ? inputBnbWei : (quoteWei ?? 0n);
        if (baseCostWei > 0n) {
          const maxCostWei = (baseCostWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;
          if (maxCostWei > bnbBalanceWei) {
            toast({
              title: "Insufficient BNB",
              description: `You need ~${formatBnbFromWei(maxCostWei)} to place this buy.`,
              variant: "destructive",
            });
            return;
          }
        }
      }

      if (!wallet.signer || !wallet.account) {
        toast({
          title: "Connect wallet",
          description: "Please connect your wallet to trade.",
        });
        window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));
        return;
      }

      setTradePending(true);

      if (tradeTab === "buy") {
        let costWei: bigint = tradeInputDenom === "BNB" ? inputBnbWei : (quoteWei ?? 0n);
        if (amountWei > 0n && costWei === 0n) {
          const contract = new Contract(campaign.campaign, CAMPAIGN_ABI, wallet.provider ?? wallet.signer) as any;
          costWei = await contract.quoteBuyExactTokens(amountWei);
        }
        const maxCostWei = (costWei * BigInt(100 + SLIPPAGE_PCT)) / 100n;

        toast({
          title: "Submitting buy",
          description: `Buying ${ethers.formatUnits(amountWei, TOKEN_DECIMALS)} ${campaign.symbol} (max ${formatBnbFromWei(maxCostWei)}).`,
        });

        const receipt: any = await buyTokens(campaign.campaign, amountWei, maxCostWei);
        toast({
          title: "Buy confirmed",
          description: receipt?.transactionHash ? `Tx: ${receipt.transactionHash.slice(0, 10)}...` : "Transaction confirmed.",
        });
      } else {
        let payoutWei: bigint = tradeInputDenom === "BNB" ? inputBnbWei : (quoteWei ?? 0n);
        if (amountWei > 0n && payoutWei === 0n) {
          const contract = new Contract(campaign.campaign, CAMPAIGN_ABI, wallet.provider ?? wallet.signer) as any;
          payoutWei = await contract.quoteSellExactTokens(amountWei);
        }
        const minPayoutWei = (payoutWei * BigInt(100 - SLIPPAGE_PCT)) / 100n;

        if (campaign.token) {
          const token = new Contract(campaign.token, TOKEN_ABI, wallet.signer) as any;
          const allowance: bigint = await token.allowance(wallet.account, campaign.campaign);
          if (allowance < amountWei) {
            setApprovePending(true);
            toast({
              title: "Approval required",
              description: `Approving ${campaign.symbol} for selling...`,
            });
            const tx = await token.approve(campaign.campaign, MAX_UINT256);
            await tx.wait();
            setApprovePending(false);
          }
        }

        toast({
          title: "Submitting sell",
          description: `Selling ${ethers.formatUnits(amountWei, TOKEN_DECIMALS)} ${campaign.symbol} (min ${formatBnbFromWei(minPayoutWei)}).`,
        });

        const receipt: any = await sellTokens(campaign.campaign, amountWei, minPayoutWei);
        toast({
          title: "Sell confirmed",
          description: receipt?.transactionHash ? `Tx: ${receipt.transactionHash.slice(0, 10)}...` : "Transaction confirmed.",
        });
      }

      await Promise.all([loadMetrics(), loadBalances()]);
    } catch (error: any) {
      toast({
        title: "Trade failed",
        description: String(error?.message ?? error ?? "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setTradePending(false);
      setApprovePending(false);
    }
  };

  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-3 md:rounded-[20px] md:p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-accent/80">Trade</div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-2.5 md:mt-4 md:rounded-2xl md:p-3">
        <Tabs value={tradeTab} onValueChange={(value) => setTradeTab(value as "buy" | "sell")}>
          <TabsList className={ctaTabsListClass}>
            <TabsTrigger value="buy" className={ctaTabsTriggerClass}>Buy</TabsTrigger>
            <TabsTrigger value="sell" className={ctaTabsTriggerClass}>Sell</TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-2.5 mt-0 md:space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                  onClick={toggleTradeInputDenom}
                >
                  {tradeInputDenom === "BNB" ? `Switch to ${campaign.symbol}` : "Switch to BNB"}
                </Button>
                <span className="text-[11px] text-muted-foreground">Slip {SLIPPAGE_PCT}%</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={tradeAmount}
                  onChange={(event) => setTradeAmount(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-16 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary md:pr-20 md:text-base"
                  placeholder="0"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="text-[11px] font-mono text-muted-foreground md:text-xs">{tradeInputDenom === "BNB" ? "BNB" : campaign.symbol}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">Bal: {tradeInputDenom === "BNB" ? formatBnbFromWei(bnbBalanceWei) : `${formatTokenFromWei(tokenBalanceWei)} ${campaign.symbol}`}</span>
                <span className="truncate text-right">Cost: {tradeInputDenom === "BNB" ? formatBnbFromWei(effectiveBnbWei) : (quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—")}</span>
              </div>
              {tradeInputDenom === "BNB" && effectiveTokenWei > 0n ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Est. receive: {formatTokenFromWei(effectiveTokenWei)} {campaign.symbol}</p>
              ) : null}
              {quoteError ? <p className="mt-2 text-center text-xs text-destructive">{quoteError}</p> : null}
            </div>

            <div className="text-center text-[11px] text-muted-foreground md:text-xs">
              {isDexStage ? (
                <p>Token is graduated. Trade on DEX.</p>
              ) : quoteWei != null ? (
                <p>You will pay ~{formatBnbFromWei(quoteWei)} (max {formatBnbFromWei((quoteWei * BigInt(100 + SLIPPAGE_PCT)) / 100n)})</p>
              ) : (
                <p>Enter an amount to see the buy quote.</p>
              )}
            </div>

            <Button
              onClick={handlePlaceTrade}
              disabled={tradePending || approvePending || (!isDexStage && (tradeInputDenom === "BNB" ? effectiveBnbWei <= 0n : parseTokenAmountWei(tradeAmount) <= 0n))}
              className={`w-full ${topbarButtonClass}`}
            >
              {tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Buy"}
            </Button>
          </TabsContent>

          <TabsContent value="sell" className="space-y-2.5 mt-0 md:space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Amt ({tradeInputDenom === "BNB" ? "BNB" : campaign.symbol})</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={toggleTradeInputDenom}
                >
                  {tradeInputDenom === "BNB" ? `Switch to ${campaign.symbol}` : "Switch to BNB"}
                </Button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={tradeAmount}
                  onChange={(event) => setTradeAmount(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-16 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary md:pr-20 md:text-base"
                  placeholder="0"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <span className="text-[11px] font-mono text-muted-foreground md:text-xs">{tradeInputDenom === "BNB" ? "BNB" : campaign.symbol}</span>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-0 text-[11px]"
                  onClick={() => {
                    if (tokenBalanceWei == null) return;
                    const amount = (tokenBalanceWei * 25n) / 100n;
                    setTradeAmount(ethers.formatUnits(amount, TOKEN_DECIMALS));
                  }}
                >
                  25%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-0 text-[11px]"
                  onClick={() => {
                    if (tokenBalanceWei == null) return;
                    const amount = (tokenBalanceWei * 50n) / 100n;
                    setTradeAmount(ethers.formatUnits(amount, TOKEN_DECIMALS));
                  }}
                >
                  50%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-0 text-[11px]"
                  onClick={() => {
                    if (tokenBalanceWei == null) return;
                    setTradeAmount(ethers.formatUnits(tokenBalanceWei, TOKEN_DECIMALS));
                  }}
                >
                  100%
                </Button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">Bal: {tradeInputDenom === "BNB" ? formatBnbFromWei(bnbBalanceWei) : `${formatTokenFromWei(tokenBalanceWei)} ${campaign.symbol}`}</span>
                <span className="truncate text-right">Out: {tradeInputDenom === "BNB" ? formatBnbFromWei(effectiveBnbWei) : (quoteLoading ? "…" : quoteWei != null ? formatBnbFromWei(quoteWei) : "—")}</span>
              </div>
              {tradeInputDenom === "BNB" && effectiveTokenWei > 0n ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Est. sell: {formatTokenFromWei(effectiveTokenWei)} {campaign.symbol}</p>
              ) : null}
              {approvePending ? <p className="mt-2 text-center text-xs text-muted-foreground">Approval in progress...</p> : null}
              {quoteError ? <p className="mt-2 text-center text-xs text-destructive">{quoteError}</p> : null}
            </div>

            <div className="text-center text-[11px] text-muted-foreground md:text-xs">
              {isDexStage ? (
                <p>Token is graduated. Trade on DEX.</p>
              ) : quoteWei != null ? (
                <p>You will receive ~{formatBnbFromWei(quoteWei)} (min {formatBnbFromWei((quoteWei * BigInt(100 - SLIPPAGE_PCT)) / 100n)})</p>
              ) : (
                <p>Enter an amount to see the sell quote.</p>
              )}
            </div>

            <Button
              onClick={handlePlaceTrade}
              disabled={tradePending || approvePending || (!isDexStage && (tradeInputDenom === "BNB" ? effectiveBnbWei <= 0n : parseTokenAmountWei(tradeAmount) <= 0n))}
              className={`w-full ${topbarButtonClass}`}
            >
              {tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Sell"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
