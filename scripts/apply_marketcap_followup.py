from pathlib import Path

p = Path('realtime-indexer/src/canonicalCandleMaterializer.ts')
s = p.read_text()

old = '''       from public.curve_trades
      where chain_id=$1 and campaign_address=$2
      order by block_number asc, log_index asc`,'''
new = '''       from public.curve_trades
      where chain_id=$1 and campaign_address=$2
        and (chain_id <> 101 or sold_tokens_after_raw is not null)
      order by block_number asc, log_index asc`,'''
if old not in s:
    raise SystemExit('campaignTrades filter target not found')
s = s.replace(old, new, 1)

old = '''      where t.chain_id in (56,97,101)
      group by t.chain_id,t.campaign_address
      having max(tc.canonical_updated_at) is null
          or max(tc.canonical_updated_at) < max(t.block_time)
          or min(coalesce(tc.canonical_version,0)) < $2'''
new = '''      where t.chain_id in (56,97,101)
        and (t.chain_id <> 101 or t.sold_tokens_after_raw is not null)
      group by t.chain_id,t.campaign_address
      having max(tc.canonical_updated_at) is null
          or max(tc.canonical_updated_at) < max(t.block_time)
          or bool_or(
            coalesce(tc.dex_trade_count,0)=0
            and coalesce(tc.canonical_version,0) < $2
          )'''
if old not in s:
    raise SystemExit('staleCampaigns target not found')
s = s.replace(old, new, 1)

p.write_text(s)
print('canonical bonding/DEX separation patch applied')
