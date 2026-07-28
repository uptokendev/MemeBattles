import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

const TESTNET_CHAIN_ID = 97n;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function rawEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function requireAddress(label: string, value: string): string {
  if (!ADDRESS_RE.test(value || "")) {
    throw new Error(`${label}: missing or invalid address: ${value || "<empty>"}`);
  }
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new Error(`${label}: zero address is not allowed.`);
  return address;
}

function loadStagedDeployment() {
  const file = rawEnv("DEPLOYMENT_FILE")
    ? path.resolve(rawEnv("DEPLOYMENT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.treasury-v2-staged.json`);
  if (!fs.existsSync(file)) throw new Error(`TreasuryRouterV2 staged deployment not found: ${file}`);
  return { file, deployment: JSON.parse(fs.readFileSync(file, "utf8")) };
}

async function requireContract(label: string, address: string) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} ${address} has no contract code on ${network.name}.`);
}

function assertExpectedOrZero(label: string, current: string, expected: string) {
  const currentAddress = ethers.getAddress(current);
  if (currentAddress !== ethers.ZeroAddress && currentAddress.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label}: refusing to overwrite unexpected value ${currentAddress}; expected ${expected} or zero.`);
  }
}

type SafeTransaction = {
  to: string;
  value: string;
  data: string;
  contractMethod: {
    inputs: Array<{ internalType: string; name: string; type: string }>;
    name: string;
    payable: boolean;
  };
  contractInputsValues: Record<string, string>;
};

function addressCall(
  router: string,
  iface: ethers.Interface,
  method: string,
  inputName: string,
  value: string,
): SafeTransaction {
  return {
    to: router,
    value: "0",
    data: iface.encodeFunctionData(method, [value]),
    contractMethod: {
      inputs: [{ internalType: "address", name: inputName, type: "address" }],
      name: method,
      payable: false,
    },
    contractInputsValues: { [inputName]: value },
  };
}

