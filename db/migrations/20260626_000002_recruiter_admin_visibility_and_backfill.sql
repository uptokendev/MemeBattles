BEGIN;

-- The web-dashboard uses the browser Supabase client. These grants/policies make the
-- canonical recruiter tables visible/editable to logged-in dashboard users when RLS
-- or missing privileges would otherwise make the page look empty.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE public.recruiters TO anon, authenticated;
GRANT SELECT ON TABLE public.wallet_recruiter_links TO anon, authenticated;
GRANT SELECT ON TABLE public.wallet_squad_memberships TO anon, authenticated;
GRANT SELECT ON TABLE public.recruiter_admin_actions TO anon, authenticated;
GRANT SELECT ON TABLE public.wallet_referral_attribution_windows TO anon, authenticated;
GRANT SELECT ON TABLE public.wallet_profiles TO anon, authenticated;

GRANT INSERT, UPDATE ON TABLE public.recruiters TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.wallet_recruiter_links TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.wallet_squad_memberships TO authenticated;
GRANT INSERT ON TABLE public.recruiter_admin_actions TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.wallet_profiles TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'recruiters',
    'wallet_recruiter_links',
    'wallet_squad_memberships',
    'recruiter_admin_actions',
    'wallet_referral_attribution_windows',
    'wallet_profiles'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    policy_name := table_name || '_dashboard_select_authenticated';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', policy_name, table_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'recruiters',
    'wallet_recruiter_links',
    'wallet_squad_memberships',
    'wallet_profiles'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    policy_name := table_name || '_dashboard_update_authenticated';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', policy_name, table_name);
    END IF;
  END LOOP;

  IF to_regclass('public.recruiter_admin_actions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'recruiter_admin_actions'
         AND policyname = 'recruiter_admin_actions_dashboard_insert_authenticated'
     ) THEN
    CREATE POLICY recruiter_admin_actions_dashboard_insert_authenticated
      ON public.recruiter_admin_actions
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Best-effort legacy backfill. This does not invent fake recruiters. It only copies
-- rows from known/likely legacy recruiter application tables when they exist and
-- expose a recognizable wallet column.
DO $$
DECLARE
  source_name text;
  wallet_col text;
  code_col text;
  display_col text;
  status_col text;
  created_col text;
  code_expr text;
  display_expr text;
  status_expr text;
  created_expr text;
BEGIN
  FOREACH source_name IN ARRAY ARRAY[
    'wm_recruiter_applications',
    'recruiter_applications',
    'recruiter_waitlist',
    'waitlist_recruiters',
    'recruiter_waitlist_submissions'
  ]
  LOOP
    IF to_regclass(format('public.%I', source_name)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT c.column_name INTO wallet_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = source_name
      AND c.column_name = ANY (ARRAY['wallet_address', 'wallet', 'applicant_wallet', 'user_wallet', 'address'])
    ORDER BY array_position(ARRAY['wallet_address', 'wallet', 'applicant_wallet', 'user_wallet', 'address'], c.column_name)
    LIMIT 1;

    IF wallet_col IS NULL THEN
      CONTINUE;
    END IF;

    SELECT c.column_name INTO code_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = source_name
      AND c.column_name = ANY (ARRAY['code', 'recruiter_code', 'referral_code', 'desired_code', 'invite_code'])
    ORDER BY array_position(ARRAY['code', 'recruiter_code', 'referral_code', 'desired_code', 'invite_code'], c.column_name)
    LIMIT 1;

    SELECT c.column_name INTO display_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = source_name
      AND c.column_name = ANY (ARRAY['display_name', 'name', 'username', 'x_handle', 'handle'])
    ORDER BY array_position(ARRAY['display_name', 'name', 'username', 'x_handle', 'handle'], c.column_name)
    LIMIT 1;

    SELECT c.column_name INTO status_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = source_name
      AND c.column_name = ANY (ARRAY['status', 'application_status'])
    ORDER BY array_position(ARRAY['status', 'application_status'], c.column_name)
    LIMIT 1;

    SELECT c.column_name INTO created_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = source_name
      AND c.column_name = ANY (ARRAY['created_at', 'submitted_at', 'joined_at'])
    ORDER BY array_position(ARRAY['created_at', 'submitted_at', 'joined_at'], c.column_name)
    LIMIT 1;

    code_expr := CASE WHEN code_col IS NULL THEN 'NULL::text' ELSE format('t.%I::text', code_col) END;
    display_expr := CASE WHEN display_col IS NULL THEN 'NULL::text' ELSE format('t.%I::text', display_col) END;
    status_expr := CASE WHEN status_col IS NULL THEN '''active''::text' ELSE format('t.%I::text', status_col) END;
    created_expr := CASE WHEN created_col IS NULL THEN 'now()' ELSE format('t.%I::timestamptz', created_col) END;

    EXECUTE format($sql$
      WITH src AS (
        SELECT
          lower(t.%1$I::text) AS wallet_address,
          %2$s AS raw_code,
          %3$s AS raw_display_name,
          %4$s AS raw_status,
          %5$s AS raw_created_at,
          to_jsonb(t) AS raw_metadata
        FROM public.%6$I t
        WHERE t.%1$I IS NOT NULL
      ), normalized AS (
        SELECT DISTINCT ON (wallet_address)
          wallet_address,
          left(
            coalesce(
              nullif(regexp_replace(lower(raw_code::text), '[^a-z0-9_-]+', '-', 'g'), ''),
              concat('recruiter-', substr(md5(wallet_address), 1, 8))
            ),
            32
          ) AS code,
          nullif(raw_display_name::text, '') AS display_name,
          CASE lower(coalesce(raw_status::text, 'active'))
            WHEN 'blocked' THEN 'blocked'
            WHEN 'inactive' THEN 'inactive'
            WHEN 'closed' THEN 'closed'
            ELSE 'active'
          END AS status,
          raw_created_at,
          raw_metadata
        FROM src
        WHERE wallet_address ~ '^0x[0-9a-f]{40}$'
        ORDER BY wallet_address, raw_created_at NULLS LAST
      )
      INSERT INTO public.recruiters (wallet_address, code, display_name, is_og, status, metadata, created_at, updated_at)
      SELECT
        wallet_address,
        code,
        display_name,
        TRUE,
        status,
        jsonb_build_object(
          'backfill', jsonb_build_object(
            'source_table', %7$L,
            'source_row', raw_metadata,
            'backfilled_at', now()
          )
        ),
        coalesce(raw_created_at, now()),
        now()
      FROM normalized
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        display_name = coalesce(public.recruiters.display_name, excluded.display_name),
        metadata = public.recruiters.metadata || excluded.metadata,
        updated_at = now()
    $sql$, wallet_col, code_expr, display_expr, status_expr, created_expr, source_name, source_name);
  END LOOP;
END $$;

COMMIT;
