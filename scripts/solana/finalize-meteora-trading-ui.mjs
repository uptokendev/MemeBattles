import fs from "node:fs";

const path = "frontend/src/pages/TokenDetails.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  `      setQuoteWei(null);\n      setQuoteError(null);\n      setEffectiveTokenWei(0n);`,
  `      setQuoteWei(null);\n      setQuoteError(null);\n      setSolanaMeteoraQuote(null);\n      setEffectiveTokenWei(0n);`,
  "clear Meteora quote on tab change",
);

replaceOnce(
  `  const [solanaCurve, setSolanaCurve] = useState<import("@/lib/solanaCampaignRead").SolanaCampaignCurveState | null>(null);\n  const [solanaBalanceTick, setSolanaBalanceTick] = useState(0);`,
  `  const [solanaCurve, setSolanaCurve] = useState<import("@/lib/solanaCampaignRead").SolanaCampaignCurveState | null>(null);\n  const [solanaMeteoraQuote, setSolanaMeteoraQuote] = useState<import("@/lib/solanaMeteoraTrade").SolanaMeteoraQuote | null>(null);\n  const [solanaBalanceTick, setSolanaBalanceTick] = useState(0);`,
  "Meteora quote state",
);

replaceOnce(
  `          if (contractGraduated) {\n            setEffectiveTokenWei(0n);\n            setEffectiveBnbWei(0n);\n            setQuoteWei(null);\n            setQuoteError("Graduated to Meteora DAMM v2. Loading the verified pool route…");\n            setQuoteLoading(false);\n            return;\n          }\n          const solStr = String(tradeAmount || "").trim();`,
  `          const meteoraStage = contractGraduated;\n          const solStr = String(tradeAmount || "").trim();`,
  "replace temporary graduated quote guard",
);

replaceOnce(
  `              setEffectiveTokenWei(0n);\n              setEffectiveBnbWei(0n);\n              setQuoteWei(null);\n              setQuoteError(null);`,
  `              setEffectiveTokenWei(0n);\n              setEffectiveBnbWei(0n);\n              setQuoteWei(null);\n              setSolanaMeteoraQuote(null);\n              setQuoteError(null);`,
  "clear empty Meteora quote",
);

replaceOnce(
  `          const dec = Number(curve?.tokenDecimals ?? 6);\n          // BNB-parity V2 defaults (1B supply, base=1 lamport/whole token). Live curve overrides.`,
  `          const dec = Number(curve?.tokenDecimals ?? 6);\n\n          if (meteoraStage) {\n            const mint = String(curve?.mint || campaign?.token || campaign?.campaign || "");\n            if (!mint) throw new Error("Solana launch mint is unavailable.");\n            const { quoteSolanaMeteoraExactIn, quoteSolanaMeteoraForDesiredOutput } = await import(\n              "@/lib/solanaMeteoraTrade"\n            );\n            const poolAddress = rtStats?.dexPool || null;\n            let q: import("@/lib/solanaMeteoraTrade").SolanaMeteoraQuote;\n            if (tradeTab === "buy") {\n              if (tradeInputDenom === "BNB") {\n                q = await quoteSolanaMeteoraExactIn({\n                  side: "buy",\n                  mint,\n                  tokenDecimals: dec,\n                  amountInRaw: parseSolLamports(solStr),\n                  slippagePct: SLIPPAGE_PCT,\n                  poolAddress,\n                });\n              } else {\n                q = await quoteSolanaMeteoraForDesiredOutput({\n                  side: "buy",\n                  mint,\n                  tokenDecimals: dec,\n                  desiredOutputRaw: parseTok(solStr, dec),\n                  slippagePct: SLIPPAGE_PCT,\n                  poolAddress,\n                });\n              }\n            } else if (tradeInputDenom === "BNB") {\n              q = await quoteSolanaMeteoraForDesiredOutput({\n                side: "sell",\n                mint,\n                tokenDecimals: dec,\n                desiredOutputRaw: parseSolLamports(solStr),\n                slippagePct: SLIPPAGE_PCT,\n                poolAddress,\n              });\n            } else {\n              q = await quoteSolanaMeteoraExactIn({\n                side: "sell",\n                mint,\n                tokenDecimals: dec,\n                amountInRaw: parseTok(solStr, dec),\n                slippagePct: SLIPPAGE_PCT,\n                poolAddress,\n              });\n            }\n            if (!cancelled) {\n              setSolanaMeteoraQuote(q);\n              setEffectiveTokenWei(tradeTab === "buy" ? q.amountOutRaw : q.amountInRaw);\n              setEffectiveBnbWei(tradeTab === "buy" ? q.amountInRaw : q.amountOutRaw);\n              setQuoteWei(tradeTab === "buy" ? q.amountInRaw : q.amountOutRaw);\n              setQuoteError(q.amountOutRaw <= 0n ? "Meteora quote returned zero output." : null);\n            }\n            return;\n          }\n          if (!cancelled) setSolanaMeteoraQuote(null);\n\n          // BNB-parity V2 defaults (1B supply, base=1 lamport/whole token). Live curve overrides.`,
  "Meteora quote branch",
);

