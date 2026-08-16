-- Abuse system Phase 1: employee RBAC + permission audit.
-- Isolated from Discord tickets and from launchpad/reward audit tables.
-- Railway/service-role Postgres only. Public Supabase roles get nothing.

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  employee_email text NOT NULL,
  permission text NOT NULL,
  granted_by uuid,
  granted_by_email text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT employee_permissions_permission_chk CHECK (
    permission IN ('abuse.view', 'abuse.reply', 'abuse.manage', 'abuse.admin')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_permissions_active_uidx
  ON public.employee_permissions (employee_id, permission)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS employee_permissions_employee_idx
  ON public.employee_permissions (employee_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS employee_permissions_email_idx
  ON public.employee_permissions (lower(employee_email))
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.abuse_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  actor_email text,
  subject_id text,
  subject_email text,
  old_value text,
  new_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abuse_audit_events_event_type_chk CHECK (
    event_type IN ('PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'UNAUTHORIZED_ACCESS')
  ),
  CONSTRAINT abuse_audit_events_actor_type_chk CHECK (
    actor_type IN ('admin', 'system')
  )
);

CREATE INDEX IF NOT EXISTS abuse_audit_events_created_idx
  ON public.abuse_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS abuse_audit_events_actor_idx
  ON public.abuse_audit_events (actor_id, created_at DESC);

ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_audit_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.employee_permissions FROM anon;
    REVOKE ALL ON TABLE public.abuse_audit_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.employee_permissions FROM authenticated;
    REVOKE ALL ON TABLE public.abuse_audit_events FROM authenticated;
  END IF;
END
$$;

COMMIT;
