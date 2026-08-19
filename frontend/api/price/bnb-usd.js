import { json } from "../../server/http.js";
import { resolveBnbUsdPrice } from "../lib/bnbUsdPrice.js";

export default async function bnbUsdPrice(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const resolved = await resolveBnbUsdPrice();
  if (!(resolved.price > 0)) return json(res, 503, { error: "BNB/USD price unavailable", price: null });
  return json(res, 200, { price: resolved.price, source: resolved.source });
}
