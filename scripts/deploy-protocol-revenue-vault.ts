import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const TESTNET_ROUTER = "0x784b1d330f11ddF98523458321Cad42Be59acBC5";
const DEFAULT_CAP_USD = 10_000n * 10n ** 18n;

async function fetchBnbUsdWad(): Promise<bigint> {
  const override = String(process.env.BNB_USD_PRICE || "").trim();
  if (override) {
    const n = Number(override);
    if (!Number.isFinite(n) || n <= 0) throw new Error("BNB_USD_PRICE must be a positive number");
    return BigInt(Math.round(n * 1e6)) * 10n ** 12n;
  }
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT");
    const json = (await res.json()) as { price?: string };
    const n = Number(json.price);
    if (!Number.isFinite(n) || n <= 0) throw new Error("bad spot");
    return BigInt(Math.round(n * 1e6)) * 10n ** 12n;
  } catch {
    return 600n * 10n ** 18n;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const operator = String(process.env.PROTOCOL_OPERATOR || deployer.address);
  const overflow = String(process.env.PROTOCOL_OVERFLOW || ethers.ZeroAddress);
  const admin = String(process.env.PROTOCOL_VAULT_ADMIN || deployer.address);
  const routerAddr = String(process.env.TREASURY_ROUTER || TESTNET_ROUTER);
  const price = await fetchBnbUsdWad();

  console.log("deployer", deployer.address);
  console.log("admin   ", admin);
  console.log("operator", operator);
  console.log("overflow", overflow);
  console.log("router  ", routerAddr);
  console.log("bnbUsd  ", ethers.formatUnits(price, 18));

  const Factory = await ethers.getContractFactory("ProtocolRevenueVault");
  const vault = await Factory.deploy(admin);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("vault   ", vaultAddr);

  if (admin.toLowerCase() === deployer.address.toLowerCase()) {
    const tx = await vault.setOperatorFill(operator, overflow, DEFAULT_CAP_USD, price);
    await tx.wait();
    console.log("setOperatorFill ok");
  } else {
    console.log("skip setOperatorFill — deployer is not vault admin");
  }

  const router = await ethers.getContractAt(
    ["function admin() view returns (address)", "function protocolRevenueVault() view returns (address)", "function setProtocolRevenueVault(address)"],
    routerAddr,
  );
  const routerAdmin = await router.admin();
  const current = await router.protocolRevenueVault();
  console.log("router.admin", routerAdmin);
  console.log("router.protocolRevenueVault (current)", current);

  if (routerAdmin.toLowerCase() === deployer.address.toLowerCase()) {
    const tx = await router.setProtocolRevenueVault(vaultAddr);
    await tx.wait();
    console.log("router.setProtocolRevenueVault ok");
  } else {
    const data = router.interface.encodeFunctionData("setProtocolRevenueVault", [vaultAddr]);
    console.log("ROUTER POINTING STILL REQUIRED from admin", routerAdmin);
    console.log("to  ", routerAddr);
    console.log("data", data);
  }

  const out = {
    network: "bscTestnet",
    chainId: 97,
    vault: vaultAddr,
    admin,
    operator,
    overflow,
    operatorFillCapUsd: DEFAULT_CAP_USD.toString(),
    nativeUsdPrice: price.toString(),
    router: routerAddr,
    routerAdmin,
    routerUpdated: routerAdmin.toLowerCase() === deployer.address.toLowerCase(),
    previousVault: current,
  };
  const dest = path.join("deployments", "bscTestnet.protocol-revenue-vault.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("wrote", dest);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