function addressBoolCall(
  router: string,
  iface: ethers.Interface,
  method: string,
  addressName: string,
  addressValue: string,
  boolName: string,
  boolValue: boolean,
): SafeTransaction {
  return {
    to: router,
    value: "0",
    data: iface.encodeFunctionData(method, [addressValue, boolValue]),
    contractMethod: {
      inputs: [
        { internalType: "address", name: addressName, type: "address" },
        { internalType: "bool", name: boolName, type: "bool" },
      ],
      name: method,
      payable: false,
    },
    contractInputsValues: {
      [addressName]: addressValue,
      [boolName]: String(boolValue),
    },
  };
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`Safe batch export is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: stagedFile, deployment } = loadStagedDeployment();
  if (deployment.treasuryRouterVersion !== "v2") {
    throw new Error("Staged deployment does not declare TreasuryRouterV2.");
  }

  const treasurySafe = requireAddress("Treasury Safe", deployment.treasurySafe);
  const router = requireAddress(
    "TreasuryRouterV2",
    deployment.contracts?.TreasuryRouterV2 || deployment.contracts?.TreasuryRouter,
  );
  const recruiterRewardsVault = requireAddress(
    "RecruiterRewardsVault",
    deployment.contracts?.RecruiterRewardsVault,
  );
  const communityRewardsVault = requireAddress(
    "CommunityRewardsVaultV2",
    deployment.contracts?.CommunityRewardsVaultV2 || deployment.contracts?.CommunityRewardsVault,
  );
  const protocolRevenueVault = requireAddress(
    "ProtocolRevenueVault",
    deployment.contracts?.ProtocolRevenueVault,
  );
  const legacyLocker = requireAddress(
    "Legacy PermanentLpLocker",
    deployment.treasuryV2Migration?.reusedContracts?.oldPermanentLpLocker || deployment.contracts?.PermanentLpLocker,
  );

  for (const [label, address] of [
    ["Treasury Safe", treasurySafe],
    ["TreasuryRouterV2", router],
    ["RecruiterRewardsVault", recruiterRewardsVault],
    ["CommunityRewardsVaultV2", communityRewardsVault],
    ["ProtocolRevenueVault", protocolRevenueVault],
    ["Legacy PermanentLpLocker", legacyLocker],
  ] as Array<[string, string]>) {
    await requireContract(label, address);
  }

  const abi = [
    "function admin() view returns (address)",
    "function recruiterRewardsVault() view returns (address)",
    "function communityRewardsVault() view returns (address)",
    "function protocolRevenueVault() view returns (address)",
    "function authorizedLpLocker(address) view returns (bool)",
    "function permanentLpLocker() view returns (address)",
    "function setRecruiterRewardsVault(address newVault)",
    "function setCommunityRewardsVault(address newVault)",
    "function setProtocolRevenueVault(address newVault)",
    "function setAuthorizedLpLocker(address locker, bool allowed)",
    "function setPrimaryLpLocker(address newLocker)",
  ];
  const iface = new ethers.Interface(abi);
  const treasury = new ethers.Contract(router, abi, ethers.provider);

  const admin = ethers.getAddress(await treasury.admin());
  if (admin.toLowerCase() !== treasurySafe.toLowerCase()) {
    throw new Error(`TreasuryRouterV2.admin mismatch: expected Safe ${treasurySafe}, got ${admin}.`);
  }

  const currentRecruiter = ethers.getAddress(await treasury.recruiterRewardsVault());
  const currentCommunity = ethers.getAddress(await treasury.communityRewardsVault());
  const currentProtocol = ethers.getAddress(await treasury.protocolRevenueVault());
  const currentPrimaryLocker = ethers.getAddress(await treasury.permanentLpLocker());
  const legacyLockerAuthorized = Boolean(await treasury.authorizedLpLocker(legacyLocker));

  assertExpectedOrZero("TreasuryRouterV2.recruiterRewardsVault", currentRecruiter, recruiterRewardsVault);
  assertExpectedOrZero("TreasuryRouterV2.communityRewardsVault", currentCommunity, communityRewardsVault);
  assertExpectedOrZero("TreasuryRouterV2.protocolRevenueVault", currentProtocol, protocolRevenueVault);
  assertExpectedOrZero("TreasuryRouterV2.permanentLpLocker", currentPrimaryLocker, legacyLocker);

  const transactions: SafeTransaction[] = [];
  if (currentRecruiter === ethers.ZeroAddress) {
    transactions.push(addressCall(router, iface, "setRecruiterRewardsVault", "newVault", recruiterRewardsVault));
  }
  if (currentCommunity === ethers.ZeroAddress) {
    transactions.push(addressCall(router, iface, "setCommunityRewardsVault", "newVault", communityRewardsVault));
  }
  if (currentProtocol === ethers.ZeroAddress) {
    transactions.push(addressCall(router, iface, "setProtocolRevenueVault", "newVault", protocolRevenueVault));
  }
  if (!legacyLockerAuthorized) {
    transactions.push(
      addressBoolCall(router, iface, "setAuthorizedLpLocker", "locker", legacyLocker, "allowed", true),
    );
  }
  if (currentPrimaryLocker === ethers.ZeroAddress) {
    transactions.push(addressCall(router, iface, "setPrimaryLpLocker", "newLocker", legacyLocker));
  }

  const outputFile = rawEnv("SAFE_BATCH_OUTPUT_FILE")
    ? path.resolve(rawEnv("SAFE_BATCH_OUTPUT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.treasury-v2.safe-batch.json`);

  const batch = {
    version: "1.0",
    chainId: net.chainId.toString(),
    createdAt: Date.now(),
    meta: {
      name: "MemeWarzone TreasuryRouterV2 initial wiring",
      description: `Configure staged TreasuryRouterV2 from ${path.basename(stagedFile)} before scheduled factory deployment.`,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: treasurySafe,
      createdFromOwnerAddress: "",
    },
    transactions,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(batch, null, 2)}\n`);

  console.log(`[safe-batch] staged deployment=${stagedFile}`);
  console.log(`[safe-batch] Safe=${treasurySafe}`);
  console.log(`[safe-batch] TreasuryRouterV2=${router}`);
  console.log(`[safe-batch] pending transactions=${transactions.length}`);
  console.log(`[safe-batch] output=${outputFile}`);

  if (transactions.length === 0) {
    console.log("[safe-batch] Router V2 is already fully wired. Rerun deploy:scheduled-test-factory:bsc-testnet.");
    return;
  }

  console.log("\n[safe-batch] Import this JSON in Safe Transaction Builder on BSC Testnet, review every target/value/calldata, then sign and execute the batch.");
  console.log("[safe-batch] After on-chain execution, rerun this export command; it should report pending transactions=0.");
  console.log("[safe-batch] Then run: npm run deploy:scheduled-test-factory:bsc-testnet");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
