import { getPostGradTokenDetailRoute } from "@/features/postgrad/identityRoutes";

/**
 * Returns the canonical token detail route for Arena surfaces.
 *
 * Mock token ids keep their seeded token detail route. API-backed ids can pass
 * through to /token/:campaignAddress, which is the existing TokenDetails route.
 */
export function getArenaTokenRoute(tokenId?: string | null) {
  return getPostGradTokenDetailRoute(tokenId);
}
