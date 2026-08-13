import fs from "node:fs";

const tokenDetailsPath = "frontend/src/pages/TokenDetails.tsx";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

const currentTopazBlock = `  const isTopazTradingActive = isSolanaPage
    ? false
    : onChainLaunched ||
      contractGraduated ||
      (verifiedMarketStage === "TOPAZ_ACTIVE" &&
        (Boolean(unifiedMarket.state?.tradingEnabled) || Boolean(unifiedMarket.state?.pairAddress || onChainPair)));`;

const compatibilityBlock = `  const isTopazTradingActive =
    !isSolanaPage &&
    Boolean(campaign?.campaign && campaign?.token) &&
    (verifiedMarketStage === "TOPAZ_ACTIVE" || contractGraduated);`;

let source = fs.readFileSync(tokenDetailsPath, "utf8");
source = replaceOnce(
  source,
  currentTopazBlock,
  compatibilityBlock,
  "current Topaz stage compatibility",
);
fs.writeFileSync(tokenDetailsPath, source);

await import("./finalize-graduation-realtime-ui.mjs");

const v1FinalBlock = `${compatibilityBlock}
  const [solanaGraduationTransitionAt, setSolanaGraduationTransitionAt] = useState<number | null>(null);
  const previousSolanaGraduatedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isSolanaPage) return;
    const previous = previousSolanaGraduatedRef.current;
    if (previous === false && contractGraduated) {
      setSolanaGraduationTransitionAt(Date.now());
    }
    previousSolanaGraduatedRef.current = contractGraduated;
  }, [isSolanaPage, contractGraduated]);`;

const desiredFinalBlock = `${currentTopazBlock}
  const [solanaGraduationTransitionAt, setSolanaGraduationTransitionAt] = useState<number | null>(null);
  const previousSolanaGraduatedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isSolanaPage) return;
    const previous = previousSolanaGraduatedRef.current;
    if (previous === false && contractGraduated) {
      setSolanaGraduationTransitionAt(Date.now());
    }
    previousSolanaGraduatedRef.current = contractGraduated;
  }, [isSolanaPage, contractGraduated]);`;

source = fs.readFileSync(tokenDetailsPath, "utf8");
source = replaceOnce(
  source,
  v1FinalBlock,
  desiredFinalBlock,
  "restore current Topaz stage logic",
);
fs.writeFileSync(tokenDetailsPath, source);
console.log("[graduation-realtime-ui-v2] current Topaz stage behavior preserved");
