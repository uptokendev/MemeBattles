import { Navigate, useParams } from "react-router-dom";

export default function BattleDetails() {
  const { id } = useParams();
  return <Navigate to={id ? `/token/${id}` : "/arena/battles"} replace />;
}
