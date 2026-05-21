import { Navigate, useParams } from "react-router-dom";
import { getMockTokenById } from "@/features/postgrad/mockRegistry";

const LegacyArenaTokenRedirect = () => {
  const { tokenId } = useParams();
  const token = getMockTokenById(tokenId);

  if (!token) {
    return <Navigate to="/arena" replace />;
  }

  return <Navigate to={`/token/${token.campaignAddress.toLowerCase()}`} replace />;
};

export default LegacyArenaTokenRedirect;
