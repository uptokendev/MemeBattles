import { getMockTokenRouteById } from "@/features/postgrad/mockRegistry";

function isRoutableTokenId(tokenId?: string | null) {
  if (!tokenId) return false;
  if (tokenId.startsWith("pending-")) return false;
  return tokenId.length > 4;
}

/**
 * Returns the canonical token detail route for Arena surfaces.
 *
 * Mock token ids keep their seeded token detail route. API-backed ids can pass
 * through to /token/:campaignAddress, which is the existing TokenDetails route.
 */
export function getArenaTokenRoute(tokenId?: string | null) {
  if (!isRoutableTokenId(tokenId)) return null;
  return getMockTokenRouteById(tokenId) ?? `/token/${encodeURIComponent(tokenId)}`;
}
