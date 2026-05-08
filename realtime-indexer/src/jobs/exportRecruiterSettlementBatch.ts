import dns from "node:dns";
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

import { listRecruiterClaimableSettlements } from "../rewards/recruiterAdmin.js";

async function main() {
  const settlements = await listRecruiterClaimableSettlements({ limit: 1000 });
  const batchesByEpoch = new Map<string, {
    chainId: number;
    epochId: number;
    epochType: string;
    startAt: string;
    endAt: string;
    payouts: Array<{
      walletAddress: string;
      recruiterId: number | null;
      recruiterCode: string | null;
      recruiterDisplayName: string | null;
      amountRaw: string;
      claimableEntryCount: number;
      firstClaimableAt: string | null;
      claimDeadlineAt: string | null;
      ledgerEntryIds: number[];
    }>;
    totalRaw: string;
  }>();

  for (const settlement of settlements) {
    const key = `${settlement.chainId}:${settlement.epochId}`;
    const batch = batchesByEpoch.get(key) ?? {
      chainId: settlement.chainId,
      epochId: settlement.epochId,
      epochType: settlement.epochType,
      startAt: settlement.startAt,
      endAt: settlement.endAt,
      payouts: [],
      totalRaw: "0",
    };

    batch.payouts.push({
      walletAddress: settlement.walletAddress,
      recruiterId: settlement.recruiterId,
      recruiterCode: settlement.recruiterCode,
      recruiterDisplayName: settlement.recruiterDisplayName,
      amountRaw: settlement.claimableAmount,
      claimableEntryCount: settlement.claimableEntryCount,
      firstClaimableAt: settlement.firstClaimableAt,
      claimDeadlineAt: settlement.claimDeadlineAt,
      ledgerEntryIds: settlement.ledgerEntryIds,
    });

    batch.totalRaw = (BigInt(batch.totalRaw) + BigInt(settlement.claimableAmount)).toString();
    batchesByEpoch.set(key, batch);
  }

  const batches = Array.from(batchesByEpoch.values()).sort((a, b) => {
    if (a.endAt === b.endAt) return a.epochId - b.epochId;
    return a.endAt < b.endAt ? 1 : -1;
  });

  console.log(JSON.stringify({
    computedAt: new Date().toISOString(),
    batches,
  }, null, 2));
}

main().catch((error) => {
  console.error("[exportRecruiterSettlementBatch] fatal", error);
  process.exit(1);
});
