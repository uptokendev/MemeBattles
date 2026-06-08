with category_map as (
  select id, slug
  from public.wm_quest_categories
  where slug in ('recon', 'reinforcements')
), desired_templates as (
  select *
  from (
    values
      ('recon', 'read-the-basics', 'Read the Basics', 'Read the MemeWarzone basics docs and pass the quiz.', 250, '{"question_count":4,"passing_score":3,"cooldown_minutes":30,"fixed_quiz":true,"track":"recon"}'::jsonb),
      ('recon', 'leagues-and-airdrop-briefing', 'Leagues and Airdrop Briefing', 'Read the leagues and airdrop docs and pass the quiz.', 300, '{"question_count":4,"passing_score":3,"cooldown_minutes":30,"fixed_quiz":true,"track":"recon"}'::jsonb),
      ('recon', 'fees-and-treasury-objectives', 'Fees and Treasury Objectives', 'Read the fees and treasury docs and pass the quiz.', 300, '{"question_count":4,"passing_score":3,"cooldown_minutes":30,"fixed_quiz":true,"track":"recon"}'::jsonb),
      ('recon', 'security-and-safety-recon', 'Security & Safety Recon', 'Read the safety rules and anti-farming docs and pass the quiz.', 350, '{"question_count":4,"passing_score":3,"cooldown_minutes":30,"fixed_quiz":true,"track":"recon"}'::jsonb),
      ('reinforcements', 'read-recruiter-program', 'Read Recruiter Program', 'Read the recruiter program docs and pass the quiz.', 300, '{"question_count":4,"passing_score":3,"cooldown_minutes":30,"fixed_quiz":true,"track":"reinforcements"}'::jsonb)
  ) as t(category_slug, slug, title, description, xp_reward, metadata)
)
insert into public.wm_quest_templates
  (category_id, slug, title, description, xp_reward, verification_type, repeatable, cooldown_seconds, active, metadata)
select
  category_map.id,
  desired_templates.slug,
  desired_templates.title,
  desired_templates.description,
  desired_templates.xp_reward,
  'docs_quiz',
  false,
  1800,
  true,
  desired_templates.metadata
from desired_templates
join category_map on category_map.slug = desired_templates.category_slug
where not exists (
  select 1
  from public.wm_quest_templates existing
  where existing.slug = desired_templates.slug
);
