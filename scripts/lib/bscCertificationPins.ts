/**
 * Fail-closed pins for live BSC remaining-path certification.
 * Factory/locker MUST come from the clean-slate manifest / on-chain factory,
 * never from deployments/bscTestnet.json (that file still carries the obsolete
 * factory 0x8Aa70e… and locker 0x01eAB0…).
 */
export const CERT_CHAIN_ID = 97;
export const CERT_FACTORY = "0x77Af7634837643d4f93d1086b492571268b30B5F";
export const CERT_LOCKER = "0xb083929D2bbabdE7fc580090D5B18bbD918Fda9a";
export const CERT_TOPAZ_ROUTER = "0xe559d93643631E9E8Cc7d10ADFA581Be4b5399C8";
export const CERT_TOPAZ_FACTORY = "0xE34346710cca352a3b69A080067d176C8ACA97D9";
export const CERT_WBNB = "0x4E7aF54D355684EF206DAb0b5Dca8695D1e75dA2";
export const CERT_ADAPTER = "0xC49895Ee36Ad19aa5Cb1405761f6272aD7be6357";
export const CERT_WIC_CAMPAIGN = "0xECD05aC87007D5aE7a13407B59Db32B8030EAB3C";
export const CERT_GRADUATION_USD = 6n * 10n ** 18n;
export const CERT_VOLATILE_FEE_BPS = 100n;
export const CREATOR_SHARE_BPS = 8000n;
export const PROTOCOL_SHARE_BPS = 2000n;
export const BPS = 10000n;

export const REJECTED_FACTORIES = [
  "0x8Aa70e9b6BDB1bb3B15425af24693B3B14fE5Ce6",
  "0xF7872169265eCE4E4C93ef894F1635E84DC6F681",
  "0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6",
  "0xA2B19f194826b6D930D18F3fBCad662FaDC9459E",
  "0x8d4937D3BEe8A750411c0a24f888C0088754D3eD",
  "0x01F0dFEde3Ba48f669d98B10E39bb06a29FdD8Fc",
];

export const REJECTED_LOCKERS = [
  "0x01eAB0BCb207977bDF1416E92074a7607cC68542",
  "0x3Fd82ACA84E43CEDEb6B8b577fd15A1Ce9eC4161",
];

export const CLEAN_SLATE_MANIFEST = "deployments/bscTestnet.clean-slate-factory.json";
export const TOPAZ_MANIFEST = "deployments/bscTestnet/minimal-topaz.json";
export const FORBIDDEN_DEPLOYMENT_FILE = "deployments/bscTestnet.json";

export function sameAddr(a: string, b: string) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

export function fail(message: string): never {
  throw new Error(`[bsc-graduation-postgrad] ${message}`);
}

export function assertAddr(label: string, actual: string, expected: string) {
  if (!sameAddr(actual, expected)) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

export function assertRejectedFactory(address: string) {
  if (REJECTED_FACTORIES.some((item) => sameAddr(item, address))) {
    fail(`refusing obsolete factory ${address}; certification factory is ${CERT_FACTORY}`);
  }
}

export function assertRejectedLocker(address: string) {
  if (REJECTED_LOCKERS.some((item) => sameAddr(item, address))) {
    fail(`refusing obsolete locker ${address}; certification locker is ${CERT_LOCKER}`);
  }
}
