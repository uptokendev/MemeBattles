-- Recruiter payout reconciliation runs
-- Keeps an auditable snapshot of native payout ledger / claim health before public claim launch.

create extension if not exists pgcrypto;

create table if not exists public.recruiter_payout_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'completed' check (status in ('completed', 'warning', 'failed')),
  checked_by text not null default 'web-dashboard',
  summary jsonb not null default '{}'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_recruiter_payout_reconciliation_runs_created_at
  on public.recruiter_payout_reconciliation_runs (created_at desc);

create index if not exists idx_recruiter_payout_reconciliation_runs_status
  on public.recruiter_payout_reconciliation_runs (status, created_at desc);
