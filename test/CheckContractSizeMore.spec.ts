import { expect } from "chai";
import {
  EVM_RUNTIME_LIMIT_BYTES,
  INTERNAL_RUNTIME_TARGET_BYTES,
  PRODUCTION_CONTRACTS,
  assertRuntimeSize,
  runtimeByteLength,
  runtimeSizeStatus,
} from "../scripts/check-contract-size";

describe("check-contract-size additional helpers", function () {
  it("keeps the EVM limit above the internal release target", async () => {
    expect(EVM_RUNTIME_LIMIT_BYTES).to.eq(24_576);
    expect(INTERNAL_RUNTIME_TARGET_BYTES).to.eq(23_000);
    expect(EVM_RUNTIME_LIMIT_BYTES).to.be.gt(INTERNAL_RUNTIME_TARGET_BYTES);
  });

  it("keeps the production contract list unique and mock-free", async () => {
    expect(new Set(PRODUCTION_CONTRACTS).size).to.eq(PRODUCTION_CONTRACTS.length);
    expect(PRODUCTION_CONTRACTS.some((name) => name.startsWith("Mock"))).to.eq(false);
    expect(PRODUCTION_CONTRACTS.some((name) => name.includes("Receiver"))).to.eq(false);
  });

  it("computes byte length for larger deployed bytecode payloads", async () => {
    const bytes = 128;
    expect(runtimeByteLength(`0x${"ab".repeat(bytes)}`)).to.eq(bytes);
  });

  it("classifies zero-byte and one-byte runtimes as ok", async () => {
    expect(runtimeSizeStatus(0)).to.eq("ok");
    expect(runtimeSizeStatus(1)).to.eq("ok");
  });

  it("rejects negative runtime sizes defensively through the internal target check only when applicable", async () => {
    expect(() => assertRuntimeSize("Synthetic", -1)).to.not.throw();
  });

  it("prioritizes the EVM runtime-limit error when both thresholds are exceeded", async () => {
    expect(() => assertRuntimeSize("Oversized", EVM_RUNTIME_LIMIT_BYTES + 500)).to.throw(
      `Oversized exceeds the EVM runtime limit of ${EVM_RUNTIME_LIMIT_BYTES} bytes`
    );
  });
});
