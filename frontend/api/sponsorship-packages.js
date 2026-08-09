import { pool } from "../server/db.js";
import { badMethod, json } from "../server/http.js";

/**
 * Public list of sponsorship duration packages (prices editable by admin in Supabase/dashboard).
 * GET /api/sponsorship-packages
 */
export default async function handler(req, res) {
  if (req.method !== "GET") return badMethod(res);

  try {
    if (!pool) {
      return json(res, 200, {
        items: defaultPackages(),
        source: "defaults",
        updatedAt: new Date().toISOString(),
        warning: "Database unavailable; using default package catalog.",
      });
    }

    const result = await pool.query(
      `select
         id::text as "id",
         code,
         label,
         duration_days as "durationDays",
         price_usd::float8 as "priceUsd",
         currency,
         active,
         sort_order as "sortOrder",
         notes
       from public.sponsorship_packages
       where coalesce(active, true) = true
       order by sort_order asc, duration_days asc`,
    );

    if (!result.rows.length) {
      return json(res, 200, {
        items: defaultPackages(),
        source: "defaults",
        updatedAt: new Date().toISOString(),
        warning: "No packages in DB; using defaults. Run database/sponsorship_packages.sql",
      });
    }

    return json(res, 200, {
      items: result.rows,
      source: "database",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/sponsorship-packages]", error);
    return json(res, 200, {
      items: defaultPackages(),
      source: "defaults",
      updatedAt: new Date().toISOString(),
      warning: String(error?.message || error),
    });
  }
}

function defaultPackages() {
  return [
    { id: "d3", code: "d3", label: "3 days", durationDays: 3, priceUsd: 49, currency: "USD", active: true, sortOrder: 10 },
    { id: "w1", code: "w1", label: "1 week", durationDays: 7, priceUsd: 99, currency: "USD", active: true, sortOrder: 20 },
    { id: "w2", code: "w2", label: "2 weeks", durationDays: 14, priceUsd: 179, currency: "USD", active: true, sortOrder: 30 },
    { id: "m1", code: "m1", label: "1 month", durationDays: 30, priceUsd: 299, currency: "USD", active: true, sortOrder: 40 },
    { id: "m3", code: "m3", label: "3 months", durationDays: 90, priceUsd: 699, currency: "USD", active: true, sortOrder: 50 },
  ];
}
