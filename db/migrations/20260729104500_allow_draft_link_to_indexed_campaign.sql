-- Allow the post-transaction draft reconciliation to attach the exact campaign
-- that the indexer may already have inserted into public.campaigns.
-- A different live campaign with the same ticker remains blocked.

create or replace function public.prevent_campaign_draft_live_ticker_conflict()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status <> 'archived' then
    if exists (
      select 1
        from public.campaigns c
       where c.chain_id = new.chain_id
         and lower(c.symbol) = lower(new.ticker)
         and (
           new.campaign_address is null
           or lower(c.campaign_address) <> lower(new.campaign_address)
         )
       limit 1
    ) then
      raise exception 'Ticker already reserved by a live campaign.'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$function$;
