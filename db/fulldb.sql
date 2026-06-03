-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.campaigns (
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  token_address text,
  created_block bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  launched boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  creator_address text,
  name text,
  symbol text,
  created_at_chain timestamp with time zone,
  graduated_at_chain timestamp with time zone,
  graduated_block bigint,
  fee_recipient_address text,
  logo_uri text,
  factory_address text,
  CONSTRAINT campaigns_pkey PRIMARY KEY (chain_id, campaign_address)
);
CREATE TABLE public.indexer_state (
  chain_id integer NOT NULL,
  cursor text NOT NULL,
  last_indexed_block bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT indexer_state_pkey PRIMARY KEY (chain_id, cursor)
);
CREATE TABLE public.curve_trades (
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  block_time timestamp with time zone NOT NULL,
  side text NOT NULL CHECK (side = ANY (ARRAY['buy'::text, 'sell'::text])),
  wallet text NOT NULL,
  token_amount_raw text NOT NULL,
  bnb_amount_raw text NOT NULL,
  token_amount numeric,
  bnb_amount numeric,
  price_bnb numeric,
  CONSTRAINT curve_trades_pkey PRIMARY KEY (chain_id, tx_hash, log_index)
);
CREATE TABLE public.token_candles (
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  timeframe text NOT NULL,
  bucket_start timestamp with time zone NOT NULL,
  o numeric NOT NULL,
  h numeric NOT NULL,
  l numeric NOT NULL,
  c numeric NOT NULL,
  volume_bnb numeric NOT NULL DEFAULT 0,
  trades_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT token_candles_pkey PRIMARY KEY (chain_id, campaign_address, timeframe, bucket_start)
);
CREATE TABLE public.token_stats (
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  last_price_bnb numeric,
  sold_tokens numeric,
  reserve_bnb numeric,
  marketcap_bnb numeric,
  vol_24h_bnb numeric,
  change_5m numeric,
  change_1h numeric,
  change_24h numeric,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT token_stats_pkey PRIMARY KEY (chain_id, campaign_address)
);
CREATE TABLE public.activity_events (
  id bigint NOT NULL DEFAULT nextval('activity_events_id_seq'::regclass),
  chain_id integer NOT NULL,
  event_type text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  block_time timestamp with time zone NOT NULL,
  actor_address text NOT NULL,
  campaign_address text,
  token_address text,
  amount_in_wei numeric,
  amount_out_wei numeric,
  cost_wei numeric,
  payout_wei numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT activity_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_coin_edges (
  chain_id integer NOT NULL,
  user_address text NOT NULL,
  campaign_address text NOT NULL,
  token_address text,
  reason text NOT NULL,
  first_seen_block bigint,
  first_seen_time timestamp with time zone,
  last_seen_block bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_coin_edges_pkey PRIMARY KEY (chain_id, user_address, campaign_address, reason)
);
CREATE TABLE public.indexer_checkpoints (
  chain_id integer NOT NULL,
  checkpoint_key text NOT NULL,
  contract_address text NOT NULL,
  last_processed_block bigint NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT indexer_checkpoints_pkey PRIMARY KEY (chain_id, checkpoint_key)
);
CREATE TABLE public.user_profiles (
  chain_id integer NOT NULL,
  address text NOT NULL CHECK (address = lower(address)),
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (chain_id, address)
);
CREATE TABLE public.auth_nonces (
  chain_id integer NOT NULL,
  address text NOT NULL CHECK (address = lower(address)),
  nonce text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  used_at timestamp with time zone,
  created_at timestamp with time zone,
  CONSTRAINT auth_nonces_pkey PRIMARY KEY (chain_id, address)
);
CREATE TABLE public.token_comments (
  id bigint NOT NULL DEFAULT nextval('token_comments_id_seq'::regclass),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL CHECK (campaign_address = lower(campaign_address)),
  token_address text CHECK (token_address IS NULL OR token_address = lower(token_address)),
  author_address text NOT NULL CHECK (author_address = lower(author_address)),
  body text NOT NULL,
  parent_id bigint,
  status smallint NOT NULL DEFAULT 0 CHECK (status = ANY (ARRAY[0, 1, 2])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT token_comments_pkey PRIMARY KEY (id),
  CONSTRAINT token_comments_parent_fk FOREIGN KEY (parent_id) REFERENCES public.token_comments(id)
);
CREATE TABLE public.votes (
  id bigint NOT NULL DEFAULT nextval('votes_id_seq'::regclass),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  voter_address text NOT NULL,
  asset_address text NOT NULL,
  amount_raw numeric NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  block_timestamp timestamp with time zone NOT NULL,
  meta text,
  status text NOT NULL DEFAULT 'confirmed'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT votes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vote_aggregates (
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  votes_1h integer NOT NULL DEFAULT 0,
  votes_24h integer NOT NULL DEFAULT 0,
  votes_7d integer NOT NULL DEFAULT 0,
  votes_all_time integer NOT NULL DEFAULT 0,
  trending_score numeric NOT NULL DEFAULT 0,
  last_vote_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vote_aggregates_pkey PRIMARY KEY (chain_id, campaign_address)
);
CREATE TABLE public.league_epoch_meta (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  epoch_start timestamp with time zone NOT NULL,
  epoch_end timestamp with time zone NOT NULL,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  protocol_fee_bps integer NOT NULL,
  league_fee_bps integer NOT NULL,
  total_league_fee_raw numeric NOT NULL,
  league_count integer NOT NULL,
  winners integer NOT NULL,
  split_bps ARRAY NOT NULL,
  CONSTRAINT league_epoch_meta_pkey PRIMARY KEY (chain_id, period, epoch_start)
);
CREATE TABLE public.league_epoch_winners (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  epoch_start timestamp with time zone NOT NULL,
  epoch_end timestamp with time zone NOT NULL,
  category text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 5),
  recipient_address text NOT NULL,
  amount_raw numeric NOT NULL,
  payload jsonb NOT NULL,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  swept_at timestamp with time zone,
  meta jsonb,
  CONSTRAINT league_epoch_winners_pkey PRIMARY KEY (chain_id, period, epoch_start, category, rank)
);
CREATE TABLE public.league_epoch_claims (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  epoch_start timestamp with time zone NOT NULL,
  category text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 5),
  recipient_address text NOT NULL,
  claimed_at timestamp with time zone NOT NULL DEFAULT now(),
  signature text,
  CONSTRAINT league_epoch_claims_pkey PRIMARY KEY (chain_id, period, epoch_start, category, rank)
);
CREATE TABLE public.user_follows (
  chain_id integer NOT NULL DEFAULT 0,
  follower_address text NOT NULL,
  following_address text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (chain_id, follower_address, following_address)
);
CREATE TABLE public.campaign_follows (
  chain_id integer NOT NULL DEFAULT 0,
  user_address text NOT NULL,
  campaign_address text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_follows_pkey PRIMARY KEY (chain_id, user_address, campaign_address)
);
CREATE TABLE public.campaign_activity (
  chain_id integer NOT NULL,
  campaign_address text NOT NULL CHECK (campaign_address = lower(campaign_address)),
  last_activity_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_activity_pkey PRIMARY KEY (chain_id, campaign_address)
);
CREATE TABLE public.league_rollovers (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  epoch_start timestamp with time zone NOT NULL,
  category text NOT NULL,
  amount_raw numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'unspecified'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT league_rollovers_pkey PRIMARY KEY (chain_id, period, epoch_start, category)
);
CREATE TABLE public.league_rollover_events (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  epoch_start timestamp with time zone NOT NULL,
  category text NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT league_rollover_events_pkey PRIMARY KEY (chain_id, period, epoch_start, category, reason)
);
CREATE TABLE public.league_epoch_payouts (
  chain_id integer NOT NULL,
  period text NOT NULL CHECK (period = ANY (ARRAY['weekly'::text, 'monthly'::text])),
  epoch_start timestamp with time zone NOT NULL,
  category text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 5),
  recipient_address text NOT NULL,
  amount_raw numeric NOT NULL DEFAULT 0,
  tx_hash text,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT league_epoch_payouts_pkey PRIMARY KEY (chain_id, period, epoch_start, category, rank)
);
CREATE TABLE public.user_rank_state (
  chain_id integer NOT NULL,
  address text NOT NULL,
  current_rank text NOT NULL DEFAULT 'Recruit'::text CHECK (current_rank = ANY (ARRAY['Recruit'::text, 'Soldier'::text, 'Corporal'::text, 'Captain'::text, 'General'::text])),
  previous_rank text CHECK (previous_rank IS NULL OR (previous_rank = ANY (ARRAY['Recruit'::text, 'Soldier'::text, 'Corporal'::text, 'Captain'::text, 'General'::text]))),
  rank_points bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_rank_state_pkey PRIMARY KEY (chain_id, address)
);
CREATE TABLE public.bot_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  channel_id text NOT NULL,
  message_id text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bot_messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_number integer NOT NULL DEFAULT nextval('tickets_ticket_number_seq'::regclass),
  discord_channel_id text NOT NULL,
  user_id text NOT NULL,
  claimed_by text,
  claimed_at timestamp with time zone,
  category text NOT NULL CHECK (category = ANY (ARRAY['general'::text, 'bug'::text, 'partnership'::text, 'appeal'::text, 'feedback'::text])),
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'claimed'::text, 'closed'::text])),
  created_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  routed_to text NOT NULL DEFAULT 'staff'::text,
  closed_by text,
  CONSTRAINT tickets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ticket_transcripts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ticket_transcripts_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_transcripts_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id)
);
CREATE TABLE public.leaderboard_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  player_id text NOT NULL UNIQUE,
  score integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT leaderboard_data_pkey PRIMARY KEY (id)
);
CREATE TABLE public.guild_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  guild_id text NOT NULL UNIQUE,
  channel_rules text,
  channel_announcements text,
  channel_patch_notes text,
  channel_league_updates text,
  channel_server_status text,
  channel_leaderboard text,
  channel_create_ticket text,
  channel_welcome text,
  channel_mod_log text,
  category_tickets text,
  role_admin text,
  role_staff text,
  leaderboard_interval_ms integer NOT NULL DEFAULT 600000,
  status_check_interval_ms integer NOT NULL DEFAULT 300000,
  monitored_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT guild_config_pkey PRIMARY KEY (id)
);
CREATE TABLE public.member_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inviter_id text NOT NULL,
  invitee_id text NOT NULL,
  invite_code text,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT member_invites_pkey PRIMARY KEY (id)
);
CREATE TABLE public.submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source text NOT NULL,
  user_id text NOT NULL,
  username text NOT NULL,
  service_type text NOT NULL,
  price text NOT NULL,
  niche text NOT NULL,
  results text NOT NULL,
  contact text NOT NULL,
  notes text,
  image_urls ARRAY,
  ticket_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submissions_pkey PRIMARY KEY (id),
  CONSTRAINT submissions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id)
);
CREATE TABLE public.submission_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  admin_id uuid NOT NULL,
  admin_email text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_notes_pkey PRIMARY KEY (id),
  CONSTRAINT submission_notes_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id)
);
CREATE TABLE public.recruiter_waitlist (
  id bigint NOT NULL DEFAULT nextval('recruiter_waitlist_id_seq'::regclass),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new'::text,
  source text NOT NULL DEFAULT 'coming-soon-popup'::text,
  name text NOT NULL,
  x_handle text NOT NULL,
  telegram_handle text NOT NULL,
  wallet_address text NOT NULL,
  email text NOT NULL,
  country_region text,
  focus text NOT NULL DEFAULT 'both'::text,
  languages text,
  notes text,
  consent_text text NOT NULL,
  reviewed_at timestamp with time zone,
  reviewer_notes text,
  approval_email_sent_at timestamp with time zone,
  approval_email_last_error text,
  approval_email_last_attempt_at timestamp with time zone,
  approval_email_send_count integer NOT NULL DEFAULT 0,
  recruiter_code text,
  approved_at timestamp with time zone,
  recruiter_last_login_at timestamp with time zone,
  squad_image_url text CHECK (squad_image_url IS NULL OR squad_image_url = ''::text OR squad_image_url ~* '^https?://'::text OR squad_image_url ~* '^ipfs://'::text),
  CONSTRAINT recruiter_waitlist_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ref_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruiter_id bigint NOT NULL,
  recruiter_code text NOT NULL,
  landing_path text,
  source text NOT NULL DEFAULT 'ref-link'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  ip_hash text,
  ua_hash text,
  bound_wallet_address text,
  bound_at timestamp with time zone,
  CONSTRAINT ref_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT ref_sessions_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.recruiter_waitlist(id)
);
CREATE TABLE public.wallet_nonces (
  id bigint NOT NULL DEFAULT nextval('wallet_nonces_id_seq'::regclass),
  address text NOT NULL,
  purpose text NOT NULL,
  nonce text NOT NULL,
  ref_session_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  CONSTRAINT wallet_nonces_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_nonces_ref_session_id_fkey FOREIGN KEY (ref_session_id) REFERENCES public.ref_sessions(id)
);
CREATE TABLE public.ref_wallets (
  wallet_address text NOT NULL,
  recruiter_id bigint NOT NULL,
  recruiter_code text NOT NULL,
  role text NOT NULL DEFAULT 'unknown'::text,
  source text NOT NULL DEFAULT 'session'::text,
  session_id uuid,
  bound_at timestamp with time zone NOT NULL DEFAULT now(),
  signature_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ref_wallets_pkey PRIMARY KEY (wallet_address),
  CONSTRAINT ref_wallets_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.recruiter_waitlist(id),
  CONSTRAINT ref_wallets_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ref_sessions(id)
);
CREATE TABLE public.chat_sessions (
  id bigint NOT NULL DEFAULT nextval('chat_sessions_id_seq'::regclass),
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'trader'::text CHECK (role = ANY (ARRAY['trader'::text, 'creator'::text, 'recruiter'::text, 'mod'::text])),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  chain_id integer,
  campaign_address text,
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chat_messages (
  id bigint NOT NULL DEFAULT nextval('chat_messages_id_seq'::regclass),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL CHECK (campaign_address = lower(campaign_address)),
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'trader'::text CHECK (role = ANY (ARRAY['trader'::text, 'creator'::text, 'recruiter'::text, 'mod'::text])),
  message text NOT NULL CHECK (length(TRIM(BOTH FROM message)) >= 1 AND length(TRIM(BOTH FROM message)) <= 500),
  reply_to_id bigint,
  client_nonce text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  is_hidden boolean NOT NULL DEFAULT false,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.chat_messages(id)
);
CREATE TABLE public.chat_mutes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  campaign_address text NOT NULL,
  wallet_address text NOT NULL,
  muted_until timestamp with time zone NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_mutes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.recruiters (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  code text NOT NULL CHECK (length(TRIM(BOTH FROM code)) > 0),
  display_name text,
  is_og boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'closed'::text, 'suspended'::text])),
  closed_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  squad_image_url text CHECK (squad_image_url IS NULL OR squad_image_url = ''::text OR squad_image_url ~* '^https?://'::text OR squad_image_url ~* '^ipfs://'::text),
  CONSTRAINT recruiters_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wallet_profiles (
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  first_activity_at timestamp with time zone,
  has_activity boolean NOT NULL DEFAULT false,
  created_campaign_count integer NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  last_campaign_created_at timestamp with time zone,
  last_trade_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wallet_profiles_pkey PRIMARY KEY (wallet_address)
);
CREATE TABLE public.wallet_recruiter_links (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  recruiter_id bigint NOT NULL,
  link_source text NOT NULL CHECK (link_source = ANY (ARRAY['referral_cookie'::text, 'manual'::text, 'admin_override'::text, 'migration'::text])),
  linked_at timestamp with time zone NOT NULL DEFAULT now(),
  locked_at timestamp with time zone,
  detached_at timestamp with time zone,
  detach_reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wallet_recruiter_links_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_recruiter_links_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.recruiters(id)
);
CREATE TABLE public.wallet_referral_attribution_windows (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text CHECK (wallet_address IS NULL OR wallet_address = lower(wallet_address)),
  recruiter_id bigint NOT NULL,
  client_fingerprint text,
  session_token text,
  captured_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wallet_referral_attribution_windows_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_referral_attribution_windows_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.recruiters(id)
);
CREATE TABLE public.wallet_squad_memberships (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  recruiter_id bigint NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  left_at timestamp with time zone,
  leave_reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  member_role text NOT NULL DEFAULT 'member'::text,
  link_source text NOT NULL DEFAULT 'recruiter'::text,
  legacy_ref_wallet_key text,
  CONSTRAINT wallet_squad_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_squad_memberships_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.recruiters(id)
);
CREATE TABLE public.epochs (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chain_id integer NOT NULL,
  epoch_type text NOT NULL CHECK (epoch_type = 'weekly'::text),
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'processing'::text, 'finalized'::text, 'published'::text, 'expired'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finalized_at timestamp with time zone,
  CONSTRAINT epochs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reward_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chain_id integer NOT NULL,
  tx_hash text NOT NULL CHECK (tx_hash = lower(tx_hash)),
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  occurred_at timestamp with time zone NOT NULL,
  epoch_id bigint NOT NULL,
  wallet_address text CHECK (wallet_address IS NULL OR wallet_address = lower(wallet_address)),
  campaign_address text CHECK (campaign_address IS NULL OR campaign_address = lower(campaign_address)),
  route_kind text NOT NULL CHECK (route_kind = ANY (ARRAY['trade'::text, 'finalize'::text])),
  route_profile text NOT NULL CHECK (route_profile = ANY (ARRAY['standard_linked'::text, 'standard_unlinked'::text, 'og_linked'::text])),
  league_amount numeric NOT NULL DEFAULT 0,
  recruiter_amount numeric NOT NULL DEFAULT 0,
  airdrop_amount numeric NOT NULL DEFAULT 0,
  squad_amount numeric NOT NULL DEFAULT 0,
  protocol_amount numeric NOT NULL DEFAULT 0,
  raw_amount numeric NOT NULL,
  source_contract text NOT NULL CHECK (source_contract = lower(source_contract)),
  source_event text NOT NULL DEFAULT 'RouteExecuted'::text,
  matched_activity_source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_events_pkey PRIMARY KEY (id),
  CONSTRAINT reward_events_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.reward_ledger_entries (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  epoch_id bigint NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  program text NOT NULL CHECK (program = ANY (ARRAY['recruiter'::text, 'airdrop_trader'::text, 'airdrop_creator'::text, 'squad'::text])),
  sub_program text NOT NULL DEFAULT ''::text,
  gross_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'claimable'::text, 'claimed'::text, 'expired'::text, 'rolled_over'::text, 'cancelled'::text])),
  source_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimable_at timestamp with time zone,
  claim_deadline_at timestamp with time zone,
  claimed_at timestamp with time zone,
  expired_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_ledger_entries_pkey PRIMARY KEY (id),
  CONSTRAINT reward_ledger_entries_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.claims (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  epoch_id bigint NOT NULL,
  program text NOT NULL CHECK (program = ANY (ARRAY['recruiter'::text, 'airdrop_trader'::text, 'airdrop_creator'::text, 'squad'::text])),
  claimed_amount numeric NOT NULL CHECK (claimed_amount >= 0::numeric),
  claim_tx_hash text CHECK (claim_tx_hash IS NULL OR claim_tx_hash = lower(claim_tx_hash)),
  claimed_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'recorded'::text CHECK (status = ANY (ARRAY['recorded'::text, 'cancelled'::text])),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT claims_pkey PRIMARY KEY (id),
  CONSTRAINT claims_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.claim_rollovers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  from_ledger_entry_id bigint NOT NULL,
  to_ledger_entry_id bigint,
  program text NOT NULL CHECK (program = ANY (ARRAY['recruiter'::text, 'airdrop_trader'::text, 'airdrop_creator'::text, 'squad'::text])),
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  reason text NOT NULL,
  destination_kind text NOT NULL CHECK (destination_kind = ANY (ARRAY['squad_pool'::text, 'squad_pool_same'::text, 'airdrop_treasury'::text, 'next_epoch_wallet_claim'::text])),
  executed_at timestamp with time zone NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT claim_rollovers_pkey PRIMARY KEY (id),
  CONSTRAINT claim_rollovers_from_ledger_entry_id_fkey FOREIGN KEY (from_ledger_entry_id) REFERENCES public.reward_ledger_entries(id),
  CONSTRAINT claim_rollovers_to_ledger_entry_id_fkey FOREIGN KEY (to_ledger_entry_id) REFERENCES public.reward_ledger_entries(id)
);
CREATE TABLE public.eligibility_results (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  epoch_id bigint NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  program text NOT NULL CHECK (program = ANY (ARRAY['recruiter'::text, 'airdrop_trader'::text, 'airdrop_creator'::text, 'squad'::text])),
  is_eligible boolean NOT NULL,
  score numeric NOT NULL DEFAULT 0 CHECK (score >= 0::numeric),
  reason_codes ARRAY NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT eligibility_results_pkey PRIMARY KEY (id),
  CONSTRAINT eligibility_results_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.exclusion_flags (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  epoch_id bigint,
  program text CHECK (program IS NULL OR (program = ANY (ARRAY['recruiter'::text, 'airdrop_trader'::text, 'airdrop_creator'::text, 'squad'::text]))),
  flag_type text NOT NULL,
  severity text NOT NULL CHECK (severity = ANY (ARRAY['hard'::text, 'review'::text])),
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by text CHECK (resolved_by IS NULL OR resolved_by = lower(resolved_by)),
  resolution_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT exclusion_flags_pkey PRIMARY KEY (id),
  CONSTRAINT exclusion_flags_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.claim_reminder_states (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  reminder_kind text NOT NULL CHECK (reminder_kind = ANY (ARRAY['claim_inactive_30d'::text, 'claim_inactive_60d'::text])),
  basis_at timestamp with time zone NOT NULL,
  first_claimable_at timestamp with time zone NOT NULL,
  last_claimed_at timestamp with time zone,
  due_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])),
  next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamp with time zone,
  sent_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  last_error text,
  target_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT claim_reminder_states_pkey PRIMARY KEY (id)
);
CREATE TABLE public.claim_reminder_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  reminder_state_id bigint NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  reminder_kind text NOT NULL CHECK (reminder_kind = ANY (ARRAY['claim_inactive_30d'::text, 'claim_inactive_60d'::text])),
  delivery_channel text NOT NULL CHECK (delivery_channel = ANY (ARRAY['outbox'::text, 'webhook'::text])),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status = ANY (ARRAY['sent'::text, 'failed'::text])),
  attempted_at timestamp with time zone NOT NULL,
  response_status integer,
  response_body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT claim_reminder_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT claim_reminder_deliveries_reminder_state_id_fkey FOREIGN KEY (reminder_state_id) REFERENCES public.claim_reminder_states(id)
);
CREATE TABLE public.recruiter_admin_actions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  recruiter_id bigint,
  wallet_address text CHECK (wallet_address IS NULL OR wallet_address = lower(wallet_address)),
  action_type text NOT NULL CHECK (action_type = ANY (ARRAY['recruiter_upsert'::text, 'og_tag_update'::text, 'status_change'::text, 'dispute_override'::text, 'settlement_export'::text])),
  acted_by text,
  reason text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recruiter_admin_actions_pkey PRIMARY KEY (id),
  CONSTRAINT recruiter_admin_actions_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES public.recruiters(id)
);
CREATE TABLE public.airdrop_draws (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  epoch_id bigint NOT NULL,
  chain_id integer NOT NULL,
  program text NOT NULL CHECK (program = ANY (ARRAY['airdrop_trader'::text, 'airdrop_creator'::text])),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'superseded'::text, 'cancelled'::text])),
  seed text NOT NULL,
  pool_amount numeric NOT NULL DEFAULT 0 CHECK (pool_amount >= 0::numeric),
  candidate_count integer NOT NULL DEFAULT 0,
  eligible_candidate_count integer NOT NULL DEFAULT 0,
  winner_count integer NOT NULL DEFAULT 0,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT airdrop_draws_pkey PRIMARY KEY (id),
  CONSTRAINT airdrop_draws_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.airdrop_winners (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  draw_id bigint NOT NULL,
  epoch_id bigint NOT NULL,
  chain_id integer NOT NULL,
  program text NOT NULL CHECK (program = ANY (ARRAY['airdrop_trader'::text, 'airdrop_creator'::text])),
  wallet_address text NOT NULL CHECK (wallet_address = lower(wallet_address)),
  winner_rank integer NOT NULL CHECK (winner_rank > 0),
  weight_tier integer NOT NULL DEFAULT 1,
  weight_value integer NOT NULL DEFAULT 1,
  activity_score numeric NOT NULL DEFAULT 0,
  payout_amount numeric NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT airdrop_winners_pkey PRIMARY KEY (id),
  CONSTRAINT airdrop_winners_draw_id_fkey FOREIGN KEY (draw_id) REFERENCES public.airdrop_draws(id),
  CONSTRAINT airdrop_winners_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.epochs(id)
);
CREATE TABLE public.reward_pool_carryovers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  source_epoch_id bigint NOT NULL,
  target_epoch_id bigint NOT NULL,
  chain_id integer NOT NULL,
  program text NOT NULL CHECK (program = 'squad'::text),
  source_ledger_entry_id bigint,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0::numeric),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_pool_carryovers_pkey PRIMARY KEY (id),
  CONSTRAINT reward_pool_carryovers_source_epoch_id_fkey FOREIGN KEY (source_epoch_id) REFERENCES public.epochs(id),
  CONSTRAINT reward_pool_carryovers_target_epoch_id_fkey FOREIGN KEY (target_epoch_id) REFERENCES public.epochs(id),
  CONSTRAINT reward_pool_carryovers_source_ledger_entry_id_fkey FOREIGN KEY (source_ledger_entry_id) REFERENCES public.reward_ledger_entries(id)
);
CREATE TABLE public.reward_publication_states (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  resource_type text NOT NULL CHECK (resource_type = ANY (ARRAY['airdrop_winners'::text, 'recruiter_leaderboard'::text, 'squad_leaderboard'::text])),
  resource_key text NOT NULL DEFAULT 'default'::text,
  is_published boolean NOT NULL DEFAULT true,
  changed_by text,
  reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamp with time zone,
  unpublished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_publication_states_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reward_admin_actions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  action_type text NOT NULL CHECK (action_type = ANY (ARRAY['draw_run'::text, 'draw_publish'::text, 'publication_change'::text, 'exclusion_create'::text, 'exclusion_resolve'::text])),
  resource_type text NOT NULL CHECK (resource_type = ANY (ARRAY['airdrop_draw'::text, 'airdrop_winners'::text, 'recruiter_leaderboard'::text, 'squad_leaderboard'::text, 'exclusion_flag'::text])),
  resource_key text NOT NULL DEFAULT ''::text,
  acted_by text,
  reason text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_admin_actions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.promotors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  x_handle text NOT NULL UNIQUE CHECK (x_handle = lower(x_handle)),
  added_by_email text NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  last_checked_at timestamp with time zone,
  shadowban_data jsonb,
  metrics_data jsonb,
  is_clean boolean,
  role text CHECK (role IS NULL OR (role = ANY (ARRAY['founder'::text, 'team'::text, 'ambassador'::text, 'kol'::text, 'contributor'::text]))),
  is_paid boolean,
  CONSTRAINT promotors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.promotor_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  promotor_id uuid NOT NULL,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  shadowban_data jsonb,
  metrics_data jsonb,
  is_clean boolean,
  CONSTRAINT promotor_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT promotor_snapshots_promotor_id_fkey FOREIGN KEY (promotor_id) REFERENCES public.promotors(id)
);
CREATE TABLE public.wm_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user'::text CHECK (role = ANY (ARRAY['user'::text, 'recruiter'::text, 'admin'::text])),
  risk_score integer NOT NULL DEFAULT 0,
  is_banned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wm_wallet_auth_nonces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_wallet_auth_nonces_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wm_social_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = ANY (ARRAY['x'::text, 'discord'::text, 'telegram'::text])),
  provider_user_id text NOT NULL,
  username text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  last_verified_at timestamp with time zone,
  CONSTRAINT wm_social_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT wm_social_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_quest_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_quest_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wm_quest_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  xp_reward integer NOT NULL CHECK (xp_reward >= 0),
  verification_type text NOT NULL,
  repeatable boolean NOT NULL DEFAULT false,
  max_completions_per_day integer,
  max_completions_per_week integer,
  cooldown_seconds integer,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_quest_templates_pkey PRIMARY KEY (id),
  CONSTRAINT wm_quest_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.wm_quest_categories(id)
);
CREATE TABLE public.wm_quest_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quest_template_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type = ANY (ARRAY['once'::text, 'daily'::text, 'weekly'::text, 'season'::text])),
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  xp_reward integer NOT NULL CHECK (xp_reward >= 0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_quest_instances_pkey PRIMARY KEY (id),
  CONSTRAINT wm_quest_instances_quest_template_id_fkey FOREIGN KEY (quest_template_id) REFERENCES public.wm_quest_templates(id)
);
CREATE TABLE public.wm_quest_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_instance_id uuid NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['started'::text, 'pending'::text, 'verified'::text, 'rejected'::text, 'revoked'::text, 'review'::text, 'expired'::text])),
  submitted_value text,
  verification_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason text,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_quest_completions_pkey PRIMARY KEY (id),
  CONSTRAINT wm_quest_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_quest_completions_quest_instance_id_fkey FOREIGN KEY (quest_instance_id) REFERENCES public.wm_quest_instances(id)
);
CREATE TABLE public.wm_quest_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quest_template_id uuid NOT NULL,
  requirement_type text NOT NULL,
  requirement_value jsonb NOT NULL,
  required boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_quest_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT wm_quest_requirements_quest_template_id_fkey FOREIGN KEY (quest_template_id) REFERENCES public.wm_quest_templates(id)
);
CREATE TABLE public.wm_xp_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_completion_id uuid,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text])),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT wm_xp_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT wm_xp_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_xp_ledger_quest_completion_id_fkey FOREIGN KEY (quest_completion_id) REFERENCES public.wm_quest_completions(id)
);
CREATE TABLE public.wm_daily_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date_utc date NOT NULL,
  quests_completed integer NOT NULL DEFAULT 0,
  daily_xp_earned integer NOT NULL DEFAULT 0,
  completed_all boolean NOT NULL DEFAULT false,
  streak_count integer NOT NULL DEFAULT 0,
  raffle_tickets_earned integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_daily_progress_pkey PRIMARY KEY (id),
  CONSTRAINT wm_daily_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_social_metric_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quest_completion_id uuid NOT NULL,
  provider text NOT NULL,
  external_post_id text,
  like_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  repost_count integer NOT NULL DEFAULT 0,
  quote_count integer NOT NULL DEFAULT 0,
  impression_count integer NOT NULL DEFAULT 0,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT wm_social_metric_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT wm_social_metric_snapshots_quest_completion_id_fkey FOREIGN KEY (quest_completion_id) REFERENCES public.wm_quest_completions(id)
);
CREATE TABLE public.wm_quiz_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quest_template_id uuid NOT NULL,
  question text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_answer_key text NOT NULL,
  explanation text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  prompt text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  correct_answer text,
  CONSTRAINT wm_quiz_questions_pkey PRIMARY KEY (id),
  CONSTRAINT wm_quiz_questions_quest_template_id_fkey FOREIGN KEY (quest_template_id) REFERENCES public.wm_quest_templates(id)
);
CREATE TABLE public.wm_quiz_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_instance_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  quest_template_id uuid NOT NULL,
  quest_completion_id uuid,
  total_questions integer NOT NULL DEFAULT 0,
  cooldown_until timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT wm_quiz_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT wm_quiz_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_quiz_attempts_quest_instance_id_fkey FOREIGN KEY (quest_instance_id) REFERENCES public.wm_quest_instances(id),
  CONSTRAINT wm_quiz_attempts_quest_template_id_fkey FOREIGN KEY (quest_template_id) REFERENCES public.wm_quest_templates(id),
  CONSTRAINT wm_quiz_attempts_quest_completion_id_fkey FOREIGN KEY (quest_completion_id) REFERENCES public.wm_quest_completions(id)
);
CREATE TABLE public.wm_recruiter_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  wallet_address text NOT NULL,
  x_username text,
  telegram_username text,
  discord_username text,
  motivation text,
  expected_recruits integer,
  status text NOT NULL DEFAULT 'submitted'::text CHECK (status = ANY (ARRAY['submitted'::text, 'review'::text, 'accepted'::text, 'rejected'::text])),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_recruiter_applications_pkey PRIMARY KEY (id),
  CONSTRAINT wm_recruiter_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_recruiter_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_referral_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_referral_links_pkey PRIMARY KEY (id),
  CONSTRAINT wm_referral_links_recruiter_user_id_fkey FOREIGN KEY (recruiter_user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_referral_attributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL,
  referred_user_id uuid,
  referral_code text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'linked'::text, 'verified'::text, 'locked'::text, 'rejected'::text, 'detached'::text])),
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  wallet_connected_at timestamp with time zone,
  verified_at timestamp with time zone,
  locked_at timestamp with time zone,
  rejected_reason text,
  CONSTRAINT wm_referral_attributions_pkey PRIMARY KEY (id),
  CONSTRAINT wm_referral_attributions_recruiter_user_id_fkey FOREIGN KEY (recruiter_user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_referral_attributions_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_admin_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  priority text NOT NULL DEFAULT 'normal'::text CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])),
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'assigned'::text, 'resolved'::text, 'dismissed'::text])),
  related_user_id uuid,
  related_completion_id uuid,
  related_application_id uuid,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT wm_admin_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT wm_admin_notifications_related_user_id_fkey FOREIGN KEY (related_user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_admin_notifications_related_completion_id_fkey FOREIGN KEY (related_completion_id) REFERENCES public.wm_quest_completions(id),
  CONSTRAINT wm_admin_notifications_related_application_id_fkey FOREIGN KEY (related_application_id) REFERENCES public.wm_recruiter_applications(id),
  CONSTRAINT wm_admin_notifications_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_leaderboard_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'season'::text, 'all_time'::text])),
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  user_id uuid NOT NULL,
  xp_total integer NOT NULL,
  rank integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_leaderboard_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT wm_leaderboard_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_prize_pools (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_type text NOT NULL,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  reward_asset text,
  reward_amount numeric,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'drawing'::text, 'published'::text, 'paid'::text])),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_prize_pools_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wm_prize_winners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  prize_pool_id uuid NOT NULL,
  user_id uuid NOT NULL,
  wallet_address text,
  rank integer,
  reward_amount numeric,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'disqualified'::text])),
  tx_hash text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_prize_winners_pkey PRIMARY KEY (id),
  CONSTRAINT wm_prize_winners_prize_pool_id_fkey FOREIGN KEY (prize_pool_id) REFERENCES public.wm_prize_pools(id),
  CONSTRAINT wm_prize_winners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_admin_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_admin_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT wm_admin_audit_log_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_badge_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  type text NOT NULL CHECK (type = ANY (ARRAY['identity'::text, 'mission'::text, 'xp'::text, 'streak'::text, 'recruiter'::text, 'manual'::text])),
  rarity text NOT NULL DEFAULT 'common'::text CHECK (rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text, 'legendary'::text])),
  icon_key text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_badge_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.wm_user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_template_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'auto'::text CHECK (source = ANY (ARRAY['auto'::text, 'admin'::text, 'system'::text])),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  awarded_at timestamp with time zone NOT NULL DEFAULT now(),
  awarded_by uuid,
  revoked_at timestamp with time zone,
  CONSTRAINT wm_user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT wm_user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_user_badges_badge_template_id_fkey FOREIGN KEY (badge_template_id) REFERENCES public.wm_badge_templates(id),
  CONSTRAINT wm_user_badges_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES public.wm_users(id)
);
CREATE TABLE public.wm_submission_fingerprints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_completion_id uuid,
  fingerprint_type text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_submission_fingerprints_pkey PRIMARY KEY (id),
  CONSTRAINT wm_submission_fingerprints_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_submission_fingerprints_quest_completion_id_fkey FOREIGN KEY (quest_completion_id) REFERENCES public.wm_quest_completions(id)
);
CREATE TABLE public.wm_verification_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  quest_completion_id uuid,
  provider text NOT NULL,
  verification_type text NOT NULL,
  status text NOT NULL,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_verification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT wm_verification_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.wm_users(id),
  CONSTRAINT wm_verification_logs_quest_completion_id_fkey FOREIGN KEY (quest_completion_id) REFERENCES public.wm_quest_completions(id)
);
CREATE TABLE public.wm_rate_limit_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text NOT NULL,
  key_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT wm_rate_limit_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.route_authorization_log (
  id bigint NOT NULL DEFAULT nextval('route_authorization_log_id_seq'::regclass),
  chain_id integer NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address ~* '^0x[0-9a-f]{40}$'::text),
  route_kind text NOT NULL CHECK (route_kind = ANY (ARRAY['create'::text, 'trade'::text])),
  route_profile_id integer NOT NULL CHECK (route_profile_id = ANY (ARRAY[0, 1, 2])),
  finalize_route_profile_id integer CHECK (finalize_route_profile_id IS NULL OR (finalize_route_profile_id = ANY (ARRAY[0, 1, 2]))),
  factory_address text,
  campaign_address text,
  recruiter_id bigint,
  recruiter_code text,
  recruiter_is_og boolean NOT NULL DEFAULT false,
  decision_profile text,
  decision_source text,
  decision_reason text,
  route_authority text,
  authorization_deadline bigint,
  valid_until timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_authorization_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.token_metadata_registry (
  id bigint NOT NULL DEFAULT nextval('token_metadata_registry_id_seq'::regclass),
  chain_id integer NOT NULL,
  campaign_address text CHECK (campaign_address IS NULL OR campaign_address ~* '^0x[0-9a-f]{40}$'::text),
  token_address text CHECK (token_address IS NULL OR token_address ~* '^0x[0-9a-f]{40}$'::text),
  creator_address text CHECK (creator_address IS NULL OR creator_address ~* '^0x[0-9a-f]{40}$'::text),
  name text,
  symbol text,
  description text,
  logo_uri text,
  metadata_uri text,
  external_url text,
  website text,
  x_account text,
  telegram text,
  discord text,
  source text NOT NULL DEFAULT 'memewarzone'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT token_metadata_registry_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campaign_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL DEFAULT 97,
  creator_wallet text NOT NULL,
  name text NOT NULL,
  ticker text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'meme'::text,
  logo_url text,
  website_url text,
  x_url text,
  other_url text,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'promotion_published'::text, 'ready_to_launch'::text, 'scheduled'::text, 'deployed'::text, 'archived'::text])),
  visibility text NOT NULL DEFAULT 'private'::text CHECK (visibility = ANY (ARRAY['public'::text, 'unlisted'::text, 'private'::text])),
  campaign_address text,
  token_address text,
  deploy_tx_hash text,
  archived_at timestamp with time zone,
  deployed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_drafts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campaign_draft_promotion (
  draft_id uuid NOT NULL,
  mission_statement text NOT NULL DEFAULT ''::text,
  roadmap jsonb NOT NULL DEFAULT '[]'::jsonb,
  launch_strategy text NOT NULL DEFAULT ''::text,
  telegram_url text NOT NULL DEFAULT ''::text,
  discord_url text NOT NULL DEFAULT ''::text,
  x_url text NOT NULL DEFAULT ''::text,
  website_url text NOT NULL DEFAULT ''::text,
  docs jsonb NOT NULL DEFAULT '[]'::jsonb,
  creator_note text NOT NULL DEFAULT ''::text,
  banner_url text NOT NULL DEFAULT ''::text,
  share_message text NOT NULL DEFAULT ''::text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_draft_promotion_pkey PRIMARY KEY (draft_id),
  CONSTRAINT campaign_draft_promotion_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.campaign_drafts(id)
);
CREATE TABLE public.campaign_draft_follows (
  draft_id uuid NOT NULL,
  wallet_address text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_draft_follows_pkey PRIMARY KEY (draft_id, wallet_address),
  CONSTRAINT campaign_draft_follows_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.campaign_drafts(id)
);
CREATE TABLE public.campaign_draft_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL,
  wallet_address text NOT NULL,
  body text NOT NULL,
  parent_comment_id uuid,
  reaction_count integer NOT NULL DEFAULT 0,
  moderation_status text NOT NULL DEFAULT 'visible'::text CHECK (moderation_status = ANY (ARRAY['visible'::text, 'hidden'::text, 'flagged'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_draft_comments_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_draft_comments_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.campaign_drafts(id),
  CONSTRAINT campaign_draft_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES public.campaign_draft_comments(id)
);
CREATE TABLE public.campaign_draft_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL,
  comment_id uuid,
  wallet_address text NOT NULL,
  reaction_type text NOT NULL DEFAULT 'upvote'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_draft_reactions_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_draft_reactions_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.campaign_drafts(id),
  CONSTRAINT campaign_draft_reactions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.campaign_draft_comments(id)
);
CREATE TABLE public.campaign_draft_metrics (
  draft_id uuid NOT NULL,
  views integer NOT NULL DEFAULT 0,
  follows integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  reactions integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  signed_actions integer NOT NULL DEFAULT 0,
  popularity_percentage integer NOT NULL DEFAULT 0,
  heat_label text NOT NULL DEFAULT 'Cold'::text,
  ranking_score numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_draft_metrics_pkey PRIMARY KEY (draft_id),
  CONSTRAINT campaign_draft_metrics_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.campaign_drafts(id)
);
CREATE TABLE public.prepare_mode_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  event_type text NOT NULL,
  target_type text NOT NULL DEFAULT 'draft'::text,
  target_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT ''::text,
  is_read boolean NOT NULL DEFAULT false,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT prepare_mode_notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.campaign_draft_notification_subscriptions (
  draft_id uuid NOT NULL,
  wallet_address text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_draft_notification_subscriptions_pkey PRIMARY KEY (draft_id, wallet_address),
  CONSTRAINT campaign_draft_notification_subscriptions_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.campaign_drafts(id)
);
CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_pkey PRIMARY KEY (id)
);
CREATE TABLE public.content_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])),
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT content_campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
);
CREATE TABLE public.content_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  campaign_id uuid,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['idea'::text, 'draft'::text, 'ready'::text, 'scheduled'::text, 'published'::text, 'archived'::text])),
  base_content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_content_text text NOT NULL DEFAULT ''::text,
  internal_notes text,
  topic text,
  goal text,
  target_audience text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_posts_pkey PRIMARY KEY (id),
  CONSTRAINT content_posts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT content_posts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.content_campaigns(id)
);
CREATE TABLE public.content_post_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['x'::text, 'instagram'::text, 'threads'::text, 'tiktok'::text, 'article'::text, 'website'::text])),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'scheduled'::text, 'published'::text, 'failed'::text, 'archived'::text])),
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_text text NOT NULL DEFAULT ''::text,
  headline text,
  caption text,
  hook text,
  call_to_action text,
  hashtags ARRAY NOT NULL DEFAULT '{}'::text[],
  article_slug text,
  article_excerpt text,
  article_cover_url text,
  platform_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT content_post_variants_pkey PRIMARY KEY (id),
  CONSTRAINT content_post_variants_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.content_posts(id)
);