import fs from "fs";

const p = "frontend/api/server.mjs";
let c = fs.readFileSync(p, "utf8");
if (c.includes("./lib/apiAuth.js")) {
  console.log("import already present");
  process.exit(0);
}

const needleLf = 'import voteCounts from "./vote_counts.js";\n';
const needleCrlf = 'import voteCounts from "./vote_counts.js";\r\n';
const insertLf = 'import voteCounts from "./vote_counts.js";\nimport { withAdminOrOps, withInternalAuth } from "./lib/apiAuth.js";\n';
const insertCrlf = 'import voteCounts from "./vote_counts.js";\r\nimport { withAdminOrOps, withInternalAuth } from "./lib/apiAuth.js";\r\n';

if (c.includes(needleCrlf)) c = c.replace(needleCrlf, insertCrlf);
else if (c.includes(needleLf)) c = c.replace(needleLf, insertLf);
else {
  console.error("voteCounts import not found");
  process.exit(1);
}

fs.writeFileSync(p, c);
console.log("import added");
