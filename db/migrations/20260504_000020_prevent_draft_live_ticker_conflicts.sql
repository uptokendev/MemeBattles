-- Prepare Mode ticker reservation hardening
-- Prevent active campaign drafts from reserving a ticker that already exists as a live campaign.

create or replace function public.prevent_campaign_draft_live_ticker_conflict()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'archived' then
    if exists (
      select 1
        from public.campaigns c
       where c.chain_id = new.chain_id
         and lower(c.symbol) = lower(new.ticker)
       limit 1
    ) then
      raise exception 'Ticker already reserved by a live campaign.'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_drafts_live_ticker_conflict_guard on public.campaign_drafts;

create trigger campaign_drafts_live_ticker_conflict_guard
before insert or update of chain_id, ticker, status
on public.campaign_drafts
for each row
execute function public.prevent_campaign_draft_live_ticker_conflict();
