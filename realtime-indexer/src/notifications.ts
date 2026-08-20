import { Pool, PoolClient } from "pg";

export async function emitNotification(
  db: Pool | PoolClient,
  params: {
    eventType: string;
    chain: string;
    dedupKey: string;
    payload: any;
    markerKey?: string;
  }
): Promise<boolean> {
  try {
    if (params.markerKey) {
      const res = await db.query(
        `INSERT INTO public.notification_markers (marker_key)
         VALUES ($1) ON CONFLICT DO NOTHING`,
        [params.markerKey]
      );
      if (res.rowCount === 0) {
        return false; // Marker already exists, skipped
      }
    }
    
    await db.query(
      `INSERT INTO public.notification_outbox (event_type, chain, dedup_key, payload)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [params.eventType, params.chain, params.dedupKey, JSON.stringify(params.payload)]
    );
    return true;
  } catch (err) {
    console.error("[realtime-indexer/notifications] emitNotification error:", err);
    throw err;
  }
}
