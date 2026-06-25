BEGIN;

CREATE TABLE IF NOT EXISTS public.recruiters (
  id BIGSERIAL PRIMARY KEY,
  wallet TEXT NOT NULL,
  code TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'command_center',
  source_metadata JSONB,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recruiters_wallet_lowercase CHECK (wallet = lower(wallet)),
  CONSTRAINT recruiters_code_lowercase CHECK (code = lower(code)),
  CONSTRAINT recruiters_status_valid CHECK (status IN ('active', 'inactive', 'blocked'))
);

ALTER TABLE public.recruiters
  ADD COLUMN IF NOT EXISTS wallet TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'command_center',
  ADD COLUMN IF NOT EXISTS source_metadata JSONB,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS recruiters_wallet_unique
  ON public.recruiters (lower(wallet));

CREATE UNIQUE INDEX IF NOT EXISTS recruiters_code_unique
  ON public.recruiters (lower(code));

CREATE INDEX IF NOT EXISTS recruiters_status_created_idx
  ON public.recruiters (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_recruiter_links (
  id BIGSERIAL PRIMARY KEY,
  wallet TEXT NOT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  recruiter_code TEXT NOT NULL,
  member_role TEXT,
  link_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'referral_link',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_recruiter_links_wallet_lowercase CHECK (wallet = lower(wallet)),
  CONSTRAINT wallet_recruiter_links_code_lowercase CHECK (recruiter_code = lower(recruiter_code)),
  CONSTRAINT wallet_recruiter_links_role_valid CHECK (member_role IS NULL OR member_role IN ('creator', 'trader', 'member')),
  CONSTRAINT wallet_recruiter_links_status_valid CHECK (link_status IN ('active', 'inactive', 'blocked')),
  CONSTRAINT wallet_recruiter_links_wallet_recruiter_unique UNIQUE (wallet, recruiter_id)
);

ALTER TABLE public.wallet_recruiter_links
  ADD COLUMN IF NOT EXISTS wallet TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_id BIGINT,
  ADD COLUMN IF NOT EXISTS recruiter_code TEXT,
  ADD COLUMN IF NOT EXISTS member_role TEXT,
  ADD COLUMN IF NOT EXISTS link_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'referral_link',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS wallet_recruiter_links_wallet_recruiter_idx
  ON public.wallet_recruiter_links (wallet, recruiter_id);

CREATE INDEX IF NOT EXISTS wallet_recruiter_links_recruiter_idx
  ON public.wallet_recruiter_links (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_recruiter_links_code_idx
  ON public.wallet_recruiter_links (lower(recruiter_code), created_at DESC);

CREATE TABLE IF NOT EXISTS public.wallet_squad_memberships (
  id BIGSERIAL PRIMARY KEY,
  wallet TEXT NOT NULL,
  recruiter_id BIGINT NOT NULL REFERENCES public.recruiters(id) ON DELETE CASCADE,
  recruiter_code TEXT NOT NULL,
  member_role TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'referral_link',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_squad_memberships_wallet_lowercase CHECK (wallet = lower(wallet)),
  CONSTRAINT wallet_squad_memberships_code_lowercase CHECK (recruiter_code = lower(recruiter_code)),
  CONSTRAINT wallet_squad_memberships_role_valid CHECK (member_role IS NULL OR member_role IN ('creator', 'trader', 'member')),
  CONSTRAINT wallet_squad_memberships_status_valid CHECK (status IN ('active', 'inactive', 'blocked')),
  CONSTRAINT wallet_squad_memberships_wallet_recruiter_unique UNIQUE (wallet, recruiter_id)
);

ALTER TABLE public.wallet_squad_memberships
  ADD COLUMN IF NOT EXISTS wallet TEXT,
  ADD COLUMN IF NOT EXISTS recruiter_id BIGINT,
  ADD COLUMN IF NOT EXISTS recruiter_code TEXT,
  ADD COLUMN IF NOT EXISTS member_role TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'referral_link',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS wallet_squad_memberships_wallet_recruiter_idx
  ON public.wallet_squad_memberships (wallet, recruiter_id);

CREATE INDEX IF NOT EXISTS wallet_squad_memberships_recruiter_idx
  ON public.wallet_squad_memberships (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_squad_memberships_code_idx
  ON public.wallet_squad_memberships (lower(recruiter_code), created_at DESC);

CREATE TABLE IF NOT EXISTS public.recruiter_admin_actions (
  id BIGSERIAL PRIMARY KEY,
  recruiter_id BIGINT,
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

COMMIT;
