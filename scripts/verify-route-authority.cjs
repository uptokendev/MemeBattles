const hre = require("hardhat");

const { ethers } = hre;

const CREATE_AUTH_TYPES = ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"];
const TRADE_AUTH_TYPES = ["string", "uint256", "address", "address", "uint8", "uint8", "uint256", "uint256", "uint64"];
const REQUEST_HASH_TYPES = ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32"];

function normalizeAddress(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return ethers.getAddress(value.trim());
}

function hardhatEphemeralHint(address) {
  if (hre.network.name !== "hardhat") return "";
  return ` The hardhat network is ephemeral per command, so a factory deployed by a previous command no longer has code at ${address}. Use npm run deploy:verify for same-run checks, run against localhost with a persistent node, or use a real network such as bscTestnet.`;
}

async function requireContractCode(address, label) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${label} ${address} has no code on ${hre.network.name}.${hardhatEphemeralHint(address)}`);
  }
}

function configuredRouteAuthority() {
  if (process.env.ROUTE_AUTHORITY_PRIVATE_KEY) {
    const raw = process.env.ROUTE_AUTHORITY_PRIVATE_KEY.trim();
    const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
    const wallet = new ethers.Wallet(privateKey);
    return { address: wallet.address, wallet };
  }

  if (process.env.ROUTE_AUTHORITY_ADDRESS) {
    return { address: normalizeAddress(process.env.ROUTE_AUTHORITY_ADDRESS, "ROUTE_AUTHORITY_ADDRESS"), wallet: null };
  }

  throw new Error("Set ROUTE_AUTHORITY_ADDRESS or ROUTE_AUTHORITY_PRIVATE_KEY before running this check");
}

function hashString(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

function hashCampaignRequest(req) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(REQUEST_HASH_TYPES, [
      hashString(req.name),
      hashString(req.symbol),
      hashString(req.logoURI),
      hashString(req.xAccount),
      hashString(req.website),
      hashString(req.extraLink),
    ])
  );
}

function createRouteAuthDigest({ chainId, factory, creator, requestHash, tradeRouteProfile, finalizeRouteProfile, deadline }) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(CREATE_AUTH_TYPES, [
      "MWZ_CREATE_ROUTE_AUTH",
      chainId,
      factory,
      creator,
      requestHash,
      tradeRouteProfile,
      finalizeRouteProfile,
      deadline,
    ])
  );
}

function tradeRouteAuthDigest({ chainId, campaign, actor, routeProfile, action, amount, limit, deadline }) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(TRADE_AUTH_TYPES, [
      "MWZ_ROUTE_TRADE_AUTH",
      chainId,
      campaign,
      actor,
      routeProfile,
      action,
      amount,
      limit,
      deadline,
    ])
  );
}

async function assertSignerRoundTrip(wallet, expectedAuthority, digest, label) {
  const signature = await wallet.signMessage(ethers.getBytes(digest));
  const recovered = ethers.verifyMessage(ethers.getBytes(digest), signature);
  if (ethers.getAddress(recovered) !== expectedAuthority) {
    throw new Error(`${label} signer self-test failed: recovered ${recovered}`);
  }
  console.log(`[route-authority] ${label} signer self-test: ok`);
}

async function main() {
  const factoryAddress = normalizeAddress(
    process.env.LAUNCH_FACTORY_ADDRESS || process.env.FACTORY_ADDRESS,
    "LAUNCH_FACTORY_ADDRESS or FACTORY_ADDRESS"
  );
  const configured = configuredRouteAuthority();
  const expectedAuthority = ethers.getAddress(configured.address);
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`[route-authority] network=${hre.network.name}`);
  console.log(`[route-authority] chainId=${chainId}`);
  console.log(`[route-authority] factory=${factoryAddress}`);
  console.log(`[route-authority] expected=${expectedAuthority}`);

  await requireContractCode(factoryAddress, "LaunchFactory");

  const factory = await ethers.getContractAt(["function routeAuthority() view returns (address)"], factoryAddress);
  const onChainAuthority = ethers.getAddress(await factory.routeAuthority());
  console.log(`[route-authority] on-chain=${onChainAuthority}`);

  if (onChainAuthority !== expectedAuthority) {
    throw new Error("Route authority mismatch: backend signer does not match LaunchFactory.routeAuthority");
  }

  const sampleRequest = {
    name: "RouteAuthProbe",
    symbol: "RAP",
    logoURI: "ipfs://route-auth-probe",
    xAccount: "",
    website: "",
    extraLink: "",
  };
  const requestHash = hashCampaignRequest(sampleRequest);
  const sampleDeadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const sampleCreator = expectedAuthority;
  const sampleCampaign = process.env.CAMPAIGN_ADDRESS
    ? normalizeAddress(process.env.CAMPAIGN_ADDRESS, "CAMPAIGN_ADDRESS")
    : factoryAddress;

  const createDigest = createRouteAuthDigest({
    chainId,
    factory: factoryAddress,
    creator: sampleCreator,
    requestHash,
    tradeRouteProfile: 1,
    finalizeRouteProfile: 1,
    deadline: sampleDeadline,
  });
  const tradeDigest = tradeRouteAuthDigest({
    chainId,
    campaign: sampleCampaign,
    actor: sampleCreator,
    routeProfile: 1,
    action: 0,
    amount: ethers.parseEther("1"),
    limit: ethers.parseEther("0.01"),
    deadline: sampleDeadline,
  });

  console.log(`[route-authority] create request hash sample=${requestHash}`);
  console.log(`[route-authority] create digest sample=${createDigest}`);
  console.log(`[route-authority] trade digest sample=${tradeDigest}`);

  if (configured.wallet) {
    await assertSignerRoundTrip(configured.wallet, expectedAuthority, createDigest, "create route auth");
    await assertSignerRoundTrip(configured.wallet, expectedAuthority, tradeDigest, "trade route auth");
  } else {
    console.log("[route-authority] signer self-test skipped: set ROUTE_AUTHORITY_PRIVATE_KEY to verify signatures locally");
  }

  console.log("[route-authority] EIP-191 digest compatibility self-test: OK");
}

module.exports = {
  CREATE_AUTH_TYPES,
  TRADE_AUTH_TYPES,
  REQUEST_HASH_TYPES,
  normalizeAddress,
  hardhatEphemeralHint,
  requireContractCode,
  configuredRouteAuthority,
  hashString,
  hashCampaignRequest,
  createRouteAuthDigest,
  tradeRouteAuthDigest,
  assertSignerRoundTrip,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[route-authority] ${error.message}`);
    process.exitCode = 1;
  });
}
