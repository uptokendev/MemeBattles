// test/factory.test.js
import { expect } from "chai";
import hre from "hardhat";
import { Interface } from "ethers";  // <-- get Interface from ethers package

const { ethers } = await hre.network.connect();

// -----------------------------------------------------------------------------
// Helpers (ethers v6)
// -----------------------------------------------------------------------------
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const parseEther = (v) => ethers.parseEther(v);
const isAddress  = (v) => ethers.isAddress(v);

async function waitForDeployment(contract) {
  if (typeof contract.waitForDeployment === "function") {
    await contract.waitForDeployment(); // ethers v6
  } else if (typeof contract.deployed === "function") {
    await contract.deployed(); // ethers v5-style, just in case
  }
}

// -----------------------------------------------------------------------------
// Match BondingCurveSale.InitParams
// -----------------------------------------------------------------------------
function buildValidInitParams(context, overrides = {}) {
  const owner = context.owner;
  const user = context.user || owner;

  return {
    token: ZERO_ADDRESS,                        // Factory fills this for createLaunch
    tierSize: parseEther("1000"),              // 1000 tokens per tier
    startPrice: parseEther("0.0001"),          // 0.0001 BNB per token
    priceStep: parseEther("0.00001"),          // step per tier
    maxTiersPerTx: 10,
    platformFeeBps: 500,                       // 5% fee
    endTime: 0,                                // no end time
    hardCapBNB: parseEther("100"),             // or 0 for unlimited
    lpPercent: 7000,                           // 70% to LP
    router: context.router || owner.address,   // dummy router
    treasury: context.treasury || owner.address,
    payout: context.payout || user.address,
    mode: 0,                                   // Mode.Minter
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------
describe("Factory", function () {
  let owner, user, other;
  let tokenImpl, saleImpl, factory;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    // Deploy TokenTemplate implementation
    const TokenTemplate = await ethers.getContractFactory("TokenTemplate");
    tokenImpl = await TokenTemplate.deploy();
    await waitForDeployment(tokenImpl);

    // Deploy BondingCurveSale implementation
    const BondingCurveSale = await ethers.getContractFactory("BondingCurveSale");
    saleImpl = await BondingCurveSale.deploy();
    await waitForDeployment(saleImpl);

    // Deploy Factory
    const Factory = await ethers.getContractFactory("Factory");

    const tokenImplAddr =
      typeof tokenImpl.getAddress === "function"
        ? await tokenImpl.getAddress()
        : tokenImpl.address;

    const saleImplAddr =
      typeof saleImpl.getAddress === "function"
        ? await saleImpl.getAddress()
        : saleImpl.address;

    factory = await Factory.deploy(tokenImplAddr, saleImplAddr);
    await waitForDeployment(factory);
  });

  // ---------------------------------------------------------------------------
  // constructor
  // ---------------------------------------------------------------------------
  describe("constructor", function () {
    it("sets tokenImpl, saleImpl and owner correctly", async function () {
      const tokenImplAddr =
        typeof tokenImpl.getAddress === "function"
          ? await tokenImpl.getAddress()
          : tokenImpl.address;

      const saleImplAddr =
        typeof saleImpl.getAddress === "function"
          ? await saleImpl.getAddress()
          : saleImpl.address;

      expect(await factory.tokenImpl()).to.equal(tokenImplAddr);
      expect(await factory.saleImpl()).to.equal(saleImplAddr);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("reverts if tokenImpl is zero", async function () {
      const Factory = await ethers.getContractFactory("Factory");
      const saleImplAddr =
        typeof saleImpl.getAddress === "function"
          ? await saleImpl.getAddress()
          : saleImpl.address;

      let error;
      try {
        await Factory.deploy(ZERO_ADDRESS, saleImplAddr);
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);
      expect(String(error.message)).to.include("impl zero");
    });

    it("reverts if saleImpl is zero", async function () {
      const Factory = await ethers.getContractFactory("Factory");
      const tokenImplAddr =
        typeof tokenImpl.getAddress === "function"
          ? await tokenImpl.getAddress()
          : tokenImpl.address;

      let error;
      try {
        await Factory.deploy(tokenImplAddr, ZERO_ADDRESS);
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);
      expect(String(error.message)).to.include("impl zero");
    });
  });

  // ---------------------------------------------------------------------------
  // createLaunch
  // ---------------------------------------------------------------------------
  describe("createLaunch", function () {
    it("reverts if initParams.token is non-zero (Token specified)", async function () {
      const context = { owner, user, tokenImpl, saleImpl };
      const params = buildValidInitParams(context, {
        token: user.address, // force non-zero to trigger require
      });

      let error;
      try {
        await factory.connect(user).createLaunch("MyToken", "MTK", params);
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);
      expect(String(error.message)).to.include("Token specified");
    });

    it("creates token + sale clones, emits LaunchCreated and transfers sale ownership", async function () {
      const context = { owner, user, tokenImpl, saleImpl };
      const params = buildValidInitParams(context);

      const tx = await factory
        .connect(user)
        .createLaunch("My Launch Token", "MLT", params);

      const receipt = await tx.wait();

      const iface = new Interface([
        "event LaunchCreated(uint256 indexed launchId, address indexed token, address indexed sale, bool externalToken, address creator)",
      ]);

      let eventData = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "LaunchCreated") {
            eventData = parsed.args;
            break;
          }
        } catch {
          // ignore non-matching logs
        }
      }

      expect(eventData, "LaunchCreated event not found").to.not.equal(null);

      const launchId = eventData.launchId;
      const tokenAddr = eventData.token;
      const saleAddr = eventData.sale;
      const externalToken = eventData.externalToken;
      const creator = eventData.creator;

      expect(launchId.toString()).to.equal("1");
      expect(externalToken).to.equal(false);
      expect(creator).to.equal(user.address);
      expect(isAddress(tokenAddr)).to.equal(true);
      expect(isAddress(saleAddr)).to.equal(true);

      const BondingCurveSale = await ethers.getContractFactory("BondingCurveSale");
      const sale = BondingCurveSale.attach(saleAddr);
      expect(await sale.owner()).to.equal(user.address);
    });

    it("increments launch id for each new launch", async function () {
      const context = { owner, user, tokenImpl, saleImpl };
      const params1 = buildValidInitParams(context);
      const params2 = buildValidInitParams(context);

      await (
        await factory.connect(user).createLaunch("TokenOne", "ONE", params1)
      ).wait();

      const tx2 = await factory
        .connect(other)
        .createLaunch("TokenTwo", "TWO", params2);
      const receipt2 = await tx2.wait();

      const iface = new Interface([
        "event LaunchCreated(uint256 indexed launchId, address indexed token, address indexed sale, bool externalToken, address creator)",
      ]);

      const ids = [];
      for (const log of receipt2.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "LaunchCreated") {
            ids.push(parsed.args.launchId.toString());
          }
        } catch {
          // ignore
        }
      }

      expect(ids).to.include("2");
    });
  });

  // ---------------------------------------------------------------------------
  // createExternalSale
  // ---------------------------------------------------------------------------
  describe("createExternalSale", function () {
    it("reverts if initParams.token is zero (Token not set)", async function () {
      const context = { owner, user, tokenImpl, saleImpl };
      const params = buildValidInitParams(context, {
        token: ZERO_ADDRESS,
      });

      let error;
      try {
        await factory.connect(user).createExternalSale(params);
      } catch (e) {
        error = e;
      }

      expect(error).to.be.instanceOf(Error);
      expect(String(error.message)).to.include("Token not set");
    });

    it("creates a sale for an external token, emits LaunchCreated with externalToken = true and transfers ownership", async function () {
      const TokenTemplate = await ethers.getContractFactory("TokenTemplate");
      const externalToken = await TokenTemplate.deploy();
      await waitForDeployment(externalToken);

      const externalTokenAddr =
        typeof externalToken.getAddress === "function"
          ? await externalToken.getAddress()
          : externalToken.address;

      const context = {
        owner,
        user,
        tokenImpl,
        saleImpl,
        externalToken: externalTokenAddr,
      };
      const params = buildValidInitParams(context, {
        token: externalTokenAddr,
      });

      const tx = await factory.connect(user).createExternalSale(params);
      const receipt = await tx.wait();

      const iface = new Interface([
        "event LaunchCreated(uint256 indexed launchId, address indexed token, address indexed sale, bool externalToken, address creator)",
      ]);

      let eventData = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "LaunchCreated") {
            eventData = parsed.args;
            break;
          }
        } catch {
          // ignore
        }
      }

      expect(eventData, "LaunchCreated event not found").to.not.equal(null);

      const tokenAddr = eventData.token;
      const saleAddr = eventData.sale;
      const externalTokenFlag = eventData.externalToken;
      const creator = eventData.creator;

      expect(tokenAddr).to.equal(externalTokenAddr);
      expect(externalTokenFlag).to.equal(true);
      expect(creator).to.equal(user.address);

      const BondingCurveSale = await ethers.getContractFactory("BondingCurveSale");
      const sale = BondingCurveSale.attach(saleAddr);
      expect(await sale.owner()).to.equal(user.address);
    });
  });
});
