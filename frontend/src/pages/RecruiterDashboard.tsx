import { Navigate } from "react-router-dom";

export default function RecruiterDashboard() {
  return <Navigate to="/profile?tab=recruiter" replace />;
}
