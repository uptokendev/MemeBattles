import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Contract, ethers } from "ethers";
import LaunchFactoryArtifact from "./abi/LaunchFactory.json";
import LaunchCampaignArtifact from "./abi/LaunchCampaign.json";
import LaunchTokenArtifact from "./abi/LaunchToken.json";
import { useWallet } from "./hooks/useWallet";
import "./App.css";

type CampaignInfo = {
  id: number;
  campaign: string;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  logoURI: string;
  xAccount: string;
  website: string;
  extraLink: string;
  createdAt: number;
};

type CampaignMetrics = {
  sold: bigint;
  curveSupply: bigint;
  liquiditySupply: bigint;
  creatorReserve: bigint;
  launched: boolean;
  basePrice: bigint;
  priceSlope: bigint;
  graduationTarget: bigint;
  liquidityBps: bigint;
  protocolFeeBps: bigint;
  price: bigint;
  balance: bigint;
  owner: string;
};

type FactoryContract = Contract & {
  createCampaign: (request: any) => Promise<any>;
  campaignsCount: () => Promise<bigint>;
  getCampaignPage: (offset: number, limit: number) => Promise<any[]>;
};

type CampaignContract = Contract & {
  sold: () => Promise<bigint>;
  curveSupply: () => Promise<bigint>;
  liquiditySupply: () => Promise<bigint>;
  creatorReserve: () => Promise<bigint>;
  launched: () => Promise<boolean>;
  basePrice: () => Promise<bigint>;
  priceSlope: () => Promise<bigint>;
  graduationTarget: () => Promise<bigint>;
  liquidityBps: () => Promise<bigint>;
  protocolFeeBps: () => Promise<bigint>;
  currentPrice: () => Promise<bigint>;
  owner: () => Promise<string>;
  quoteBuyExactTokens: (amount: bigint) => Promise<bigint>;
  quoteSellExactTokens: (amount: bigint) => Promise<bigint>;
  buyExactTokens: (
    amount: bigint,
    maxCost: bigint,
    overrides?: Record<string, unknown>
  ) => Promise<any>;
  sellExactTokens: (amount: bigint, minAmount: bigint) => Promise<any>;
  finalize: (minTokens: bigint, minBnb: bigint) => Promise<any>;
};

const FACTORY_ABI = LaunchFactoryArtifact.abi as ethers.InterfaceAbi;
const CAMPAIGN_ABI = LaunchCampaignArtifact.abi as ethers.InterfaceAbi;
const TOKEN_ABI = LaunchTokenArtifact.abi as ethers.InterfaceAbi;
const DEFAULT_FACTORY = import.meta.env.VITE_FACTORY_ADDRESS ?? "";

const formatNumber = (value?: bigint, precision = 4) => {
  if (value === undefined || value === null) return "-";
  const formatted = ethers.formatEther(value);
  const [whole, fraction = ""] = formatted.split(".");
  if (!fraction) {
    return whole;
  }
  return `${whole}.${fraction.slice(0, precision)}`;
};

const shortAddress = (address?: string) => {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const toBps = (input: string) => {
  const numeric = Number(input);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.floor(numeric * 100));
};

const parseAmount = (value: string) => {
  if (!value) return 0n;
  try {
    return ethers.parseUnits(value, 18);
  } catch {
    return null;
  }
};

const parseWei = (value: string) => {
  if (!value) return 0n;
  try {
    return ethers.parseEther(value);
  } catch {
    return null;
  }
};

