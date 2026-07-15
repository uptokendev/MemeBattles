import { expect } from "chai";
import {
  EVM_RUNTIME_LIMIT_BYTES,
  INTERNAL_RUNTIME_TARGET_BYTES,
  PRODUCTION_CONTRACTS,
  assertRuntimeSize,
  runtimeByteLength,
  runtimeSizeStatus,
} from "../scripts/check-contract-size";

describe("check-contract-size helpers", function () {
  it("tracks the production contracts that should stay within bytecode targets", async () => {
    expect(PRODUCTION_CONTRACTS).to.include.members([
      "LaunchCampaign",
      "LaunchFactory",
      "LaunchToken",
      "TreasuryRouter",
      "TreasuryVaultV2",
      "PermanentLpLocker",
    ]);
    expect(PRODUCTION_CONTRACTS).to.have.length(13);
  });

  it("computes runtime byte length from deployed bytecode", async () => {
    expect(runtimeByteLength("0x")).to.eq(0);
    expect(runtimeByteLength("0x00")).to.eq(1);
    expect(runtimeByteLength("0x1234abcd")).to.eq(4);
  });

  it("classifies bytecode below the internal target as ok", async () => {
    expect(runtimeSizeStatus(INTERNAL_RUNTIME_TARGET_BYTES - 1)).to.eq("ok");
    expect(runtimeSizeStatus(INTERNAL_RUNTIME_TARGET_BYTES)).to.eq("too large");
    expect(runtimeSizeStatus(EVM_RUNTIME_LIMIT_BYTES)).to.eq("too large");
  });

  it("accepts runtimes below the internal target", async () => {
    expect(() => assertRuntimeSize("LaunchFactory", INTERNAL_RUNTIME_TARGET_BYTES - 1)).to.not.throw();
  });

  it("rejects runtimes at the internal target", async () => {
    expect(() => assertRuntimeSize("LaunchFactory", INTERNAL_RUNTIME_TARGET_BYTES)).to.throw(
      `One or more production contracts exceed the internal ${INTERNAL_RUNTIME_TARGET_BYTES} byte target`
    );
  });

  it("rejects runtimes beyond the EVM limit with the contract name", async () => {
    expect(() => assertRuntimeSize("LaunchCampaign", EVM_RUNTIME_LIMIT_BYTES + 1)).to.throw(
      `LaunchCampaign exceeds the EVM runtime limit of ${EVM_RUNTIME_LIMIT_BYTES} bytes`
    );
  });
});
