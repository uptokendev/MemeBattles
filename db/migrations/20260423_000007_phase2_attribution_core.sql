BEGIN;

CREATE TABLE IF NOT EXISTS public.recruiters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  code TEXT NOT NULL,
  display_name TEXT NULL,
  is_og BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  closed_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recruiters_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT recruiters_wallet_nonempty CHECK (length(trim(wallet_address)) > 0),
  CONSTRAINT recruiters_code_nonempty CHECK (length(trim(code)) > 0),
  CONSTRAINT recruiters_status_chk CHECK (status IN ('active', 'inactive', 'closed', 'suspended'))
);

CREATE UNIQUE INDEX IF NOT EXISTS recruiters_wallet_uidx
  ON public.recruiters (wallet_address);

CREATE UNIQUE INDEX IF NOT EXISTS recruiters_code_ci_uidx
  ON public.recruiters ((lower(code)));

CREATE INDEX IF NOT EXISTS recruiters_status_idx
  ON public.recruiters (status, is_og, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_profiles (
  wallet_address TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_activity_at TIMESTAMPTZ NULL,
  has_activity BOOLEAN NOT NULL DEFAULT false,
  created_campaign_count INTEGER NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  last_campaign_created_at TIMESTAMPTZ NULL,
  last_trade_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_profiles_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT wallet_profiles_counts_nonnegative CHECK (created_campaign_count >= 0 AND trade_count >= 0)
);

CREATE INDEX IF NOT EXISTS wallet_profiles_has_activity_idx
  ON public.wallet_profiles (has_activity, first_activity_at);

CREATE TABLE IF NOT EXISTS public.wallet_recruiter_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE RESTRICT,
  link_source TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ NULL,
  detached_at TIMESTAMPTZ NULL,
  detach_reason TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_recruiter_links_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT wallet_recruiter_links_source_chk CHECK (link_source IN ('referral_cookie', 'manual', 'admin_override', 'migration'))
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_recruiter_links_one_active_uidx
  ON public.wallet_recruiter_links (wallet_address)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS wallet_recruiter_links_wallet_idx
  ON public.wallet_recruiter_links (wallet_address, linked_at DESC);

CREATE INDEX IF NOT EXISTS wallet_recruiter_links_recruiter_idx
  ON public.wallet_recruiter_links (recruiter_id, is_active, linked_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_referral_attribution_windows (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  client_fingerprint TEXT NULL,
  session_token TEXT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_referral_windows_wallet_lowercase CHECK (wallet_address IS NULL OR wallet_address = lower(wallet_address)),
  CONSTRAINT wallet_referral_windows_identifier_chk CHECK (
    wallet_address IS NOT NULL OR client_fingerprint IS NOT NULL OR session_token IS NOT NULL
  ),
  CONSTRAINT wallet_referral_windows_expiry_chk CHECK (expires_at > captured_at)
);

CREATE INDEX IF NOT EXISTS wallet_referral_windows_wallet_idx
  ON public.wallet_referral_attribution_windows (wallet_address, captured_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS wallet_referral_windows_session_idx
  ON public.wallet_referral_attribution_windows (session_token, captured_at DESC)
  WHERE consumed_at IS NULL AND session_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_referral_windows_fingerprint_idx
  ON public.wallet_referral_attribution_windows (client_fingerprint, captured_at DESC)
  WHERE consumed_at IS NULL AND client_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wallet_squad_memberships (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ NULL,
  leave_reason TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_squad_memberships_wallet_lowercase CHECK (wallet_address = lower(wallet_address))
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_squad_memberships_one_active_uidx
  ON public.wallet_squad_memberships (wallet_address)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS wallet_squad_memberships_wallet_idx
  ON public.wallet_squad_memberships (wallet_address, joined_at DESC);

CREATE INDEX IF NOT EXISTS wallet_squad_memberships_recruiter_idx
  ON public.wallet_squad_memberships (recruiter_id, is_active, joined_at DESC);

CREATE OR REPLACE VIEW public.wallet_attribution_states AS
WITH active_links AS (
  SELECT DISTINCT ON (l.wallet_address)
    l.wallet_address,
    l.id AS link_id,
    l.recruiter_id,
    l.link_source,
    l.linked_at,
    l.locked_at,
    l.detached_at,
    l.detach_reason,
    l.is_active,
    r.wallet_address AS recruiter_wallet_address,
    r.code AS recruiter_code,
    r.display_name AS recruiter_display_name,
    r.is_og AS recruiter_is_og,
    r.status AS recruiter_status
  FROM public.wallet_recruiter_links l
  JOIN public.recruiters r ON r.id = l.recruiter_id
  WHERE l.is_active = true
  ORDER BY l.wallet_address, l.linked_at DESC, l.id DESC
),
last_links AS (
  SELECT DISTINCT ON (l.wallet_address)
    l.wallet_address,
    l.id AS last_link_id,
    l.recruiter_id AS last_recruiter_id,
    l.link_source AS last_link_source,
    l.linked_at AS last_linked_at,
    l.locked_at AS last_locked_at,
    l.detached_at AS last_detached_at,
    l.detach_reason AS last_detach_reason,
    l.is_active AS last_is_active,
    r.wallet_address AS last_recruiter_wallet_address,
    r.code AS last_recruiter_code,
    r.display_name AS last_recruiter_display_name,
    r.is_og AS last_recruiter_is_og,
    r.status AS last_recruiter_status
  FROM public.wallet_recruiter_links l
  JOIN public.recruiters r ON r.id = l.recruiter_id
  ORDER BY l.wallet_address, coalesce(l.detached_at, l.linked_at) DESC, l.id DESC
),
active_squads AS (
  SELECT DISTINCT ON (s.wallet_address)
    s.wallet_address,
    s.id AS squad_membership_id,
    s.recruiter_id AS squad_recruiter_id,
    s.joined_at,
    s.left_at,
    s.leave_reason,
    s.is_active,
    r.code AS squad_recruiter_code,
    r.display_name AS squad_recruiter_display_name,
    r.is_og AS squad_recruiter_is_og,
    r.status AS squad_recruiter_status
  FROM public.wallet_squad_memberships s
  JOIN public.recruiters r ON r.id = s.recruiter_id
  WHERE s.is_active = true
  ORDER BY s.wallet_address, s.joined_at DESC, s.id DESC
),
all_wallets AS (
  SELECT wallet_address FROM public.wallet_profiles
  UNION
  SELECT wallet_address FROM public.wallet_recruiter_links
  UNION
  SELECT wallet_address FROM public.wallet_squad_memberships
  UNION
  SELECT wallet_address FROM public.wallet_referral_attribution_windows WHERE wallet_address IS NOT NULL
)
SELECT
  w.wallet_address,
  p.first_seen_at,
  p.first_activity_at,
  coalesce(p.has_activity, false) AS has_activity,
  coalesce(p.created_campaign_count, 0) AS created_campaign_count,
  coalesce(p.trade_count, 0) AS trade_count,
  p.last_campaign_created_at,
  p.last_trade_at,
  a.link_id,
  a.recruiter_id,
  a.recruiter_wallet_address,
  a.recruiter_code,
  a.recruiter_display_name,
  a.recruiter_is_og,
  a.recruiter_status,
  a.link_source,
  a.linked_at,
  a.locked_at,
  s.squad_membership_id,
  s.squad_recruiter_id,
  s.squad_recruiter_code,
  s.squad_recruiter_display_name,
  s.squad_recruiter_is_og,
  s.squad_recruiter_status,
  s.joined_at AS squad_joined_at,
  l.last_link_id,
  l.last_recruiter_id,
  l.last_recruiter_wallet_address,
  l.last_recruiter_code,
  l.last_recruiter_display_name,
  l.last_recruiter_is_og,
  l.last_recruiter_status,
  l.last_link_source,
  l.last_linked_at,
  l.last_locked_at,
  l.last_detached_at,
  l.last_detach_reason,
  CASE
    WHEN a.link_id IS NOT NULL AND a.locked_at IS NULL THEN 'linked_unlocked'
    WHEN a.link_id IS NOT NULL AND a.locked_at IS NOT NULL THEN 'linked_locked'
    WHEN l.last_link_id IS NOT NULL AND l.last_detached_at IS NOT NULL AND l.last_recruiter_status = 'closed' THEN 'closed_history'
    WHEN l.last_link_id IS NOT NULL AND l.last_detached_at IS NOT NULL THEN 'detached'
    ELSE 'unlinked'
  END AS recruiter_link_state,
  CASE
    WHEN s.squad_membership_id IS NOT NULL THEN 'in_squad'
    WHEN l.last_link_id IS NOT NULL AND l.last_detached_at IS NOT NULL THEN 'solo_detached'
    ELSE 'solo'
  END AS squad_state,
  now() AS materialized_at
FROM all_wallets w
LEFT JOIN public.wallet_profiles p ON p.wallet_address = w.wallet_address
LEFT JOIN active_links a ON a.wallet_address = w.wallet_address
LEFT JOIN active_squads s ON s.wallet_address = w.wallet_address
LEFT JOIN last_links l ON l.wallet_address = w.wallet_address;

COMMIT;
