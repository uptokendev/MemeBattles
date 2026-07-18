import { expect } from "chai";
import { ethers } from "hardhat";
import { deployCoreFixture } from "./fixtures/core";

const baseReq = (overrides: Record<string, unknown> = {}) => ({
  name: "LpReceiverToken",
  symbol: "LPR",
  logoURI: "ipfs://lp-receiver-logo",
  xAccount: "",
  website: "",
  extraLink: "",
  basePrice: 0n,
  priceSlope: 0n,
  graduationTarget: 0n,
  lpReceiver: ethers.ZeroAddress,
  ...overrides,
});

function hashCreateRouteRequest(req: ReturnType<typeof baseReq>) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "uint256"],
      [
        ethers.keccak256(ethers.toUtf8Bytes(req.name)),
        ethers.keccak256(ethers.toUtf8Bytes(req.symbol)),
        ethers.keccak256(ethers.toUtf8Bytes(req.logoURI)),
        ethers.keccak256(ethers.toUtf8Bytes(req.xAccount)),
        ethers.keccak256(ethers.toUtf8Bytes(req.website)),
        ethers.keccak256(ethers.toUtf8Bytes(req.extraLink)),
        BigInt(req.basePrice as bigint),
        BigInt(req.priceSlope as bigint),
        BigInt(req.graduationTarget as bigint),
      ]
    )
  );
}

async function signCreateRoute(
  factory: any,
  creator: string,
  signer: any,
  req: ReturnType<typeof baseReq>,
  tradeProfile: number,
  finalizeProfile: number,
  deadline: bigint
) {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const digest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"],
      [
        "MWZ_CREATE_ROUTE_AUTH",
        chainId,
        await factory.getAddress(),
        creator,
        hashCreateRouteRequest(req),
        tradeProfile,
        finalizeProfile,
        deadline,
      ]
    )
  );
  return signer.signMessage(ethers.getBytes(digest));
}

describe("LaunchFactory LP receiver hardening", function () {
  it("ignores the legacy request field and always injects the permanent LP locker", async () => {
    const { factory, creator, alice } = await deployCoreFixture();
    const locker = await factory.permanentLpLocker();
    const suppliedReceiver = await alice.getAddress();

    await expect(
      factory.connect(creator).createCampaign(baseReq({ lpReceiver: suppliedReceiver }) as any)
    ).to.emit(factory, "CampaignCreated");

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.lpReceiver()).to.eq(locker);
    expect(await campaign.lpReceiver()).not.to.eq(suppliedReceiver);
  });

  it("does not bind route authorization signatures to the ignored legacy LP receiver field", async () => {
    const { factory, creator, owner, alice } = await deployCoreFixture();
    await factory.connect(owner).setRouteAuthority(await owner.getAddress());

    const signedReq = baseReq({
      name: "AuthorizedLpReceiver",
      symbol: "ALPR",
      lpReceiver: ethers.ZeroAddress,
    });
    const submittedReq = { ...signedReq, lpReceiver: await alice.getAddress() };
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600);
    const signature = await signCreateRoute(
      factory,
      await creator.getAddress(),
      owner,
      signedReq,
      1,
      1,
      deadline
    );

    await expect(
      factory.connect(creator).createCampaignAuthorized(submittedReq as any, {
        tradeRouteProfile: 1,
        finalizeRouteProfile: 1,
        deadline,
        signature,
      })
    ).to.emit(factory, "CampaignCreated");

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.lpReceiver()).to.eq(await factory.permanentLpLocker());
  });
});
