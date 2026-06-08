import { Link, useLocation } from "react-router-dom";
import { Play } from "lucide-react";

// Live status polling + Mux HEAD checks removed to eliminate 412 Precondition Failed spam
// and "No Listener" noise from the stream (no active broadcast). The overlay is disabled.
export function LiveStreamOverlay() {
  const location = useLocation();
  if (location.pathname === "/live") return null;

  // To re-enable a live banner, restore the useQuery + checkLive and conditional render.
  return null;
}
