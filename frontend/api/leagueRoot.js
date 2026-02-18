import { ethers } from "ethers";
import { pool } from "../server/db.js";
import { badMethod, isAddress, json, readJson } from "../server/http.js";

// POST /api/leagueRoot
// Admin-only helper to publish the merkle root for an epoch, enabling user-paid on-chain claims.
//
// Body:
// {
//   chainId: 56|97,
//   period: "weekly"|"monthly",
//   epochStart: "<ISO>",
// }
//
// Headers:
// - x-admin-key: must equal process.env.ADMIN_API_KEY
export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);

  try {
    const adminKey = String(req.headers["x-admin-key"] ?? "");
    if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
      return json(res, 401, { error: "Unauthorized" });
    }

    const b = await readJson(req);
    const chainId = Number(b.chainId);
    const period = String(b.period ?? "").toLowerCase().trim();
    const epochStart = String(b.epochStart ?? "").trim();

    if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });
    if (!(period === "weekly" || period === "monthly")) return json(res, 400, { error: "Invalid period" });
    if (!epochStart) return json(res, 400, { error: "epochStart missing" });
    if (!pool) return json(res, 500, { error: "Server misconfigured: DATABASE_URL missing" });

    const vaultAddress = chainId === 56 ? process.env.TREASURY_VAULT_V2_ADDRESS_56 : process.env.TREASURY_VAULT_V2_ADDRESS_97;
    if (!isAddress(vaultAddress)) return json(res, 500, { error: "Server misconfigured: bad TreasuryVaultV2 address" });

    const rpc = chainId === 56 ? process.env.BSC_RPC_HTTP_56 : process.env.BSC_RPC_HTTP_97;
    if (!rpc) return json(res, 500, { error: "Server misconfigured: missing RPC url" });

    const pk = process.env.LEAGUE_ROOT_POSTER_PK;
    if (!pk) return json(res, 500, { error: "Server misconfigured: missing LEAGUE_ROOT_POSTER_PK" });

    const epochStartSec = Math.floor(new Date(epochStart).getTime() / 1000);
    const eid = computeEpochId(chainId, period, epochStartSec);

    // Load all winners for epoch and compute leaves
    const { rows } = await pool.query(
      `SELECT category, rank, recipient_address AS "recipientAddress", amount_raw AS "amountRaw"
         FROM league_epoch_winners
        WHERE chain_id = $1 AND period = $2 AND epoch_start = $3::timestamptz
        ORDER BY category ASC, rank ASC, recipient_address ASC`,
      [chainId, period, epochStart]
    );

    if (!rows?.length) return json(res, 404, { error: "No winners for epoch" });

    const leaves = [];
    let epochTotal = 0n;
    for (const r of rows) {
      const cat = String(r.category || "").toLowerCase().trim();
      const rank = Number(r.rank);
      const recipient = String(r.recipientAddress || "").toLowerCase();
      const amt = BigInt(String(r.amountRaw));
      epochTotal += amt;
      leaves.push(
        leafHash({
          epochId: eid,
          categoryHash: categoryHashFromString(cat),
          rank,
          recipient,
          amountRaw: amt,
        })
      );
    }

    const root = buildMerkleRoot(leaves);

    // Call setEpochRoot(epochId, root, epochTotal) on vault
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pk, provider);
    const abi = ["function setEpochRoot(uint256 epochId, bytes32 root, uint256 epochTotal) external"];
    const vault = new ethers.Contract(vaultAddress, abi, wallet);

    const tx = await vault.setEpochRoot(eid, root, epochTotal.toString());
    return json(res, 200, { ok: true, epochId: eid.toString(), root, epochTotal: epochTotal.toString(), txHash: tx.hash });
  } catch (e) {
    console.error("[api/leagueRoot]", e);
    return json(res, 500, { error: "Server error" });
  }
}

function periodCode(period) {
  return period === "weekly" ? 1 : 2;
}

function computeEpochId(chainId, period, epochStartSec) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const enc = coder.encode(["uint32", "uint8", "uint64"], [chainId, periodCode(period), BigInt(epochStartSec)]);
  const h = ethers.keccak256(enc);
  return BigInt(h);
}

function categoryHashFromString(category) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(category)));
}

function leafHash({ epochId, categoryHash, rank, recipient, amountRaw }) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const enc = coder.encode(
    ["uint256", "bytes32", "uint8", "address", "uint256"],
    [epochId, categoryHash, rank, recipient, BigInt(amountRaw)]
  );
  return ethers.keccak256(enc);
}

function hashPair(a, b) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  const [x, y] = aa <= bb ? [a, b] : [b, a];
  return ethers.keccak256(ethers.concat([x, y]));
}

function buildMerkleRoot(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) return ethers.ZeroHash;
  let layer = leaves.slice();
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      next.push(hashPair(left, right));
    }
    layer = next;
  }
  return layer[0];
}
