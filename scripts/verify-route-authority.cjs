const hre = require("hardhat");

const { ethers } = hre;

function normalizeAddress(value, label) {
  if (!value) throw new Error(`${label} is required`);
  return ethers.getAddress(value.trim());
}

function configuredRouteAuthority() {
  if (process.env.ROUTE_AUTHORITY_ADDRESS) {
    return normalizeAddress(process.env.ROUTE_AUTHORITY_ADDRESS, "ROUTE_AUTHORITY_ADDRESS");
  }

  if (process.env.ROUTE_AUTHORITY_PRIVATE_KEY) {
    const raw = process.env.ROUTE_AUTHORITY_PRIVATE_KEY.trim();
    const privateKey = raw.startsWith("0x") ? raw : `0x${raw}`;
    return new ethers.Wallet(privateKey).address;
  }

  throw new Error("Set ROUTE_AUTHORITY_ADDRESS or ROUTE_AUTHORITY_PRIVATE_KEY before running this check");
}

async function main() {
  const factoryAddress = normalizeAddress(
    process.env.LAUNCH_FACTORY_ADDRESS || process.env.FACTORY_ADDRESS,
    "LAUNCH_FACTORY_ADDRESS or FACTORY_ADDRESS"
  );
  const expectedAuthority = configuredRouteAuthority();

  const factory = await ethers.getContractAt(["function routeAuthority() view returns (address)"], factoryAddress);
  const onChainAuthority = ethers.getAddress(await factory.routeAuthority());

  console.log(`[route-authority] network=${hre.network.name}`);
  console.log(`[route-authority] factory=${factoryAddress}`);
  console.log(`[route-authority] expected=${expectedAuthority}`);
  console.log(`[route-authority] on-chain=${onChainAuthority}`);

  if (onChainAuthority !== expectedAuthority) {
    throw new Error("Route authority mismatch: backend signer does not match LaunchFactory.routeAuthority");
  }

  console.log("[route-authority] OK");
}

main().catch((error) => {
  console.error(`[route-authority] ${error.message}`);
  process.exitCode = 1;
});
