import fs from "node:fs";

const serverPath = "frontend/api/server.mjs";
let server = fs.readFileSync(serverPath, "utf8");

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

server = replaceOnce(
  server,
  `import { solanaTradeAuthorizationV1, solanaTradeStatus } from "./dev-fix/solana-trade-authorization-v1.js";`,
  `import { solanaTradeAuthorizationV1, solanaTradeStatus } from "./dev-fix/solana-trade-authorization-v1.js";\nimport { solanaGraduationAuthorizationV1 } from "./dev-fix/solana-graduation-authorization-v1.js";`,
  "graduation auth import",
);

server = replaceOnce(
  server,
  `router.all("/solana/trade-authorize", wrap(solanaTradeAuthorizationV1));\nrouter.all("/solana/trade-status", wrap(solanaTradeStatus));`,
  `router.all("/solana/trade-authorize", wrap(solanaTradeAuthorizationV1));\nrouter.all("/solana/graduation-authorize", wrap(solanaGraduationAuthorizationV1));\nrouter.all("/solana/trade-status", wrap(solanaTradeStatus));`,
  "graduation auth route",
);

fs.writeFileSync(serverPath, server);
console.log("[graduation-service-finalizer] asserted server route transform applied");