function App() {
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const wallet = useWallet();
  const [factoryAddress, setFactoryAddress] = useState(DEFAULT_FACTORY);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [selected, setSelected] = useState<CampaignInfo | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [createForm, setCreateForm] = useState({
    name: "",
    symbol: "",
    logoURI: "",
    xAccount: "",
    website: "",
    extraLink: "",
    basePrice: "",
    priceSlope: "",
    graduationTarget: "",
    lpReceiver: "",
  });
  const [logoPreview, setLogoPreview] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoValid, setLogoValid] = useState(false);

  const [buyInput, setBuyInput] = useState("");
  const [buyQuote, setBuyQuote] = useState<bigint | null>(null);
  const [buySlippage, setBuySlippage] = useState("1");

  const [sellInput, setSellInput] = useState("");
  const [sellQuote, setSellQuote] = useState<bigint | null>(null);
  const [sellSlippage, setSellSlippage] = useState("1");

  const [finalizeMinTokens, setFinalizeMinTokens] = useState("");
  const [finalizeMinBnb, setFinalizeMinBnb] = useState("");

  const factoryContract = useMemo<FactoryContract | null>(() => {
    if (!factoryAddress || !wallet.provider) return null;
    try {
      return new Contract(
        factoryAddress,
        FACTORY_ABI,
        wallet.signer ?? wallet.provider
      ) as FactoryContract;
    } catch {
      return null;
    }
  }, [factoryAddress, wallet.provider, wallet.signer]);

  const campaignContract = useMemo<CampaignContract | null>(() => {
    if (!selected || !wallet.provider) return null;
    return new Contract(
      selected.campaign,
      CAMPAIGN_ABI,
      wallet.signer ?? wallet.provider
    ) as CampaignContract;
  }, [selected, wallet.provider, wallet.signer]);

  const loadCampaigns = useCallback(async () => {
    if (!factoryContract) {
      setCampaigns([]);
      return;
    }
    try {
      const total: bigint = await factoryContract.campaignsCount();
      if (total === 0n) {
        setCampaigns([]);
        setSelected(null);
        return;
      }
      const totalNumber = Number(total);
      const limit = Math.min(totalNumber, 25);
      const offset = Math.max(0, totalNumber - limit);
      const page = await factoryContract.getCampaignPage(offset, limit);
      const parsed: CampaignInfo[] = page.map(
        (raw: any, index: number): CampaignInfo => ({
          id: offset + index,
          campaign: raw.campaign,
          token: raw.token,
          creator: raw.creator,
          name: raw.name,
          symbol: raw.symbol,
          logoURI: raw.logoURI,
          xAccount: raw.xAccount,
          website: raw.website,
          extraLink: raw.extraLink,
          createdAt: Number(raw.createdAt),
        })
      );
      setCampaigns(parsed.slice().reverse());
      if (parsed.length > 0 && !selected) {
        setSelected(parsed[parsed.length - 1]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load campaigns. Check factory address.");
    }
  }, [factoryContract, selected]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const loadMetrics = useCallback(async () => {
    if (!campaignContract || !wallet.provider || !selected) {
      setMetrics(null);
      return;
    }
    try {
      const [
        sold,
        curveSupply,
        liquiditySupply,
        creatorReserve,
        launched,
        basePrice,
        priceSlope,
        graduationTarget,
        liquidityBps,
        protocolFeeBps,
        price,
        owner,
      ] = await Promise.all([
        campaignContract.sold(),
        campaignContract.curveSupply(),
        campaignContract.liquiditySupply(),
        campaignContract.creatorReserve(),
        campaignContract.launched(),
        campaignContract.basePrice(),
        campaignContract.priceSlope(),
        campaignContract.graduationTarget(),
        campaignContract.liquidityBps(),
        campaignContract.protocolFeeBps(),
        campaignContract.currentPrice(),
        campaignContract.owner(),
      ]);
      const balance = await wallet.provider.getBalance(selected.campaign);
      setMetrics({
        sold,
        curveSupply,
        liquiditySupply,
        creatorReserve,
        launched,
        basePrice,
        priceSlope,
        graduationTarget,
        liquidityBps,
        protocolFeeBps,
        price,
        balance,
        owner,
      });
    } catch (err) {
      console.error(err);
      setError("Unable to load campaign details.");
    }
  }, [campaignContract, selected, wallet.provider]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  useEffect(() => {
    if (!campaignContract || !buyInput) {
      setBuyQuote(null);
      return;
    }
    const parsed = parseAmount(buyInput);
    if (!parsed || parsed <= 0) {
      setBuyQuote(null);
      return;
    }
    campaignContract
      .quoteBuyExactTokens(parsed)
      .then(setBuyQuote)
      .catch(() => setBuyQuote(null));
  }, [campaignContract, buyInput]);

  useEffect(() => {
    if (!campaignContract || !sellInput) {
      setSellQuote(null);
      return;
    }
    const parsed = parseAmount(sellInput);
    if (!parsed || parsed <= 0) {
      setSellQuote(null);
      return;
    }
    campaignContract
      .quoteSellExactTokens(parsed)
      .then(setSellQuote)
      .catch(() => setSellQuote(null));
  }, [campaignContract, sellInput]);

  const handleCreateChange = (field: keyof typeof createForm, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = (file?: File | null) => {
    setLogoError("");
    setLogoValid(false);
    if (!file) {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
      setLogoPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.width !== 500 || img.height !== 500) {
        setLogoError("Logo must be exactly 500px by 500px.");
        URL.revokeObjectURL(previewUrl);
        setLogoPreview("");
        return;
      }
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
      setLogoPreview(previewUrl);
      setLogoValid(true);
    };
    img.onerror = () => {
      setLogoError("Unable to read the logo. Use a 500x500 PNG or JPG.");
      URL.revokeObjectURL(previewUrl);
      setLogoPreview("");
    };
    img.src = previewUrl;
  };

  const describeError = (err: unknown) => {
    if (err && typeof err === "object") {
      const asAny = err as any;
      return (
        asAny?.info?.error?.message ||
        asAny?.shortMessage ||
        asAny?.message ||
        "Unexpected error"
      );
    }
    return "Unexpected error";
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!factoryContract || !wallet.signer) {
      setError("Connect your wallet to deploy a campaign.");
      return;
    }
    const logoUri = createForm.logoURI.trim();
    if (!logoValid || !logoUri) {
      setError("Upload a 500x500 logo and provide the logo URL to store on-chain.");
      return;
    }
    try {
      setStatus("Sending transaction...");
      setError("");
      const writer = factoryContract.connect(wallet.signer) as FactoryContract;
      const tx = await writer.createCampaign({
        name: createForm.name,
        symbol: createForm.symbol,
        logoURI: logoUri,
        xAccount: createForm.xAccount.trim(),
        website: createForm.website.trim(),
        extraLink: createForm.extraLink.trim(),
        basePrice: parseWei(createForm.basePrice) ?? 0n,
        priceSlope: parseWei(createForm.priceSlope) ?? 0n,
        graduationTarget: parseWei(createForm.graduationTarget) ?? 0n,
        lpReceiver: createForm.lpReceiver || ethers.ZeroAddress,
      });
      await tx.wait();
      setStatus("Campaign created successfully.");
      setCreateForm({
        name: "",
        symbol: "",
        logoURI: "",
        xAccount: "",
        website: "",
        extraLink: "",
        basePrice: "",
        priceSlope: "",
        graduationTarget: "",
        lpReceiver: "",
      });
      await loadCampaigns();
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
      setLogoPreview("");
      setLogoValid(false);
      setLogoError("");
      await loadCampaigns();
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const handleBuy = async (event: FormEvent) => {
    event.preventDefault();
    if (!campaignContract || !wallet.signer || !buyQuote || !selected) {
      setError("Unable to process buy request.");
      return;
    }
    const amount = parseAmount(buyInput);
    if (!amount || amount <= 0) {
      setError("Enter a valid token amount.");
      return;
    }
    try {
      setStatus("Submitting buy order...");
      setError("");
      const slippageBps = toBps(buySlippage);
      const premium = (buyQuote * BigInt(slippageBps)) / 10000n;
      const maxCost = buyQuote + premium;
      const writer = campaignContract.connect(wallet.signer) as CampaignContract;
      const tx = await writer.buyExactTokens(amount, maxCost, { value: maxCost });
      await tx.wait();
      setStatus("Tokens purchased.");
      setBuyInput("");
      await Promise.all([loadMetrics(), loadCampaigns()]);
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const handleSell = async (event: FormEvent) => {
    event.preventDefault();
    if (!campaignContract || !wallet.signer || !sellQuote || !selected) {
      setError("Unable to process sell request.");
      return;
    }
    const amount = parseAmount(sellInput);
    if (!amount || amount <= 0) {
      setError("Enter a valid token amount.");
      return;
    }
    try {
      setStatus("Submitting sell order...");
      setError("");
      const signer = wallet.signer;
      const tokenContract = new Contract(selected.token, TOKEN_ABI, signer);
      const approveTx = await tokenContract.approve(selected.campaign, amount);
      await approveTx.wait();
      const slippageBps = toBps(sellSlippage);
      const discount = (sellQuote * BigInt(slippageBps)) / 10000n;
      const minAmount = sellQuote > discount ? sellQuote - discount : 0n;
      const writer = campaignContract.connect(wallet.signer) as CampaignContract;
      const tx = await writer.sellExactTokens(amount, minAmount);
      await tx.wait();
      setSellInput("");
      setStatus("Tokens sold back to curve.");
      await Promise.all([loadMetrics(), loadCampaigns()]);
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const handleFinalize = async (event: FormEvent) => {
    event.preventDefault();
    if (!campaignContract || !wallet.signer) {
      setError("Connect your wallet to finalize.");
      return;
    }
    const minTokens = parseAmount(finalizeMinTokens);
    const minBnb = parseWei(finalizeMinBnb);
    if (minTokens === null || minBnb === null) {
      setError("Invalid min amounts.");
      return;
    }
    try {
      setStatus("Finalizing campaign...");
      setError("");
      const writer = campaignContract.connect(wallet.signer) as CampaignContract;
      const tx = await writer.finalize(minTokens ?? 0n, minBnb ?? 0n);
      await tx.wait();
      setStatus("Campaign finalized.");
      setFinalizeMinTokens("");
      setFinalizeMinBnb("");
      await Promise.all([loadMetrics(), loadCampaigns()]);
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const currentCampaignStatus = selected
    ? `${selected.name} - ${selected.symbol}`
    : "Select a campaign";

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>LaunchIt - Pump.fun for BSC</h1>
          <p>Deploy bonding-curve launches that auto-graduate to PancakeSwap.</p>
        </div>
        <div className="wallet-panel">
  <div>
    <span className="label">Network</span>
    <strong>{wallet.chainId ?? "Unknown"}</strong>
  </div>
  <div>
    <span className="label">Account</span>
    <strong>{wallet.account ? shortAddress(wallet.account) : "Not Connected"}</strong>
  </div>

  {!wallet.isConnected ? (
    <button
      onClick={wallet.connect}
      disabled={wallet.connecting}
    >
      {wallet.connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  ) : (
    <div className="wallet-menu">
      <button
        type="button"
        onClick={() => setWalletMenuOpen((open) => !open)}
      >
        Connected ▾
      </button>
      {walletMenuOpen && (
        <div className="wallet-dropdown">
          <button
            type="button"
            onClick={() => {
              wallet.disconnect();
              setWalletMenuOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )}
</div>
      </header>

      {status && <div className="banner success">{status}</div>}
      {error && (
        <div className="banner danger">
          {error}
          <button onClick={() => setError("")}>x</button>
        </div>
      )}

      <section className="card">
        <h2>Factory Configuration</h2>
        <label htmlFor="factory-address">Factory address</label>
        <div className="factory-row">
          <input
            id="factory-address"
            value={factoryAddress}
            onChange={(event) => setFactoryAddress(event.target.value)}
            placeholder="0x..."
          />
          <button onClick={loadCampaigns}>Refresh</button>
        </div>
        <p className="hint">
          Deploy the smart contracts, paste the factory address here, and use the UI
          to create and test campaigns. All values are denominated in BNB (18 decimals).
        </p>
      </section>

      <section className="grid two">
        <form className="card" onSubmit={handleCreate}>
          <div className="card-header">
            <h2>Create Campaign</h2>
            <span>Deploy tokens and bonding curves directly from the factory.</span>
          </div>
          <label>Name</label>
          <input
            value={createForm.name}
            onChange={(event) => handleCreateChange("name", event.target.value)}
            required
            placeholder="Memecoin"
          />
          <label>Symbol</label>
          <input
            value={createForm.symbol}
            onChange={(event) => handleCreateChange("symbol", event.target.value)}
            required
            placeholder="MEME"
          />
          <label>Logo Upload (500x500 required)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => handleLogoUpload(event.target.files?.[0])}
            required
          />
          {logoPreview && (
            <div className="logo-preview">
              <img src={logoPreview} alt="Logo preview" />
              <span>500x500 confirmed</span>
            </div>
          )}
          {logoError && <p className="hint error">{logoError}</p>}
          <label>Logo URL (stored on-chain)</label>
          <input
            value={createForm.logoURI}
            onChange={(event) => handleCreateChange("logoURI", event.target.value)}
            required
            placeholder="https://..."
          />
          <div className="grid two">
            <div>
              <label>X / Twitter (optional)</label>
              <input
                value={createForm.xAccount}
                onChange={(event) =>
                  handleCreateChange("xAccount", event.target.value)
                }
                placeholder="https://x.com/username"
              />
            </div>
            <div>
              <label>Website (optional)</label>
              <input
                value={createForm.website}
                onChange={(event) =>
                  handleCreateChange("website", event.target.value)
                }
                placeholder="https://example.com"
              />
            </div>
          </div>
          <label>Third Link (optional)</label>
          <input
            value={createForm.extraLink}
            onChange={(event) => handleCreateChange("extraLink", event.target.value)}
            placeholder="Discord, Telegram, or other link"
          />
          <div className="grid two">
            <div>
              <label>Base Price (BNB)</label>
              <input
                value={createForm.basePrice}
                placeholder="0.000001"
                onChange={(event) =>
                  handleCreateChange("basePrice", event.target.value)
                }
              />
            </div>
            <div>
              <label>Price Slope (BNB/token)</label>
              <input
                value={createForm.priceSlope}
                placeholder="0.0000000005"
                onChange={(event) =>
                  handleCreateChange("priceSlope", event.target.value)
                }
              />
            </div>
          </div>
          <div className="grid two">
            <div>
              <label>Graduation Target (BNB)</label>
              <input
                value={createForm.graduationTarget}
                placeholder="50"
                onChange={(event) =>
                  handleCreateChange("graduationTarget", event.target.value)
                }
              />
            </div>
            <div>
              <label>LP Receiver (optional)</label>
              <input
                value={createForm.lpReceiver}
                placeholder="0x..."
                onChange={(event) =>
                  handleCreateChange("lpReceiver", event.target.value)
                }
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={!wallet.isConnected || !logoValid || !createForm.logoURI.trim()}
          >
            Deploy Campaign
          </button>
        </form>

        <div className="card">
          <div className="card-header">
            <h2>Available Campaigns</h2>
            <span>Showing the most recent launches.</span>
          </div>
          <div className="campaign-list">
            {campaigns.length === 0 && <p>No campaigns found.</p>}
            {campaigns.map((campaign) => (
              <button
                key={campaign.campaign}
                className={`campaign ${selected?.campaign === campaign.campaign ? "active" : ""}`}
                type="button"
                onClick={() => setSelected(campaign)}
              >
                <strong>
                  {campaign.name} - {campaign.symbol}
                </strong>
                <span>{shortAddress(campaign.campaign)}</span>
                <span>Creator: {shortAddress(campaign.creator)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>{currentCampaignStatus}</h2>
        </div>
        {selected && metrics ? (
          <>
            <div className="metadata-row">
              {selected.logoURI && (
                <div className="logo-card">
                  <img
                    src={selected.logoURI}
                    alt={`${selected.name} logo`}
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                  <span>Logo</span>
                </div>
              )}
              <div className="link-stack">
                <div className="link-row">
                  <span>Logo Link</span>
                  <a href={selected.logoURI} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
                {selected.xAccount && (
                  <div className="link-row">
                    <span>X</span>
                    <a href={selected.xAccount} target="_blank" rel="noreferrer">
                      {selected.xAccount}
                    </a>
                  </div>
                )}
                {selected.website && (
                  <div className="link-row">
                    <span>Website</span>
                    <a href={selected.website} target="_blank" rel="noreferrer">
                      {selected.website}
                    </a>
                  </div>
                )}
                {selected.extraLink && (
                  <div className="link-row">
                    <span>Extra</span>
                    <a href={selected.extraLink} target="_blank" rel="noreferrer">
                      {selected.extraLink}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="stats-grid">
              <div>
                <span className="label">Status</span>
                <strong>{metrics.launched ? "Graduated" : "Curve Live"}</strong>
              </div>
              <div>
                <span className="label">Owner</span>
                <strong>{shortAddress(metrics.owner)}</strong>
              </div>
              <div>
                <span className="label">Price</span>
                <strong>{formatNumber(metrics.price)} BNB/token</strong>
              </div>
              <div>
                <span className="label">Curve Balance</span>
                <strong>{formatNumber(metrics.balance)} BNB</strong>
              </div>
              <div>
                <span className="label">Sold</span>
                <strong>
                  {formatNumber(metrics.sold)} / {formatNumber(metrics.curveSupply)}
                </strong>
              </div>
              <div>
                <span className="label">Graduation Target</span>
                <strong>{formatNumber(metrics.graduationTarget)} BNB</strong>
              </div>
            </div>
            <div className="grid three">
              <form onSubmit={handleBuy}>
                <h3>Buy Tokens</h3>
                <label>Amount</label>
                <input
                  value={buyInput}
                  placeholder="1000"
                  onChange={(event) => setBuyInput(event.target.value)}
                />
                <label>Slippage (%)</label>
                <input
                  value={buySlippage}
                  onChange={(event) => setBuySlippage(event.target.value)}
                />
                <p className="hint">
                  Quote: {buyQuote ? `${formatNumber(buyQuote)} BNB` : "-"}
                </p>
                <button type="submit" disabled={!wallet.isConnected || !buyQuote}>
                  Buy
                </button>
              </form>

              <form onSubmit={handleSell}>
                <h3>Sell Tokens</h3>
                <label>Amount</label>
                <input
                  value={sellInput}
                  placeholder="500"
                  onChange={(event) => setSellInput(event.target.value)}
                />
                <label>Slippage (%)</label>
                <input
                  value={sellSlippage}
                  onChange={(event) => setSellSlippage(event.target.value)}
                />
                <p className="hint">
                  Quote: {sellQuote ? `${formatNumber(sellQuote)} BNB` : "-"}
                </p>
                <button type="submit" disabled={!wallet.isConnected || !sellQuote}>
                  Sell Back
                </button>
              </form>

              <form onSubmit={handleFinalize}>
                <h3>Finalize</h3>
                <label>Min LP Tokens (optional)</label>
                <input
                  value={finalizeMinTokens}
                  onChange={(event) => setFinalizeMinTokens(event.target.value)}
                  placeholder="0"
                />
                <label>Min LP BNB (optional)</label>
                <input
                  value={finalizeMinBnb}
                  onChange={(event) => setFinalizeMinBnb(event.target.value)}
                  placeholder="0"
                />
                <p className="hint">
                  Anyone can finalize once the graduation target or curve cap is hit.
                </p>
                <button type="submit" disabled={!wallet.isConnected}>
                  Finalize Campaign
                </button>
              </form>
            </div>
          </>
        ) : (
          <p>Select a campaign to inspect bonding curve metrics.</p>
        )}
      </section>
    </div>
  );
}

export default App;
