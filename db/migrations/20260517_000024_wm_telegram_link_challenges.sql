BEGIN;

CREATE TABLE IF NOT EXISTS public.wm_social_link_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wm_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wm_social_link_challenges_provider_valid CHECK (provider IN ('telegram'))
);

CREATE INDEX IF NOT EXISTS idx_wm_social_link_challenges_lookup
  ON public.wm_social_link_challenges(provider, token, expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wm_social_link_challenges_user
  ON public.wm_social_link_challenges(user_id, provider, created_at DESC);

COMMIT;
