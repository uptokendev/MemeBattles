import { Contract, ethers, type JsonRpcSigner } from "ethers";
import { apiFetch } from "@/lib/apiBase";

const SCHEDULED_FACTORY_ABI = [
  "function createScheduledCampaignAuthorized(((string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint256 graduationTarget) campaign,uint64 launchAt,bytes32 draftReferenceHash,bytes32 normalizedTickerHash,bytes32 metadataHash,uint64 reservationVersion,uint256 authorizationNonce) req,(uint8 tradeRouteProfile,uint8 finalizeRouteProfile,uint64 deadline,bytes signature) routeAuth) returns (address campaignAddr,address tokenAddr)",
  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol,string logoURI,string metadataURI)",
] as const;

function parseApiJson(res: Response) {
  return res.json().catch(() => ({})).then((json) => {
    if (!res.ok) throw new Error(String(json?.error || json?.message || `Request failed (${res.status})`));
    return json;
  });
}

function extractCreated(receipt: any) {
  const iface = new ethers.Interface(SCHEDULED_FACTORY_ABI);
  for (const log of receipt?.logs || []) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "CampaignCreated") {
        return {
          campaignAddress: String(parsed.args?.campaign || ""),
          tokenAddress: String(parsed.args?.token || ""),
        };
      }
    } catch {}
  }
  return { campaignAddress: "", tokenAddress: "" };
}

export async function deployScheduledDraftCampaign(input: {
  signer: JsonRpcSigner;
  walletAddress: string;
  chainId: number;
  factoryAddress: string;
  draftId: string;
  launchAt: number;
  graduationTargetWei: bigint;
}) {
  const response = await apiFetch("/api/routing/scheduled-create-authorization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      factoryAddress: input.factoryAddress,
      draftId: input.draftId,
      launchAt: input.launchAt,
      graduationTargetWei: input.graduationTargetWei.toString(),
    }),
  });
  const json = await parseApiJson(response);
  const scheduledRequest = json.scheduledRequest;
  const authorization = json.authorization;
  if (!scheduledRequest || !authorization) throw new Error("Scheduled launch authorization response is incomplete.");

  const factory = new Contract(input.factoryAddress, SCHEDULED_FACTORY_ABI, input.signer) as any;
  const tx = await factory.createScheduledCampaignAuthorized(
    {
      campaign: {
        ...scheduledRequest.campaign,
        graduationTarget: BigInt(scheduledRequest.campaign.graduationTarget),
      },
      launchAt: Number(scheduledRequest.launchAt),
      draftReferenceHash: scheduledRequest.draftReferenceHash,
      normalizedTickerHash: scheduledRequest.normalizedTickerHash,
      metadataHash: scheduledRequest.metadataHash,
      reservationVersion: Number(scheduledRequest.reservationVersion),
      authorizationNonce: BigInt(scheduledRequest.authorizationNonce),
    },
    {
      tradeRouteProfile: Number(authorization.tradeRouteProfileId),
      finalizeRouteProfile: Number(authorization.finalizeRouteProfileId),
      deadline: Math.floor(new Date(authorization.validUntil).getTime() / 1000),
      signature: authorization.signature,
    },
  );
  const receipt = await tx.wait();
  return { receipt, ...extractCreated(receipt) };
}
