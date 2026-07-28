#!/usr/bin/env node

import fs from "node:fs";

const deploymentPath = "scripts/deploy-scheduled-cooldown-factory.ts";
let source = fs.readFileSync(deploymentPath, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  '  if (await activeFactory.globalPaused()) throw new Error("Active LaunchFactory is globally paused.");\n',
  '  if (await activeFactory.globalPaused()) throw new Error("Active LaunchFactory is globally paused.");\n' +
    '  if (await activeFactory.createPaused()) {\n' +
    '    throw new Error("Active factory creation is already paused. Refusing a duplicate replacement deployment.");\n' +
    '  }\n',
  "add duplicate deployment guard",
);

replaceOnce(
  '  const expectedEarliest = BigInt(creatorProfile.lastLaunchTimestamp) + BigInt(creatorRules.cooldownSeconds);\n' +
    '  const beforeEligibility = await replacement.creatorLaunchEligibilityAt(qaCreator, expectedEarliest - 1n);\n',
  '  const latestBlock = await ethers.provider.getBlock("latest");\n' +
    '  const registryEarliest = BigInt(creatorProfile.lastLaunchTimestamp) + BigInt(creatorRules.cooldownSeconds);\n' +
    '  const expectedEarliest = registryEarliest > BigInt(latestBlock?.timestamp || 0)\n' +
    '    ? registryEarliest\n' +
    '    : BigInt(latestBlock?.timestamp || 0);\n' +
    '  const beforeEligibility = await replacement.creatorLaunchEligibilityAt(qaCreator, expectedEarliest - 1n);\n',
  "make eligibility verification robust to current block time",
);

replaceOnce(
  '      `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,\n' +
    '      `SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,\n',
  '      `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,\n' +
    '      `VITE_PERMANENT_LP_LOCKER_ADDRESS_97=${replacementLocker}`,\n' +
    '      `SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`,\n',
  "export replacement locker address",
);

const oldBnbBlock = `  const bnbContractsFile = path.join(root, "frontend", "src", "lib", "bnbContracts.ts");
  let bnbContractsSource = fs.readFileSync(bnbContractsFile, "utf8");
  if (!bnbContractsSource.includes("ACTIVE_BSC_TESTNET_FACTORY")) {
    bnbContractsSource = bnbContractsSource.replace(
      "const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;",
      \`const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;\\nexport const ACTIVE_BSC_TESTNET_FACTORY = "\${replacementFactoryAddress}";\`,
    );
  } else {
    bnbContractsSource = bnbContractsSource.replace(
      /export const ACTIVE_BSC_TESTNET_FACTORY = "0x[a-fA-F0-9]{40}";/,
      \`export const ACTIVE_BSC_TESTNET_FACTORY = "\${replacementFactoryAddress}";\`,
    );
  }
  bnbContractsSource = bnbContractsSource.replace(
    /launchFactory: readAddress\\(chainId, "VITE_FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"\\),/,
    "launchFactory: Number(chainId) === 97 ? ACTIVE_BSC_TESTNET_FACTORY : readAddress(chainId, \\"VITE_FACTORY_ADDRESS\\", \\"VITE_FACTORY_ADDRESS\\"),",
  );
  fs.writeFileSync(bnbContractsFile, bnbContractsSource);`;

const newBnbBlock = `  const bnbContractsFile = path.join(root, "frontend", "src", "lib", "bnbContracts.ts");
  let bnbContractsSource = fs.readFileSync(bnbContractsFile, "utf8");
  if (!bnbContractsSource.includes("ACTIVE_BSC_TESTNET_FACTORY")) {
    bnbContractsSource = bnbContractsSource.replace(
      "const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;",
      \`const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;\\nexport const ACTIVE_BSC_TESTNET_FACTORY = "\${replacementFactoryAddress}";\\nexport const ACTIVE_BSC_TESTNET_PERMANENT_LP_LOCKER = "\${replacementLocker}";\`,
    );
  } else {
    bnbContractsSource = bnbContractsSource.replace(
      /export const ACTIVE_BSC_TESTNET_FACTORY = "0x[a-fA-F0-9]{40}";/,
      \`export const ACTIVE_BSC_TESTNET_FACTORY = "\${replacementFactoryAddress}";\`,
    );
    if (bnbContractsSource.includes("ACTIVE_BSC_TESTNET_PERMANENT_LP_LOCKER")) {
      bnbContractsSource = bnbContractsSource.replace(
        /export const ACTIVE_BSC_TESTNET_PERMANENT_LP_LOCKER = "0x[a-fA-F0-9]{40}";/,
        \`export const ACTIVE_BSC_TESTNET_PERMANENT_LP_LOCKER = "\${replacementLocker}";\`,
      );
    } else {
      bnbContractsSource = bnbContractsSource.replace(
        /export const ACTIVE_BSC_TESTNET_FACTORY = "0x[a-fA-F0-9]{40}";/,
        (match) => \`\${match}\\nexport const ACTIVE_BSC_TESTNET_PERMANENT_LP_LOCKER = "\${replacementLocker}";\`,
      );
    }
  }
  bnbContractsSource = bnbContractsSource.replace(
    /launchFactory: readAddress\\(chainId, "VITE_FACTORY_ADDRESS", "VITE_FACTORY_ADDRESS"\\),/,
    "launchFactory: Number(chainId) === 97 ? ACTIVE_BSC_TESTNET_FACTORY : readAddress(chainId, \\"VITE_FACTORY_ADDRESS\\", \\"VITE_FACTORY_ADDRESS\\"),",
  );
  bnbContractsSource = bnbContractsSource.replace(
    /permanentLpLocker: readAddress\\(chainId, "VITE_PERMANENT_LP_LOCKER_ADDRESS"\\),/,
    "permanentLpLocker: Number(chainId) === 97 ? ACTIVE_BSC_TESTNET_PERMANENT_LP_LOCKER : readAddress(chainId, \\"VITE_PERMANENT_LP_LOCKER_ADDRESS\\"),",
  );
  if (!bnbContractsSource.includes(replacementFactoryAddress) || !bnbContractsSource.includes(replacementLocker)) {
    throw new Error("Frontend BSC Testnet factory or locker pointer was not updated.");
  }
  fs.writeFileSync(bnbContractsFile, bnbContractsSource);`;

replaceOnce(oldBnbBlock, newBnbBlock, "pin replacement factory and locker in frontend contract map");

replaceOnce(
  '  exampleEnv = exampleEnv.replace(/^VITE_SCHEDULED_FACTORY_ADDRESS_97=.*$/m, `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);\n' +
    '  exampleEnv = exampleEnv.replace(/^SCHEDULED_FACTORY_ADDRESS_97=.*$/m, `SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);\n',
  '  exampleEnv = exampleEnv.replace(/^VITE_SCHEDULED_FACTORY_ADDRESS_97=.*$/m, `VITE_SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);\n' +
    '  exampleEnv = exampleEnv.replace(/^VITE_PERMANENT_LP_LOCKER_ADDRESS_97=.*$/m, `VITE_PERMANENT_LP_LOCKER_ADDRESS_97=${replacementLocker}`);\n' +
    '  exampleEnv = exampleEnv.replace(/^SCHEDULED_FACTORY_ADDRESS_97=.*$/m, `SCHEDULED_FACTORY_ADDRESS_97=${replacementFactoryAddress}`);\n',
  "update replacement locker in example environment",
);

fs.writeFileSync(deploymentPath, source);
console.log("Prepared duplicate-safe scheduled cooldown factory deployment.");
