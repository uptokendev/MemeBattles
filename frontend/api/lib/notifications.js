/**
 * Safely inserts a notification event and an optional marker in a transaction.
 * Resolves silently if the marker or dedup_key already exists.
 * @param {Object} db - The pg client or pool to use. Can be a transaction client.
 * @param {Object} params
 * @param {string} params.eventType - e.g. "campaign.created"
 * @param {string} params.chain - "solana", "bnb", etc.
 * @param {string} params.dedupKey - unique message dedup key
 * @param {Object} params.payload - JSON payload
 * @param {string} [params.markerKey] - optional per-item once-only marker key
 */
export async function emitNotification(db, { eventType, chain, dedupKey, payload, markerKey }) {
  try {
    if (markerKey) {
      const { rowCount } = await db.query(
        `INSERT INTO public.notification_markers (marker_key)
         VALUES ($1) ON CONFLICT DO NOTHING`,
        [markerKey]
      );
      if (rowCount === 0) {
        // Marker already exists, skip
        return false;
      }
    }
    
    await db.query(
      `INSERT INTO public.notification_outbox (event_type, chain, dedup_key, payload)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [eventType, chain, dedupKey, JSON.stringify(payload)]
    );
    return true;
  } catch (err) {
    console.error("[api/lib/notifications] emitNotification error:", err);
    throw err;
  }
}
