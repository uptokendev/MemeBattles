import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { SCHEMA_VERSION, buildIndexerSchemaSql, tableNames, writeIndexerSchema } = require("../scripts/lib/indexerSchema.cjs");

function runExporter() {
  const dir = mkdtempSync(path.join(tmpdir(), "mwz-indexer-schema-"));
  const outFile = path.join(dir, "schema.sql");

  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "export-indexer-schema.cjs")], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INDEXER_SCHEMA_FILE: outFile,
    },
    encoding: "utf8",
  });

  const written = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
  rmSync(dir, { recursive: true, force: true });
  return { ...result, written };
}

describe("indexer schema export", function () {
  it("defines the core tables needed by the indexer and admin dashboard", async () => {
    expect(SCHEMA_VERSION).to.eq(1);
    expect(tableNames()).to.deep.eq([
      "indexer_meta",
      "contracts",
      "event_cursors",
      "campaigns",
      "trades",
      "graduations",
      "route_executions",
      "lp_locks",
      "creator_registry_events",
      "risk_registry_events",
      "treasury_movements",
    ]);
  });

  it("builds deterministic SQL with scan cursors and dashboard indexes", async () => {
    const sql = buildIndexerSchemaSql();

    expect(sql).to.include("-- schemaVersion=1");
    expect(sql).to.include("CREATE TABLE IF NOT EXISTS event_cursors");
    expect(sql).to.include("PRIMARY KEY (chain_id, contract_name, event_signature)");
    expect(sql).to.include("CREATE TABLE IF NOT EXISTS campaigns");
    expect(sql).to.include("status TEXT NOT NULL DEFAULT 'bonding'");
    expect(sql).to.include("CREATE TABLE IF NOT EXISTS trades");
    expect(sql).to.include("side TEXT NOT NULL CHECK (side IN ('buy', 'sell'))");
    expect(sql).to.include("CREATE TABLE IF NOT EXISTS graduations");
    expect(sql).to.include("final_curve_price_wei TEXT NOT NULL");
    expect(sql).to.include("CREATE INDEX IF NOT EXISTS idx_campaigns_creator");
    expect(sql).to.include("INSERT OR REPLACE INTO indexer_meta");
  });

  it("writes schema SQL to a requested path", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mwz-indexer-schema-write-"));
    const outFile = path.join(dir, "nested", "schema.sql");

    const result = writeIndexerSchema(outFile);
    const sql = readFileSync(outFile, "utf8");
    rmSync(dir, { recursive: true, force: true });

    expect(result.schemaVersion).to.eq(1);
    expect(result.tables).to.include("campaigns");
    expect(sql).to.include("CREATE TABLE IF NOT EXISTS treasury_movements");
  });

  it("writes the schema from the CLI", async () => {
    const result = runExporter();

    expect(result.status).to.eq(0);
    expect(result.stdout).to.include("[indexer-schema] Wrote:");
    expect(result.stdout).to.include("schemaVersion=1");
    expect(result.written).to.include("CREATE TABLE IF NOT EXISTS lp_locks");
  });
});
