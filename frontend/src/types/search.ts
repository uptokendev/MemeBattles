export type TokenStatus = "bonding" | "graduated" | "unknown";
export type SearchResultKind = "token" | "wallet";

export interface TokenSearchResult {
  kind: SearchResultKind;
  campaignAddress: string;
  tokenAddress?: string;
  name: string;
  symbol: string;
  status: TokenStatus;
  logoURI?: string;
  chainId: number;
  marketcapBnb?: string | null;
  href: string;
}
