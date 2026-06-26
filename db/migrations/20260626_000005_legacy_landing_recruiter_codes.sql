BEGIN;

WITH raw AS (
  SELECT
    r.id,
    r.wallet_address,
    r.code,
    r.metadata,
    NULLIF(lower(regexp_replace(regexp_replace(COALESCE(
      r.metadata #>> '{legacyLandingSignup,xHandle}',
      r.metadata #>> '{legacyLandingSignup,x_handle}',
      r.metadata #>> '{landingSignup,xHandle}',
      r.metadata #>> '{landingSignup,x_handle}',
      r.metadata #>> '{backfill,source_row,xHandle}',
      r.metadata #>> '{backfill,source_row,x_handle}',
      r.metadata #>> '{backfill,source_row,twitter}',
      r.metadata #>> '{backfill,source_row,handle}',
      r.metadata #>> '{backfill,source_row,username}',
      r.metadata ->> 'xHandle',
      r.metadata ->> 'x_handle',
      r.metadata ->> 'twitter',
      r.metadata ->> 'handle',
      r.metadata ->> 'username'
    ), '^https?://(www\.)?(x|twitter)\.com/', '', 'i'), '^@', '')), '') AS raw_handle
  FROM public.recruiters r
  WHERE r.metadata IS NOT NULL
), normalized AS (
  SELECT
    id,
    wallet_address,
    code,
    left(regexp_replace(raw_handle, '[^a-z0-9_]+', '-', 'g'), 32) AS base_code
  FROM raw
  WHERE raw_handle IS NOT NULL
), candidates AS (
  SELECT
    n.*,
    CASE
      WHEN n.base_code IS NULL OR length(n.base_code) < 2 THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM public.recruiters other
        WHERE lower(other.code) = lower(n.base_code)
          AND other.id <> n.id
      ) THEN left(n.base_code, 27) || '-' || substr(md5(n.wallet_address), 1, 4)
      ELSE n.base_code
    END AS next_code
  FROM normalized n
), updated AS (
  UPDATE public.recruiters r
  SET
    code = c.next_code,
    metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('legacyLandingSignup', jsonb_build_object('source', 'legacy_landing', 'xHandleCodeBackfilled', true, 'previousCode', r.code, 'backfilledAt', now())),
    updated_at = now()
  FROM candidates c
  WHERE r.id = c.id
    AND c.next_code IS NOT NULL
    AND (
      r.code IS NULL
      OR r.code = ''
      OR r.code ~ '^recruiter-[0-9a-f]{8}$'
      OR r.code ~ '^legacy-[0-9a-f]{8}$'
    )
  RETURNING r.id
)
UPDATE public.recruiters r
SET
  metadata = COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('legacyLandingSignup', jsonb_build_object('source', 'legacy_landing', 'xHandleCodeBackfilled', false, 'markedAt', now())),
  updated_at = now()
WHERE r.id IN (SELECT id FROM candidates)
  AND r.id NOT IN (SELECT id FROM updated)
  AND NOT (COALESCE(r.metadata, '{}'::jsonb) ? 'signup');

COMMIT;
