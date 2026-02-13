BEGIN;

-- Track most-recent activity (trade OR upvote) per campaign.
CREATE TABLE IF NOT EXISTS public.campaign_activity (
  chain_id          INTEGER NOT NULL,
  campaign_address  TEXT NOT NULL,          -- lowercase
  last_activity_at  TIMESTAMPTZ NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (chain_id, campaign_address),
  CONSTRAINT campaign_activity_campaign_lowercase CHECK (campaign_address = lower(campaign_address))
);

CREATE INDEX IF NOT EXISTS idx_campaign_activity_chain_last
  ON public.campaign_activity (chain_id, last_activity_at DESC NULLS LAST);

-- Backfill from existing data (max trade time vs. max vote time). Safe to run multiple times.
INSERT INTO public.campaign_activity (chain_id, campaign_address, last_activity_at)
SELECT
  c.chain_id,
  c.campaign_address,
  GREATEST(
    COALESCE(t.last_trade_at, to_timestamp(0)),
    COALESCE(v.last_vote_at,  to_timestamp(0)),
    COALESCE(c.created_at_chain, to_timestamp(0))
  ) AS last_activity_at
FROM public.campaigns c
LEFT JOIN (
  SELECT chain_id, campaign_address, MAX(block_time) AS last_trade_at
  FROM public.curve_trades
  GROUP BY chain_id, campaign_address
) t
  ON t.chain_id = c.chain_id AND t.campaign_address = c.campaign_address
LEFT JOIN (
  SELECT chain_id, campaign_address, MAX(block_timestamp) AS last_vote_at
  FROM public.votes
  WHERE status='confirmed'
  GROUP BY chain_id, campaign_address
) v
  ON v.chain_id = c.chain_id AND v.campaign_address = c.campaign_address
ON CONFLICT (chain_id, campaign_address) DO UPDATE
SET last_activity_at = GREATEST(
  EXCLUDED.last_activity_at,
  COALESCE(public.campaign_activity.last_activity_at, to_timestamp(0))
),
updated_at = now();

COMMIT;
