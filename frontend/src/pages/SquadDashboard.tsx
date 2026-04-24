import { Navigate } from "react-router-dom";

export default function SquadDashboard() {
  return <Navigate to="/profile?tab=squad" replace />;
}
