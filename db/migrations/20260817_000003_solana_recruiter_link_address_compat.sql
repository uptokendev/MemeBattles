-- Solana recruiter attribution compatibility.
-- A linked Solana trader must be allowed to retain the exact base58 pubkey so
-- the route profile can correctly select Recruiter + Squad versus the unlinked
-- Airdrop fallback. EVM normalization remains enforced in application code.

alter table if exists public.wallet_recruiter_links
  drop constraint if exists wallet_recruiter_links_wallet_lowercase;
