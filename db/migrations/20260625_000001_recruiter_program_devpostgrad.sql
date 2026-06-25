BEGIN;

CREATE TABLE IF NOT EXISTS public.wallet_profiles (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_profiles_wallet_lowercase CHECK (wallet_address = lower(wallet_address))
);

ALTER TABLE public.wallet_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.auth_nonces (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, address),
  CONSTRAINT auth_nonces_address_lowercase CHECK (address = lower(address))
);

ALTER TABLE public.auth_nonces
  ADD COLUMN IF NOT EXISTS nonce TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.recruiters (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  code TEXT NOT NULL,
  display_name TEXT,
  is_og BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recruiters_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT recruiters_code_lowercase CHECK (code = lower(code)),
  CONSTRAINT recruiters_status_valid CHECK (status IN ('active', 'inactive', 'blocked', 'closed'))
);

ALTER TABLE public.recruiters
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS is_og BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS recruiters_wallet_address_unique
  ON public.recruiters (wallet_address);

CREATE UNIQUE INDEX IF NOT EXISTS recruiters_code_unique
  ON public.recruiters (lower(code));

CREATE INDEX IF NOT EXISTS recruiters_status_created_idx
  ON public.recruiters (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_referral_attribution_windows (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  client_fingerprint TEXT,
  session_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_referral_windows_wallet_lowercase CHECK (wallet_address IS NULL OR wallet_address = lower(wallet_address))
);

ALTER TABLE public.wallet_referral_attribution_windows
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_id BIGINT,
  ADD COLUMN IF NOT EXISTS client_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS session_token TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS wallet_referral_windows_session_idx
  ON public.wallet_referral_attribution_windows (session_token, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS wallet_referral_windows_fingerprint_idx
  ON public.wallet_referral_attribution_windows (client_fingerprint, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS wallet_referral_windows_wallet_idx
  ON public.wallet_referral_attribution_windows (wallet_address, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.wallet_recruiter_links (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  link_source TEXT NOT NULL DEFAULT 'referral_cookie',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_recruiter_links_wallet_lowercase CHECK (wallet_address = lower(wallet_address))
);

ALTER TABLE public.wallet_recruiter_links
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_id BIGINT,
  ADD COLUMN IF NOT EXISTS link_source TEXT DEFAULT 'referral_cookie',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS wallet_recruiter_links_active_wallet_unique
  ON public.wallet_recruiter_links (wallet_address)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS wallet_recruiter_links_recruiter_idx
  ON public.wallet_recruiter_links (recruiter_id, linked_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_squad_memberships (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member',
  link_source TEXT NOT NULL DEFAULT 'referral_cookie',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_squad_memberships_wallet_lowercase CHECK (wallet_address = lower(wallet_address)),
  CONSTRAINT wallet_squad_memberships_role_valid CHECK (member_role IN ('creator', 'trader', 'member'))
);

ALTER TABLE public.wallet_squad_memberships
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_id BIGINT,
  ADD COLUMN IF NOT EXISTS member_role TEXT DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS link_source TEXT DEFAULT 'referral_cookie',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS wallet_squad_memberships_active_wallet_unique
  ON public.wallet_squad_memberships (wallet_address)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS wallet_squad_memberships_recruiter_idx
  ON public.wallet_squad_memberships (recruiter_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS public.recruiter_admin_actions (
  id BIGSERIAL PRIMARY KEY,
  recruiter_id BIGINT REFERENCES public.recruiters(id) ON DELETE SET NULL,
  target_wallet TEXT,
  action TEXT NOT NULL,
  before JSONB,
  after JSONB,
  reason TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.recruiter_admin_actions
  ADD COLUMN IF NOT EXISTS recruiter_id BIGINT,
  ADD COLUMN IF NOT EXISTS target_wallet TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS before JSONB,
  ADD COLUMN IF NOT EXISTS after JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS recruiter_admin_actions_recruiter_idx
  ON public.recruiter_admin_actions (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_admin_actions_target_wallet_idx
  ON public.recruiter_admin_actions (lower(target_wallet), created_at DESC);

CREATE OR REPLACE VIEW public.wallet_attribution_states AS
SELECT
  p.wallet_address,
  COALESCE(a.has_activity, FALSE) AS has_activity,
  CASE
    WHEN l.wallet_address IS NULL THEN 'unlinked'
    WHEN COALESCE(a.has_activity, FALSE) THEN 'linked_locked'
    ELSE 'linked_unlocked'
  END AS recruiter_link_state,
  r.id AS recruiter_id,
  r.code AS recruiter_code,
  r.display_name AS recruiter_display_name,
  COALESCE(r.is_og, FALSE) AS recruiter_is_og,
  CASE
    WHEN s.wallet_address IS NULL THEN 'solo'
    WHEN COALESCE(s.is_active, TRUE) THEN 'in_squad'
    ELSE 'inactive'
  END AS squad_state,
  CASE WHEN COALESCE(a.has_activity, FALSE) THEN GREATEST(l.linked_at, s.joined_at) ELSE NULL END AS locked_at
FROM public.wallet_profiles p
LEFT JOIN public.wallet_recruiter_links l
  ON l.wallet_address = p.wallet_address
 AND COALESCE(l.is_active, TRUE) = TRUE
LEFT JOIN public.wallet_squad_memberships s
  ON s.wallet_address = p.wallet_address
 AND COALESCE(s.is_active, TRUE) = TRUE
LEFT JOIN public.recruiters r
  ON r.id = COALESCE(l.recruiter_id, s.recruiter_id)
LEFT JOIN (
  SELECT wallet_address, TRUE AS has_activity
  FROM public.wallet_recruiter_links
  GROUP BY wallet_address
) a ON a.wallet_address = p.wallet_address;

COMMIT;