replaceOnce(
  `  }, [readProvider, campaign?.campaign, campaign?.token, chainIdForStorage, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage, isTopazTradingActive, onChainLaunched, topazSlippageBps, unifiedMarket.state?.lastError, unifiedMarket.summary?.last_price_bnb, isSolanaPage, solanaCurve, contractGraduated]);`,
  `  }, [readProvider, campaign?.campaign, campaign?.token, chainIdForStorage, metrics?.currentPrice, tradeTab, tradeAmount, tradeInputDenom, tokenBalanceWei, isDexStage, isTopazTradingActive, onChainLaunched, topazSlippageBps, unifiedMarket.state?.lastError, unifiedMarket.summary?.last_price_bnb, isSolanaPage, solanaCurve, contractGraduated, rtStats?.dexPool]);`,
  "Meteora quote dependency",
);

replaceOnce(
  `      if (contractGraduated) {\n        toast({\n          title: "Meteora market active",\n          description: "This campaign has graduated. Bonding-curve trading is closed; the verified Meteora route is being loaded.",\n        });\n        return;\n      }\n      try {`,
  `      if (contractGraduated) {\n        try {\n          setTradePending(true);\n          const quote = solanaMeteoraQuote;\n          if (!quote) throw new Error("Wait for the Meteora quote to load before submitting.");\n          const { getSolanaProvider } = await import("@/lib/solanaWallet");\n          const provider = getSolanaProvider();\n          const trader = String(provider?.publicKey?.toString?.() || "");\n          if (!trader) {\n            toast({\n              title: "Connect Solana wallet",\n              description: "Connect Phantom / Solflare / Backpack to trade on Meteora.",\n            });\n            window.dispatchEvent(new CustomEvent("memewarzone:openWalletModal"));\n            return;\n          }\n          if (quote.side === "buy" && bnbBalanceWei != null && quote.amountInRaw > bnbBalanceWei) {\n            throw new Error("Insufficient SOL balance for this Meteora buy.");\n          }\n          if (quote.side === "sell" && tokenBalanceWei != null && quote.amountInRaw > tokenBalanceWei) {\n            throw new Error("Insufficient token balance for this Meteora sell.");\n          }\n          const mint = String(solanaCurve?.mint || campaign.token || campaign.campaign);\n          const { executeSolanaMeteoraSwap } = await import("@/lib/solanaMeteoraTrade");\n          toast({\n            title: quote.side === "buy" ? "Submitting Meteora buy" : "Submitting Meteora sell",\n            description: `Minimum received: ${\n              quote.side === "buy"\n                ? formatTokenFromWei(quote.minimumAmountOutRaw) + " " + tokenData.ticker\n                : formatBnbFromWei(quote.minimumAmountOutRaw)\n            }.`,\n          });\n          const result = await executeSolanaMeteoraSwap({\n            quote,\n            mint,\n            tokenDecimals: Number(solanaCurve?.tokenDecimals ?? 6),\n            walletAddress: trader,\n            poolAddress: rtStats?.dexPool || quote.pool,\n          });\n          toast({\n            title: quote.side === "buy" ? "Meteora buy confirmed" : "Meteora sell confirmed",\n            description: `Tx: ${result.signature.slice(0, 12)}…`,\n          });\n\n          try {\n            const tokenRaw = quote.side === "buy" ? quote.amountOutRaw : quote.amountInRaw;\n            const nativeRaw = quote.side === "buy" ? quote.amountInRaw : quote.amountOutRaw;\n            const decimals = Number(solanaCurve?.tokenDecimals ?? 6);\n            const tokenHuman = Number(ethers.formatUnits(tokenRaw > 0n ? tokenRaw : 1n, decimals));\n            const nativeHuman = Number(ethers.formatUnits(nativeRaw, 9));\n            const point: CurveTradePoint = {\n              type: quote.side,\n              from: trader,\n              to: mint,\n              tokensWei: tokenRaw,\n              nativeWei: nativeRaw,\n              pricePerToken: tokenHuman > 0 ? nativeHuman / tokenHuman : 0,\n              timestamp: Math.floor(Date.now() / 1000),\n              txHash: result.signature,\n              blockNumber: 0,\n              logIndex: SYNTHETIC_LOG_INDEX_MIN + (localTopazTrades.length % 1000),\n            };\n            const storageKey = String(solanaCurve?.campaignAddress || campaign.campaign || mint);\n            setLocalTopazTrades(appendLocalTopazTrade(chainIdForStorage, storageKey, point));\n          } catch (historyError) {\n            console.warn("[TokenDetails] Meteora optimistic trade history", historyError);\n          }\n          setSolanaMeteoraQuote(null);\n          setSolanaBalanceTick((value) => value + 1);\n        } catch (e: any) {\n          console.error("[TokenDetails] Meteora trade failed", e);\n          toast({\n            title: "Meteora trade failed",\n            description: String(e?.message || e || "Transaction failed."),\n            variant: "destructive",\n          });\n        } finally {\n          setTradePending(false);\n        }\n        return;\n      }\n      try {`,
  "replace temporary graduated trade guard",
);

fs.writeFileSync(path, source);
console.log("[meteora-trading-ui-finalizer] asserted TokenDetails transform applied");
