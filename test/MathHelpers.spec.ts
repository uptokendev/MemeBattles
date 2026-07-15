import { expect } from "chai";
import { ethers } from "hardhat";
import { area, bn, currentPrice, fee, quoteBuyExactTokens, quoteSellExactTokens } from "./helpers/math";

describe("bonding curve math helpers", function () {
  it("normalizes supported bigint-like inputs", async () => {
    expect(bn(1n)).to.eq(1n);
    expect(bn(2)).to.eq(2n);
    expect(bn("3")).to.eq(3n);
    expect(bn(ethers.parseEther("4"))).to.eq(ethers.parseEther("4"));
    expect(() => bn({} as any)).to.throw("Unsupported BigNumberish");
  });

  it("computes zero area at zero supply", async () => {
    expect(area(0n, 10n ** 12n, 10n ** 9n)).to.eq(0n);
  });

  it("computes linear-only area when the slope is zero", async () => {
    const sold = ethers.parseEther("2");
    const basePrice = ethers.parseEther("0.01");

    expect(area(sold, basePrice, 0n)).to.eq(ethers.parseEther("0.02"));
  });

  it("computes protocol fees in basis points", async () => {
    const amount = ethers.parseEther("1");

    expect(fee(amount, 0n)).to.eq(0n);
    expect(fee(amount, 200n)).to.eq(ethers.parseEther("0.02"));
    expect(fee(amount, 10_000n)).to.eq(amount);
  });

  it("quotes buys as the curve area delta plus fee", async () => {
    const sold = ethers.parseEther("3");
    const amountOut = ethers.parseEther("2");
    const basePrice = ethers.parseEther("0.01");
    const priceSlope = ethers.parseEther("0.001");
    const protocolFeeBps = 200n;

    const expectedCostNoFee = area(sold + amountOut, basePrice, priceSlope) - area(sold, basePrice, priceSlope);
    const expectedFee = fee(expectedCostNoFee, protocolFeeBps);
    const quote = quoteBuyExactTokens(sold, amountOut, basePrice, priceSlope, protocolFeeBps);

    expect(quote.costNoFee).to.eq(expectedCostNoFee);
    expect(quote.fee).to.eq(expectedFee);
    expect(quote.total).to.eq(expectedCostNoFee + expectedFee);
  });

  it("quotes sells as the reverse area delta minus fee", async () => {
    const sold = ethers.parseEther("5");
    const amountIn = ethers.parseEther("2");
    const basePrice = ethers.parseEther("0.01");
    const priceSlope = ethers.parseEther("0.001");
    const protocolFeeBps = 200n;

    const expectedGross = area(sold, basePrice, priceSlope) - area(sold - amountIn, basePrice, priceSlope);
    const expectedFee = fee(expectedGross, protocolFeeBps);
    const quote = quoteSellExactTokens(sold, amountIn, basePrice, priceSlope, protocolFeeBps);

    expect(quote.gross).to.eq(expectedGross);
    expect(quote.fee).to.eq(expectedFee);
    expect(quote.payout).to.eq(expectedGross - expectedFee);
  });

  it("computes current price from base plus linear sold slope", async () => {
    const basePrice = ethers.parseEther("0.01");
    const priceSlope = ethers.parseEther("0.001");
    const sold = ethers.parseEther("7");

    expect(currentPrice(basePrice, priceSlope, 0n)).to.eq(basePrice);
    expect(currentPrice(basePrice, priceSlope, sold)).to.eq(ethers.parseEther("0.017"));
  });
});
