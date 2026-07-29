export const CAMPAIGN_CREATED_EVENT_V3 =
  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol,string logoURI,string metadataURI)";

export const CAMPAIGN_CREATED_EVENT_V2 =
  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol,string logoURI)";

export const CAMPAIGN_CREATED_EVENT_LEGACY =
  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol)";

export const LAUNCH_FACTORY_ABI = [
  CAMPAIGN_CREATED_EVENT_V3,
  "event CampaignGraduated(address indexed campaign,address indexed creator,address indexed lpToken,address locker)",

  // Current generation registry shape. metadataURI was inserted before the
  // social/link fields, so createdAt is tuple index 10 rather than index 9.
  "function campaignsCount() view returns (uint256)",
  "function getCampaign(uint256 id) view returns (tuple(address campaign,address token,address creator,string name,string symbol,string logoURI,string metadataURI,string xAccount,string website,string extraLink,uint64 createdAt))",
  "function router() view returns (address)"
];

export const LEGACY_LAUNCH_FACTORY_ABI = [
  CAMPAIGN_CREATED_EVENT_LEGACY,
  "event CampaignGraduated(address indexed campaign,address indexed creator,address indexed lpToken,address locker)",
  "function campaignsCount() view returns (uint256)",
  "function getCampaign(uint256 id) view returns (tuple(address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt))",
  "function router() view returns (address)"
];

export const LAUNCH_CAMPAIGN_ABI = [
  "event TokensPurchased(address indexed buyer,uint256 amountOut,uint256 cost)",
  "event TokensSold(address indexed seller,uint256 amountIn,uint256 payout)",
  "event CampaignFinalized(address indexed caller,uint256 liquidityTokens,uint256 liquidityBnb,uint256 protocolFee,uint256 creatorPayout)",
  "function feeRecipient() view returns (address)"
];

export const TREASURY_ROUTER_ABI = [
  "event RouteExecuted(uint8 indexed kind,uint8 indexed profile,uint256 amountIn,uint256 leagueAmount,uint256 recruiterAmount,uint256 airdropAmount,uint256 squadAmount,uint256 protocolAmount)"
];

// UPVoteTreasury (paid upvote events)
export const UP_VOTE_TREASURY_ABI = [
  "event VoteCast(address indexed campaign,address indexed voter,address indexed asset,uint256 amountPaid,bytes32 meta)"
];
