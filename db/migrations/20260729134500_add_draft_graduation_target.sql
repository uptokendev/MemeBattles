alter table public.campaign_drafts
  add column if not exists graduation_target_wei numeric(78,0);

update public.campaign_drafts
   set graduation_target_wei = 30000000000000000000000
 where graduation_target_wei is null;

alter table public.campaign_drafts
  alter column graduation_target_wei set default 30000000000000000000000,
  alter column graduation_target_wei set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'campaign_drafts_graduation_target_check'
       and conrelid = 'public.campaign_drafts'::regclass
  ) then
    alter table public.campaign_drafts
      add constraint campaign_drafts_graduation_target_check
      check (
        graduation_target_wei in (
          6000000000000000000,
          15000000000000000000000,
          30000000000000000000000,
          50000000000000000000000
        )
        and (graduation_target_wei <> 6000000000000000000 or chain_id = 97)
      );
  end if;
end
$$;
