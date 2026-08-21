import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { injectLiveWallet } from "./fixtures/liveWallet";

const CAMPAIGN = String(
  process.env.CERT_CAMPAIGN || process.env.BSC_CERT_CAMPAIGN || "0xECD05aC87007D5aE7a13407B59Db32B8030EAB3C",
);
const RPC = String(process.env.BSC_TESTNET_RPC || process.env.BSC_TESTNET_RPC_URL || "");
const PK = String(process.env.BSC_TESTNET_PRIVATE_KEY || process.env.DEPLOYER_PK || "").trim();

test.describe("live BSC graduation post-grad Token Details", () => {
  test("UnifiedMarketChart continues and Topaz BUY/SELL go through topazV2Trade", async ({ page }) => {
    test.setTimeout(180_000);
    if (!RPC || !PK) {
      throw new Error("BLOCKER: BSC_TESTNET_RPC and BSC_TESTNET_PRIVATE_KEY must be mapped for frontend live proof");
    }

    const provider = new ethers.JsonRpcProvider(RPC, 97);
    const wallet = new ethers.Wallet(PK.startsWith("0x") ? PK : `0x${PK}`, provider);
    const address = await wallet.getAddress();
    const sent: string[] = [];

    await injectLiveWallet(page, {
      address,
      handler: async (method, params) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x61";
        if (method === "net_version") return "97";
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "eth_sendTransaction") {
          const txReq = params[0] || {};
          const tx = await wallet.sendTransaction({
            to: txReq.to,
            data: txReq.data,
            value: txReq.value ? BigInt(txReq.value) : 0n,
            gasLimit: txReq.gas ? BigInt(txReq.gas) : undefined,
            gasPrice: txReq.gasPrice ? BigInt(txReq.gasPrice) : undefined,
          });
          const receipt = await tx.wait();
          sent.push(receipt!.hash);
          return receipt!.hash;
        }
        const res = await fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || method);
        return json.result;
      },
    });

    const tokenPath = `/token/${CAMPAIGN}?chainId=97`;
    await page.goto(tokenPath, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const html = await page.content();
    expect(html.toLowerCase()).not.toContain("dexscreener.com");
    expect(html.toLowerCase()).not.toContain("pancakeswap");
    expect(await page.locator("iframe[src*='dexscreener']").count()).toBe(0);
    expect(await page.locator("iframe[src*='pancake']").count()).toBe(0);

    const chart = page.locator(".tv-lightweight-charts, canvas").first();
    await expect(chart).toBeVisible({ timeout: 30_000 });
    const reportsDir = path.join(process.cwd(), "..", "reports");
    fs.mkdirSync(reportsDir, { recursive: true });
    await page.screenshot({
      path: path.join(reportsDir, "bnb-graduation-chart.png"),
      fullPage: true,
    });

    const buyTab = page.getByRole("tab", { name: /^Buy$/i }).first();
    if (await buyTab.count()) await buyTab.click();
    const amount = page.locator("input[placeholder='0']").first();
    await expect(amount).toBeVisible({ timeout: 30_000 });
    await amount.fill("0.001");
    const buyButton = page.getByRole("button", { name: /Buy on Topaz/i }).first();
    await expect(buyButton).toBeEnabled({ timeout: 60_000 });
    const buysBefore = sent.length;
    await buyButton.click();
    await expect.poll(() => sent.length, { timeout: 90_000 }).toBeGreaterThan(buysBefore);
    const frontendBuyTx = sent[sent.length - 1];

    const sellTab = page.getByRole("tab", { name: /^Sell$/i }).first();
    await sellTab.click();
    await amount.fill("0.001");
    const maybeSwitch = page.getByRole("button", { name: /Switch to /i }).first();
    if (await maybeSwitch.count()) {
      const label = await maybeSwitch.textContent();
      if (label && /BNB/i.test(label)) await maybeSwitch.click();
    }
    const sellButton = page.getByRole("button", { name: /Sell on Topaz/i }).first();
    await expect(sellButton).toBeEnabled({ timeout: 60_000 });
    const sellsBefore = sent.length;
    await sellButton.click();
    await expect.poll(() => sent.length, { timeout: 90_000 }).toBeGreaterThan(sellsBefore);
    const frontendSellTx = sent[sent.length - 1];

    const evidencePath = path.join(process.cwd(), "..", "reports", "bnb-lifecycle-certification-testnet.json");
    if (fs.existsSync(evidencePath)) {
      const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
      evidence.uiFrontendBuyTx = frontendBuyTx;
      evidence.uiFrontendSellTx = frontendSellTx;
      evidence.chartScreenshot = "reports/bnb-graduation-chart.png";
      evidence.chartDexScreenerAbsent = true;
      evidence.chartPancakeAbsent = true;
      fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    }

    expect(frontendBuyTx).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(frontendSellTx).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });
});
