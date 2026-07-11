import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";
import { getBalance } from "./helpers/balances";

const directInitParams = async (values: {
  creator: string;
  owner: string;
  router: string;
  feeRecipient?: string;
  leagueReceiver?: string;
  basePrice?: bigint;
  priceSlope?: bigint;
  graduationTarget?: bigint;
}) => ({
  name: "Phase2Guard",
  symbol: "P2G",
  logoURI: "ipfs://logo",
  xAccount: "",
  website: "",
  extraLink: "",
  totalSupply: ethers.parseEther("1000"),
  curveBps: 5000,
  liquidityTokenBps: 4000,
  basePrice: values.basePrice ?? ethers.parseEther("0.001"),
  priceSlope: values.priceSlope ?? 1n,
  graduationTarget: values.graduationTarget ?? ethers.parseEther("10"),
  liquidityBps: 8000,
  protocolFeeBps: 200,
  leagueFeeBps: 75,
  leagueReceiver: values.leagueReceiver ?? values.owner,
  router: values.router,
  lpReceiver: values.creator,
  feeRecipient: values.feeRecipient ?? values.owner,
  creator: values.creator,
  factory: values.creator,
  creatorRegistry: ethers.ZeroAddress,
  riskRegistry: ethers.ZeroAddress,
  creatorBuyLockUntil: 0n,
  creatorBuyCapWei: 0n,
  requireAuthorizedTrading: false,
  tradeRouteProfile: 1,
  finalizeRouteProfile: 1,
});

async function deployDirectCampaign(params: any) {
  const Campaign = await ethers.getContractFactory("LaunchCampaign");
  const impl = await Campaign.deploy();
  await impl.waitForDeployment();

  const implAddr = await impl.getAddress();
  const minimalProxyBytecode =
    "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" +
    implAddr.slice(2).toLowerCase() +
    "5af43d82803e903d91602b57fd5bf3";

  const [, creator] = await ethers.getSigners();
  const txClone = await creator.sendTransaction({ data: minimalProxyBytecode });
  const receipt = await txClone.wait();
  const campaign = Campaign.attach(receipt!.contractAddress);
  await campaign.initialize(params);
  return campaign;
}

describe("LaunchCampaign Phase 2 graduation guardrails", function () {
  it("rejects graduation when matching the final curve price needs more LP tokens than reserved", async () => {
    const { owner, creator, alice } = await deployCoreFixture();

    const V2Factory = await ethers.getContractFactory("MockV2Factory");
    const v2factory = await V2Factory.deploy();
    await v2factory.waitForDeployment();

    const Router = await ethers.getContractFactory("MockRouter");
    const router = await Router.deploy(await v2factory.getAddress(), await owner.getAddress());
    await router.waitForDeployment();

    const campaign = await deployDirectCampaign(
      await directInitParams({
        creator: await creator.getAddress(),
        owner: await owner.getAddress(),
        router: await router.getAddress(),
      })
    );

    const oneToken = ethers.parseUnits("1", 18);
    const quote = await campaign.quoteBuyExactTokens(oneToken);
    await campaign.connect(alice).buyExactTokens(oneToken, quote, { value: quote });

    const target = await campaign.graduationTarget();
    const balance = await getBalance(await campaign.getAddress());
    if (balance < target) await owner.sendTransaction({ to: await campaign.getAddress(), value: target - balance });

    await expect(campaign.connect(creator).finalize(0, 0)).to.be.revertedWithCustomError(
      campaign,
      "InsufficientLpAllocation"
    );
  });
});
