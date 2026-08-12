"use strict";

const web3 = require("@solana/web3.js");

if (!web3.BPF_LOADER_UPGRADEABLE_PROGRAM_ID) {
  Object.defineProperty(web3, "BPF_LOADER_UPGRADEABLE_PROGRAM_ID", {
    value: new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
    enumerable: true,
    configurable: true,
    writable: false,
  });
}
