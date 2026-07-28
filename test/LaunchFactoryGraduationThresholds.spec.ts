import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const req = (graduationTarget: bigint, name = "Threshold", symbol = "THR") => ({
  name,
  symbol,
  logoURI: "ipfs://logo",
  xAccount: "",
  website: "",
  extraLink: "",
  graduationTarget,
});

function hashCampaignRequest(request: ReturnType<typeof req>) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256"],
      [
        ethers.keccak256(ethers.toUtf8Bytes(request.name)),
        ethers.keccak256(ethers.toUtf8Bytes(request.symbol)),
        ethers.keccak256(ethers.toUtf8Bytes(request.logoURI)),
        ethers.keccak256(ethers.toUtf8Bytes(request.xAccount)),
        ethers.keccak256(ethers.toUtf8Bytes(request.website)),
        ethers.keccak256(ethers.toUtf8Bytes(request.extraLink)),
        request.graduationTarget,
      ],
    ),
  );
}

async function signRoute(factory: any, creator: string, signer: any, request: ReturnType<typeof req>, deadline: bigint) {
  const { chainId } = await ethers.provider.getNetwork();
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"],
      [
        "MWZ_CREATE_ROUTE_AUTH",
        chainId,
        await factory.getAddress(),
        creator,
        hashCampaignRequest(request),
        1,
        1,
        deadline,
      ],
    ),
  );
  return signer.signMessage(ethers.getBytes(digest));
}

describe("LaunchFactory graduation threshold policy", function () {
  const six = ethers.parseEther("6");
  const fifteenK = ethers.parseEther("15000");
  const thirtyK = ethers.parseEther("30000");
  const fiftyK = ethers.parseEther("50000");
  const arbitrary = ethers.parseEther("12345");

  it("allows only 15k, 30k and 50k on BNB mainnet", async () => {
    const { factory } = await deployCoreFixture();

    expect(await factory.isGraduationTargetAllowedForChain(56, fifteenK)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(56, thirtyK)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(56, fiftyK)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(56, six)).to.eq(false);
    expect(await factory.isGraduationTargetAllowedForChain(56, arbitrary)).to.eq(false);
  });

  it("also allows the $6 testing threshold on BNB testnet", async () => {
    const { factory } = await deployCoreFixture();

    expect(await factory.isGraduationTargetAllowedForChain(97, six)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(97, fifteenK)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(97, thirtyK)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(97, fiftyK)).to.eq(true);
    expect(await factory.isGraduationTargetAllowedForChain(97, arbitrary)).to.eq(false);
  });

  it("accepts each approved explicit threshold in the local testnet environment", async () => {
    const { factory, creator } = await deployCoreFixture();
    const approved = [six, fifteenK, thirtyK, fiftyK];

    for (let index = 0; index < approved.length; index += 1) {
      await factory.connect(creator).createCampaign(req(approved[index], `Threshold ${index}`, `T${index}`) as any);
      const info = await factory.getCampaign(BigInt(index));
      const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
      expect(await campaign.graduationTarget()).to.eq(approved[index]);
    }
  });

  it("rejects an arbitrary explicit threshold even with a valid route-authority signature", async () => {
    const { factory, creator, owner } = await deployCoreFixture();
    await factory.connect(owner).setRequireRouteAuthorization(true);
    await factory.connect(owner).setRouteAuthority(await owner.getAddress());

    const request = req(arbitrary, "Rejected", "NOPE");
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600);
    const signature = await signRoute(factory, await creator.getAddress(), owner, request, deadline);

    await expect(
      factory.connect(creator).createCampaignAuthorized(request as any, {
        tradeRouteProfile: 1,
        finalizeRouteProfile: 1,
        deadline,
        signature,
      }),
    ).to.be.revertedWithCustomError(factory, "UnsupportedGraduationTarget");
  });

  it("keeps graduationTarget 0 as the factory-configured default", async () => {
    const { factory, owner, creator } = await deployCoreFixture();
    const current = await factory.config();

    await factory.connect(owner).setConfig({
      totalSupply: current.totalSupply,
      curveBps: current.curveBps,
      liquidityTokenBps: current.liquidityTokenBps,
      basePrice: current.basePrice,
      priceSlope: current.priceSlope,
      graduationTarget: thirtyK,
      liquidityBps: current.liquidityBps,
    });

    await factory.connect(creator).createCampaign(req(0n, "Default", "DFLT") as any);
    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.graduationTarget()).to.eq(thirtyK);
  });
});
