import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../src/pages/TokenDetails.tsx");
let source = fs.readFileSync(target, "utf8");

function replaceOnce(label, before, after) {
  if (!source.includes(before)) {
    throw new Error(`WTR patch target not found: ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  "remove DexScreener hook",
  'import { useDexScreenerChart } from "@/hooks/useDexScreenerChart";\n',
  "",
);

replaceOnce(
  "add unified market imports",
  'import { CurvePriceChart } from "@/components/token/CurvePriceChart";\n',
  'import { CurvePriceChart } from "@/components/token/CurvePriceChart";\n' +
    'import { UnifiedMarketChart } from "@/components/token/UnifiedMarketChart";\n' +
    'import { GraduationExplosion } from "@/components/token/GraduationExplosion";\n' +
    'import { useUnifiedMarket, type MarketResolution } from "@/hooks/useUnifiedMarket";\n' +
    'import {\n' +
    '  ensureTopazSellAllowance,\n' +
    '  executeTopazBuy,\n' +
    '  executeTopazSell,\n' +
    '  quoteTopazBuy,\n' +
    '  quoteTopazSell,\n' +
    '  resolveVerifiedTopazRoute,\n' +
    '  solveNativeForExactTokens,\n' +
    '  solveTokensForExactNative,\n' +
    '} from "@/lib/topazV2Trade";\n',
);

replaceOnce(
  "add market trade state",
  '  const [tokenBalanceWei, setTokenBalanceWei] = useState<bigint | null>(null);\n',
  '  const [tokenBalanceWei, setTokenBalanceWei] = useState<bigint | null>(null);\n' +
    '  const [marketResolution, setMarketResolution] = useState<MarketResolution>("1m");\n' +
    '  const [topazSlippageBps, setTopazSlippageBps] = useState(100);\n',
);

replaceOnce(
  "mount unified market hook",
  '  const curvePointsForUi: CurveTradePoint[] = useMemo(() => {\n' +
    '    return combinedCurvePointsSafe.length ? combinedCurvePointsSafe : lastCurvePointsRef.current;\n' +
    '  }, [combinedCurvePointsSafe]);\n\n',
  '  const curvePointsForUi: CurveTradePoint[] = useMemo(() => {\n' +
    '    return combinedCurvePointsSafe.length ? combinedCurvePointsSafe : lastCurvePointsRef.current;\n' +
    '  }, [combinedCurvePointsSafe]);\n\n' +
    '  const unifiedMarket = useUnifiedMarket({\n' +
    '    campaignAddress: hasValidCampaignAddress ? resolvedCampaignAddress : undefined,\n' +
    '    chainId: chainIdForStorage,\n' +
    '    resolution: marketResolution,\n' +
    '    enabled: hasValidCampaignAddress,\n' +
    '  });\n\n',
);

replaceOnce(
  "use unified trade rows",
  '    const next: TxRow[] = [...combinedCurvePointsSafe]\n',
  '    const transactionPoints: any[] = unifiedMarket.enabled && unifiedMarket.trades.length\n' +
    '      ? unifiedMarket.trades.map((trade) => ({\n' +
    '          type: trade.side,\n' +
    '          from: trade.wallet,\n' +
    '          to: trade.recipient || trade.campaignAddress,\n' +
    '          tokensWei: BigInt(trade.tokenAmountRaw || "0"),\n' +
    '          nativeWei: BigInt(trade.nativeAmountRaw || "0"),\n' +
    '          pricePerToken: Number(trade.priceBnb || 0),\n' +
    '          timestamp: Math.floor(new Date(trade.blockTime).getTime() / 1000),\n' +
    '          txHash: trade.txHash,\n' +
    '          blockNumber: trade.blockNumber,\n' +
    '          logIndex: trade.logIndex,\n' +
    '        }))\n' +
    '      : combinedCurvePointsSafe;\n' +
    '    const next: TxRow[] = [...transactionPoints]\n',
);

replaceOnce(
  "transaction effect dependencies",
  '  }, [campaign, combinedCurvePointsSafe, tokenData.marketCap, metrics]);\n',
  '  }, [campaign, combinedCurvePointsSafe, tokenData.marketCap, metrics, unifiedMarket.enabled, unifiedMarket.trades]);\n',
);

replaceOnce(
  "replace DexScreener market stage",
  '  // DexScreener gating: only show external DEX chart after graduation / finalize.\n' +
    '  // Prefer explicit flags when available; older deployments can fall back to sold supply.\n' +
    '  const hasLaunchFlag = (metrics as any)?.launched !== undefined || (metrics as any)?.finalizedAt !== undefined;\n' +
    '  const isGraduated = hasLaunchFlag\n' +
    '    ? Boolean((metrics as any)?.launched) || (typeof (metrics as any)?.finalizedAt === "bigint" ? (metrics as any).finalizedAt > 0n : Number((metrics as any)?.finalizedAt ?? 0) > 0)\n' +
    '    : Boolean(metrics && metrics.curveSupply > 0n && metrics.sold >= metrics.curveSupply);\n\n' +
    '  const dexTokenAddress = isGraduated ? (campaign?.token ?? "") : "";\n\n' +
    '  const { url: chartUrl, baseUrl: dexBaseUrl, liquidityBnb: dexLiquidityBnb } =\n' +
    '    useDexScreenerChart(dexTokenAddress);\n' +
    '  const isDexStage = isGraduated;\n',
  '  // Graduation is a market-stage transition inside MemeWarzone, not a redirect.\n' +
    '  // Prefer verified backend state; retain the on-chain fallback while rollout flags are disabled.\n' +
    '  const hasLaunchFlag = (metrics as any)?.launched !== undefined || (metrics as any)?.finalizedAt !== undefined;\n' +
    '  const contractGraduated = hasLaunchFlag\n' +
    '    ? Boolean((metrics as any)?.launched) || (typeof (metrics as any)?.finalizedAt === "bigint" ? (metrics as any).finalizedAt > 0n : Number((metrics as any)?.finalizedAt ?? 0) > 0)\n' +
    '    : Boolean(metrics && metrics.curveSupply > 0n && metrics.sold >= metrics.curveSupply);\n' +
    '  const verifiedMarketStage = unifiedMarket.state?.marketStage;\n' +
    '  const isDexStage = verifiedMarketStage\n' +
    '    ? ["TOPAZ_PENDING", "TOPAZ_ACTIVE", "TOPAZ_DEGRADED"].includes(verifiedMarketStage)\n' +
    '    : contractGraduated;\n' +
    '  const isTopazTradingActive = verifiedMarketStage === "TOPAZ_ACTIVE" && Boolean(unifiedMarket.state?.tradingEnabled);\n',
);

replaceOnce(
  "use verified liquidity",
  '  const liquidityValue = (() => {\n' +
    '    if (!isDexStage) return tokenData.liquidity;\n\n' +
    '    // LIVE: best-effort liquidity (BNB-equivalent) from DexScreener.\n' +
    '    return formatBnb(dexLiquidityBnb ?? null);\n' +
    '  })()\n',
  '  const liquidityValue = (() => {\n' +
    '    if (!isDexStage) return tokenData.liquidity;\n' +
    '    return formatBnb(Number(unifiedMarket.summary?.liquidity_bnb ?? NaN));\n' +
    '  })()\n',
);

replaceOnce(
  "chart header stage",
  '  const chartTitle = isDexStage ? "DEX chart" : "";\n' +
    '  const stagePill = isDexStage ? "Graduated" : "Bonding";\n',
  '  const chartTitle = "";\n' +
    '  const stagePill = isTopazTradingActive ? "Graduated · Topaz" : isDexStage ? "Graduating" : "Bonding";\n',
);

replaceOnce(
  "Topaz quote branch",
  '        if (isDexStage) {\n' +
    '          setQuoteWei(null);\n' +
    '          return;\n' +
    '        }\n',
  '        if (isDexStage) {\n' +
    '          if (!isTopazTradingActive || !campaign?.campaign || !campaign?.token) {\n' +
    '            setQuoteWei(null);\n' +
    '            setQuoteError(unifiedMarket.state?.lastError || "Topaz market verification is still in progress.");\n' +
    '            return;\n' +
    '          }\n' +
    '          setQuoteLoading(true);\n' +
    '          const resolved = await resolveVerifiedTopazRoute({\n' +
    '            provider: readProvider,\n' +
    '            campaignAddress: campaign.campaign,\n' +
    '            expectedTokenAddress: campaign.token,\n' +
    '            chainId: chainIdForStorage,\n' +
    '          });\n' +
    '          if (tradeInputDenom === "BNB") {\n' +
    '            const targetNativeWei = parseBnbAmountWei(tradeAmount);\n' +
    '            setEffectiveBnbWei(targetNativeWei);\n' +
    '            if (targetNativeWei <= 0n) {\n' +
    '              setEffectiveTokenWei(0n);\n' +
    '              setQuoteWei(null);\n' +
    '              return;\n' +
    '            }\n' +
    '            if (tradeTab === "buy") {\n' +
    '              const quote = await quoteTopazBuy({ provider: readProvider, resolved, nativeAmountInRaw: targetNativeWei, slippageBps: topazSlippageBps });\n' +
    '              if (!cancelled) {\n' +
    '                setEffectiveTokenWei(quote.amountOutRaw);\n' +
    '                setQuoteWei(targetNativeWei);\n' +
    '              }\n' +
    '              return;\n' +
    '            }\n' +
    '            const tokenInputWei = await solveTokensForExactNative({\n' +
    '              provider: readProvider,\n' +
    '              resolved,\n' +
    '              targetNativeOutRaw: targetNativeWei,\n' +
    '              initialTokenHighRaw: tokenBalanceWei && tokenBalanceWei > 0n ? tokenBalanceWei : 10n ** 24n,\n' +
    '            });\n' +
    '            const quote = await quoteTopazSell({ provider: readProvider, resolved, tokenAmountInRaw: tokenInputWei, slippageBps: topazSlippageBps });\n' +
    '            if (!cancelled) {\n' +
    '              setEffectiveTokenWei(tokenInputWei);\n' +
    '              setEffectiveBnbWei(quote.amountOutRaw);\n' +
    '              setQuoteWei(quote.amountOutRaw);\n' +
    '            }\n' +
    '            return;\n' +
    '          }\n' +
    '          const tokenInputWei = parseTokenAmountWei(tradeAmount);\n' +
    '          setEffectiveTokenWei(tokenInputWei);\n' +
    '          if (tokenInputWei <= 0n) {\n' +
    '            setEffectiveBnbWei(0n);\n' +
    '            setQuoteWei(null);\n' +
    '            return;\n' +
    '          }\n' +
    '          if (tradeTab === "buy") {\n' +
    '            let initialNativeHighRaw = 10n ** 15n;\n' +
    '            try {\n' +
    '              const lastPriceWei = ethers.parseUnits(String(unifiedMarket.summary?.last_price_bnb || "0"), 18);\n' +
    '              const estimate = (tokenInputWei * lastPriceWei) / 10n ** 18n;\n' +
    '              if (estimate > 0n) initialNativeHighRaw = estimate * 2n;\n' +
    '            } catch {\n' +
    '              // Binary-search expansion handles an unavailable spot price.\n' +
    '            }\n' +
    '            const nativeInputWei = await solveNativeForExactTokens({\n' +
    '              provider: readProvider,\n' +
    '              resolved,\n' +
    '              targetTokenOutRaw: tokenInputWei,\n' +
    '              initialNativeHighRaw,\n' +
    '            });\n' +
    '            const quote = await quoteTopazBuy({ provider: readProvider, resolved, nativeAmountInRaw: nativeInputWei, slippageBps: topazSlippageBps });\n' +
    '            if (!cancelled) {\n' +
    '              setEffectiveBnbWei(nativeInputWei);\n' +
    '              setEffectiveTokenWei(quote.amountOutRaw);\n' +
    '              setQuoteWei(nativeInputWei);\n' +
    '            }\n' +
    '            return;\n' +
    '          }\n' +
    '          const quote = await quoteTopazSell({ provider: readProvider, resolved, tokenAmountInRaw: tokenInputWei, slippageBps: topazSlippageBps });\n' +
    '          if (!cancelled) {\n' +
    '            setEffectiveBnbWei(quote.amountOutRaw);\n' +
    '            setQuoteWei(quote.amountOutRaw);\n' +
    '          }\n' +
    '          return;\n' +
    '        }\n',
);

replaceOnce(
  "quote dependencies",
  '  }, [readProvider, campaign?.campaign, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage]);\n',
  '  }, [readProvider, campaign?.campaign, campaign?.token, chainIdForStorage, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage, isTopazTradingActive, topazSlippageBps, unifiedMarket.state?.lastError, unifiedMarket.summary?.last_price_bnb]);\n',
);

replaceOnce(
  "execute Topaz inside MemeWarzone",
  '    if (isDexStage) {\n' +
    '      toast({\n' +
    '        title: "Token is graduated",\n' +
    '        description: "This token is trading on DEX now. Use DexScreener / PancakeSwap.",\n' +
    '      });\n' +
    '      if (dexBaseUrl) window.open(dexBaseUrl, "_blank", "noopener,noreferrer");\n' +
    '      return;\n' +
    '    }\n',
  '    if (isDexStage) {\n' +
    '      if (!isTopazTradingActive || !campaign?.token) {\n' +
    '        toast({\n' +
    '          title: "Topaz market is not ready",\n' +
    '          description: unifiedMarket.state?.lastError || "The verified Topaz route is still being reconciled.",\n' +
    '          variant: "destructive",\n' +
    '        });\n' +
    '        return;\n' +
    '      }\n' +
    '      if (!wallet.signer || !wallet.account) {\n' +
    '        toast({ title: "Connect wallet", description: "Please connect your wallet to trade." });\n' +
    '        window.dispatchEvent(new CustomEvent("memebattles:openWalletModal"));\n' +
    '        return;\n' +
    '      }\n' +
    '      try {\n' +
    '        setTradePending(true);\n' +
    '        const resolved = await resolveVerifiedTopazRoute({\n' +
    '          provider: readProvider,\n' +
    '          campaignAddress: campaign.campaign,\n' +
    '          expectedTokenAddress: campaign.token,\n' +
    '          chainId: chainIdForStorage,\n' +
    '        });\n' +
    '        if (tradeTab === "buy") {\n' +
    '          const nativeAmountInRaw = tradeInputDenom === "BNB" ? parseBnbAmountWei(tradeAmount) : effectiveBnbWei;\n' +
    '          if (nativeAmountInRaw <= 0n) throw new Error("Enter a valid BNB or token amount.");\n' +
    '          if (bnbBalanceWei != null && nativeAmountInRaw > bnbBalanceWei) throw new Error("Insufficient BNB balance.");\n' +
    '          const quote = await quoteTopazBuy({ provider: readProvider, resolved, nativeAmountInRaw, slippageBps: topazSlippageBps });\n' +
    '          toast({ title: "Submitting Topaz buy", description: `Minimum received: ${formatTokenFromWei(quote.minimumOutRaw)} ${tokenData.ticker}.` });\n' +
    '          const tx = await executeTopazBuy({ signer: wallet.signer, recipient: wallet.account, quote });\n' +
    '          const receipt = await tx.wait();\n' +
    '          toast({ title: "Buy confirmed", description: receipt?.hash ? `Tx: ${receipt.hash.slice(0, 10)}...` : "Transaction confirmed." });\n' +
    '        } else {\n' +
    '          const tokenAmountInRaw = tradeInputDenom === "BNB" ? effectiveTokenWei : parseTokenAmountWei(tradeAmount);\n' +
    '          if (tokenAmountInRaw <= 0n) throw new Error("Enter a valid token or BNB amount.");\n' +
    '          if (tokenBalanceWei != null && tokenAmountInRaw > tokenBalanceWei) throw new Error(`Insufficient ${tokenData.ticker} balance.`);\n' +
    '          const quote = await quoteTopazSell({ provider: readProvider, resolved, tokenAmountInRaw, slippageBps: topazSlippageBps });\n' +
    '          const approval = await ensureTopazSellAllowance({ signer: wallet.signer, owner: wallet.account, resolved, tokenAmountRaw: tokenAmountInRaw });\n' +
    '          if (approval) {\n' +
    '            setApprovePending(true);\n' +
    '            toast({ title: "Approval required", description: `Approving the verified Topaz router for ${tokenData.ticker}...` });\n' +
    '            await approval.wait();\n' +
    '            setApprovePending(false);\n' +
    '          }\n' +
    '          toast({ title: "Submitting Topaz sell", description: `Minimum received: ${formatBnbFromWei(quote.minimumOutRaw)}.` });\n' +
    '          const tx = await executeTopazSell({ signer: wallet.signer, recipient: wallet.account, quote });\n' +
    '          const receipt = await tx.wait();\n' +
    '          toast({ title: "Sell confirmed", description: receipt?.hash ? `Tx: ${receipt.hash.slice(0, 10)}...` : "Transaction confirmed." });\n' +
    '        }\n' +
    '        await unifiedMarket.refresh();\n' +
    '        const [bnbBal, tokenBal] = await Promise.all([\n' +
    '          readProvider.getBalance(wallet.account),\n' +
    '          (new Contract(campaign.token, TOKEN_ABI, readProvider) as any).balanceOf(wallet.account),\n' +
    '        ]);\n' +
    '        setBnbBalanceWei(bnbBal);\n' +
    '        setTokenBalanceWei(tokenBal);\n' +
    '        setTradeAmount("0");\n' +
    '      } catch (e: any) {\n' +
    '        console.error("[TokenDetails] Topaz trade failed", e);\n' +
    '        toast({ title: "Trade failed", description: e?.shortMessage || e?.message || "Topaz trade failed.", variant: "destructive" });\n' +
    '      } finally {\n' +
    '        setApprovePending(false);\n' +
    '        setTradePending(false);\n' +
    '      }\n' +
    '      return;\n' +
    '    }\n',
);

replaceOnce(
  "show ATH throughout lifecycle",
  '                {!isDexStage && (\n' +
    '                  <AthBar\n' +
    '                    currentLabel={marketCapUsdLabel ?? undefined}\n' +
    '                    storageKey={`ath:${String(chainIdForStorage)}:${String((campaignAddress ?? campaign?.campaign ?? "")).toLowerCase()}`}\n' +
    '                    className="w-full md:w-auto md:max-w-[320px]"\n' +
    '                  />\n' +
    '                )}\n\n' +
    '                {isDexStage && dexBaseUrl && (\n' +
    '                  <Button\n' +
    '                    variant="ghost"\n' +
    '                    size="sm"\n' +
    '                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground"\n' +
    '                    onClick={() => window.open(dexBaseUrl, "_blank", "noopener,noreferrer")}\n' +
    '                  >\n' +
    '                    <ExternalLink className="h-3 w-3 mr-1" />\n' +
    '                    DexScreener\n' +
    '                  </Button>\n' +
    '                )}\n',
  '                <AthBar\n' +
    '                  currentLabel={marketCapUsdLabel ?? undefined}\n' +
    '                  storageKey={`ath:${String(chainIdForStorage)}:${String((campaignAddress ?? campaign?.campaign ?? "")).toLowerCase()}`}\n' +
    '                  className="w-full md:w-auto md:max-w-[320px]"\n' +
    '                />\n',
);

replaceOnce(
  "single continuous chart",
  '            <div className="flex-1 min-h-0">\n' +
    '              {isDexStage ? (\n' +
    '                chartUrl ? (\n' +
    '                  <iframe\n' +
    '                    src={chartUrl}\n' +
    '                    title={`${tokenData.ticker} chart`}\n' +
    '                    className="w-full h-full min-h-[260px] border-0"\n' +
    '                    allow="clipboard-write; clipboard-read; encrypted-media;"\n' +
    '                  />\n' +
    '                ) : (\n' +
    '                  <div className="flex items-center justify-center h-full min-h-[260px] text-xs text-muted-foreground p-4">\n' +
    '                    DexScreener data is not available yet.\n' +
    '                  </div>\n' +
    '                )\n' +
    '              ) : (\n' +
    '                <div className="w-full h-full min-h-[260px]">\n' +
    '                  <CurvePriceChart\n' +
    '                    campaignAddress={campaign?.campaign}\n' +
    '                    curvePointsOverride={curvePointsForUi}\n' +
    '                    loadingOverride={(curvePointsForUi?.length ?? 0) > 0 ? false : liveCurveLoading}\n' +
    '                    errorOverride={(curvePointsForUi?.length ?? 0) > 0 ? null : liveCurveError}\n' +
    '                  />\n' +
    '                </div>\n' +
    '              )}\n' +
    '            </div>\n',
  '            <div className="flex-1 min-h-0">\n' +
    '              <div className="w-full h-full min-h-[260px]">\n' +
    '                {unifiedMarket.enabled ? (\n' +
    '                  <UnifiedMarketChart\n' +
    '                    curvePoints={curvePointsForUi}\n' +
    '                    marketCandles={unifiedMarket.candles}\n' +
    '                    marketState={unifiedMarket.state}\n' +
    '                    graduationMarker={unifiedMarket.graduationMarker}\n' +
    '                    resolution={marketResolution}\n' +
    '                    onResolutionChange={setMarketResolution}\n' +
    '                    denomination={displayDenom}\n' +
    '                    loading={unifiedMarket.loading}\n' +
    '                    error={unifiedMarket.error}\n' +
    '                  />\n' +
    '                ) : (\n' +
    '                  <CurvePriceChart\n' +
    '                    campaignAddress={campaign?.campaign}\n' +
    '                    curvePointsOverride={curvePointsForUi}\n' +
    '                    loadingOverride={(curvePointsForUi?.length ?? 0) > 0 ? false : liveCurveLoading}\n' +
    '                    errorOverride={(curvePointsForUi?.length ?? 0) > 0 ? null : liveCurveError}\n' +
    '                  />\n' +
    '                )}\n' +
    '              </div>\n' +
    '            </div>\n',
);

replaceOnce(
  "graduation explosion",
  '  return (\n' +
    '    <div className="h-full w-full overflow-y-auto flex flex-col px-3 md:px-6 pt-16 md:pt-16 gap-3 md:gap-4">\n',
  '  return (\n' +
    '    <div className="h-full w-full overflow-y-auto flex flex-col px-3 md:px-6 pt-16 md:pt-16 gap-3 md:gap-4">\n' +
    '      <GraduationExplosion\n' +
    '        campaignAddress={campaign?.campaign}\n' +
    '        active={isTopazTradingActive}\n' +
    '        transitionAt={unifiedMarket.stageTransition?.to === "TOPAZ_ACTIVE" ? unifiedMarket.stageTransition.at : null}\n' +
    '      />\n',
);

source = source.replaceAll(
  '<span className="text-xs text-muted-foreground">Slippage: {SLIPPAGE_PCT}%</span>',
  '<label className="flex items-center gap-1 text-xs text-muted-foreground">\n' +
    '                        Slippage:\n' +
    '                        {isDexStage ? (\n' +
    '                          <select\n' +
    '                            value={topazSlippageBps}\n' +
    '                            onChange={(event) => setTopazSlippageBps(Number(event.target.value))}\n' +
    '                            className="h-6 rounded border border-border bg-background px-1 text-[10px] text-foreground"\n' +
    '                          >\n' +
    '                            <option value={50}>0.50%</option>\n' +
    '                            <option value={100}>1.00%</option>\n' +
    '                            <option value={200}>2.00%</option>\n' +
    '                            <option value={300}>3.00%</option>\n' +
    '                          </select>\n' +
    '                        ) : (\n' +
    '                          <span>{SLIPPAGE_PCT}%</span>\n' +
    '                        )}\n' +
    '                      </label>',
);

replaceOnce(
  "buy continuity copy",
  '                    {isDexStage ? (\n' +
    '                      <p>Token is graduated. Trade on DEX.</p>\n' +
    '                    ) : quoteWei != null ? (\n',
  '                    {isDexStage ? (\n' +
    '                      isTopazTradingActive && quoteWei != null ? (\n' +
    '                        <p>Topaz execution · minimum received is protected by {(topazSlippageBps / 100).toFixed(2)}% slippage.</p>\n' +
    '                      ) : (\n' +
    '                        <p>Topaz market verification is in progress. Your bonding history remains visible.</p>\n' +
    '                      )\n' +
    '                    ) : quoteWei != null ? (\n',
);

replaceOnce(
  "sell continuity copy",
  '                    {isDexStage ? (\n' +
    '                      <p>Token is graduated. Trade on DEX.</p>\n' +
    '                    ) : quoteWei != null ? (\n',
  '                    {isDexStage ? (\n' +
    '                      isTopazTradingActive && quoteWei != null ? (\n' +
    '                        <p>Topaz execution · minimum received is protected by {(topazSlippageBps / 100).toFixed(2)}% slippage.</p>\n' +
    '                      ) : (\n' +
    '                        <p>Topaz market verification is in progress. Your bonding history remains visible.</p>\n' +
    '                      )\n' +
    '                    ) : quoteWei != null ? (\n',
);

source = source.replaceAll(
  'disabled={tradePending || approvePending || quoteLoading || (!isDexStage && (tradeInputDenom === "BNB" ? effectiveBnbWei <= 0n || effectiveTokenWei <= 0n : parseTokenAmountWei(tradeAmount) <= 0n))}',
  'disabled={tradePending || approvePending || quoteLoading || (isDexStage && !isTopazTradingActive) || (tradeInputDenom === "BNB" ? effectiveBnbWei <= 0n || effectiveTokenWei <= 0n : parseTokenAmountWei(tradeAmount) <= 0n)}',
);

replaceOnce(
  "buy label",
  '{tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Buy"}',
  '{tradePending ? "Processing..." : "Buy"}',
);
replaceOnce(
  "sell label",
  '{tradePending ? "Processing..." : isDexStage ? "Trade on DEX" : "Sell"}',
  '{tradePending ? "Processing..." : "Sell"}',
);

fs.writeFileSync(target, source);
console.log("Applied WTR Token Details market-continuity patch.");
