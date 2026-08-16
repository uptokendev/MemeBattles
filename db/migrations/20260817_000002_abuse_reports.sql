-- Abuse system Phase 2: isolated report/conversation/evidence/audit tables.
-- Never reuse public.tickets. Railway/service-role Postgres only.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.abuse_report_reference_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS public.abuse_reporter_sessions (
  token_hash text PRIMARY KEY,
  wallet_address text NOT NULL,
  chain_id integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT abuse_reporter_sessions_token_hash_length CHECK (length(token_hash) = 64)
);

CREATE INDEX IF NOT EXISTS abuse_reporter_sessions_wallet_idx
  ON public.abuse_reporter_sessions (wallet_address, chain_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference text NOT NULL UNIQUE,
  reporter_wallet text NOT NULL,
  reporter_chain integer NOT NULL,
  reporter_email text NOT NULL,
  category text NOT NULL,
  subject text,
  description text NOT NULL,
  reported_entity_type text,
  reported_wallet text,
  reported_profile_id text,
  reported_campaign_address text,
  reported_token_address text,
  reported_url text,
  status text NOT NULL DEFAULT 'OPEN',
  priority text NOT NULL DEFAULT 'NORMAL',
  assigned_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  CONSTRAINT abuse_reports_category_chk CHECK (
    category IN ('impersonation', 'stolen_content', 'fake_project', 'phishing', 'other')
  ),
  CONSTRAINT abuse_reports_status_chk CHECK (
    status IN ('OPEN', 'UNDER_REVIEW', 'WAITING_FOR_REPORTER', 'RESOLVED', 'CLOSED')
  ),
  CONSTRAINT abuse_reports_priority_chk CHECK (
    priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  ),
  CONSTRAINT abuse_reports_entity_type_chk CHECK (
    reported_entity_type IS NULL OR reported_entity_type IN (
      'profile', 'campaign', 'token', 'wallet', 'external_account', 'external_website', 'other'
    )
  )
);

CREATE INDEX IF NOT EXISTS abuse_reports_reporter_idx
  ON public.abuse_reports (reporter_wallet, reporter_chain, created_at DESC);

CREATE INDEX IF NOT EXISTS abuse_reports_status_idx
  ON public.abuse_reports (status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS public.abuse_report_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.abuse_reports(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_wallet text,
  sender_admin_id uuid,
  message text NOT NULL,
  visibility text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CONSTRAINT abuse_report_messages_sender_chk CHECK (sender_type IN ('reporter', 'admin')),
  CONSTRAINT abuse_report_messages_visibility_chk CHECK (visibility IN ('reporter', 'internal'))
);

CREATE INDEX IF NOT EXISTS abuse_report_messages_report_idx
  ON public.abuse_report_messages (report_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.abuse_report_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.abuse_reports(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.abuse_report_messages(id) ON DELETE SET NULL,
  uploaded_by_type text NOT NULL,
  uploaded_by_wallet text,
  uploaded_by_admin_id uuid,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abuse_report_evidence_uploader_chk CHECK (uploaded_by_type IN ('reporter', 'admin')),
  CONSTRAINT abuse_report_evidence_size_chk CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT abuse_report_evidence_mime_chk CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  )
);

CREATE INDEX IF NOT EXISTS abuse_report_evidence_report_idx
  ON public.abuse_report_evidence (report_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.abuse_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.abuse_reports(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  old_value text,
  new_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abuse_report_events_actor_chk CHECK (actor_type IN ('reporter', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS abuse_report_events_report_idx
  ON public.abuse_report_events (report_id, created_at DESC);

ALTER TABLE public.abuse_reporter_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_report_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_report_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_report_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.abuse_reporter_sessions FROM anon;
    REVOKE ALL ON TABLE public.abuse_reports FROM anon;
    REVOKE ALL ON TABLE public.abuse_report_messages FROM anon;
    REVOKE ALL ON TABLE public.abuse_report_evidence FROM anon;
    REVOKE ALL ON TABLE public.abuse_report_events FROM anon;
    REVOKE ALL ON SEQUENCE public.abuse_report_reference_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.abuse_reporter_sessions FROM authenticated;
    REVOKE ALL ON TABLE public.abuse_reports FROM authenticated;
    REVOKE ALL ON TABLE public.abuse_report_messages FROM authenticated;
    REVOKE ALL ON TABLE public.abuse_report_evidence FROM authenticated;
    REVOKE ALL ON TABLE public.abuse_report_events FROM authenticated;
    REVOKE ALL ON SEQUENCE public.abuse_report_reference_seq FROM authenticated;
  END IF;
END
$$;

COMMIT;
