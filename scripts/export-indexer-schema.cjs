#!/usr/bin/env node
const path = require("node:path");

const { writeIndexerSchema } = require("./lib/indexerSchema.cjs");

function defaultOutputFile() {
  return path.join(process.cwd(), "output", "indexer-schema.sql");
}

function main() {
  const outFile = process.env.INDEXER_SCHEMA_FILE || defaultOutputFile();
  const result = writeIndexerSchema(outFile);

  console.log(`[indexer-schema] Wrote: ${outFile}`);
  console.log(`[indexer-schema] schemaVersion=${result.schemaVersion}`);
  console.log(`[indexer-schema] tables=${result.tables.join(",")}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultOutputFile,
  main,
};
