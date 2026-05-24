import { badMethod, getQuery, json } from "../server/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  const q = getQuery(req);
  const chainId = Number(q.chainId ?? 97);
  if (!Number.isFinite(chainId)) return json(res, 400, { error: "Invalid chainId" });

  return json(res, 200, {
    active: [],
    upcoming: [
      {
        id: "league-cycle",
        label: "Current league cycle",
        href: "/arena/leagues",
        status: "Live",
        meta: "Standings and reward context are already available in Leagues.",
      },
    ],
    tournaments: [],
    updatedAt: new Date().toISOString(),
    warning: "Dedicated event runtime is still being connected. League state is the first live source in this hub.",
  });
}
