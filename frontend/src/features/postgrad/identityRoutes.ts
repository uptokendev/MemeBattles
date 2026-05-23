import { getMockTokenRouteById } from "@/features/postgrad/mockRegistry";

function normalizeIdentity(value?: string | null) {
  return String(value ?? "").trim();
}

function isUsableIdentity(value?: string | null) {
  const identity = normalizeIdentity(value);
  if (!identity) return false;
  if (identity.startsWith("pending-")) return false;
  return identity.length > 4;
}

export function getPostGradTokenDetailRoute(identity?: string | null) {
  const value = normalizeIdentity(identity);
  if (!isUsableIdentity(value)) return null;
  return getMockTokenRouteById(value) ?? `/token/${encodeURIComponent(value)}`;
}

export function getPostGradWarRoomSearchRoute(label?: string | null) {
  const value = normalizeIdentity(label);
  return value ? `/war-room?search=${encodeURIComponent(value)}` : "/war-room";
}
