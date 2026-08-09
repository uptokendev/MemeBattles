-- Sponsorship packages (duration + price) + application package fields.
-- Run in Supabase SQL editor. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sponsorship_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0 AND duration_days <= 366),
  price_usd numeric(12, 2) NOT NULL CHECK (price_usd >= 0),
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Snapshot fields on applications (price locked when they apply / when admin approves).
ALTER TABLE public.sponsorship_applications
  ADD COLUMN IF NOT EXISTS package_code text,
  ADD COLUMN IF NOT EXISTS package_label text,
  ADD COLUMN IF NOT EXISTS package_duration_days integer,
  ADD COLUMN IF NOT EXISTS package_price_usd numeric(12, 2),
  ADD COLUMN IF NOT EXISTS payment_due_usd numeric(12, 2),
  ADD COLUMN IF NOT EXISTS payment_instructions text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.sponsored_placements
  ADD COLUMN IF NOT EXISTS package_code text,
  ADD COLUMN IF NOT EXISTS package_duration_days integer,
  ADD COLUMN IF NOT EXISTS package_price_usd numeric(12, 2);

-- Seed defaults (ops can edit prices anytime). ON CONFLICT updates labels only, not prices.
INSERT INTO public.sponsorship_packages (code, label, duration_days, price_usd, sort_order)
VALUES
  ('d3', '3 days', 3, 49.00, 10),
  ('w1', '1 week', 7, 99.00, 20),
  ('w2', '2 weeks', 14, 179.00, 30),
  ('m1', '1 month', 30, 299.00, 40),
  ('m3', '3 months', 90, 699.00, 50)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  duration_days = EXCLUDED.duration_days,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

GRANT SELECT ON TABLE public.sponsorship_packages TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsorship_packages TO anon, authenticated, service_role;

ALTER TABLE public.sponsorship_packages DISABLE ROW LEVEL SECURITY;

COMMIT;

-- Flow:
-- 1) Applicant picks package (no pay yet) → status submitted
-- 2) Admin approves → status approved, payment_due_usd set from package (or override)
-- 3) Applicant pays offline → admin Mark Paid → create/activate placement with window = duration_days
