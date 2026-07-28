import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";

const TESTNET_CHAIN_ID = 97n;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function rawEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function boolEnv(name: string, fallback = false): boolean {
  const value = rawEnv(name).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
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

async function hasContractCode(address: string): Promise<boolean> {
  return (await ethers.provider.getCode(address)) !== "0x";
}

async function requireContract(label: string, address: string) {
  if (!(await hasContractCode(address))) {
    throw new Error(`${label} ${address} has no contract code on ${network.name}.`);
  }
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

type AdminAction = {
  label: string;
  method: string;
  args: Array<string | boolean>;
  transaction: SafeTransaction;
};

function addressAction(
  label: string,
  router: string,
  iface: ethers.Interface,
  method: string,
  inputName: string,
  value: string,
): AdminAction {
  return {
    label,
    method,
    args: [value],
    transaction: {
      to: router,
      value: "0",
      data: iface.encodeFunctionData(method, [value]),
      contractMethod: {
        inputs: [{ internalType: "address", name: inputName, type: "address" }],
        name: method,
        payable: false,
      },
      contractInputsValues: { [inputName]: value },
    },
  };
}

function addressBoolAction(
  label: string,
  router: string,
  iface: ethers.Interface,
  method: string,
  addressName: string,
  addressValue: string,
  boolName: string,
  boolValue: boolean,
): AdminAction {
  return {
    label,
    method,
    args: [addressValue, boolValue],
    transaction: {
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
    },
  };
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== TESTNET_CHAIN_ID) {
    throw new Error(`TreasuryRouterV2 wiring is restricted to BSC Testnet chain 97; connected chain is ${net.chainId.toString()}.`);
  }

  const { file: stagedFile, deployment } = loadStagedDeployment();
  if (deployment.treasuryRouterVersion !== "v2") {
    throw new Error("Staged deployment does not declare TreasuryRouterV2.");
  }

  // Historical manifests call this treasurySafe, but the admin may be either a Safe contract or a normal EOA.
  const treasuryAdmin = requireAddress("Treasury admin", deployment.treasurySafe);
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
  const treasuryRead = new ethers.Contract(router, abi, ethers.provider);

  const onChainAdmin = ethers.getAddress(await treasuryRead.admin());
  if (onChainAdmin.toLowerCase() !== treasuryAdmin.toLowerCase()) {
    throw new Error(`TreasuryRouterV2.admin mismatch: manifest expects ${treasuryAdmin}, contract reports ${onChainAdmin}.`);
  }

  const adminIsContract = await hasContractCode(treasuryAdmin);
  const [signer] = await ethers.getSigners();
  const signerAddress = ethers.getAddress(await signer.getAddress());

  const currentRecruiter = ethers.getAddress(await treasuryRead.recruiterRewardsVault());
  const currentCommunity = ethers.getAddress(await treasuryRead.communityRewardsVault());
  const currentProtocol = ethers.getAddress(await treasuryRead.protocolRevenueVault());
  const currentPrimaryLocker = ethers.getAddress(await treasuryRead.permanentLpLocker());
  const legacyLockerAuthorized = Boolean(await treasuryRead.authorizedLpLocker(legacyLocker));

  assertExpectedOrZero("TreasuryRouterV2.recruiterRewardsVault", currentRecruiter, recruiterRewardsVault);
  assertExpectedOrZero("TreasuryRouterV2.communityRewardsVault", currentCommunity, communityRewardsVault);
  assertExpectedOrZero("TreasuryRouterV2.protocolRevenueVault", currentProtocol, protocolRevenueVault);
  assertExpectedOrZero("TreasuryRouterV2.permanentLpLocker", currentPrimaryLocker, legacyLocker);

  const actions: AdminAction[] = [];
  if (currentRecruiter === ethers.ZeroAddress) {
    actions.push(
      addressAction(
        `setRecruiterRewardsVault(${recruiterRewardsVault})`,
        router,
        iface,
        "setRecruiterRewardsVault",
        "newVault",
        recruiterRewardsVault,
      ),
    );
  }
  if (currentCommunity === ethers.ZeroAddress) {
    actions.push(
      addressAction(
        `setCommunityRewardsVault(${communityRewardsVault})`,
        router,
        iface,
        "setCommunityRewardsVault",
        "newVault",
        communityRewardsVault,
      ),
    );
  }
  if (currentProtocol === ethers.ZeroAddress) {
    actions.push(
      addressAction(
        `setProtocolRevenueVault(${protocolRevenueVault})`,
        router,
        iface,
        "setProtocolRevenueVault",
        "newVault",
        protocolRevenueVault,
      ),
    );
  }
  if (!legacyLockerAuthorized) {
    actions.push(
      addressBoolAction(
        `setAuthorizedLpLocker(${legacyLocker}, true)`,
        router,
        iface,
        "setAuthorizedLpLocker",
        "locker",
        legacyLocker,
        "allowed",
        true,
      ),
    );
  }
  if (currentPrimaryLocker === ethers.ZeroAddress) {
    actions.push(
      addressAction(
        `setPrimaryLpLocker(${legacyLocker})`,
        router,
        iface,
        "setPrimaryLpLocker",
        "newLocker",
        legacyLocker,
      ),
    );
  }

  console.log(`[treasury-v2-admin] staged deployment=${stagedFile}`);
  console.log(`[treasury-v2-admin] admin=${treasuryAdmin}`);
  console.log(`[treasury-v2-admin] admin type=${adminIsContract ? "contract/Safe" : "EOA wallet"}`);
  console.log(`[treasury-v2-admin] connected signer=${signerAddress}`);
  console.log(`[treasury-v2-admin] TreasuryRouterV2=${router}`);
  console.log(`[treasury-v2-admin] pending actions=${actions.length}`);

  if (actions.length === 0) {
    console.log("[treasury-v2-admin] Router V2 is already fully wired. Run: npm run deploy:scheduled-test-factory:bsc-testnet");
    return;
  }

  if (adminIsContract) {
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
        createdFromSafeAddress: treasuryAdmin,
        createdFromOwnerAddress: "",
      },
      transactions: actions.map((action) => action.transaction),
    };
    writeJson(outputFile, batch);
    console.log(`[treasury-v2-admin] Safe batch=${outputFile}`);
    console.log("[treasury-v2-admin] Import the JSON in Safe Transaction Builder on BSC Testnet, review, sign, and execute it.");
    console.log("[treasury-v2-admin] Then rerun this command; pending actions must be 0.");
    return;
  }

  const actionFile = rawEnv("ADMIN_ACTIONS_OUTPUT_FILE")
    ? path.resolve(rawEnv("ADMIN_ACTIONS_OUTPUT_FILE"))
    : path.join(__dirname, "..", "deployments", `${network.name}.treasury-v2.eoa-admin-actions.json`);
  writeJson(actionFile, {
    network: network.name,
    chainId: net.chainId.toString(),
    admin: treasuryAdmin,
    router,
    signer: signerAddress,
    stagedDeployment: stagedFile,
    actions: actions.map((action) => ({
      label: action.label,
      to: action.transaction.to,
      value: action.transaction.value,
      data: action.transaction.data,
      method: action.method,
      args: action.args,
    })),
  });
  console.log(`[treasury-v2-admin] EOA action manifest=${actionFile}`);

  if (signerAddress.toLowerCase() !== treasuryAdmin.toLowerCase()) {
    throw new Error(
      `TreasuryRouterV2 is controlled by EOA ${treasuryAdmin}, but Hardhat is using ${signerAddress}. ` +
        "Set DEPLOYER_PK (or PRIVATE_KEY_DEPLOY) to the private key controlling the admin address, then run npm run wire:treasury-v2-admin:bsc-testnet. " +
        "If nobody controls that address, the deployed Router V2 cannot be configured and must not be used.",
    );
  }

  if (!boolEnv("EXECUTE_TREASURY_V2_ADMIN_ACTIONS", false)) {
    console.log("[treasury-v2-admin] Correct EOA signer detected. No writes made in inspection mode.");
    console.log("[treasury-v2-admin] Execute with: npm run wire:treasury-v2-admin:bsc-testnet");
    return;
  }

  const treasuryWrite = new ethers.Contract(router, abi, signer);
  for (const action of actions) {
    console.log(`[treasury-v2-admin] executing ${action.label}`);
    const tx = await treasuryWrite[action.method](...action.args);
    console.log(`[treasury-v2-admin] submitted ${tx.hash}`);
    await tx.wait();
    console.log(`[treasury-v2-admin] confirmed ${action.label}`);
  }

  const verifiedRecruiter = ethers.getAddress(await treasuryRead.recruiterRewardsVault());
  const verifiedCommunity = ethers.getAddress(await treasuryRead.communityRewardsVault());
  const verifiedProtocol = ethers.getAddress(await treasuryRead.protocolRevenueVault());
  const verifiedPrimaryLocker = ethers.getAddress(await treasuryRead.permanentLpLocker());
  const verifiedLockerAuthorization = Boolean(await treasuryRead.authorizedLpLocker(legacyLocker));

  if (verifiedRecruiter.toLowerCase() !== recruiterRewardsVault.toLowerCase()) throw new Error("Recruiter vault verification failed.");
  if (verifiedCommunity.toLowerCase() !== communityRewardsVault.toLowerCase()) throw new Error("Community vault verification failed.");
  if (verifiedProtocol.toLowerCase() !== protocolRevenueVault.toLowerCase()) throw new Error("Protocol vault verification failed.");
  if (verifiedPrimaryLocker.toLowerCase() !== legacyLocker.toLowerCase()) throw new Error("Primary locker verification failed.");
  if (!verifiedLockerAuthorization) throw new Error("Legacy locker authorization verification failed.");

  console.log("[treasury-v2-admin] Router V2 wiring verified. Next: npm run deploy:scheduled-test-factory:bsc-testnet");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
