-- =========================================
-- MemeBattles UP Only League: lifecycle columns + indexes
-- =========================================

begin;

-- Extend campaigns table with objective lifecycle fields used by the League.
-- These are filled by the realtime-indexer:
--  - created_at_chain: from factory CampaignCreated block timestamp or factory.getCampaign().createdAt
--  - graduated_at_chain + graduated_block: from CampaignFinalized event
--  - fee_recipient_address: from LaunchCampaign.feeRecipient()

alter table public.campaigns
  add column if not exists created_at_chain timestamptz null;

alter table public.campaigns
  add column if not exists graduated_at_chain timestamptz null;

alter table public.campaigns
  add column if not exists graduated_block bigint null;

alter table public.campaigns
  add column if not exists fee_recipient_address text null;

-- Indexes for leaderboard queries
create index if not exists campaigns_idx_chain_graduated_time
  on public.campaigns(chain_id, graduated_at_chain desc);

create index if not exists campaigns_idx_chain_created_time
  on public.campaigns(chain_id, created_at_chain desc);

create index if not exists campaigns_idx_chain_fee_recipient
  on public.campaigns(chain_id, fee_recipient_address);

-- Helpful expression index for Largest Buy queries
create index if not exists curve_trades_idx_chain_side_bnb
  on public.curve_trades(chain_id, side, (bnb_amount_raw::numeric) desc);

commit;
