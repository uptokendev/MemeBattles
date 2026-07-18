from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old!r}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "contracts/LaunchFactory.sol",
    "    error InvalidLpReceiver();\n",
    "",
)
replace_once(
    "contracts/LaunchFactory.sol",
    "        if (req.lpReceiver != address(0) && req.lpReceiver != lockedLpReceiver) revert InvalidLpReceiver();\n",
    "",
)
replace_once(
    "contracts/LaunchFactory.sol",
    "                req.graduationTarget,\n                req.lpReceiver\n",
    "                req.graduationTarget\n",
)
replace_once(
    "test/LaunchFactory.spec.ts",
    '["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "uint256", "address"],',
    '["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "uint256"],',
)
replace_once(
    "test/LaunchFactory.spec.ts",
    "        asBigInt(req.graduationTarget),\n        req.lpReceiver,\n",
    "        asBigInt(req.graduationTarget),\n",
)

Path("test/LaunchFactory.lpReceiver.audit.spec.ts").write_text(
    '''import { expect } from "chai";
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

describe("LaunchFactory LP receiver hardening", function () {
  it("ignores the legacy request field and always uses the permanent locker", async () => {
    const { factory, creator, alice } = await deployCoreFixture();
    const locker = await factory.permanentLpLocker();

    await expect(
      factory.connect(creator).createCampaign(baseReq({ lpReceiver: await alice.getAddress() }) as any)
    ).to.emit(factory, "CampaignCreated");

    const info = await factory.getCampaign(0n);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    expect(await campaign.lpReceiver()).to.eq(locker);
    expect(await campaign.lpReceiver()).not.to.eq(await alice.getAddress());
  });

  it("does not bind route authorization signatures to the ignored legacy field", async () => {
    const { factory, creator, owner, alice } = await deployCoreFixture();
    await factory.connect(owner).setRouteAuthority(await owner.getAddress());

    const reqForSignature = baseReq({ name: "SignedLocker", symbol: "SLCK", lpReceiver: ethers.ZeroAddress });
    const deadline = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 600);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const requestHash = ethers.keccak256(
      coder.encode(
        ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "uint256"],
        [
          ethers.keccak256(ethers.toUtf8Bytes(reqForSignature.name)),
          ethers.keccak256(ethers.toUtf8Bytes(reqForSignature.symbol)),
          ethers.keccak256(ethers.toUtf8Bytes(reqForSignature.logoURI)),
          ethers.keccak256(ethers.toUtf8Bytes(reqForSignature.xAccount)),
          ethers.keccak256(ethers.toUtf8Bytes(reqForSignature.website)),
          ethers.keccak256(ethers.toUtf8Bytes(reqForSignature.extraLink)),
          reqForSignature.basePrice,
          reqForSignature.priceSlope,
          reqForSignature.graduationTarget,
        ]
      )
    );
    const { chainId } = await ethers.provider.getNetwork();
    const digest = ethers.keccak256(
      coder.encode(
        ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"],
        ["MWZ_CREATE_ROUTE_AUTH", chainId, await factory.getAddress(), await creator.getAddress(), requestHash, 1, 1, deadline]
      )
    );
    const signature = await owner.signMessage(ethers.getBytes(digest));

    const submittedReq = { ...reqForSignature, lpReceiver: await alice.getAddress() };
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
''',
    encoding="utf-8",
)
