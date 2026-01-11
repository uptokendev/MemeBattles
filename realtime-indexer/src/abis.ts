export const LAUNCH_FACTORY_ABI = [
  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol)"
];

export const LAUNCH_CAMPAIGN_ABI = [
  "event TokensPurchased(address indexed buyer,uint256 amountOut,uint256 cost)",
  "event TokensSold(address indexed seller,uint256 amountIn,uint256 payout)",
  "event CampaignFinalized(address indexed caller,uint256 liquidityTokens,uint256 liquidityBnb,uint256 protocolFee,uint256 creatorPayout)"
];
