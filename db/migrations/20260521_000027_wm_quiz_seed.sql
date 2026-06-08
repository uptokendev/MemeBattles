BEGIN;

INSERT INTO public.wm_quest_categories (slug, title, description, display_order, active)
VALUES
  ('recon-interrogation', 'Recon & Interrogation', 'Documentation and quiz quests for learning the MemeWarzone battlefield.', 40, true),
  ('operation-reinforcements', 'Operation: Reinforcements', 'Recruiter and squad-growth questline.', 50, true)
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  active = true;

WITH category AS (
  SELECT id, slug
  FROM public.wm_quest_categories
  WHERE slug IN ('recon-interrogation', 'operation-reinforcements')
)
INSERT INTO public.wm_quest_templates (
  category_id,
  slug,
  title,
  description,
  xp_reward,
  verification_type,
  repeatable,
  metadata,
  active
)
SELECT
  category.id,
  seed.slug,
  seed.title,
  seed.description,
  seed.xp_reward,
  'docs_quiz',
  false,
  seed.metadata,
  true
FROM (
  VALUES
    ('recon-interrogation', 'read-the-basics', 'Read the Basics', 'Read the platform basics and pass the briefing quiz.', 250, '{"question_count":4,"passing_score":3,"retry_cooldown_minutes":30,"docs_path":"/docs"}'::jsonb),
    ('recon-interrogation', 'leagues-and-airdrop-briefing', 'Leagues and Airdrop Briefing', 'Read the leagues, epochs, and reward briefings and pass the quiz.', 300, '{"question_count":4,"passing_score":3,"retry_cooldown_minutes":30,"docs_path":"/docs"}'::jsonb),
    ('recon-interrogation', 'fees-and-treasury-objectives', 'Fees and Treasury Objectives', 'Read the fees, treasury, and prize-loop objectives and pass the quiz.', 300, '{"question_count":4,"passing_score":3,"retry_cooldown_minutes":30,"docs_path":"/docs"}'::jsonb),
    ('recon-interrogation', 'security-safety-recon', 'Security & Safety Recon', 'Read the safety guidance and pass the security recon quiz.', 350, '{"question_count":4,"passing_score":3,"retry_cooldown_minutes":30,"docs_path":"/docs"}'::jsonb),
    ('operation-reinforcements', 'read-recruiter-program', 'Read Recruiter Program', 'Read the Recruiter Program docs and pass the quiz.', 300, '{"question_count":4,"passing_score":3,"retry_cooldown_minutes":30,"docs_path":"/docs/programs/recruiter-program"}'::jsonb)
) AS seed(category_slug, slug, title, description, xp_reward, metadata)
JOIN category ON category.slug = seed.category_slug
ON CONFLICT (slug) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  xp_reward = EXCLUDED.xp_reward,
  verification_type = EXCLUDED.verification_type,
  repeatable = EXCLUDED.repeatable,
  metadata = COALESCE(wm_quest_templates.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  active = true;

WITH quiz_seed(quest_slug, seed_key, display_order, prompt, answers, correct_answer_key, explanation) AS (
  VALUES
    (
      'read-the-basics',
      'read-basics-1',
      1,
      'What is MemeWarzone primarily built for?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Launching, discovering, and competing around meme-token campaigns'),
        jsonb_build_object('key','b','text','Private one-to-one token custody only'),
        jsonb_build_object('key','c','text','A centralized exchange order book'),
        jsonb_build_object('key','d','text','A general-purpose chat app with no wallet layer')
      ),
      'a',
      'MemeWarzone is positioned as a launchpad and competitive arena for meme-token campaigns.'
    ),
    (
      'read-the-basics',
      'read-basics-2',
      2,
      'Why should creators double-check official links before sharing a campaign?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Because wrong or lookalike links can send users to scams or fake pages'),
        jsonb_build_object('key','b','text','Because links are never visible after launch'),
        jsonb_build_object('key','c','text','Because wallet signatures are optional for all actions'),
        jsonb_build_object('key','d','text','Because links automatically make a campaign safe')
      ),
      'a',
      'The docs repeatedly emphasize using official domains, handles, and links to reduce fake-link risk.'
    ),
    (
      'read-the-basics',
      'read-basics-3',
      3,
      'What does Prepare Mode help users do before full live deployment?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Understand the ecosystem, prepare campaigns, and learn the rules before activity accelerates'),
        jsonb_build_object('key','b','text','Claim guaranteed payouts before doing any activity'),
        jsonb_build_object('key','c','text','Skip wallet safety checks'),
        jsonb_build_object('key','d','text','Bypass campaign preparation')
      ),
      'a',
      'Prepare Mode is the staging ground for creators, traders, recruiters, and squads before full deployment.'
    ),
    (
      'read-the-basics',
      'read-basics-4',
      4,
      'What identity is War Missions designed to use as the primary account anchor?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Wallet address'),
        jsonb_build_object('key','b','text','A temporary browser tab'),
        jsonb_build_object('key','c','text','A Discord nickname only'),
        jsonb_build_object('key','d','text','A random referral click with no wallet')
      ),
      'a',
      'The War Missions scope uses wallet as the primary identity and social accounts as linked verification signals.'
    ),
    (
      'leagues-and-airdrop-briefing',
      'leagues-airdrop-1',
      1,
      'What do League standings help show?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Competitive performance around campaign and trader activity'),
        jsonb_build_object('key','b','text','Private wallet seed phrases'),
        jsonb_build_object('key','c','text','Guaranteed future token prices'),
        jsonb_build_object('key','d','text','Unreviewed admin passwords')
      ),
      'a',
      'Leagues are competitive standings; they do not guarantee outcomes or expose private credentials.'
    ),
    (
      'leagues-and-airdrop-briefing',
      'leagues-airdrop-2',
      2,
      'What does a reward epoch define?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','A time window for measuring activity, eligibility, and rewards'),
        jsonb_build_object('key','b','text','A permanent ban on all new campaigns'),
        jsonb_build_object('key','c','text','A wallet seed backup phrase'),
        jsonb_build_object('key','d','text','A fixed token price that cannot change')
      ),
      'a',
      'Epochs are time windows used for reward processing, standings, and claim logic.'
    ),
    (
      'leagues-and-airdrop-briefing',
      'leagues-airdrop-3',
      3,
      'What should users understand about airdrop and prize eligibility?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Eligibility can depend on caps, anti-abuse checks, and claim windows'),
        jsonb_build_object('key','b','text','Every wallet is automatically guaranteed the same payout'),
        jsonb_build_object('key','c','text','Rewards ignore suspicious activity'),
        jsonb_build_object('key','d','text','Claim links sent by random DMs are always safe')
      ),
      'a',
      'Rewards are conditional and should be processed through official, eligibility-aware flows.'
    ),
    (
      'leagues-and-airdrop-briefing',
      'leagues-airdrop-4',
      4,
      'What role do UpVotes and visible competition play in the battlefield?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','They help surface and compare campaign activity and attention'),
        jsonb_build_object('key','b','text','They replace all security checks'),
        jsonb_build_object('key','c','text','They guarantee campaign graduation'),
        jsonb_build_object('key','d','text','They remove the need for official documentation')
      ),
      'a',
      'UpVotes and competitive visibility are signals, not guarantees or replacements for safety checks.'
    ),
    (
      'fees-and-treasury-objectives',
      'fees-treasury-1',
      1,
      'What is the standard buy/sell fee envelope described for recruiter-linked activity?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','2.00%'),
        jsonb_build_object('key','b','text','0.00% forever'),
        jsonb_build_object('key','c','text','25.00%'),
        jsonb_build_object('key','d','text','100.00%')
      ),
      'a',
      'The recruiter docs describe recruiter rewards as coming from the existing 2.00% fee envelope.'
    ),
    (
      'fees-and-treasury-objectives',
      'fees-treasury-2',
      2,
      'What is one purpose of platform fee routing in the MemeWarzone model?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Funding sustainable rewards, operations, and incentive loops'),
        jsonb_build_object('key','b','text','Publishing private keys'),
        jsonb_build_object('key','c','text','Guaranteeing profits for every trader'),
        jsonb_build_object('key','d','text','Removing the need for anti-abuse review')
      ),
      'a',
      'Fees support platform incentives and operating loops; they are not profit guarantees.'
    ),
    (
      'fees-and-treasury-objectives',
      'fees-treasury-3',
      3,
      'What graduation threshold is referenced in the current docs?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','50 BNB'),
        jsonb_build_object('key','b','text','1 wallet signature'),
        jsonb_build_object('key','c','text','10 Discord messages'),
        jsonb_build_object('key','d','text','1 fake claim link')
      ),
      'a',
      'The docs reference a 50 BNB graduation threshold in the campaign preparation material.'
    ),
    (
      'fees-and-treasury-objectives',
      'fees-treasury-4',
      4,
      'What should users assume about rewards and fees?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Rewards depend on rules, eligibility, caps, and review'),
        jsonb_build_object('key','b','text','Fees guarantee a profit on every trade'),
        jsonb_build_object('key','c','text','Anti-abuse checks never apply'),
        jsonb_build_object('key','d','text','Claims should be made through random links')
      ),
      'a',
      'The docs frame rewards as eligibility-based and subject to caps and anti-abuse checks.'
    ),
    (
      'security-safety-recon',
      'security-safety-1',
      1,
      'Which behavior is safest when connecting a wallet?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Use only official MemeWarzone domains and verified links'),
        jsonb_build_object('key','b','text','Connect through any DM link that mentions rewards'),
        jsonb_build_object('key','c','text','Share seed phrases with support accounts'),
        jsonb_build_object('key','d','text','Ignore URL spelling and domains')
      ),
      'a',
      'Users should only use official links and never trust random DMs or lookalike pages.'
    ),
    (
      'security-safety-recon',
      'security-safety-2',
      2,
      'What does War Room Chat represent?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','A communication layer, not an endorsement or safety guarantee'),
        jsonb_build_object('key','b','text','A replacement for due diligence'),
        jsonb_build_object('key','c','text','A guarantee that every campaign is safe'),
        jsonb_build_object('key','d','text','A private key recovery system')
      ),
      'a',
      'The docs state that War Room activity is communication, not an endorsement system.'
    ),
    (
      'security-safety-recon',
      'security-safety-3',
      3,
      'What should users do if they see a fake claim page or suspicious link?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Avoid it and use official pages only'),
        jsonb_build_object('key','b','text','Connect immediately to check'),
        jsonb_build_object('key','c','text','Enter their seed phrase to verify'),
        jsonb_build_object('key','d','text','Forward it to more users as proof')
      ),
      'a',
      'Suspicious or fake links should be avoided; official links are the safe route.'
    ),
    (
      'security-safety-recon',
      'security-safety-4',
      4,
      'What does due diligence mean in this context?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','Reviewing official information, risks, and links before acting'),
        jsonb_build_object('key','b','text','Assuming every trending campaign is safe'),
        jsonb_build_object('key','c','text','Ignoring docs because chat is active'),
        jsonb_build_object('key','d','text','Treating rewards as guaranteed')
      ),
      'a',
      'Users still need to review risks, official docs, and official links before acting.'
    ),
    (
      'read-recruiter-program',
      'recruiter-program-1',
      1,
      'What does an approved recruiter receive?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','A unique recruiter code and shareable link'),
        jsonb_build_object('key','b','text','Unlimited ability to move users between recruiters'),
        jsonb_build_object('key','c','text','A user wallet seed phrase'),
        jsonb_build_object('key','d','text','Guaranteed rewards from every visitor')
      ),
      'a',
      'Recruiters are given attribution tools such as codes and links, not guaranteed rewards for raw traffic.'
    ),
    (
      'read-recruiter-program',
      'recruiter-program-2',
      2,
      'How long does the pre-connect referral window last in the docs?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','30 days'),
        jsonb_build_object('key','b','text','30 seconds'),
        jsonb_build_object('key','c','text','Forever, even after abuse'),
        jsonb_build_object('key','d','text','Only until the page refreshes')
      ),
      'a',
      'The recruiter docs describe a 30-day pre-connect referral window.'
    ),
    (
      'read-recruiter-program',
      'recruiter-program-3',
      3,
      'When should a recruiter link lock according to the recruiter docs?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','After first activity'),
        jsonb_build_object('key','b','text','Before the user ever clicks a link'),
        jsonb_build_object('key','c','text','Only after the recruiter asks support manually'),
        jsonb_build_object('key','d','text','Never; users should silently move between recruiters')
      ),
      'a',
      'The docs state switching is allowed only before first activity; after first activity the link locks.'
    ),
    (
      'read-recruiter-program',
      'recruiter-program-4',
      4,
      'Do recruiters receive an extra skim from Squad Pool distributions?',
      jsonb_build_array(
        jsonb_build_object('key','a','text','No, recruiter rewards and Squad Pool rewards are separate systems'),
        jsonb_build_object('key','b','text','Yes, recruiters take all Squad Pool rewards'),
        jsonb_build_object('key','c','text','Yes, but only from banned users'),
        jsonb_build_object('key','d','text','The docs say Squad Pool does not exist')
      ),
      'a',
      'The recruiter docs say recruiters do not receive an additional cut from Squad Pool distributions.'
    )
)
INSERT INTO public.wm_quiz_questions (
  quest_template_id,
  prompt,
  answers,
  correct_answer_key,
  explanation,
  active,
  display_order,
  metadata
)
SELECT
  template.id,
  quiz_seed.prompt,
  quiz_seed.answers,
  quiz_seed.correct_answer_key,
  quiz_seed.explanation,
  true,
  quiz_seed.display_order,
  jsonb_build_object(
    'seed_key', quiz_seed.seed_key,
    'seed_source', '20260521_000027_wm_quiz_seed',
    'quest_slug', quiz_seed.quest_slug
  )
FROM quiz_seed
JOIN public.wm_quest_templates template ON template.slug = quiz_seed.quest_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.wm_quiz_questions existing
  WHERE existing.quest_template_id = template.id
    AND existing.metadata->>'seed_key' = quiz_seed.seed_key
);

COMMIT;
