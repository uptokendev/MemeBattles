import { expect } from "chai";
import { ethers } from "hardhat";

describe("ProtocolRevenueVault operator fill", () => {
  it("fills the operator first up to $10k, then keeps overflow for admin", async () => {
    const [admin, operator, outsider] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("ProtocolRevenueVault");
    const vault = await Vault.deploy(admin.address);
    await vault.waitForDeployment();

    const wad = 10n ** 18n;
    const price = 500n * wad; // $500 / BNB
    await vault.setOperatorFill(operator.address, ethers.ZeroAddress, 10_000n * wad, price);

    const before = await ethers.provider.getBalance(operator.address);
    await outsider.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });
    const after = await ethers.provider.getBalance(operator.address);
    expect(after - before).to.eq(ethers.parseEther("10"));
    expect(await vault.operatorFilledUsd()).to.eq(5_000n * wad);

    await outsider.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("30") });
    const afterCap = await ethers.provider.getBalance(operator.address);
    expect(afterCap - before).to.eq(ethers.parseEther("20"));
    expect(await vault.operatorFilledUsd()).to.eq(10_000n * wad);
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.eq(ethers.parseEther("20"));
  });
});
